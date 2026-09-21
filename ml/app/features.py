from __future__ import annotations

import math
from typing import Iterable
from .optimization import add_market_optimization_features

import numpy as np
import pandas as pd

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


def build_features(candles: Iterable[dict] | pd.DataFrame) -> pd.DataFrame:
    if isinstance(candles, pd.DataFrame):
        df = candles.copy()
    else:
        df = pd.DataFrame(list(candles))
    required = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f'Missing candle columns: {missing}')

    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df = df.dropna(subset=required).sort_values('timestamp').drop_duplicates('timestamp').reset_index(drop=True)
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

    minute = df['timestamp'].dt.hour * 60 + df['timestamp'].dt.minute
    phase = 2 * math.pi * (minute - 9 * 60) / (6.5 * 60)
    df['hour_sin'] = np.sin(phase)
    df['hour_cos'] = np.cos(phase)

    df = df.replace([np.inf, -np.inf], np.nan)
    return add_market_optimization_features(df)


def make_supervised(candles: Iterable[dict] | pd.DataFrame, horizon: int = 1):
    features = build_features(candles)
    future_return = features['close'].shift(-horizon) / features['close'] - 1
    features['target_return'] = future_return
    features['target_up'] = (future_return > 0).astype(int)
    usable = features.dropna(subset=FEATURE_COLUMNS + ['target_return']).reset_index(drop=True)
    return usable
