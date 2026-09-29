
from __future__ import annotations
import os, json
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from .runtime import predict_many
from .features import FEATURE_COLUMNS

MODEL_ROOT=os.getenv('MODEL_ROOT','./models')
SERVICE_VERSION=os.getenv('ML_SERVICE_VERSION','2.0.0-real-all-models')
app=FastAPI(title='TradingCoreOS Real ML Service',version=SERVICE_VERSION)

class Candle(BaseModel):
    timestamp:str; open:float; high:float; low:float; close:float; volume:float=0
class PredictionRequest(BaseModel):
    symbol:str; timeframe:str; candles:list[Candle]=Field(min_length=80)
    models:list[str]=Field(min_length=1); horizon:int=Field(default=1,ge=1,le=100)

@app.get('/health')
def health():
    count=0
    if os.path.isdir(MODEL_ROOT):
        count=sum(os.path.isfile(os.path.join(MODEL_ROOT,d,'metadata.json')) for d in os.listdir(MODEL_ROOT))
    return {'status':'ok','service':'TradingCoreOS Real ML','version':SERVICE_VERSION,'trained_artifacts':count}

@app.get('/models')
def models():
    out=[]
    if os.path.isdir(MODEL_ROOT):
        for d in sorted(os.listdir(MODEL_ROOT)):
            p=os.path.join(MODEL_ROOT,d,'metadata.json')
            if os.path.isfile(p):
                try: out.append(json.load(open(p)))
                except: pass
    return {'models':out}

@app.post('/predict')
def predict(req:PredictionRequest,x_tradingcore_ml_secret:str|None=Header(default=None)):
    secret=os.getenv('ML_SERVICE_SECRET','')
    if secret and x_tradingcore_ml_secret!=secret: raise HTTPException(401,'Invalid ML service secret')
    if len(req.candles)<80: raise HTTPException(422,'At least 80 candles are required')
    ids=list(dict.fromkeys(req.models))[:39]
    result=predict_many(MODEL_ROOT,req.symbol,req.timeframe,ids,[c.model_dump() for c in req.candles])
    available={k:v for k,v in result.items() if v.get('trained')}
    unavailable={k:v for k,v in result.items() if not v.get('trained')}
    if not available: raise HTTPException(503,detail={'message':'No trained artifacts are installed for this symbol/timeframe','models':unavailable})
    return {'symbol':req.symbol,'timeframe':req.timeframe,'models':result,'trained_model_count':len(available),'requested_model_count':len(ids)}
