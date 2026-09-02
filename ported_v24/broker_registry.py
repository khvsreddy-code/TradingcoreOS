"""Process-local broker connection registry.

Connections are keyed by broker + account id. Multiple Streamlit sessions can
reuse the same authenticated market-data connection for the same account,
while different users/accounts remain isolated.
"""
from __future__ import annotations

import hashlib
import threading
from typing import Dict, Optional

from broker_core import BrokerAdapter
from upstox_adapter import UpstoxV3Adapter
from fyers_adapter import FyersV3Adapter

_LOCK = threading.RLock()
_CONNECTIONS: Dict[str, BrokerAdapter] = {}


def account_key(broker: str, account_id: str, token: str = "") -> str:
    # Do not expose or log the token itself. The digest only differentiates
    # authenticated sessions internally.
    digest = hashlib.sha256(token.encode()).hexdigest()[:16] if token else "anonymous"
    return f"{broker}:{account_id}:{digest}"


def get_upstox(account_id: str, token: str) -> UpstoxV3Adapter:
    key = account_key("upstox", account_id, token)
    with _LOCK:
        adapter = _CONNECTIONS.get(key)
        if adapter is None:
            adapter = UpstoxV3Adapter(token, account_id=account_id)
            _CONNECTIONS[key] = adapter
        return adapter


def get_fyers(account_id: str, app_id: str, token: str) -> FyersV3Adapter:
    key = account_key("fyers", account_id, token)
    with _LOCK:
        adapter = _CONNECTIONS.get(key)
        if adapter is None:
            adapter = FyersV3Adapter(app_id, token, account_id=account_id)
            _CONNECTIONS[key] = adapter
        return adapter


def health_snapshot():
    with _LOCK:
        return [adapter.health() for adapter in _CONNECTIONS.values()]


def close_all() -> None:
    with _LOCK:
        values = list(_CONNECTIONS.values())
        _CONNECTIONS.clear()
    for adapter in values:
        try:
            adapter.close()
        except Exception:
            pass
