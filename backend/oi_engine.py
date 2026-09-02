"""TradingCore OI intelligence engine.
Framework independent, stateful across option-chain snapshots.
"""
from __future__ import annotations
from typing import Iterable, Mapping, Any
import math
from collections import defaultdict


def _f(x, d=0.0):
    try:
        v=float(x)
        return v if math.isfinite(v) else d
    except Exception:
        return d


def pcr(chain):
    ce=sum(_f(r.get("ce_oi") or r.get("call_oi")) for r in chain)
    pe=sum(_f(r.get("pe_oi") or r.get("put_oi")) for r in chain)
    return pe/ce if ce else 0.0


def max_pain(chain):
    rows=list(chain)
    strikes=sorted({_f(r.get("strike")) for r in rows if _f(r.get("strike"))>0})
    if not strikes: return None
    best,best_loss=None,float("inf")
    for s in strikes:
        loss=0.0
        for r in rows:
            k=_f(r.get("strike")); ce=_f(r.get("ce_oi") or r.get("call_oi")); pe=_f(r.get("pe_oi") or r.get("put_oi"))
            loss += max(0,s-k)*ce + max(0,k-s)*pe
        if loss<best_loss: best_loss,best=loss,s
    return best


def _rows(chain):
    out=[]
    for r in chain:
        k=_f(r.get("strike"))
        if not k: continue
        out.append({
            "strike":k,
            "ce_oi":_f(r.get("ce_oi") or r.get("call_oi")),
            "pe_oi":_f(r.get("pe_oi") or r.get("put_oi")),
            "ce_doi":_f(r.get("ce_doi_5m") or r.get("ce_change_oi")),
            "pe_doi":_f(r.get("pe_doi_5m") or r.get("pe_change_oi")),
            "ce_ltp":_f(r.get("ce_ltp") or r.get("call_ltp")),
            "pe_ltp":_f(r.get("pe_ltp") or r.get("put_ltp")),
            "ce_price_change":_f(r.get("ce_price_change")),
            "pe_price_change":_f(r.get("pe_price_change")),
        })
    return sorted(out,key=lambda x:x["strike"])


def classify_leg(ltp, doi, price_change):
    dp=_f(price_change); d=_f(doi)
    if dp>0 and d>0: return "LONG_BUILDUP"
    if dp<0 and d>0: return "SHORT_BUILDUP"
    if dp>0 and d<0: return "SHORT_COVERING"
    if dp<0 and d<0: return "LONG_UNWINDING"
    return "NEUTRAL"


def classify_buildup(rows):
    return [{**dict(r),"state":classify_leg(r.get("ltp"),r.get("doi") or r.get("change_oi"),r.get("price_change"))} for r in rows]


def walls(chain, top_n=5):
    rows=_rows(chain)
    return {"call":sorted(rows,key=lambda x:x["ce_oi"],reverse=True)[:top_n],"put":sorted(rows,key=lambda x:x["pe_oi"],reverse=True)[:top_n]}


def levels(chain, spot, top_n=5):
    w=walls(chain,max(top_n,10))
    support=sorted([x for x in w["put"] if x["strike"]<=spot],key=lambda x:x["pe_oi"],reverse=True)[:top_n]
    resistance=sorted([x for x in w["call"] if x["strike"]>=spot],key=lambda x:x["ce_oi"],reverse=True)[:top_n]
    return {"support":support,"resistance":resistance}


def movement(chain):
    rows=_rows(chain); out=[]
    for r in rows:
        for leg,ltp,doi,dp in (("CE",r["ce_ltp"],r["ce_doi"],r["ce_price_change"]),("PE",r["pe_ltp"],r["pe_doi"],r["pe_price_change"])):
            out.append({"strike":r["strike"],"leg":leg,"ltp":ltp,"doi":doi,"price_change":dp,"state":classify_leg(ltp,doi,dp)})
    return out


class OITracker:
    """Stateful OI snapshot tracker with wall movement, flips and level lifecycle."""
    def __init__(self):
        self.previous={}
        self.history=defaultdict(list)
        self.lifecycle=defaultdict(dict)

    @staticmethod
    def _wall(cur, old, leg):
        if not cur: return None
        k=cur["strike"]; oi=cur[f"{leg}_oi"]; doi=cur[f"{leg}_doi"]
        prev_k=old["strike"] if old else None
        return {"strike":k,"oi":oi,"doi":doi,"previous_strike":prev_k,
                "moved":bool(old and k!=prev_k),
                "direction":"UP" if old and k>prev_k else "DOWN" if old and k<prev_k else "STABLE"}

    def snapshot(self,key,chain,spot,top_n=5,mitigation_pct=0.0025):
        rows=_rows(chain)
        calls=sorted(rows,key=lambda x:x["ce_oi"],reverse=True)[:top_n]
        puts=sorted(rows,key=lambda x:x["pe_oi"],reverse=True)[:top_n]
        w={"call":calls,"put":puts}
        prev=self.previous.get(key,{})
        call=calls[0] if calls else None; put=puts[0] if puts else None
        cw=self._wall(call,prev.get("call"),"ce"); pw=self._wall(put,prev.get("put"),"pe")

        # Wall movement trail: keep the last 20 dominant wall positions.
        trail=list(prev.get("trail",[]))
        for x,side in ((cw,"CALL"),(pw,"PUT")):
            if x:
                trail.append({"side":side,"strike":x["strike"],"oi":x["oi"],"doi":x["doi"]})
        trail=trail[-20:]

        # Dominance flip plus per-strike flow flips (positive -> negative ΔOI or vice versa).
        old_bias=prev.get("bias","NEUTRAL")
        bias="CALL_DOMINANT" if call and (not put or call["ce_oi"]>=put["pe_oi"]) else "PUT_DOMINANT" if put else "NEUTRAL"
        bias_flip=old_bias not in (None,"NEUTRAL") and bias not in ("NEUTRAL",old_bias)
        old_flow=prev.get("flow",{})
        flips=[]
        for r in rows:
            for leg in ("CE","PE"):
                doi=r[f"{leg.lower()}_doi"]; sign=1 if doi>0 else -1 if doi<0 else 0
                sk=f"{leg}:{r['strike']:g}"; old_sign=old_flow.get(sk,0)
                if sign and old_sign and sign!=old_sign:
                    flips.append({"leg":leg,"strike":r["strike"],"from":"BUILDUP" if old_sign>0 else "UNWINDING","to":"BUILDUP" if sign>0 else "UNWINDING"})
                old_flow[sk]=sign

        # Level lifecycle. A touch/cross marks mitigation; mitigated levels remain in the
        # lifecycle feed for a few snapshots and fade automatically instead of disappearing.
        tol=max(abs(spot)*mitigation_pct,1e-6)
        active={}
        current_keys=set()
        for side,arr,leg in (("CALL",calls,"ce"),("PUT",puts,"pe")):
            for r in arr:
                k=r["strike"]; ident=f"{side}:{k:g}"; current_keys.add(ident)
                item=self.lifecycle[key].get(ident,{"age":0,"mitigated":False,"fade":1.0})
                crossed=prev.get("spot") is not None and ((prev["spot"]<k<=spot) or (prev["spot"]>k>=spot))
                touched=abs(spot-k)<=tol
                mitigated=bool(item.get("mitigated") or touched or crossed)
                item.update({"id":ident,"side":side,"strike":k,"oi":r[f"{leg}_oi"],"doi":r[f"{leg}_doi"],
                             "age":int(item.get("age",0))+1,"mitigated":mitigated,
                             "state":"MITIGATED" if mitigated else "ACTIVE"})
                if mitigated:
                    item["fade"] = max(0.10, float(item.get("fade",1.0))*0.78)
                    item["mitigated_snapshot"]=int(item.get("mitigated_snapshot",0))+1
                else: item["fade"]=1.0
                self.lifecycle[key][ident]=item; active[ident]=item

        # Keep recently mitigated levels even after they fall out of the top-N wall list.
        for ident,item in list(self.lifecycle[key].items()):
            if ident in current_keys: continue
            if item.get("mitigated"):
                item["fade"]=max(0.08,float(item.get("fade",1.0))*0.78)
                item["age"]=int(item.get("age",0))+1
                if item["fade"]<=0.10: del self.lifecycle[key][ident]
                else: active[ident]=item

        result={
            "walls":w,
            "wall_movement":{"call":cw,"put":pw,"trail":trail},
            "bias":bias,
            "flip":{"detected":bool(bias_flip or flips),"dominance":bias_flip,"from":old_bias,"to":bias,"flow_flips":flips},
            "levels":list(active.values()),
            "spot":spot,
        }
        self.previous[key]={"call":call,"put":put,"bias":bias,"spot":spot,"trail":trail,"flow":old_flow}
        self.history[key].append(result)
        self.history[key]=self.history[key][-50:]
        result["history"]=self.history[key][-10:]
        return result


def enriched_summary(tracker,key,chain,spot,top_n=5):
    base={"pcr":pcr(chain),"max_pain":max_pain(chain),"walls":walls(chain,top_n),
          "levels":levels(chain,spot,top_n),"movement":movement(chain),"spot":spot}
    extra=tracker.snapshot(key,chain,spot,top_n)
    # Preserve the traditional support/resistance arrays and expose lifecycle separately.
    base.update(extra)
    return base
