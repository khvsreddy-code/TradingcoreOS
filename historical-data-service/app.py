from __future__ import annotations

import asyncio
import hmac
import math
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
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


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "max_bars": MAX_BARS, "workers": MAX_WORKERS, "service_token_configured": bool(os.environ.get("TVDATAFEED_SERVICE_TOKEN"))}


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
