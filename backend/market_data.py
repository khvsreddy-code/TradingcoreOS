"""Persistent market-data hub with TradingView-style timeframe aggregation."""
from __future__ import annotations
import asyncio, time
from collections import defaultdict, deque
from dataclasses import dataclass, asdict
from typing import Any

# Seconds. The chart may request any of these directly or derive them from 1m bars.
TIMEFRAMES={"1s":1,"5s":5,"15s":15,"30s":30,"1m":60,"2m":120,"3m":180,"5m":300,"10m":600,"15m":900,"30m":1800,"45m":2700,"1H":3600,"2H":7200,"3H":10800,"4H":14400,"1D":86400,"1W":604800,"1M":2592000}
DEFAULT_INTERVALS=tuple(TIMEFRAMES.values())

@dataclass
class Tick:
    symbol:str; instrument_key:str; ltp:float|None=None; bid:float|None=None; ask:float|None=None; volume:float|None=None; timestamp:float|None=None; source_timestamp:float|None=None; received_at:float=0.0; sequence:int=0; broker:str=""

class CandleBook:
    def __init__(self, max_bars=5000):
        self.live={}; self.series=defaultdict(lambda: deque(maxlen=max_bars)); self.max_bars=max_bars
    def update(self,t:Tick, intervals=DEFAULT_INTERVALS):
        if t.ltp is None:return []
        now=t.timestamp or time.time(); out=[]
        for sec in intervals:
            start=int(now//sec)*sec; k=(t.instrument_key,sec); current=self.live.get(k)
            if not current or current["time"]!=start:
                if current:self.series[k].append(dict(current))
                current={"instrument_key":t.instrument_key,"symbol":t.symbol,"interval":sec,"time":start,"open":t.ltp,"high":t.ltp,"low":t.ltp,"close":t.ltp,"volume":t.volume or 0}
                self.live[k]=current
            else:
                current["high"]=max(current["high"],t.ltp); current["low"]=min(current["low"],t.ltp); current["close"]=t.ltp; current["volume"]=max(current["volume"],t.volume or 0)
            out.append(dict(current))
        return out
    def history(self,instrument_key,interval,limit=500):
        sec=TIMEFRAMES.get(str(interval), None)
        if sec is None:
            try: sec=int(interval)
            except: raise ValueError("Unsupported timeframe")
        k=(instrument_key,sec); bars=list(self.series[k])
        if self.live.get(k): bars.append(dict(self.live[k]))
        return bars[-max(1,min(int(limit),self.max_bars)):]
    def supported(self):return [{"id":k,"seconds":v} for k,v in TIMEFRAMES.items()]

class MarketDataHub:
    def __init__(self):
        self.subs=defaultdict(set); self.clients=defaultdict(set); self.last={}; self.seq=0; self.lock=asyncio.Lock(); self.candles=CandleBook()
        self.metrics={"ticks":0,"coalesced":0,"fanout":0,"errors":0,"reconnects":0,"started_at":time.time()}
    def normalize(self,broker,payload):
        d=payload.get("data",payload); sym=str(d.get("symbol") or d.get("trading_symbol") or d.get("instrument_key") or d.get("instrument_token") or "UNKNOWN"); key=str(d.get("instrument_key") or d.get("instrument_token") or sym); ltp=d.get("ltp",d.get("last_price",d.get("last_traded_price"))); self.seq+=1; now=time.time()
        return Tick(sym,key,float(ltp) if ltp is not None else None,d.get("bid"),d.get("ask"),d.get("volume"),d.get("timestamp") or now,d.get("timestamp"),now,self.seq,broker.upper())
    async def subscribe(self,client_id,instruments):
        async with self.lock:
            for key in instruments:self.subs[key].add(client_id)
        return self.subscription_snapshot(client_id)
    async def unsubscribe(self,client_id,instruments=None):
        async with self.lock:
            for key in instruments or list(self.subs):
                self.subs[key].discard(client_id)
                if not self.subs[key]:self.subs.pop(key,None)
        return self.subscription_snapshot(client_id)
    def subscription_snapshot(self,client_id=None):
        items=[{"instrument_key":k,"subscriber_count":len(v)} for k,v in self.subs.items() if client_id is None or client_id in v]; return {"subscriptions":items,"upstream_unique":len(self.subs)}
    async def attach(self,client_id,ws):self.clients[client_id].add(ws)
    async def detach(self,client_id,ws=None):
        if ws:self.clients[client_id].discard(ws)
        else:self.clients.pop(client_id,None)
        await self.unsubscribe(client_id)
    async def publish(self,broker,payload):
        try:
            t=self.normalize(broker,payload); self.last[t.instrument_key]=asdict(t); self.metrics["ticks"]+=1; candles=self.candles.update(t); targets=set(self.subs.get(t.instrument_key,set()))|set(self.subs.get(t.symbol,set()))
            msg={"type":"tick","tick":asdict(t),"candles":candles,"latency":{"ingest_ms":round((time.time()-t.received_at)*1000,3),"tick_age_ms":round((time.time()-(t.source_timestamp or t.received_at))*1000,2)}}; dead=[]
            for cid in targets:
                for ws in list(self.clients.get(cid,set())):
                    try:await ws.send_json(msg);self.metrics["fanout"]+=1
                    except Exception:dead.append((cid,ws))
            for cid,ws in dead:await self.detach(cid,ws)
            return msg
        except Exception:self.metrics["errors"]+=1;raise
    def health(self):
        now=time.time();stale=sum(1 for x in self.last.values() if now-x.get("received_at",0)>10);return {"ok":True,"active_clients":sum(len(x) for x in self.clients.values()),"unique_instruments":len(self.subs),"last_ticks":len(self.last),"stale_instruments":stale,"metrics":self.metrics,"subscriptions":self.subscription_snapshot()["subscriptions"],"timeframes":list(TIMEFRAMES)}

hub=MarketDataHub()
