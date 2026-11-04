from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Iterable

import joblib
import pandas as pd

from .features import FEATURE_COLUMNS, FEATURE_SCHEMA_VERSION, make_supervised
from .train_all import (
    MODEL_NAMES,
    _ordered_feature_hash,
    build_model_contract,
    evaluate,
    persist_immutable_dataset_snapshot,
    split,
    train_classical,
)
from .runtime import artifact_path
from ..training_input import validate_training_identity

MODEL_ID = "xgb-direction"
OHLCV_FIELDS = ("open", "high", "low", "close", "volume")


def _validate_identity(value: str, label: str) -> str:
    normalized = str(value or "").strip()
    if not normalized or len(normalized) > 128 or any(ch in normalized for ch in ("\\0", "\\n", "\\r")):
        raise ValueError(f"{label} is required and must be a valid identifier.")
    return normalized


def _validate_rows(rows: Iterable[dict], horizon: int) -> list[dict]:
    values = list(rows)
    if len(values) < 240 or len(values) > 5000:
        raise ValueError("CoreSpirit XGBoost training requires 240–5000 confirmed OHLCV candles.")
    normalized: list[dict] = []
    previous = None
    for index, raw in enumerate(values):
        if not isinstance(raw, dict):
            raise ValueError(f"Candle {index} must be an object.")
        if raw.get("confirmed") is not True or str(raw.get("phase", "")).lower() not in ("historical", "confirmed"):
            raise ValueError(f"Candle {index} is not a confirmed historical input.")
        timestamp = pd.to_datetime(raw.get("timestamp"), utc=True, errors="coerce")
        available_at = pd.to_datetime(raw.get("availableAt"), utc=True, errors="coerce")
        if pd.isna(timestamp) or pd.isna(available_at) or available_at > timestamp:
            raise ValueError(f"Candle {index} violates the availableAt <= timestamp rule.")
        stamp = int(timestamp.value // 1_000_000)
        if previous is not None and stamp <= previous:
            raise ValueError("CoreSpirit training candles must be strictly chronological.")
        previous = stamp
        candle = {"timestamp": timestamp.isoformat()}
        for name in OHLCV_FIELDS:
            number = raw.get(name, 0 if name == "volume" else None)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not pd.notna(number):
                raise ValueError(f"Candle {index} has an invalid {name} value.")
            number = float(number)
            if not pd.notna(number) or abs(number) == float("inf"):
                raise ValueError(f"Candle {index} has a non-finite {name} value.")
            candle[name] = number
        if min(candle["open"], candle["high"], candle["low"], candle["close"]) <= 0 or candle["volume"] < 0:
            raise ValueError(f"Candle {index} has invalid prices or negative volume.")
        if candle["high"] < max(candle["open"], candle["close"], candle["low"]) or candle["low"] > min(candle["open"], candle["close"], candle["high"]):
            raise ValueError(f"Candle {index} has an invalid OHLC range.")
        candle.update({"phase": "confirmed", "confirmed": True, "availableAt": timestamp.isoformat()})
        normalized.append(candle)
    if not isinstance(horizon, int) or horizon < 1 or horizon > 100:
        raise ValueError("CoreSpirit XGBoost horizon must be an integer from 1 to 100.")
    return normalized


def train_core_spirit_xgboost(
    model_root: str | Path,
    *,
    symbol: str,
    timeframe: str,
    horizon: int,
    model_version: str,
    dataset_version: str,
    candles: Iterable[dict],
) -> dict:
    """Train a real, versioned XGBoost artifact for CoreSpirit's typed OHLCV model ABI.

    The feature pipeline and estimator are the same implementation used by the
    regular TradingCoreOS Python ML trainer. Only the target is a declared
    forward return; no browser-supplied labels or arbitrary Python code are run.
    """
    symbol = _validate_identity(symbol, "symbol")
    timeframe = _validate_identity(timeframe, "timeframe")
    model_version = str(model_version or "").strip().lower()
    dataset_version = str(dataset_version or "").strip().lower()
    if len(model_version) != 64 or any(c not in "0123456789abcdef" for c in model_version):
        raise ValueError("model_version must be a SHA-256 identity.")
    if len(dataset_version) != 64 or any(c not in "0123456789abcdef" for c in dataset_version):
        raise ValueError("dataset_version must be a SHA-256 identity.")
    if not isinstance(horizon, int) or horizon < 1 or horizon > 100:
        raise ValueError("forecast horizon must be an integer from 1 to 100 bars.")
    validate_training_identity(symbol, timeframe, horizon)
    normalized_candles = _validate_rows(candles, horizon)

    supervised = make_supervised(normalized_candles, horizon, require_confirmed=True)
    if len(supervised) > 5000:
        raise ValueError("CoreSpirit XGBoost dataset exceeds the 5000-row interactive training limit.")
    train, valid, test = split(supervised, horizon)
    if min(len(train), len(valid), len(test)) < 12:
        raise ValueError("Purged chronological XGBoost training requires at least 12 rows in train, validation and test windows.")
    if len(set(int(value) for value in train.target_up.to_numpy())) < 2:
        raise ValueError("The chronological training window contains only one direction class.")
    if len(set(int(value) for value in test.target_up.to_numpy())) < 2:
        raise ValueError("The untouched chronological test window contains only one direction class.")

    root = Path(model_root)
    root.mkdir(parents=True, exist_ok=True)
    session_holidays: list[str] = []
    calendar_hash = hashlib.sha256("".encode("utf-8")).hexdigest()
    snapshot = persist_immutable_dataset_snapshot(
        root,
        supervised,
        symbol=symbol,
        timeframe=timeframe,
        horizon=horizon,
        exchange_timezone="Asia/Kolkata",
        session_open="09:15",
        session_close="15:30",
        session_holidays=session_holidays,
        session_calendar_hash=calendar_hash,
    )

    model = train_classical(train, valid, MODEL_ID, FEATURE_COLUMNS)
    metrics = evaluate(model, test, FEATURE_COLUMNS, "direction")
    if not isinstance(metrics, dict) or not isinstance(metrics.get("sample_count"), int) or metrics["sample_count"] != len(test):
        raise RuntimeError("XGBoost chronological test metrics are incomplete.")
    if not all(isinstance(metrics.get(name), (int, float)) and pd.notna(metrics.get(name)) for name in ("accuracy", "precision", "recall", "brier_score")):
        raise RuntimeError("XGBoost evaluation returned incomplete or non-finite classification metrics.")

    required_lookback = 80
    meta = {
        "model_id": MODEL_ID,
        "name": MODEL_NAMES[MODEL_ID],
        "algorithm": "xgboost",
        "version": model_version,
        "symbol": symbol,
        "timeframe": timeframe,
        "horizon": horizon,
        "status": "paper",
        "trained_on": "CoreSpirit immutable confirmed OHLCV snapshot",
        "feature_schema": list(FEATURE_COLUMNS),
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "feature_schema_hash": _ordered_feature_hash(FEATURE_COLUMNS),
        "exchange_timezone": "Asia/Kolkata",
        "session_open": "09:15",
        "session_close": "15:30",
        "session_holidays": session_holidays,
        "session_calendar_policy": "weekday-session+explicit-holidays/v1",
        "session_calendar_hash": calendar_hash,
        "dataset_hash": snapshot["hash"],
        "dataset_snapshot": snapshot,
        "target_kind": "direction",
        "forecast_horizon_bars": horizon,
        "required_lookback_bars": required_lookback,
        "calibration_status": "not_calibrated",
        "release_status": "candidate",
        "validation_protocol": "purged-chronological-v1",
        "purged_bars_per_boundary": horizon,
        "metrics": metrics,
    }
    contract = build_model_contract(meta, FEATURE_COLUMNS, metrics, session_holidays)
    contract["identity"]["version"] = model_version
    contract["target"]["kind"] = "direction"
    contract["target"]["forecastHorizonBars"] = horizon
    contract["validation"]["calibrationStatus"] = "not_calibrated"
    contract["releaseStatus"] = "candidate"
    meta["model_contract"] = contract
    meta["kind"] = "classical"
    meta["corespirit_dataset_version"] = dataset_version
    meta["corespirit_model_version"] = model_version
    meta["training_protocol"] = "purged-chronological-v1"

    base = artifact_path(root, symbol, timeframe, MODEL_ID)
    versions = base / "versions"
    versions.mkdir(parents=True, exist_ok=True)
    version_dir = versions / model_version
    if version_dir.exists():
        existing_path = version_dir / "metadata.json"
        try:
            existing = json.loads(existing_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise RuntimeError("A versioned CoreSpirit artifact path already exists but is unreadable.") from error
        if existing.get("corespirit_dataset_version") != dataset_version or existing.get("version") != model_version:
            raise RuntimeError("A conflicting artifact already exists for this immutable model version.")
        return {
            "model_id": MODEL_ID,
            "model_version": model_version,
            "artifact_hash": existing.get("artifact_hash"),
            "dataset_hash": existing.get("dataset_hash"),
            "release_status": existing.get("release_status", "candidate"),
            "calibration_status": existing.get("calibration_status", "not_calibrated"),
            "metrics": existing.get("metrics", {}),
            "idempotent_reuse": True,
        }

    with tempfile.TemporaryDirectory(prefix=".corespirit-xgb-", dir=versions) as temporary:
        temporary_dir = Path(temporary)
        model_path = temporary_dir / "model.joblib"
        joblib.dump({"kind": "classical", "model": model, "features": list(FEATURE_COLUMNS)}, model_path)
        model_bytes = model_path.read_bytes()
        artifact_hash = hashlib.sha256(model_bytes).hexdigest()
        meta["artifact_hash"] = artifact_hash
        meta["model_contract"]["artifactHash"] = artifact_hash
        (temporary_dir / "metadata.json").write_text(
            json.dumps(meta, sort_keys=True, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        os.replace(temporary_dir, version_dir)

    # Keep the active pointer compatible with the existing /models and /predict
    # endpoints. Never replace an already-approved active release automatically.
    pointer_path = base / "metadata.json"
    current_pointer = {}
    if pointer_path.exists():
        try:
            current_pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            current_pointer = {}
    current_release = str(current_pointer.get("release_status", "candidate"))
    pointer_updated = current_release != "approved"
    if pointer_updated:
        pointer = {**meta, "active_version": model_version}
        temporary_pointer = base / (".metadata-" + model_version + ".tmp")
        temporary_pointer.write_text(
            json.dumps(pointer, sort_keys=True, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        os.replace(temporary_pointer, pointer_path)

    return {
        "model_id": MODEL_ID,
        "model_version": model_version,
        "artifact_hash": artifact_hash,
        "dataset_hash": snapshot["hash"],
        "corespirit_dataset_version": dataset_version,
        "release_status": "candidate",
        "calibration_status": "not_calibrated",
        "metrics": metrics,
        "training_rows": len(train),
        "validation_rows": len(valid),
        "test_rows": len(test),
        "pointer_updated": pointer_updated,
        "idempotent_reuse": False,
    }
