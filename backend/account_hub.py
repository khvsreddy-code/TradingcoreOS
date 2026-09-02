"""Persistent per-account portfolio event hub.

The browser subscribes once to TradingCore's WebSocket. Broker portfolio/order
updates are fanned out to that connection; REST snapshots are used only for
initial hydration and recovery.
"""
from __future__ import annotations
import asyncio, json, threading, time
from dataclasses import dataclass, field
from typing import Any

@dataclass
class AccountState:
    session_id: str
    broker: str
    orders: list[dict] = field(default_factory=list)
    positions: list[dict] = field(default_factory=list)
    funds: dict = field(default_factory=dict)
    holdings: list[dict] = field(default_factory=list)
    trades: list[dict] = field(default_factory=list)
    last_event: float = 0.0
    connected: bool = False
    stream_status: str = "DISCONNECTED"

class AccountHub:
    def __init__(self):
        self.states: dict[str, AccountState] = {}
        self.clients: dict[str, set[Any]] = {}
        self.lock = threading.RLock()

    def state(self, sid: str, broker: str) -> AccountState:
        with self.lock:
            return self.states.setdefault(sid, AccountState(sid, broker))

    async def attach(self, sid: str, ws: Any):
        with self.lock:
            self.clients.setdefault(sid, set()).add(ws)
        try:
            st = self.states.get(sid)
            if st:
                await ws.send_json(self.snapshot(st))
            while True:
                await ws.receive_text()
        except Exception:
            pass
        finally:
            with self.lock:
                self.clients.get(sid, set()).discard(ws)

    def snapshot(self, st: AccountState) -> dict:
        return {"type":"account_snapshot","stream_status":st.stream_status,
                "last_event":st.last_event,"orders":st.orders,"positions":st.positions,
                "funds":st.funds,"holdings":st.holdings,"trades":st.trades}

    def update(self, sid: str, broker: str, update: dict):
        with self.lock:
            st = self.state(sid, broker)
            typ = str(update.get("update_type") or update.get("type") or "event").lower()
            st.last_event = time.time()
            st.connected = True; st.stream_status = "CONNECTED"
            if typ in ("order", "orderupdate"):
                oid = str(update.get("order_id") or update.get("orderId") or "")
                st.orders = [x for x in st.orders if str(x.get("order_id") or x.get("orderId") or "") != oid] + [update]
            elif typ in ("position", "positionupdate"):
                key = str(update.get("instrument_key") or update.get("symbol") or "")
                st.positions = [x for x in st.positions if str(x.get("instrument_key") or x.get("symbol") or "") != key] + [update]
            elif typ == "holding":
                key = str(update.get("instrument_key") or update.get("isin") or update.get("symbol") or "")
                st.holdings = [x for x in st.holdings if str(x.get("instrument_key") or x.get("isin") or x.get("symbol") or "") != key] + [update]
            event = {"type":"account_update","update_type":typ,"data":update,"stream_status":st.stream_status,"last_event":st.last_event}
            clients=list(self.clients.get(sid, set()))
        for ws in clients:
            try:
                asyncio.create_task(ws.send_json(event))
            except Exception:
                pass

    def hydrate(self, sid: str, broker: str, *, orders=None, positions=None, funds=None, holdings=None):
        with self.lock:
            st=self.state(sid,broker)
            if orders is not None: st.orders=orders.get("data", orders) if isinstance(orders,dict) else orders
            if positions is not None: st.positions=positions.get("data", positions) if isinstance(positions,dict) else positions
            if funds is not None: st.funds=funds.get("data", funds) if isinstance(funds,dict) else funds
            if holdings is not None: st.holdings=holdings.get("data", holdings) if isinstance(holdings,dict) else holdings
            st.last_event=time.time()
            return self.snapshot(st)

hub=AccountHub()
