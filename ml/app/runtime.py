
from __future__ import annotations
import json, math
from pathlib import Path
import joblib, numpy as np, pandas as pd, torch
from .features import build_features, FEATURE_COLUMNS
from .all_models import *
from .optimization import _meta_frame, execution_gate
from statsmodels.tsa.arima.model import ARIMA
try: from statsmodels.tsa.statespace.sarimax import SARIMAX
except: SARIMAX=None

def artifact_path(root,symbol,timeframe,model_id):
    return Path(root)/f"{symbol}__{timeframe}__{model_id}".replace('/','_').replace(':','_').replace('|','_').replace(' ','_')

def load_artifact(root,symbol,timeframe,model_id):
    d=artifact_path(root,symbol,timeframe,model_id); mp=d/'metadata.json'
    if not mp.exists(): raise FileNotFoundError(f'No trained artifact for {symbol}/{timeframe}/{model_id}')
    meta=json.loads(mp.read_text())
    if (d/'model.joblib').exists(): return d,meta,joblib.load(d/'model.joblib')
    if (d/'model.pt').exists():
        kind=meta['kind']; nf=len(meta.get('neural_features',FEATURE_COLUMNS)); seq=int(meta.get('sequence_length',60))
        if kind=='nbeats': m=NBeatsNet(nf)
        elif kind=='patchtst':m=PatchTSTNet(nf,seq)
        elif kind=='tft':m=TFTNet(nf,seq)
        elif kind=='timemixer':m=TimeMixerNet(nf)
        else:m=SequenceNet(kind,nf,seq)
        m.load_state_dict(torch.load(d/'model.pt',map_location='cpu'));m.eval();sc=joblib.load(d/'scaler.joblib')
        return d,meta,{'kind':'neural','model':m,'scaler':sc,'features':meta.get('neural_features',FEATURE_COLUMNS)}
    raise FileNotFoundError('Artifact has no model file')

def _probs_from_p(p):
    p=float(np.clip(p,0,1)); edge=2*p-1; neutral=max(0.0,min(.30,.30-abs(edge)*.45)); total=1+neutral
    return p/total,neutral/total,(1-p)/total,edge

def _apply_meta_gate(root, symbol, timeframe, frame, prob, direction):
    meta_dir = artifact_path(root, symbol, timeframe, "meta-labeler")
    mp = meta_dir / "meta_labeler.joblib"
    if not mp.exists():
        return {
            "status": "not_trained",
            "entry_allowed": False,
            "meta_success_probability": None,
            "threshold": 0.65,
            "direction": direction,
        }
    try:
        a = joblib.load(mp)
        X = _meta_frame(frame, float(prob))
        X = X.reindex(columns=a["features"], fill_value=0.0)
        ms = float(a["model"].predict_proba(X.tail(1))[0, 1])
        gate = execution_gate(frame, direction, ms, float(a.get("threshold", 0.65)))
        gate["status"] = "trained"
        return gate
    except Exception as e:
        return {
            "status": "error",
            "entry_allowed": False,
            "meta_success_probability": None,
            "threshold": 0.65,
            "direction": direction,
            "error": str(e),
        }

def predict_artifact(root,symbol,timeframe,model_id,candles):
    d,meta,a=load_artifact(root,symbol,timeframe,model_id)
    frame=build_features(candles); latest=float(frame.close.iloc[-1])
    kind=a.get('kind') if isinstance(a,dict) else 'classical'
    lower=upper=latest; expected_return=0.0
    if kind=='classical':
        feats=a['features']; X=frame[feats].tail(1); m=a['model']
        if hasattr(m,'predict_proba'): p=float(m.predict_proba(X)[0,1]); expected_return=0.002*(2*p-1)
        else:
            r=float(m.predict(X)[0]); expected_return=r; p=float(1/(1+np.exp(-np.clip(r*100,-20,20))))
        lower=latest*(1-abs(expected_return)*1.5);upper=latest*(1+abs(expected_return)*1.5)
    elif kind=='ensemble':
        X=frame[a['features']].tail(1); ps=[]
        for m in a['model'].values():
            ps.append(float(m.predict_proba(X)[0,1]))
        p=float(np.mean(ps)); expected_return=.002*(2*p-1); lower=latest*(1-abs(expected_return)*1.5);upper=latest*(1+abs(expected_return)*1.5)
    elif kind=='neural':
        feats=a['features'];seq=60; x=a['scaler'].transform(frame[feats].tail(seq)).astype(np.float32)
        with torch.no_grad(): logit=float(a['model'](torch.tensor(x[None])).squeeze().item())
        p=float(1/(1+np.exp(-np.clip(logit,-20,20))));expected_return=.002*(2*p-1);lower=latest*(1-abs(expected_return)*1.5);upper=latest*(1+abs(expected_return)*1.5)
    elif kind=='quantile':
        X=frame[a['features']].tail(1); pred=float(a['q50'].predict(X)[0]);lo=float(a['q10'].predict(X)[0]);hi=float(a['q90'].predict(X)[0]);expected_return=pred;p=float(1/(1+np.exp(-pred*100)));lower=latest*(1+lo);upper=latest*(1+hi)
    elif kind=='conformal':
        X=frame[a['features']].tail(1);pred=float(a['model'].predict(X)[0]);expected_return=pred;p=float(1/(1+np.exp(-pred*100)));lower=latest*(1+pred-a['q90']);upper=latest*(1+pred+a['q90'])
    elif kind=='hmm':
        X=a['scaler'].transform(frame[a['features']]); state=int(a['model'].predict(X[-1:].reshape(1,-1))[0]); means=a['model'].means_[:,0] if a['model'].means_.shape[1] else a['model'].means_.ravel(); z=float(means[state]);p=float(1/(1+np.exp(-z)));expected_return=.002*(2*p-1);lower=latest*(1-abs(expected_return)*1.5);upper=latest*(1+abs(expected_return)*1.5)
    elif kind=='timeseries':
        m=a['model']
        if model_id=='garch-volatility':
            fc=m.forecast(horizon=1,reindex=False); vol=float(np.sqrt(fc.variance.values[-1,0]))/100; expected_return=0;p=.5;lower=latest*(1-vol);upper=latest*(1+vol)
        else:
            f=m.forecast(steps=1); pred=float(np.asarray(f)[-1]);expected_return=pred/latest-1;p=float(1/(1+np.exp(-expected_return*500)));lower=pred;upper=pred
    else: raise RuntimeError('Unsupported artifact kind')
    bull,neu,bear,edge=_probs_from_p(p)
    direction='BULLISH' if edge>.08 else 'BEARISH' if edge<-.08 else 'NEUTRAL'
    gate=_apply_meta_gate(root,symbol,timeframe,frame,p,direction)
    return {'model_version':meta.get('version',meta.get('model_id','trained')),'algorithm':meta.get('algorithm',model_id),
            'direction':direction,
            'bullish_probability':bull,'neutral_probability':neu,'bearish_probability':bear,
            'confidence':float(.5+abs(edge)*.5),'predicted_price':latest*(1+expected_return),
            'lower_bound':float(lower),'upper_bound':float(upper),'expected_move':float(abs(latest*expected_return)),
            'latest_price':latest,'feature_schema':meta.get('feature_schema',FEATURE_COLUMNS),'execution_gate':gate,
            'artifact_path':str(d),'trained':True,'status':meta.get('status','paper')}

def predict_many(root,symbol,timeframe,model_ids,candles):
    out={}
    for mid in model_ids:
        try: out[mid]=predict_artifact(root,symbol,timeframe,mid,candles)
        except Exception as e: out[mid]={'error':str(e),'trained':False,'status':'unavailable'}
    return out
