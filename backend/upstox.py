"""Upstox adapter: V3 order operations + current option-contract lookup."""
from __future__ import annotations
import requests
from requests.adapters import HTTPAdapter

_http=requests.Session()
_adapter=HTTPAdapter(pool_connections=32,pool_maxsize=64,max_retries=0,pool_block=False)
_http.mount("https://",_adapter)
from .broker_core import OrderRequest
ORDER_BASE="https://api-hft.upstox.com/v3"
DATA_BASE="https://api.upstox.com/v2"

def _headers(token):
    return {"Authorization":f"Bearer {token}","Accept":"application/json","Content-Type":"application/json"}

def option_contracts(token, underlying_key, expiry=None):
    params={"instrument_key":underlying_key}
    if expiry: params["expiry_date"]=expiry
    r=_http.get(f"{DATA_BASE}/option/contract",headers=_headers(token),params=params,timeout=5)
    r.raise_for_status()
    return (r.json().get("data") or [])

def resolve_option(token, underlying_key, expiry, strike, leg):
    rows=option_contracts(token,underlying_key,expiry)
    typ=leg.upper()
    matches=[x for x in rows if str(x.get("instrument_type","")).upper()==typ and abs(float(x.get("strike_price",0))-float(strike))<1e-6]
    if not matches: raise ValueError("Broker option contract not found for selected expiry/strike/type")
    x=matches[0]
    return {"instrument_key":x["instrument_key"],"symbol":x.get("trading_symbol",""),"strike":float(x["strike_price"]),"lot_size":int(x.get("lot_size") or x.get("minimum_lot") or 1),"freeze_quantity":int(x.get("freeze_quantity") or 0),"tick_size":float(x.get("tick_size") or 0),"expiry":x.get("expiry")}

def place_order(token:str, order:OrderRequest):
    if not token: raise ValueError("Missing Upstox access token")
    payload={"quantity":order.qty,"product":order.product,"validity":"DAY","price":order.price or 0,"tag":order.tag,
             "instrument_token":order.instrument_key,"order_type":order.order_type,"transaction_type":order.side,
             "disclosed_quantity":0,"trigger_price":0,"is_amo":False,"slice":False}
    r=_http.post(f"{ORDER_BASE}/order/place",headers=_headers(token),json=payload,timeout=5)
    r.raise_for_status(); return r.json()

def orders(token):
    r=_http.get(f"{DATA_BASE}/order/retrieve-all",headers=_headers(token),timeout=5); r.raise_for_status(); return r.json()

def positions(token):
    r=_http.get(f"{DATA_BASE}/portfolio/short-term-positions",headers=_headers(token),timeout=5); r.raise_for_status(); return r.json()

def funds(token):
    r=_http.get(f"{DATA_BASE}/user/get-funds-and-margin",headers=_headers(token),timeout=5); r.raise_for_status(); return r.json()

def funds_v3(token):
    r=_http.get("https://api.upstox.com/v3/user/get-funds-and-margin",headers={"Authorization":f"Bearer {token}","Accept":"application/json","Api-Version":"3.0"},timeout=5)
    r.raise_for_status(); return r.json()

def portfolio_stream_authorize(token, update_types="order,position,holding"):
    r=_http.get("https://api.upstox.com/v2/feed/portfolio-stream-feed/authorize",headers={"Authorization":f"Bearer {token}","Accept":"application/json"},params={"update_types":update_types},timeout=5)
    r.raise_for_status(); return r.json().get("data",{}).get("authorized_redirect_uri")
