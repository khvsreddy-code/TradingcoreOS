"""Broker-neutral execution primitives for TradingCore browser OS."""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Any
import os, time, hashlib, json, threading

@dataclass
class OrderRequest:
    broker:str; mode:str; instrument_key:str; symbol:str; side:str; qty:int
    order_type:str="MARKET"; price:float|None=None; product:str="I"; tag:str="tradingcore"

class OrderGuard:
    def __init__(self):
        self._seen={}; self._lock=threading.Lock()
        self.max_live_lots=int(os.getenv("TRADINGCORE_MAX_LIVE_LOTS","20"))
        self.max_live_notional=float(os.getenv("TRADINGCORE_MAX_LIVE_NOTIONAL","500000"))
    def validate(self, o:OrderRequest, lot_size:int=1, ltp:float=0):
        if o.mode not in ("PAPER","LIVE"): raise ValueError("Invalid execution mode")
        if o.side not in ("BUY","SELL"): raise ValueError("Invalid side")
        if o.qty<=0 or o.qty%max(lot_size,1): raise ValueError("Quantity must be a positive multiple of lot size")
        if o.order_type=="LIMIT" and (o.price is None or o.price<=0): raise ValueError("Limit orders require a positive price")
        if o.mode=="LIVE":
            lots=o.qty//max(lot_size,1)
            if lots>self.max_live_lots: raise ValueError(f"Live order exceeds {self.max_live_lots} lot safety limit")
            notional=o.qty*(o.price or ltp or 0)
            if notional and notional>self.max_live_notional: raise ValueError("Live order exceeds notional safety limit")
        raw=json.dumps(asdict(o),sort_keys=True)
        key=hashlib.sha256(raw.encode()).hexdigest()
        with self._lock:
            now=time.time()
            self._seen={k:v for k,v in self._seen.items() if now-v<15}
            if key in self._seen: raise ValueError("Duplicate order blocked (15s idempotency window)")
            self._seen[key]=now
        return key

guard=OrderGuard()
