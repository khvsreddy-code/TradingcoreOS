from __future__ import annotations
import time, uuid, threading
from dataclasses import dataclass, asdict, field

@dataclass
class Alert:
    id:str; kind:str; symbol:str; condition:str; value:float|None=None; enabled:bool=True; once:bool=False; created:float=field(default_factory=time.time); triggered:float|None=None

class AlertEngine:
    def __init__(self): self.alerts={}; self.events=[]; self.last={}; self.lock=threading.RLock()
    def create(self, **x):
        a=Alert(id=uuid.uuid4().hex[:12],**x); self.alerts[a.id]=a; return asdict(a)
    def list(self): return [asdict(x) for x in self.alerts.values()]
    def remove(self,i): return self.alerts.pop(i,None) is not None
    def toggle(self,i,en): self.alerts[i].enabled=en; return asdict(self.alerts[i])
    def evaluate(self,symbol, price=None, indicators=None, oi=None, levels=None):
        indicators=indicators or {}; oi=oi or {}; levels=levels or {}; out=[]
        with self.lock:
            prev=self.last.get(symbol,{}); self.last[symbol]={"price":price,**indicators}
            for a in self.alerts.values():
                if not a.enabled or a.symbol!=symbol: continue
                cur=price if a.kind=='price' else indicators.get(a.kind)
                hit=False
                if a.kind=='price' and cur is not None and a.value is not None:
                    hit=(a.condition=='above' and cur>=a.value) or (a.condition=='below' and cur<=a.value) or (a.condition=='cross_above' and prev.get('price',cur)<a.value<=cur) or (a.condition=='cross_below' and prev.get('price',cur)>a.value>=cur)
                elif a.kind in indicators and a.value is not None:
                    hit=(a.condition=='above' and cur>=a.value) or (a.condition=='below' and cur<=a.value)
                elif a.kind=='oi' and a.condition in oi: hit=bool(oi[a.condition])
                elif a.kind=='level' and a.condition in levels: hit=bool(levels[a.condition])
                if hit:
                    a.triggered=time.time(); e={"id":uuid.uuid4().hex[:12],"alert_id":a.id,"symbol":symbol,"kind":a.kind,"condition":a.condition,"value":cur,"target":a.value,"timestamp":a.triggered,"acknowledged":False}; self.events.insert(0,e); out.append(e)
                    if a.once:a.enabled=False
            self.events=self.events[:1000]
        return out
    def history(self): return self.events[:200]
engine=AlertEngine()
