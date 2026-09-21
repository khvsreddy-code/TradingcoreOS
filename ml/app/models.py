from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch
import torch.nn as nn
import xgboost as xgb

from .features import FEATURE_COLUMNS


class LSTMClassifier(nn.Module):
    def __init__(self, input_size: int, hidden_size: int = 64, layers: int = 2, dropout: float = 0.15):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers=layers, batch_first=True, dropout=dropout if layers > 1 else 0.0)
        self.head = nn.Sequential(nn.LayerNorm(hidden_size), nn.Linear(hidden_size, 32), nn.GELU(), nn.Dropout(dropout), nn.Linear(32, 1))

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.head(out[:, -1, :]).squeeze(-1)


class TransformerClassifier(nn.Module):
    def __init__(self, input_size: int, d_model: int = 64, heads: int = 4, layers: int = 2, dropout: float = 0.15, max_len: int = 128):
        super().__init__()
        self.proj = nn.Linear(input_size, d_model)
        self.pos = nn.Parameter(torch.zeros(1, max_len, d_model))
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=heads, dim_feedforward=d_model * 2, dropout=dropout, batch_first=True, norm_first=True, activation='gelu')
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=layers)
        self.head = nn.Sequential(nn.LayerNorm(d_model), nn.Linear(d_model, 32), nn.GELU(), nn.Dropout(dropout), nn.Linear(32, 1))

    def forward(self, x):
        x = self.proj(x)
        x = x + self.pos[:, :x.shape[1], :]
        x = self.encoder(x)
        return self.head(x[:, -1, :]).squeeze(-1)


def artifact_dir(root: str | Path, symbol: str, timeframe: str) -> Path:
    safe = f'{symbol}__{timeframe}'.replace('/', '_').replace(':', '_').replace('|', '_').replace(' ', '_')
    return Path(root) / safe


def load_bundle(root: str | Path, symbol: str, timeframe: str) -> dict[str, Any] | None:
    directory = artifact_dir(root, symbol, timeframe)
    meta_path = directory / 'metadata.json'
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text())
    bundle: dict[str, Any] = {'meta': meta, 'dir': directory}
    if (directory / 'xgboost.json').exists():
        booster = xgb.XGBClassifier()
        booster.load_model(directory / 'xgboost.json')
        bundle['xgb'] = booster
    if (directory / 'scaler.joblib').exists():
        bundle['scaler'] = joblib.load(directory / 'scaler.joblib')
    if (directory / 'transformer.pt').exists():
        model = TransformerClassifier(len(FEATURE_COLUMNS), d_model=meta.get('transformer_d_model', 64), heads=meta.get('transformer_heads', 4), layers=meta.get('transformer_layers', 2), dropout=meta.get('transformer_dropout', 0.15), max_len=meta.get('sequence_length', 60))
        model.load_state_dict(torch.load(directory / 'transformer.pt', map_location='cpu'))
        model.eval()
        bundle['transformer'] = model
    if (directory / 'lstm.pt').exists():
        model = LSTMClassifier(len(FEATURE_COLUMNS), hidden_size=meta.get('lstm_hidden', 64), layers=meta.get('lstm_layers', 2), dropout=meta.get('lstm_dropout', 0.15))
        model.load_state_dict(torch.load(directory / 'lstm.pt', map_location='cpu'))
        model.eval()
        bundle['lstm'] = model
    return bundle


def predict_xgb(bundle: dict[str, Any], x: np.ndarray) -> tuple[float, float]:
    model = bundle.get('xgb')
    if model is None:
        raise RuntimeError('XGBoost artifact is not installed for this symbol/timeframe')
    p = float(model.predict_proba(x[-1:].astype(np.float32))[0, 1])
    return p, 0.0


def predict_sequence_model(bundle: dict[str, Any], sequence: np.ndarray, key: str) -> tuple[float, float]:
    model = bundle.get(key)
    if model is None:
        raise RuntimeError(f'{key} artifact is not installed for this symbol/timeframe')
    scaler = bundle.get('scaler')
    seq = sequence
    if scaler is not None:
        shape = seq.shape
        seq = scaler.transform(seq.reshape(-1, shape[-1])).reshape(shape)
    with torch.no_grad():
        tensor = torch.tensor(seq[None, ...], dtype=torch.float32)
        logit = float(model(tensor).item())
    p = float(1 / (1 + np.exp(-logit)))
    return p, 0.0
