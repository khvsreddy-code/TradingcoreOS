from __future__ import annotations

import math
from typing import Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .optimization import add_market_optimization_features
import numpy as np
import pandas as pd

# Feature order is a model ABI. Never silently change the meaning of columns for an old artifact.
LEGACY_FEATURE_SCHEMA_VERSION = 'tradingcore-market-features/1'
TIMEZONE_FEATURE_SCHEMA_VERSION = 'tradingcore-market-features/2'
FEATURE_SCHEMA_VERSION = 'tradingcore-market-features/3'
SESSION_CALENDAR_POLICY_VERSION = 'weekday-session+explicit-holidays/v1'
FEATURE_COLUMNS = [
    'ret_1', 'ret_3', 'ret_5', 'ret_10',
    'range_pct', 'body_pct', 'volume_ratio',
    'ema_9_gap', 'ema_21_gap', 'ema_50_gap',
    'rsi_14', 'atr_14_pct', 'volatility_20',
    'high_20_gap', 'low_20_gap', 'trend_slope',
    'hour_sin', 'hour_cos',
]


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev = df['close'].shift(1)
    tr = pd.concat([
        df['high'] - df['low'],
        (df['high'] - prev).abs(),
        (df['low'] - prev).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def _parse_clock(value: str, label: str) -> int:
    try:
        parts = str(value).strip().split(':')
        if len(parts) != 2:
            raise ValueError
        hour, minute = int(parts[0]), int(parts[1])
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
        return hour * 60 + minute
    except (TypeError, ValueError):
        raise ValueError(f'{label} must use valid HH:MM 24-hour time') from None


def build_features(
    candles: Iterable[dict] | pd.DataFrame,
    *,
    exchange_timezone: str = 'Asia/Kolkata',
    session_open: str = '09:15',
    session_close: str = '15:30',
    feature_schema_version: str = FEATURE_SCHEMA_VERSION,
    session_holidays: Iterable[str] = (),
    require_confirmed: bool = False,
) -> pd.DataFrame:
    if feature_schema_version not in (FEATURE_SCHEMA_VERSION, TIMEZONE_FEATURE_SCHEMA_VERSION, LEGACY_FEATURE_SCHEMA_VERSION):
        raise ValueError(f'Unsupported market feature schema: {feature_schema_version}')
    try:
        ZoneInfo(exchange_timezone)
    except (ZoneInfoNotFoundError, TypeError, ValueError):
        raise ValueError(f'Unknown exchange timezone: {exchange_timezone}') from None

    open_minute = _parse_clock(session_open, 'session_open')
    close_minute = _parse_clock(session_close, 'session_close')
    if close_minute <= open_minute:
        raise ValueError('session_close must be later than session_open on the same exchange day')

    if isinstance(candles, pd.DataFrame):
        df = candles.copy()
    else:
        df = pd.DataFrame(list(candles))
    required = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f'Missing candle columns: {missing}')

    # Keep UTC as the canonical timeline. Explicit temporal columns, when present,
    # are enforced before features are calculated so a training request cannot relabel a
    # developing/realtime bar as historical merely by sorting it into the input frame.
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
    if require_confirmed:
        if 'confirmed' in df.columns:
            df = df[df['confirmed'].map(lambda value: value is True or str(value).strip().lower() in ('true', '1', 'yes'))]
        if 'phase' in df.columns:
            df = df[df['phase'].astype(str).str.lower().isin(('historical', 'confirmed'))]
        if 'availableAt' in df.columns:
            available_at = pd.to_datetime(df['availableAt'], utc=True, errors='coerce')
            df = df.loc[available_at.notna() & df['timestamp'].notna() & (available_at <= df['timestamp'])].copy()
        elif 'available_at' in df.columns:
            available_at = pd.to_datetime(df['available_at'], utc=True, errors='coerce')
            df = df.loc[available_at.notna() & df['timestamp'].notna() & (available_at <= df['timestamp'])].copy()
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df = df.dropna(subset=required).sort_values('timestamp').drop_duplicates('timestamp').reset_index(drop=True)
    if df.empty:
        raise ValueError('No valid, timestamped OHLCV candles were provided')
    if (df[['open', 'high', 'low', 'close']].le(0).any(axis=None)
            or df['volume'].lt(0).any()):
        raise ValueError('OHLC prices must be positive and volume must be non-negative')
    if (df['high'] < df[['open', 'close', 'low']].max(axis=1)).any():
        raise ValueError('Candle high is below its OHLC range')
    if (df['low'] > df[['open', 'close', 'high']].min(axis=1)).any():
        raise ValueError('Candle low is above its OHLC range')

    close = df['close']
    df['ret_1'] = close.pct_change(1)
    df['ret_3'] = close.pct_change(3)
    df['ret_5'] = close.pct_change(5)
    df['ret_10'] = close.pct_change(10)
    df['range_pct'] = (df['high'] - df['low']) / close.replace(0, np.nan)
    df['body_pct'] = (df['close'] - df['open']) / close.replace(0, np.nan)
    vol_mean = df['volume'].rolling(20).mean().replace(0, np.nan)
    df['volume_ratio'] = df['volume'] / vol_mean

    for period in (9, 21, 50):
        ema = close.ewm(span=period, adjust=False).mean()
        df[f'ema_{period}_gap'] = (close / ema.replace(0, np.nan)) - 1

    df['rsi_14'] = _rsi(close) / 100.0
    df['atr_14_pct'] = _atr(df) / close.replace(0, np.nan)
    df['volatility_20'] = df['ret_1'].rolling(20).std()
    rolling_high = close.rolling(20).max()
    rolling_low = close.rolling(20).min()
    df['high_20_gap'] = close / rolling_high.replace(0, np.nan) - 1
    df['low_20_gap'] = close / rolling_low.replace(0, np.nan) - 1
    df['trend_slope'] = close.pct_change(10) / 10.0

    if feature_schema_version == LEGACY_FEATURE_SCHEMA_VERSION:
        # Exact compatibility with the original published artifact ABI.
        minute = df['timestamp'].dt.hour * 60 + df['timestamp'].dt.minute
        phase = 2 * math.pi * (minute - 9 * 60) / (6.5 * 60)
        calendar_policy = 'legacy-utc-clock/v1'
    else:
        local_timestamp = df['timestamp'].dt.tz_convert(exchange_timezone)
        minute = local_timestamp.dt.hour * 60 + local_timestamp.dt.minute
        session_phase = ((minute - open_minute) / (close_minute - open_minute)).clip(0.0, 1.0)
        if feature_schema_version == TIMEZONE_FEATURE_SCHEMA_VERSION:
            # Schema v2 is frozen for previously trained artifacts: timezone-aware
            # clock features, without a session-calendar filter.
            phase = 2 * math.pi * session_phase
            calendar_policy = 'timezone-session-clock/v1'
        else:
            holidays = {str(day).strip()[:10] for day in session_holidays if str(day).strip()}
            local_dates = local_timestamp.dt.strftime('%Y-%m-%d')
            weekday_session = (local_timestamp.dt.dayofweek < 5) & ~local_dates.isin(holidays)
            # Exchange-local weekends and explicit holidays are not valid trading
            # sessions. Keep the missing value as NaN; downstream train/validation
            # drops it rather than inventing an out-of-session phase.
            phase = (2 * math.pi * session_phase).where(weekday_session, np.nan)
            calendar_policy = SESSION_CALENDAR_POLICY_VERSION
    df['hour_sin'] = np.sin(phase)
    df['hour_cos'] = np.cos(phase)

    df = df.replace([np.inf, -np.inf], np.nan)
    df.attrs['feature_schema_version'] = feature_schema_version
    df.attrs['exchange_timezone'] = exchange_timezone
    df.attrs['session_open'] = session_open
    df.attrs['session_close'] = session_close
    df.attrs['session_calendar_policy'] = calendar_policy
    df.attrs['session_holidays'] = sorted({str(day).strip()[:10] for day in session_holidays if str(day).strip()})
    return add_market_optimization_features(df)


def make_supervised(
    candles: Iterable[dict] | pd.DataFrame,
    horizon: int = 1,
    *,
    exchange_timezone: str = 'Asia/Kolkata',
    session_open: str = '09:15',
    session_close: str = '15:30',
    feature_schema_version: str = FEATURE_SCHEMA_VERSION,
    session_holidays: Iterable[str] = (),
    require_confirmed: bool = True,
):
    if not isinstance(horizon, int) or horizon < 1 or horizon > 500:
        raise ValueError('forecast horizon must be an integer in [1, 500] bars')
    features = build_features(
        candles,
        exchange_timezone=exchange_timezone,
        session_open=session_open,
        session_close=session_close,
        feature_schema_version=feature_schema_version,
        session_holidays=session_holidays,
        require_confirmed=require_confirmed,
    )
    future_return = features['close'].shift(-horizon) / features['close'] - 1
    features['target_return'] = future_return
    features['target_up'] = (future_return > 0).astype(int)
    usable = features.dropna(subset=FEATURE_COLUMNS + ['target_return']).reset_index(drop=True)
    usable.attrs.update(features.attrs)
    return usable
