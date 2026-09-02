"""Portfolio normalization, P&L, exposure and blotter helpers."""
from __future__ import annotations
from typing import Any

def _num(x, default=0.0):
    try: return float(x)
    except Exception: return default

def normalize_positions(payload: Any) -> list[dict]:
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    out=[]
    for x in rows or []:
        qty=int(_num(x.get("quantity", x.get("net_qty",0))))
        avg=_num(x.get("average_price", x.get("avg_price",0)))
        ltp=_num(x.get("last_price", x.get("ltp", x.get("last_traded_price",0))))
        pnl=_num(x.get("pnl", (ltp-avg)*qty if qty else 0))
        out.append({**x,"normalized_symbol":x.get("trading_symbol") or x.get("tradingsymbol") or x.get("symbol") or x.get("instrument_key"),
                    "quantity":qty,"average_price":avg,"ltp":ltp,"unrealized_pnl":pnl,
                    "market_value":abs(qty)*ltp})
    return out

def normalize_orders(payload: Any) -> list[dict]:
    rows=payload.get("data", payload) if isinstance(payload,dict) else payload
    out=[]
    for x in rows or []:
        out.append({**x,"normalized_symbol":x.get("trading_symbol") or x.get("tradingsymbol") or x.get("symbol") or x.get("instrument_key"),
                    "status":x.get("status") or x.get("order_status") or "UNKNOWN",
                    "side":x.get("transaction_type") or x.get("side") or "",
                    "quantity":int(_num(x.get("quantity",0))),
                    "filled_quantity":int(_num(x.get("filled_quantity", x.get("filledQty",0))))})
    return out

def summarize(positions, orders, funds):
    pos=normalize_positions(positions); ords=normalize_orders(orders)
    unrealized=sum(_num(x.get("unrealized_pnl")) for x in pos)
    invested=sum(_num(x.get("market_value")) for x in pos)
    realized=sum(_num(x.get("realized_pnl",0)) for x in pos)
    open_lots=sum(abs(int(x.get("quantity",0))) for x in pos)
    filled=sum(1 for x in ords if str(x.get("status","")).lower() in {"complete","filled","traded","trade_executed"})
    pending=sum(1 for x in ords if str(x.get("status","")).lower() not in {"complete","filled","traded","trade_executed","rejected","cancelled","canceled"})
    return {"unrealized_pnl":unrealized,"realized_pnl":realized,"net_pnl":realized+unrealized,
            "gross_market_value":invested,"open_quantity":open_lots,"orders":len(ords),"filled_orders":filled,"pending_orders":pending}

def exposure(positions):
    pos=normalize_positions(positions); total=sum(abs(_num(x.get("market_value"))) for x in pos)
    return [{"symbol":x["normalized_symbol"],"quantity":x["quantity"],"market_value":x["market_value"],
             "weight":(abs(x["market_value"])/total if total else 0),"pnl":x["unrealized_pnl"]} for x in pos]

def greeks(positions):
    out=[]
    for x in normalize_positions(positions):
        g=x.get("greeks") or {}
        if not g and any(k in x for k in ("delta","gamma","theta","vega")):
            g={k:x.get(k) for k in ("delta","gamma","theta","vega")}
        if g:
            out.append({"symbol":x["normalized_symbol"],"quantity":x["quantity"],"delta":_num(g.get("delta")),"gamma":_num(g.get("gamma")),"theta":_num(g.get("theta")),"vega":_num(g.get("vega"))})
    return out

def trade_history(orders):
    rows=normalize_orders(orders)
    return [x for x in rows if str(x.get("status","")).lower() in {"complete","filled","traded","trade_executed"}]
