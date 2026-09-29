"""TradingCoreOS CoreSpirit research client.

This package is intentionally a research/client layer. It does not execute
production broker orders and it does not embed the CoreSpirit VM.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Protocol, Sequence


class Transport(Protocol):
    def load(self, artifact: str) -> Mapping[str, Any]: ...
    def history(self, symbol: str, timeframe: str, **kwargs: Any) -> Mapping[str, Any]: ...
    def replay(self, artifact_checksum: str, dataset_id: str, mode: str = "replay") -> Mapping[str, Any]: ...
    def train(self, request: Mapping[str, Any]) -> Mapping[str, Any]: ...


@dataclass(frozen=True)
class ModelResult:
    model_id: str
    model_version: str
    prediction: Any
    confidence: float | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)
    output_checksum: str = ""


class ModelHandle:
    """Research-side handle for a registered CoreSpirit external model.

    The handle orchestrates inference through the configured transport; it does
    not execute broker orders and does not embed the production CoreSpirit VM.
    """

    def __init__(self, client: "CoreSpiritClient", model_id: str, model_version: str):
        self._client = client
        self.model_id = model_id
        self.model_version = model_version

    def predict(self, *, symbol: str, timeframe: str, timestamp: int, features: Mapping[str, Any]) -> ModelResult:
        infer = getattr(self._client._transport, "infer_model", None)
        if infer is None:
            raise RuntimeError("research transport does not implement infer_model()")
        raw = infer({
            "modelId": self.model_id,
            "modelVersion": self.model_version,
            "symbol": symbol,
            "timeframe": timeframe,
            "timestamp": timestamp,
            "features": dict(features),
        })
        return ModelResult(
            model_id=str(raw["modelId"]),
            model_version=str(raw["modelVersion"]),
            prediction=raw.get("prediction"),
            confidence=float(raw["confidence"]) if raw.get("confidence") is not None else None,
            metadata=dict(raw.get("metadata", {})),
            output_checksum=str(raw.get("outputChecksum", "")),
        )


@dataclass(frozen=True)
class ReplayResult:
    run_id: str
    artifact_checksum: str
    dataset_id: str
    _signals: tuple[Mapping[str, Any], ...] = ()
    _outputs: Mapping[str, Sequence[float]] = field(default_factory=dict)
    state_checksum: str = ""
    output_checksum: str = ""
    trace_checksum: str = ""

    def metrics(self) -> Mapping[str, Any]:
        longs = sum(1 for s in self._signals if str(s.get("type", "")).upper() in {"LONG", "BUY"})
        shorts = sum(1 for s in self._signals if str(s.get("type", "")).upper() in {"SHORT", "SELL"})
        return {
            "signals": len(self._signals),
            "long_signals": longs,
            "short_signals": shorts,
            "plots": sum(len(values) for values in self._outputs.values()),
            "state_checksum": self.state_checksum,
            "output_checksum": self.output_checksum,
            "trace_checksum": self.trace_checksum,
        }

    def signals(self) -> list[Mapping[str, Any]]:
        return list(self._signals)

    def equity_curve(self, initial_equity: float = 1.0) -> list[float]:
        # Research projection only. A production backtest should supply an
        # execution simulator/fill model rather than pretending signals are fills.
        equity = initial_equity
        curve: list[float] = []
        for _ in self._signals:
            curve.append(equity)
        if not curve:
            curve.append(equity)
        return curve


@dataclass(frozen=True)
class TrainingResult:
    model_id: str
    model_version: str
    artifact_checksum: str
    metrics: Mapping[str, float]


class Market:
    def __init__(self, transport: Transport):
        self._transport = transport

    def history(self, symbol: str, timeframe: str, **kwargs: Any) -> Mapping[str, Any]:
        return self._transport.history(symbol, timeframe, **kwargs)


class CoreSpiritModel:
    def __init__(self, client: "CoreSpiritClient", artifact_checksum: str):
        self._client = client
        self.artifact_checksum = artifact_checksum

    def replay(self, data: Mapping[str, Any], mode: str = "replay") -> ReplayResult:
        dataset_id = str(data["datasetId"])
        raw = self._client._transport.replay(self.artifact_checksum, dataset_id, mode)
        return ReplayResult(
            run_id=str(raw["runId"]),
            artifact_checksum=str(raw["artifactChecksum"]),
            dataset_id=str(raw["datasetId"]),
            _signals=tuple(raw.get("signals", ())),
            _outputs={k: tuple(v) for k, v in raw.get("outputs", {}).items()},
            state_checksum=str(raw.get("stateChecksum", "")),
            output_checksum=str(raw.get("outputChecksum", "")),
            trace_checksum=str(raw.get("traceChecksum", "")),
        )

    def train(self, **kwargs: Any) -> TrainingResult:
        raw = self._client._transport.train({
            "modelId": kwargs.get("model_id"),
            "featureSet": kwargs.get("feature_set", ()),
            "target": kwargs.get("target"),
            "seed": kwargs.get("seed", "default"),
            "datasetId": kwargs.get("dataset_id"),
        })
        return TrainingResult(
            model_id=str(raw["modelId"]),
            model_version=str(raw["modelVersion"]),
            artifact_checksum=str(raw["artifactChecksum"]),
            metrics={str(k): float(v) for k, v in raw.get("metrics", {}).items()},
        )


class CoreSpiritClient:
    def __init__(self, transport: Transport):
        self._transport = transport
        self.market = Market(transport)

    def model(self, model_id: str, model_version: str) -> ModelHandle:
        return ModelHandle(self, model_id, model_version)

    def load(self, artifact: str) -> CoreSpiritModel:
        info = self._transport.load(artifact)
        checksum = str(info.get("artifactChecksum", artifact))
        return CoreSpiritModel(self, checksum)
