from __future__ import annotations

import asyncio
import hmac
import math
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pandas as pd
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from tvDatafeed import Interval, TvDatafeed

app = FastAPI(title="TradingCoreOS Historical Data Service", version="1.0.0")
MAX_BARS = 5000
MAX_WORKERS = 2
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="tvdatafeed")
slots = asyncio.Semaphore(MAX_WORKERS)
TIMEFRAMES: dict[str, tuple[Any, bool]] = {
    # Numeric minute aliases are accepted because the FYERS API also uses
    # interval values such as "1", "5", "15" and "60".
    "1": (Interval.in_1_minute, False), "3": (Interval.in_3_minute, False),
    "5": (Interval.in_5_minute, False), "10": (Interval.in_5_minute, True),
    "15": (Interval.in_15_minute, False), "30": (Interval.in_30_minute, False),
    "45": (Interval.in_45_minute, False), "60": (Interval.in_1_hour, False),
    "120": (Interval.in_2_hour, False), "180": (Interval.in_3_hour, False),
    "240": (Interval.in_4_hour, False),
    # Upper-case exchange/broker aliases must be resolved before lowercasing:
    # "1M" is monthly, whereas "1m" is one-minute.
    "1M": (Interval.in_monthly, False), "M": (Interval.in_monthly, False),
    "1W": (Interval.in_weekly, False), "W": (Interval.in_weekly, False),
    "1D": (Interval.in_daily, False), "D": (Interval.in_daily, False),
    "1m": (Interval.in_1_minute, False), "1minute": (Interval.in_1_minute, False),
    "3m": (Interval.in_3_minute, False), "3minute": (Interval.in_3_minute, False),
    "5m": (Interval.in_5_minute, False), "5minute": (Interval.in_5_minute, False),
    "10m": (Interval.in_5_minute, True), "10minute": (Interval.in_5_minute, True),
    "15m": (Interval.in_15_minute, False), "15minute": (Interval.in_15_minute, False),
    "30m": (Interval.in_30_minute, False), "30minute": (Interval.in_30_minute, False),
    "45m": (Interval.in_45_minute, False), "45minute": (Interval.in_45_minute, False),
    "60m": (Interval.in_1_hour, False), "1h": (Interval.in_1_hour, False), "60minute": (Interval.in_1_hour, False),
    "120m": (Interval.in_2_hour, False), "2h": (Interval.in_2_hour, False), "120minute": (Interval.in_2_hour, False),
    "180m": (Interval.in_3_hour, False), "3h": (Interval.in_3_hour, False),
    "240m": (Interval.in_4_hour, False), "4h": (Interval.in_4_hour, False), "240minute": (Interval.in_4_hour, False),
    "1d": (Interval.in_daily, False), "day": (Interval.in_daily, False), "1day": (Interval.in_daily, False), "daily": (Interval.in_daily, False),
    "1w": (Interval.in_weekly, False), "week": (Interval.in_weekly, False), "weekly": (Interval.in_weekly, False),
    "1mo": (Interval.in_monthly, False), "month": (Interval.in_monthly, False), "monthly": (Interval.in_monthly, False),
}


class HistoryRequest(BaseModel):
    instrument_id: str = Field(min_length=1, max_length=160)
    symbol: str = Field(min_length=1, max_length=80)
    exchange: str = Field(min_length=2, max_length=16)
    timeframe: str = Field(min_length=1, max_length=16)
    max_bars: int = Field(default=MAX_BARS, ge=1, le=MAX_BARS)
    timezone: str = Field(default="Asia/Kolkata", min_length=1, max_length=64)
    session_open: str = Field(default="09:15", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    fut_contract: Optional[int] = Field(default=None, ge=1, le=12)


def authenticated(authorization: Optional[str]) -> None:
    expected = os.environ.get("TVDATAFEED_SERVICE_TOKEN", "").strip()
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Historical data service is not configured")
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid service credentials")


def safe_time_zone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Unknown IANA timezone") from exc


def numeric(value: Any) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("non-finite OHLCV value")
    return result


def timestamp_utc(value: Any, timezone: ZoneInfo) -> pd.Timestamp:
    stamp = pd.Timestamp(value)
    if stamp.tzinfo is None:
        stamp = stamp.tz_localize(timezone, ambiguous="NaT", nonexistent="shift_forward")
    else:
        stamp = stamp.tz_convert(timezone)
    if pd.isna(stamp):
        raise ValueError("invalid candle timestamp")
    return stamp.tz_convert("UTC")


def aggregate_ten_minute(frame: pd.DataFrame, timezone: ZoneInfo, session_open: str) -> list[dict[str, Any]]:
    grouped: dict[pd.Timestamp, list[Any]] = {}
    open_hour, open_minute = (int(part) for part in session_open.split(":"))
    for index, row in frame.sort_index().iterrows():
        local = pd.Timestamp(index)
        local = local.tz_localize(timezone) if local.tzinfo is None else local.tz_convert(timezone)
        anchor = pd.Timestamp(local.date()).replace(hour=open_hour, minute=open_minute).tz_localize(timezone)
        if local < anchor:
            continue
        bucket = anchor + timedelta(minutes=int((local - anchor).total_seconds() // 600) * 10)
        values = [numeric(row["open"]), numeric(row["high"]), numeric(row["low"]), numeric(row["close"])]
        try:
            raw_volume = row.get("volume", 0) if hasattr(row, "get") else 0
            volume = max(0.0, numeric(raw_volume))
        except (TypeError, ValueError):
            volume = 0.0
        current = grouped.get(bucket)
        if current is None:
            grouped[bucket] = [values[0], values[1], values[2], values[3], volume]
        else:
            current[1] = max(current[1], values[1])
            current[2] = min(current[2], values[2])
            current[3] = values[3]
            current[4] += volume
    return [{
        "timestamp": bucket.tz_convert("UTC").isoformat(),
        "open": values[0], "high": values[1], "low": values[2],
        "close": values[3], "volume": values[4],
    } for bucket, values in sorted(grouped.items())]


def fetch_history(request: HistoryRequest, interval: Any, aggregate_10m: bool, timezone: ZoneInfo) -> list[dict[str, Any]]:
    username = os.environ.get("TVDATAFEED_USERNAME", "").strip()
    password = os.environ.get("TVDATAFEED_PASSWORD", "")
    client = TvDatafeed(username, password) if username and password else TvDatafeed()
    kwargs: dict[str, Any] = {
        "symbol": request.symbol, "exchange": request.exchange,
        "interval": interval, "n_bars": MAX_BARS,
    }
    if request.fut_contract is not None:
        kwargs["fut_contract"] = request.fut_contract
    frame = client.get_hist(**kwargs)
    if frame is None or frame.empty:
        return []
    frame = frame.sort_index()
    if aggregate_10m:
        return aggregate_ten_minute(frame, timezone, request.session_open)[-request.max_bars:]

    output: list[dict[str, Any]] = []
    for index, row in frame.iterrows():
        try:
            stamp = timestamp_utc(index, timezone)
            open_value, high_value = numeric(row["open"]), numeric(row["high"])
            low_value, close_value = numeric(row["low"]), numeric(row["close"])
            raw_volume = row.get("volume", 0) if hasattr(row, "get") else 0
            try:
                volume_value = max(0.0, numeric(raw_volume)) if pd.notna(raw_volume) else 0.0
            except (TypeError, ValueError):
                volume_value = 0.0
            if high_value < max(open_value, close_value) or low_value > min(open_value, close_value) or high_value < low_value:
                continue
            output.append({
                "timestamp": stamp.isoformat(), "open": open_value, "high": high_value,
                "low": low_value, "close": close_value, "volume": volume_value,
            })
        except (ValueError, TypeError, OverflowError):
            continue
    deduped = {bar["timestamp"]: bar for bar in output}
    return [deduped[key] for key in sorted(deduped)][-request.max_bars:]


class InvestinyHistoryRequest(BaseModel):
    instrument_id: str = Field(min_length=1, max_length=160)
    investing_id: int = Field(gt=0, le=2_147_483_647)
    timeframe: str = Field(min_length=1, max_length=16)
    from_ms: int = Field(gt=0)
    to_ms: int = Field(gt=0)
    max_bars: int = Field(default=MAX_BARS, ge=1, le=MAX_BARS)
    timezone: str = Field(default="Asia/Kolkata", min_length=1, max_length=64)
    session_open: str = Field(default="09:15", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def authenticated_investiny(authorization: Optional[str]) -> None:
    expected = (os.environ.get("INVESTINY_SERVICE_TOKEN", "").strip()
                or os.environ.get("TVDATAFEED_SERVICE_TOKEN", "").strip())
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Investiny service token is not configured")
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid service credentials")


def investiny_timeframe(raw: str) -> tuple[Any, Optional[int]]:
    value = str(raw or "").strip()
    if value in ("1minute", "1", "1m"):
        return 1, None
    if value in ("2minute", "2", "2m"):
        return 1, 2
    if value in ("3minute", "3", "3m"):
        return 1, 3
    if value in ("5minute", "5", "5m"):
        return 5, None
    if value in ("10minute", "10", "10m"):
        return 5, 10
    if value in ("15minute", "15", "15m"):
        return 15, None
    if value in ("30minute", "30", "30m"):
        return 30, None
    if value in ("45minute", "45", "45m"):
        return 15, 45
    if value in ("60minute", "60", "60m"):
        return 60, None
    if value in ("120minute", "120", "120m"):
        return 60, 120
    if value in ("240minute", "240", "240m"):
        return 60, 240
    if value in ("day", "1D", "1d", "D", "daily"):
        return "D", None
    if value in ("week", "1W", "1w", "W", "weekly"):
        return "W", None
    if value in ("month", "1M", "M", "monthly"):
        return "M", None
    raise HTTPException(status_code=422, detail="Investiny does not support this timeframe")


def parse_investiny_timestamp(value: Any, timezone: ZoneInfo) -> Optional[pd.Timestamp]:
    try:
        if isinstance(value, (int, float)) and math.isfinite(float(value)):
            stamp = pd.Timestamp(float(value), unit="s", tz="UTC")
        else:
            raw = str(value).strip()
            if not raw:
                return None
            # Investiny 0.7.2 formats intraday epochs with datetime.fromtimestamp(),
            # which emits the *service host's local timezone* without an offset.
            # Reinterpret date-only daily/weekly/monthly values in the exchange zone,
            # but round-trip intraday wall time through the host zone to avoid a UTC
            # container silently shifting Indian candles by 5h30m.
            if len(raw) <= 10 and ":" not in raw:
                parsed_date = pd.to_datetime(raw, format="mixed", dayfirst=False, errors="coerce")
                if pd.isna(parsed_date):
                    return None
                stamp = pd.Timestamp(parsed_date)
                if stamp.tzinfo is None:
                    stamp = stamp.tz_localize(timezone, ambiguous="NaT", nonexistent="shift_forward")
            else:
                parsed_dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if parsed_dt.tzinfo is None:
                    parsed_dt = parsed_dt.astimezone(ZoneInfo("UTC"))
                stamp = pd.Timestamp(parsed_dt)
        if pd.isna(stamp):
            return None
        if stamp.tzinfo is None:
            stamp = stamp.tz_localize(timezone, ambiguous="NaT", nonexistent="shift_forward")
        return stamp.tz_convert("UTC")
    except (TypeError, ValueError, OverflowError):
        return None


def aggregate_investiny_bars(rows: list[dict[str, Any]], target_minutes: int, timezone: ZoneInfo, session_open: str) -> list[dict[str, Any]]:
    grouped: dict[pd.Timestamp, list[float]] = {}
    open_hour, open_minute = (int(part) for part in session_open.split(":"))
    for row in rows:
        local = pd.Timestamp(row["timestamp"]).tz_convert(timezone)
        midnight = pd.Timestamp(local.date()).tz_localize(timezone)
        anchor = midnight + pd.Timedelta(hours=open_hour, minutes=open_minute)
        close_boundary = midnight + pd.Timedelta(hours=15, minutes=30)
        if local < anchor or local >= close_boundary:
            continue
        bucket = anchor + pd.Timedelta(minutes=int((local - anchor).total_seconds() // (target_minutes * 60)) * target_minutes)
        values = [float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"]), float(row["volume"])]
        old = grouped.get(bucket)
        if old is None:
            grouped[bucket] = values
        else:
            old[1] = max(old[1], values[1])
            old[2] = min(old[2], values[2])
            old[3] = values[3]
            old[4] += values[4]
    return [{
        "timestamp": bucket.tz_convert("UTC").isoformat(),
        "open": values[0], "high": values[1], "low": values[2], "close": values[3], "volume": values[4],
    } for bucket, values in sorted(grouped.items())]


def fetch_investiny_history(request: InvestinyHistoryRequest, interval: Any, aggregate_minutes: Optional[int], timezone: ZoneInfo) -> list[dict[str, Any]]:
    if os.environ.get("INVESTINY_ENABLED", "false").strip().lower() not in ("1", "true", "yes", "on"):
        raise RuntimeError("Investiny fallback is disabled by operator configuration")
    # Import lazily so the existing tvdatafeed service still starts when this
    # optional, unofficial provider dependency is unavailable.
    from investiny import historical_data  # type: ignore[import-not-found]

    from_local = pd.Timestamp(request.from_ms, unit="ms", tz="UTC").tz_convert(timezone)
    to_local = pd.Timestamp(request.to_ms, unit="ms", tz="UTC").tz_convert(timezone)
    data = historical_data(
        investing_id=request.investing_id,
        from_date=from_local.strftime("%m/%d/%Y"),
        to_date=to_local.strftime("%m/%d/%Y"),
        interval=interval,
    )
    if not isinstance(data, dict):
        raise ValueError("Investiny response is not a columnar history object")
    dates = data.get("date")
    opens = data.get("open")
    highs = data.get("high")
    lows = data.get("low")
    closes = data.get("close")
    volumes = data.get("volume")
    dates = dates if dates is not None else []
    opens = opens if opens is not None else []
    highs = highs if highs is not None else []
    lows = lows if lows is not None else []
    closes = closes if closes is not None else []
    volumes = volumes if volumes is not None else []
    count = min(len(dates), len(opens), len(highs), len(lows), len(closes))
    output: list[dict[str, Any]] = []
    for index in range(count):
        stamp = parse_investiny_timestamp(dates[index], timezone)
        if stamp is None:
            continue
        stamp_ms = int(stamp.timestamp() * 1000)
        if stamp_ms < request.from_ms or stamp_ms > request.to_ms:
            continue
        try:
            opn, high, low, close = (numeric(opens[index]), numeric(highs[index]), numeric(lows[index]), numeric(closes[index]))
            raw_volume = volumes[index] if index < len(volumes) else 0
            volume = 0.0 if raw_volume is None or pd.isna(raw_volume) else numeric(raw_volume)
            if volume < 0 or high < low or high < max(opn, close) or low > min(opn, close):
                continue
            output.append({"timestamp": stamp.isoformat(), "open": opn, "high": high, "low": low, "close": close, "volume": volume})
        except (ValueError, TypeError, OverflowError):
            continue
    deduped = {bar["timestamp"]: bar for bar in output}
    normalized = [deduped[key] for key in sorted(deduped)]
    if aggregate_minutes:
        normalized = aggregate_investiny_bars(normalized, aggregate_minutes, timezone, request.session_open)
    return normalized[-request.max_bars:]


@app.post("/v1/investiny/history")
async def investiny_history(request: InvestinyHistoryRequest, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    authenticated_investiny(authorization)
    if request.to_ms < request.from_ms:
        raise HTTPException(status_code=422, detail="to_ms must be greater than or equal to from_ms")
    interval, aggregate_minutes = investiny_timeframe(request.timeframe)
    timezone = safe_time_zone(request.timezone)
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.25)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=503, detail="Historical source is busy; retry shortly", headers={"Retry-After": "2"}) from exc
    release_slot = True
    try:
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(executor, fetch_investiny_history, request, interval, aggregate_minutes, timezone)
        try:
            bars = await asyncio.wait_for(asyncio.shield(future), timeout=20.0)
        except asyncio.TimeoutError as exc:
            release_slot = False
            future.add_done_callback(lambda _completed: slots.release())
            raise HTTPException(status_code=504, detail="Investiny history request timed out") from exc
        except Exception as exc:
            # Do not rotate identities or probe alternate hidden endpoints after a source error.
            raise HTTPException(status_code=502, detail="Investiny historical source is unavailable or returned invalid data") from exc
        return {"instrument_id": request.instrument_id, "investing_id": request.investing_id, "timeframe": request.timeframe,
                "bars": bars, "returned": len(bars), "historical_only": True, "live_stream_supported": False}
    finally:
        if release_slot:
            slots.release()


@app.get("/health")
async def health() -> dict[str, Any]:
    tv_token_configured = bool(os.environ.get("TVDATAFEED_SERVICE_TOKEN", "").strip())
    investiny_token_configured = bool(
        (os.environ.get("INVESTINY_SERVICE_TOKEN", "").strip()
         or os.environ.get("TVDATAFEED_SERVICE_TOKEN", "").strip())
    )
    investiny_enabled = os.environ.get("INVESTINY_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")
    return {
        "status": "ok",
        "max_bars": MAX_BARS,
        "workers": MAX_WORKERS,
        "service_token_configured": tv_token_configured or investiny_token_configured,
        "providers": {
            "tvdatafeed": {"enabled": True, "token_configured": tv_token_configured},
            "investiny": {
                "enabled": investiny_enabled,
                "token_configured": investiny_token_configured,
                "historical_only": True,
                "live_stream_supported": False,
            },
        },
    }


@app.post("/v1/history")
async def history(request: HistoryRequest, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    authenticated(authorization)
    entry = TIMEFRAMES.get(request.timeframe.strip()) or TIMEFRAMES.get(request.timeframe.strip().lower())
    if not entry:
        raise HTTPException(status_code=422, detail="Unsupported timeframe")
    timezone = safe_time_zone(request.timezone)
    interval, aggregate_10m = entry
    try:
        await asyncio.wait_for(slots.acquire(), timeout=0.25)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=503, detail="Historical source is busy; retry shortly", headers={"Retry-After": "2"}) from exc
    release_slot = True
    try:
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(executor, fetch_history, request, interval, aggregate_10m, timezone)
        try:
            bars = await asyncio.wait_for(asyncio.shield(future), timeout=20.0)
        except asyncio.TimeoutError as exc:
            # Keep the slot reserved until the underlying synchronous socket call
            # actually exits; cancelling a thread future cannot stop that thread.
            release_slot = False
            future.add_done_callback(lambda _completed: slots.release())
            raise HTTPException(status_code=504, detail="tvdatafeed history request timed out") from exc
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail="tvdatafeed could not return validated history") from exc
        return {
            "instrument_id": request.instrument_id, "symbol": request.symbol,
            "exchange": request.exchange, "timeframe": request.timeframe,
            "bars": bars, "returned": len(bars), "candidate_cap": MAX_BARS,
            "arbitrary_end_paging": False,
        }
    finally:
        if release_slot:
            slots.release()
