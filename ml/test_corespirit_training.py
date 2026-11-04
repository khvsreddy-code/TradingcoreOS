from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from ml.app.corespirit_training import train_core_spirit_xgboost
from ml.app.features import FEATURE_COLUMNS


class FakeClassifier:
    def predict_proba(self, frame):
        indexes = np.arange(len(frame), dtype=float)
        probability = 0.5 + 0.2 * np.sin(indexes * 0.37)
        probability = np.clip(probability, 0.05, 0.95)
        return np.column_stack((1.0 - probability, probability))

    def predict(self, frame):
        return (self.predict_proba(frame)[:, 1] >= 0.5).astype(int)


def confirmed_candles(count: int = 500):
    result = []
    previous = 100.0
    for index in range(count):
        close = 100 + index * 0.003 + 1.8 * np.sin(index * 0.19) + 0.35 * np.sin(index * 0.71)
        open_price = previous
        high = max(open_price, close) + 0.25
        low = min(open_price, close) - 0.25
        timestamp = f"2026-01-{1 + (index // 300):02d}T{9 + ((index % 300) // 60):02d}:{(index % 60):02d}:00+05:30"
        result.append({
            "timestamp": timestamp,
            "availableAt": timestamp,
            "open": float(open_price),
            "high": float(high),
            "low": float(low),
            "close": float(close),
            "volume": float(1000 + (index % 37) * 11),
            "phase": "historical",
            "confirmed": True,
        })
        previous = close
    return result


class CoreSpiritXgboostTrainingTests(unittest.TestCase):
    def test_trains_versioned_candidate_from_confirmed_ohlcv(self):
        with tempfile.TemporaryDirectory() as temporary:
            model_version = "a" * 64
            dataset_version = "b" * 64
            with patch("ml.app.corespirit_training.train_classical", return_value=FakeClassifier()) as trainer:
                result = train_core_spirit_xgboost(
                    temporary,
                    symbol="NSE:NIFTY50-INDEX",
                    timeframe="5m",
                    horizon=3,
                    model_version=model_version,
                    dataset_version=dataset_version,
                    candles=confirmed_candles(),
                )

            trainer.assert_called_once()
            self.assertEqual(trainer.call_args.args[2], "xgb-direction")
            self.assertEqual(result["model_id"], "xgb-direction")
            self.assertEqual(result["model_version"], model_version)
            self.assertEqual(result["corespirit_dataset_version"], dataset_version)
            self.assertEqual(result["release_status"], "candidate")
            self.assertEqual(result["calibration_status"], "not_calibrated")
            self.assertGreaterEqual(result["training_rows"], 12)
            self.assertGreaterEqual(result["validation_rows"], 12)
            self.assertGreaterEqual(result["test_rows"], 12)
            self.assertIn("accuracy", result["metrics"])
            self.assertIn("brier_score", result["metrics"])

            base = Path(temporary) / "NSE_NIFTY50-INDEX__5m__xgb-direction"
            version_dir = base / "versions" / model_version
            metadata = json.loads((version_dir / "metadata.json").read_text(encoding="utf-8"))
            self.assertTrue((version_dir / "model.joblib").is_file())
            self.assertEqual(metadata["algorithm"], "xgboost")
            self.assertEqual(metadata["release_status"], "candidate")
            self.assertEqual(metadata["calibration_status"], "not_calibrated")
            self.assertEqual(metadata["model_contract"]["releaseStatus"], "candidate")
            self.assertEqual(metadata["model_contract"]["target"]["forecastHorizonBars"], 3)
            self.assertEqual(metadata["dataset_snapshot"]["immutable"], True)
            active = json.loads((base / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(active["active_version"], model_version)
            self.assertEqual(active["release_status"], "candidate")

    def test_rejects_forming_or_unconfirmed_candles(self):
        candles = confirmed_candles()
        candles[100] = {**candles[100], "confirmed": False, "phase": "developing"}
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "not a confirmed historical input"):
                train_core_spirit_xgboost(
                    temporary,
                    symbol="NSE:NIFTY50-INDEX",
                    timeframe="5m",
                    horizon=3,
                    model_version="c" * 64,
                    dataset_version="d" * 64,
                    candles=candles,
                )

    def test_rejects_noncanonical_horizon_or_feature_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "horizon"):
                train_core_spirit_xgboost(
                    temporary,
                    symbol="NSE:NIFTY50-INDEX",
                    timeframe="5m",
                    horizon=0,
                    model_version="e" * 64,
                    dataset_version="f" * 64,
                    candles=confirmed_candles(),
                )

    def test_existing_same_version_is_reused(self):
        with tempfile.TemporaryDirectory() as temporary:
            arguments = dict(
                model_root=temporary,
                symbol="NSE:NIFTY50-INDEX",
                timeframe="5m",
                horizon=3,
                model_version="1" * 64,
                dataset_version="2" * 64,
                candles=confirmed_candles(),
            )
            with patch("ml.app.corespirit_training.train_classical", return_value=FakeClassifier()):
                first = train_core_spirit_xgboost(**arguments)
                second = train_core_spirit_xgboost(**arguments)
            self.assertFalse(first.get("idempotent_reuse", False))
            self.assertTrue(second["idempotent_reuse"])
            self.assertEqual(first["artifact_hash"], second["artifact_hash"])


if __name__ == "__main__":
    unittest.main()
