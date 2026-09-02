"""FYERS V3 adapter. The official SDK is optional at import time."""
from __future__ import annotations
def place_order(access_token, payload):
    try:
        from fyers_apiv3 import fyersModel
    except Exception as e: raise RuntimeError("Install fyers-apiv3 for FYERS execution") from e
    # FYERS V3 SDK instances are created server-side; credentials never enter frontend JS.
    client_id=payload.pop("_client_id",None)
    if not client_id: raise ValueError("Missing FYERS client id")
    api=fyersModel.FyersModel(client_id=client_id,is_async=False,token=access_token,log_path="")
    payload.pop("broker",None); return api.place_order(payload)

def orders(access_token, client_id):
    from fyers_apiv3 import fyersModel
    return fyersModel.FyersModel(client_id=client_id,is_async=False,token=access_token,log_path="").orderbook()
