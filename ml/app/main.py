
from __future__ import annotations

import hmac
import json
import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from .runtime import predict_many

MODEL_ROOT = os.getenv('MODEL_ROOT', './models')
SERVICE_VERSION = os.getenv('ML_SERVICE_VERSION', '3.0.0-versioned-contract')
MAX_CANDLES = 5000
MAX_MODELS = 39
app = FastAPI(title='TradingCoreOS ML Service', version=SERVICE_VERSION)


class Candle(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0
    source: str | None = None
    phase: str | None = None
    confirmed: bool | None = None
    availableAt: str | int | None = None
    revision: int | None = None


class PredictionRequest(BaseModel):
    symbol: str
    timeframe: str
    candles: list[Candle] = Field(min_length=80, max_length=MAX_CANDLES)
    models: list[str] = Field(min_length=1, max_length=MAX_MODELS)
    horizon: int = Field(default=1, ge=1, le=100)


def require_ml_service_auth(received_secret: str | None) -> None:
    """Fail closed when the internal model-service credential is missing or invalid."""
    configured_secret = os.getenv('ML_SERVICE_SECRET', '').strip()
    if len(configured_secret) < 32:
        raise HTTPException(503, 'ML service authentication is not configured; set ML_SERVICE_SECRET to at least 32 characters.')
    if not received_secret or not hmac.compare_digest(received_secret, configured_secret):
        raise HTTPException(401, 'Invalid ML service secret')


def _validate_candles(candles: list[Candle]) -> None:
    previous = None
    for index, candle in enumerate(candles):
        try:
            stamp = datetime.fromisoformat(candle.timestamp.replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            stamp = stamp.astimezone(timezone.utc)
        except (ValueError, AttributeError):
            raise HTTPException(422, f'Invalid timestamp on candle {index}.') from None
        if previous is not None and stamp <= previous:
            raise HTTPException(422, 'Prediction candles must be strictly chronological with unique timestamps.')
        previous = stamp
        values = (candle.open, candle.high, candle.low, candle.close, candle.volume)
        if not all(map(lambda value: isinstance(value, (int, float)) and value == value and abs(value) != float('inf'), values)):
            raise HTTPException(422, f'Candle {index} contains a non-finite OHLCV value.')
        if min(candle.open, candle.high, candle.low, candle.close) <= 0 or candle.volume < 0:
            raise HTTPException(422, f'Candle {index} has invalid prices or negative volume.')
        if candle.high < max(candle.open, candle.close, candle.low) or candle.low > min(candle.open, candle.close, candle.high):
            raise HTTPException(422, f'Candle {index} has an invalid OHLC range.')


@app.get('/health')
def health():
    count = 0
    if os.path.isdir(MODEL_ROOT):
        count = sum(os.path.isfile(os.path.join(MODEL_ROOT, directory, 'metadata.json')) for directory in os.listdir(MODEL_ROOT))
    return {'status': 'ok', 'service': 'TradingCoreOS ML', 'version': SERVICE_VERSION, 'installed_artifacts': count, 'inference_auth_configured': len(os.getenv('ML_SERVICE_SECRET', '').strip()) >= 32}


@app.get('/models')
def models(x_tradingcore_ml_secret: str | None = Header(default=None)):
    require_ml_service_auth(x_tradingcore_ml_secret)
    out = []
    if os.path.isdir(MODEL_ROOT):
        for directory in sorted(os.listdir(MODEL_ROOT)):
            path = os.path.join(MODEL_ROOT, directory, 'metadata.json')
            if os.path.isfile(path):
                try:
                    with open(path, encoding='utf-8') as stream:
                        out.append(json.load(stream))
                except (OSError, ValueError):
                    continue
    return {'models': out}


@app.post('/predict')
def predict(req: PredictionRequest, x_tradingcore_ml_secret: str | None = Header(default=None)):
    require_ml_service_auth(x_tradingcore_ml_secret)
    if not req.symbol.strip() or not req.timeframe.strip():
        raise HTTPException(422, 'symbol and timeframe are required')
    _validate_candles(req.candles)
    ids = list(dict.fromkeys(model_id.strip() for model_id in req.models if model_id.strip()))[:MAX_MODELS]
    if not ids:
        raise HTTPException(422, 'At least one non-empty model id is required.')
    rows = [candle.model_dump(exclude_none=True) for candle in req.candles]
    result = predict_many(MODEL_ROOT, req.symbol.strip(), req.timeframe.strip(), ids, rows, horizon=req.horizon)
    available = {key: value for key, value in result.items() if value.get('trained')}
    unavailable = {key: value for key, value in result.items() if not value.get('trained')}
    if not available:
        raise HTTPException(503, detail={'message': 'No compatible trained artifacts are installed for this symbol/timeframe/horizon', 'models': unavailable})
    production_ready = {
        key: value for key, value in available.items()
        if value.get('release_status') in ('approved', 'production') and
        value.get('probability_calibration') in ('calibrated', 'validated') and
        value.get('execution_gate', {}).get('live_execution_eligible') is True
    }
    return {
        'symbol': req.symbol.strip(),
        'timeframe': req.timeframe.strip(),
        'horizon': req.horizon,
        'models': result,
        'trained_model_count': len(available),
        'production_ready_model_count': len(production_ready),
        'requested_model_count': len(ids),
        'input_temporal_provenance': {
            'rows': len(rows),
            'latest_bar_phase': rows[-1].get('phase', 'unknown'),
            'latest_bar_confirmed': rows[-1].get('confirmed'),
            'release_policy': 'candidate artifacts may support research/paper inference but are not production-approved',
        },
    }
