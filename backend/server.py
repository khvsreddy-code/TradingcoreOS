"""TradingCore OS persistent backend — Phase 8 portfolio/account intelligence."""
from __future__ import annotations
import os,time,uuid,asyncio,threading,json
from dataclasses import asdict
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header, WebSocket, WebSocketDisconnect, Request, Response, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .broker_core import OrderRequest, guard
from . import upstox
from . import fyers
from .oi_engine import OITracker,enriched_summary
from .risk_engine import risk
from .account_hub import hub
from .alert_engine import engine as alerts
from .portfolio import normalize_positions,normalize_orders,summarize,exposure,greeks,trade_history
from .market_data import hub as market_hub
from .security import encrypt,decrypt,token_fingerprint,opaque_id,limiter,client_key,security_headers

app=FastAPI(title="TradingCore OS API",version="30.5.1")
app.add_middleware(CORSMiddleware,allow_origins=os.getenv("TRADINGCORE_CORS","*").split(","),allow_methods=["*"],allow_headers=["*"])
_sessions={}; _oi_tracker=OITracker(); _stream_threads={}; _latency=[]; _latency_lock=threading.Lock()
def _record_latency(x):
    with _latency_lock:
        _latency.append(x); del _latency[:-2000]
def _audit_async(event):
    # Intentionally non-blocking hot-path audit hook; never stores access tokens.
    _record_latency({"type":"audit",**event,"ts":time.time()})

@app.middleware("http")
async def phase13_security(request:Request, call_next):
    if request.headers.get("content-length") and int(request.headers["content-length"])>1_000_000: raise HTTPException(413,"Request too large")
    limiter.check(f"{request.method}:{client_key(request)}", limit=600 if request.method=="GET" else 120)
    response=await call_next(request)
    security_headers(response)
    return response

class Connect(BaseModel):
    broker:str; access_token:str=Field(min_length=8); client_id:str|None=None
class Order(BaseModel):
    broker:str; mode:str; underlying_key:str="NSE_INDEX|Nifty 50"; expiry:str|None=None; strike:float|None=None; leg:str|None=None; instrument_key:str|None=None; symbol:str=""; side:str; qty:int; lot_size:int=1; order_type:str="MARKET"; price:float|None=None; product:str="I"; ltp:float=0
class Chain(BaseModel):
    spot:float; rows:list[dict]; underlying:str="NIFTY50"

def session(x):
    if not x or x not in _sessions: raise HTTPException(401,"Broker session not connected")
    return _sessions[x]

def session_token(s): return decrypt(s["token"])

def _account_stream_upstox(sid, token):
    try:
        import websocket
        url=upstox.portfolio_stream_authorize(token)
        if not url: raise RuntimeError("Upstox did not return an authorized portfolio stream URL")
        ws=websocket.create_connection(url,timeout=15,enable_multithread=True)
        st=hub.state(sid,"UPSTOX"); st.connected=True; st.stream_status="CONNECTED"
        while sid in _sessions:
            raw=ws.recv()
            if raw is None: break
            if isinstance(raw,bytes):
                try: raw=raw.decode("utf-8")
                except Exception: continue
            try: data=json.loads(raw)
            except Exception: continue
            hub.update(sid,"UPSTOX",data)
    except Exception as e:
        st=hub.state(sid,"UPSTOX"); st.connected=False; st.stream_status=f"ERROR: {str(e)[:100]}"

def start_stream(sid):
    s=_sessions[sid]
    if s["broker"]=="UPSTOX" and sid not in _stream_threads:
        t=threading.Thread(target=_account_stream_upstox,args=(sid,session_token(s)),daemon=True); _stream_threads[sid]=t; t.start()

@app.get("/api/health")
def health(): return {"ok":True,"service":"TradingCore OS","version":"30.5","runtime":"persistent-browser","streaming":True,"market_data":market_hub.health()}
@app.get("/api/performance/latency")
def latency():
    with _latency_lock: rows=[x for x in _latency if x.get("type")!="audit"][-500:]
    def stats(values):
        values=sorted(float(v) for v in values if v is not None)
        if not values: return {"avg":0,"p50":0,"p95":0,"p99":0,"max":0}
        def pct(p): return values[min(len(values)-1, max(0, int((len(values)-1)*p)))]
        return {"avg":round(sum(values)/len(values),3),"p50":round(pct(.50),3),"p95":round(pct(.95),3),"p99":round(pct(.99),3),"max":round(values[-1],3)}
    core=stats([x.get("core_overhead_ms") for x in rows])
    broker=stats([x.get("broker_roundtrip_ms") for x in rows])
    return {"samples":len(rows),"core":core,"broker":broker,"recent":rows[-100:],"updated_at":time.time()}

@app.post("/api/brokers/connect")
def connect(c:Connect):
    sid=opaque_id(); _sessions[sid]={"broker":c.broker.upper(),"token":encrypt(c.access_token),"token_fp":token_fingerprint(c.access_token),"client_id":c.client_id,"created":time.time()}
    hub.state(sid,c.broker.upper()).stream_status="CONNECTING"; start_stream(sid)
    return {"session_id":sid,"broker":c.broker.upper(),"connected":True,"security":{"token_stored_encrypted":bool(os.getenv("TOKEN_ENCRYPTION_KEY"))}}

@app.websocket("/ws/account/{sid}")
async def account_ws(ws:WebSocket,sid:str):
    await ws.accept()
    if sid not in _sessions:
        await ws.close(code=4401); return
    try: await hub.attach(sid,ws)
    except WebSocketDisconnect: pass

@app.get("/api/brokers/{sid}/account/snapshot")
def account_snapshot(sid:str):
    s=session(sid)
    try:
        if s["broker"]=="UPSTOX":
            orders=upstox.orders(session_token(s)); positions=upstox.positions(session_token(s)); funds=upstox.funds_v3(session_token(s))
            snap=hub.hydrate(sid,"UPSTOX",orders=orders,positions=positions,funds=funds)
            pos=normalize_positions(positions); ords=normalize_orders(orders)
            snap["positions"]=pos; snap["orders"]=ords; snap["summary"]=summarize(pos,ords,funds); snap["exposure"]=exposure(pos); snap["greeks"]=greeks(pos); snap["trades"]=trade_history(ords); snap["broker"]="UPSTOX"
            return snap
        if s["broker"]=="FYERS":
            orders=fyers.orders(session_token(s),s["client_id"] or "")
            return {"broker":"FYERS","orders":normalize_orders(orders),"positions":[] ,"funds":{},"summary":summarize([],orders,{}),"exposure":[],"stream_status":hub.state(sid,"FYERS").stream_status}
    except Exception as e: raise HTTPException(502,str(e))

@app.get("/api/brokers/{sid}/funds")
def get_funds(sid:str):
    s=session(sid)
    if s["broker"]=="UPSTOX": return upstox.funds_v3(session_token(s))
    raise HTTPException(501,"Funds adapter not implemented for this broker build")
@app.get("/api/brokers/{sid}/orders")
def get_orders(sid:str):
    s=session(sid)
    if s["broker"]=="UPSTOX": return upstox.orders(session_token(s))
    if s["broker"]=="FYERS": return fyers.orders(session_token(s),s["client_id"] or "")
    raise HTTPException(400,"Unsupported broker")
@app.get("/api/brokers/{sid}/positions")
def get_positions(sid:str):
    s=session(sid)
    if s["broker"]=="UPSTOX": return upstox.positions(session_token(s))
    raise HTTPException(501,"Positions adapter not implemented for this broker build")
@app.get("/api/brokers/{sid}/option-contract")
def get_contract(sid:str,underlying_key:str="NSE_INDEX|Nifty 50",expiry:str|None=None,strike:float=0,leg:str="CE"):
    s=session(sid)
    if s["broker"]!="UPSTOX": raise HTTPException(501,"Contract lookup is currently wired for Upstox")
    try:return upstox.resolve_option(session_token(s),underlying_key,expiry,strike,leg)
    except Exception as e:raise HTTPException(400,str(e))
@app.post("/api/oi/summary")
def oi_summary(c:Chain): return enriched_summary(_oi_tracker,c.underlying or "NIFTY50",c.rows,c.spot)
@app.post("/api/risk/preflight")
def risk_preflight(payload:dict,x_tradingcore_session:str|None=Header(default=None)):
    mode=str(payload.get("mode","PAPER")).upper()
    if mode=="LIVE" and not x_tradingcore_session: raise HTTPException(401,"Broker session required for LIVE risk preflight")
    return risk.preflight(mode,int(payload.get("qty",0)),int(payload.get("lot_size",1)),float(payload.get("price") or 0),float(payload.get("ltp") or 0),float(payload.get("daily_pnl") or 0),int(payload.get("open_lots") or 0))
@app.post("/api/risk/kill-switch")
def risk_kill(payload:dict): return {"armed":risk.kill(bool(payload.get("armed",False)))}
@app.get("/api/risk/status")
def risk_status(): return {"kill_switch":risk.status()}
@app.post("/api/orders")
def place(o:Order,x_tradingcore_session:str|None=Header(default=None)):
    if o.mode.upper()=="LIVE" and o.broker.upper()=="UPSTOX" and (not o.instrument_key or o.instrument_key.startswith("DEMO|")):
        if not o.expiry or o.strike is None or o.leg not in ("CE","PE"): raise HTTPException(400,"LIVE option order requires expiry, strike and CE/PE")
        try:
            c=upstox.resolve_option(session_token(session(x_tradingcore_session)),o.underlying_key,o.expiry,o.strike,o.leg); o.instrument_key,o.symbol,o.lot_size=c["instrument_key"],c["symbol"],c["lot_size"]
        except Exception as e: raise HTTPException(400,str(e))
    if o.mode.upper()=="PAPER" and (not o.instrument_key or o.instrument_key.startswith("DEMO|")): o.instrument_key=o.instrument_key or f"PAPER|{o.strike}|{o.leg}"
    req=OrderRequest(o.broker.upper(),o.mode.upper(),o.instrument_key or "",o.symbol,o.side.upper(),o.qty,o.order_type.upper(),o.price,o.product)
    try: idem=guard.validate(req,o.lot_size,o.ltp)
    except ValueError as e: raise HTTPException(400,str(e))
    if req.mode=="LIVE":
        pre=risk.preflight(req.mode,req.qty,o.lot_size,o.price,o.ltp)
        if not pre["allowed"]: raise HTTPException(403,pre["reason"])
    if req.mode=="PAPER": return {"accepted":True,"mode":"PAPER","order_id":"PAPER-"+idem[:12],"status":"FILLED_SIMULATED","request":asdict(req)}
    s=session(x_tradingcore_session)
    if req.broker=="UPSTOX":
        started=time.perf_counter(); dispatch_started=started
        result=upstox.place_order(session_token(s),req)
        broker_ms=round((time.perf_counter()-dispatch_started)*1000,3); core_ms=round((time.perf_counter()-started)*1000-broker_ms,3)
        risk.record_live_order(); metric={"type":"order","broker":"UPSTOX","core_overhead_ms":max(core_ms,0),"broker_roundtrip_ms":broker_ms,"mode":"LIVE"}; _record_latency(metric)
        _audit_async({"event":"order_dispatched","broker":"UPSTOX","side":req.side,"qty":req.qty,"instrument":req.instrument_key})
        return {"accepted":True,"mode":"LIVE","broker_latency_ms":broker_ms,"tradingcore_overhead_ms":max(core_ms,0),"result":result}
    if req.broker=="FYERS": raise HTTPException(501,"FYERS live order adapter requires the current FYERS API-trading configuration and client payload mapping")
    raise HTTPException(400,"Unsupported broker")



class MarketSubscription(BaseModel):
    instruments:list[str]=Field(min_length=1)

@app.get("/api/market/health")
def market_health(): return market_hub.health()

@app.get("/api/market/timeframes")
def market_timeframes(): return {"timeframes": market_hub.candles.supported()}

@app.get("/api/market/candles/{instrument_key:path}")
def market_candles(instrument_key:str, timeframe:str="5m", limit:int=500):
    try: return {"instrument_key":instrument_key,"timeframe":timeframe,"candles":market_hub.candles.history(instrument_key,timeframe,limit)}
    except ValueError as e: raise HTTPException(400,str(e))

@app.get("/api/market/subscriptions/{client_id}")
def market_subscriptions(client_id:str): return market_hub.subscription_snapshot(client_id)

@app.post("/api/market/subscriptions/{client_id}")
async def market_subscribe(client_id:str,payload:MarketSubscription): return await market_hub.subscribe(client_id,payload.instruments)

@app.delete("/api/market/subscriptions/{client_id}")
async def market_unsubscribe(client_id:str,payload:dict): return await market_hub.unsubscribe(client_id,payload.get("instruments"))

@app.post("/api/market/publish/{broker}")
async def market_publish(broker:str,payload:dict):
    # Adapter ingress point. Production broker websocket workers call this hub directly.
    return await market_hub.publish(broker,payload)

@app.websocket("/ws/market/{client_id}")
async def market_ws(ws:WebSocket,client_id:str):
    await ws.accept()
    await market_hub.attach(client_id,ws)
    try:
        while True:
            message=await ws.receive_json()
            op=message.get("op")
            if op=="subscribe": await market_hub.subscribe(client_id,message.get("instruments",[])); await ws.send_json({"type":"subscriptions",**market_hub.subscription_snapshot(client_id)})
            elif op=="unsubscribe": await market_hub.unsubscribe(client_id,message.get("instruments")); await ws.send_json({"type":"subscriptions",**market_hub.subscription_snapshot(client_id)})
            elif op=="ping": await ws.send_json({"type":"pong","ts":time.time()})
    except WebSocketDisconnect: pass
    finally: await market_hub.detach(client_id,ws)

class AlertCreate(BaseModel):
    kind:str; symbol:str; condition:str; value:float|None=None; once:bool=False

@app.get("/api/alerts")
def list_alerts(): return {"alerts":alerts.list(),"history":alerts.history()}
@app.post("/api/alerts")
def create_alert(a:AlertCreate): return alerts.create(**a.model_dump())
@app.delete("/api/alerts/{alert_id}")
def delete_alert(alert_id:str): return {"deleted":alerts.remove(alert_id)}
@app.post("/api/alerts/{alert_id}/toggle")
def toggle_alert(alert_id:str,payload:dict): return alerts.toggle(alert_id,bool(payload.get("enabled",True)))
@app.post("/api/alerts/evaluate/{symbol}")
def evaluate_alerts(symbol:str,payload:dict): return {"events":alerts.evaluate(symbol,payload.get("price"),payload.get("indicators"),payload.get("oi"),payload.get("levels"))}

web=Path(__file__).resolve().parent.parent/"frontend"
app.mount("/",StaticFiles(directory=web,html=True),name="frontend")
