"""Build a candidate-only model bundle outside the repository checkout."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

try:
    from .training_input import MODEL_ID_RE, validate_training_identity
except ImportError:
    from training_input import MODEL_ID_RE, validate_training_identity

MODEL_FILES = ("model.joblib", "model.pt", "scaler.joblib")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def validate_candidate_bundle(models_root: str, symbol: str, timeframe: str, output: str) -> dict:
    symbol, timeframe, _ = validate_training_identity(symbol, timeframe, 1)
    root, target = Path(models_root).resolve(), Path(output).resolve()
    if not root.is_dir():
        raise ValueError("training did not produce a model directory")
    if target == root or root in target.parents:
        raise ValueError("candidate bundle output must be outside the training directory")
    target.parent.mkdir(parents=True, exist_ok=True)
    prefix = f"{symbol}__{timeframe}__"
    candidates = []
    for directory in sorted(root.iterdir()):
        if not directory.name.startswith(prefix) or directory.name == prefix + "meta-labeler":
            continue
        if not directory.is_dir():
            continue
        if directory.is_symlink():
            raise ValueError("model output may not contain symlink directories")
        weights = [directory / name for name in MODEL_FILES if (directory / name).exists()]
        if any(item.is_symlink() or not item.is_file() for item in weights):
            raise ValueError(f"{directory.name}: model artifacts must be regular files")
        metadata_path = directory / "metadata.json"
        if not metadata_path.is_file():
            if weights:
                raise ValueError(f"{directory.name}: weights exist without validating metadata")
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("symbol") != symbol or metadata.get("timeframe") != timeframe:
            raise ValueError(f"{directory.name}: metadata identity mismatch")
        model_id = metadata.get("model_id")
        if not isinstance(model_id, str) or not MODEL_ID_RE.fullmatch(model_id):
            raise ValueError(f"{directory.name}: invalid model id")
        if directory.name != f"{prefix}{model_id}":
            raise ValueError(f"{directory.name}: model path differs from metadata")
        if metadata.get("status") != "paper" or metadata.get("releaseStatus") != "candidate":
            if weights:
                raise ValueError(f"{directory.name}: blocked or non-candidate model left weight files behind")
            continue
        if not any(item.name in {"model.joblib", "model.pt"} for item in weights):
            raise ValueError(f"{directory.name}: candidate metadata exists without model weights")
        snapshot = metadata.get("dataset_snapshot")
        digest = snapshot.get("hash") if isinstance(snapshot, dict) else None
        relative = snapshot.get("path") if isinstance(snapshot, dict) else None
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            raise ValueError(f"{directory.name}: invalid immutable dataset digest")
        if relative != f"dataset-snapshots/{digest}.json":
            raise ValueError(f"{directory.name}: unsafe dataset snapshot path")
        snapshot_path = root / relative
        if snapshot_path.is_symlink() or not snapshot_path.is_file():
            raise ValueError(f"{directory.name}: immutable dataset snapshot is missing")
        if hashlib.sha256(snapshot_path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"{directory.name}: immutable dataset snapshot failed SHA-256 verification")
        candidates.append((model_id, directory, metadata, weights, snapshot_path, digest))
    if not candidates:
        raise ValueError("training produced no valid paper/candidate models; no artifact will be published")

    stage = Path(tempfile.mkdtemp(prefix=".tradingcoreos-candidate-", dir=target.parent))
    try:
        model_root, snapshot_root = stage / "models", stage / "dataset-snapshots"
        model_root.mkdir()
        snapshot_root.mkdir()
        copied = set()
        manifest_models = []
        for model_id, directory, metadata, weights, snapshot_path, digest in candidates:
            destination = model_root / model_id
            destination.mkdir()
            shutil.copyfile(directory / "metadata.json", destination / "metadata.json")
            for item in weights:
                shutil.copyfile(item, destination / item.name)
            if digest not in copied:
                shutil.copyfile(snapshot_path, snapshot_root / f"{digest}.json")
                copied.add(digest)
            manifest_models.append({
                "id": model_id, "status": metadata["status"], "releaseStatus": metadata["releaseStatus"],
                "artifacts": sorted([item.name for item in weights] + ["metadata.json"]), "datasetHash": digest,
            })
        manifest = {
            "schema": "tradingcoreos-ml-candidate-bundle/1", "symbol": symbol, "timeframe": timeframe,
            "releaseStatus": "candidate", "liveTradingEligible": False, "promotionRequiresReview": True,
            "modelCount": len(candidates), "models": manifest_models,
        }
        (stage / "bundle-manifest.json").write_text(
            json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8"
        )
        if target.exists():
            if target.is_symlink() or not target.is_dir():
                raise ValueError("candidate bundle output exists and is not a directory")
            shutil.rmtree(target)
        os.replace(stage, target)
        return manifest
    finally:
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and stage candidate ML artifacts")
    parser.add_argument("--models-root", required=True)
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--timeframe", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    manifest = validate_candidate_bundle(args.models_root, args.symbol, args.timeframe, args.out)
    print(json.dumps({
        "symbol": manifest["symbol"], "timeframe": manifest["timeframe"],
        "candidateModels": manifest["modelCount"], "releaseStatus": manifest["releaseStatus"],
        "liveTradingEligible": manifest["liveTradingEligible"],
    }, indent=2))


if __name__ == "__main__":
    main()
