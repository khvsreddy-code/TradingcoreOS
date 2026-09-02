"""Broker-neutral pre-trade risk engine for TradingCore OS.

Designed as a fast, deterministic gate before any live order is sent.
All limits are configurable with environment variables and the emergency
kill switch is process-wide until replaced with persistent per-account state.
"""
from __future__ import annotations
import os, threading, time

class RiskEngine:
    def __init__(self):
        self.max_lots=int(os.getenv("TRADINGCORE_RISK_MAX_LOTS","5"))
        self.max_notional=float(os.getenv("TRADINGCORE_RISK_MAX_NOTIONAL","250000"))
        self.max_daily_loss=float(os.getenv("TRADINGCORE_RISK_MAX_DAILY_LOSS","10000"))
        self.max_open_lots=int(os.getenv("TRADINGCORE_RISK_MAX_OPEN_LOTS","10"))
        self.max_orders_min=int(os.getenv("TRADINGCORE_RISK_MAX_ORDERS_MIN","20"))
        self._lock=threading.Lock(); self._kill=False; self._orders=[]
    def kill(self, armed:bool):
        with self._lock: self._kill=bool(armed)
        return self._kill
    def status(self):
        with self._lock: return self._kill
    def preflight(self, mode, qty, lot_size, price, ltp, daily_pnl=0, open_lots=0):
        reasons=[]; lot=max(int(lot_size or 1),1); qty=int(qty or 0); lots=qty//lot if qty else 0
        notional=qty*float(price or ltp or 0)
        if mode=="LIVE" and self.status(): reasons.append("Emergency kill switch is armed")
        if qty<=0 or qty%lot: reasons.append("Quantity must be a positive lot multiple")
        if lots>self.max_lots: reasons.append(f"Order exceeds {self.max_lots} lot risk limit")
        if notional>self.max_notional: reasons.append(f"Order exceeds ₹{self.max_notional:,.0f} notional risk limit")
        if float(daily_pnl) <= -abs(self.max_daily_loss): reasons.append("Daily loss limit reached")
        if int(open_lots)+lots>self.max_open_lots: reasons.append(f"Open exposure would exceed {self.max_open_lots} lots")
        now=time.time()
        with self._lock:
            self._orders=[t for t in self._orders if now-t<60]
            if mode=="LIVE" and len(self._orders)>=self.max_orders_min: reasons.append("Live order rate limit reached")
        return {"allowed":not reasons,"reasons":reasons,"reason":reasons[0] if reasons else "Risk preflight passed","lots":lots,"notional":notional,"kill_switch":self.status()}
    def record_live_order(self):
        with self._lock: self._orders.append(time.time())

risk=RiskEngine()
