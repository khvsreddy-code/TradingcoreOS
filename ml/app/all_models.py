
from __future__ import annotations
import json, math, warnings
from pathlib import Path
from typing import Any
import joblib
import numpy as np
import pandas as pd

# Classical ML
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, GradientBoostingRegressor, RandomForestRegressor, ExtraTreesRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVR
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score
import xgboost as xgb

try:
    import lightgbm as lgb
except Exception: lgb = None
try:
    import catboost as cb
except Exception: cb = None
try:
    from hmmlearn.hmm import GaussianHMM
except Exception: GaussianHMM = None
try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    from statsmodels.tsa.exponential_smoothing.ets import ETSModel
except Exception:
    ARIMA = SARIMAX = ETSModel = None
try:
    from arch import arch_model
except Exception: arch_model = None
try:
    from prophet import Prophet
except Exception: Prophet = None

import torch
import torch.nn as nn

TREE_MODELS = {
'xgb-direction':'xgboost','xgb-breakout':'xgboost','production-xgboost-direction':'xgboost',
'rf-direction':'random_forest','trend-strength':'random_forest','price-action':'random_forest',
'logistic-direction':'logistic_regression','mean-reversion':'logistic_regression',
'gb-volatility':'gradient_boosting','momentum-regime':'gradient_boosting','range-breakout':'gradient_boosting',
'volatility-regime':'gradient_boosting','options-flow':'gradient_boosting','ensemble-voting':'gradient_boosting',
'lightgbm-regime':'lightgbm','catboost-direction':'catboost',
'svr-direction':'svr','knn-pattern':'knn','quantile-forest-range':'quantile_forest'
}

NEURAL_MODELS = ['tft-multihorizon','nbeats-trend','patchtst-pattern','lstm-sequence','tcn-momentum',
'bilstm-sequence','cnn-lstm-hybrid','lstm-gru-hybrid','transformer-attention','production-lstm-sequence','production-transformer','timemixer-multiscale']

TIME_SERIES_MODELS = ['arima-direction','sarima-seasonal','ets-trend','prophet-trend','garch-volatility']

SPECIAL_MODELS = ['hmm-regime','conformal-range','sentiment-hybrid','options-flow','ensemble-voting']

ALL_MODEL_IDS = [
'xgb-direction','rf-direction','logistic-direction','gb-volatility','xgb-breakout','momentum-regime','mean-reversion',
'trend-strength','range-breakout','volatility-regime','price-action','options-flow','ensemble-voting','tft-multihorizon',
'nbeats-trend','patchtst-pattern','lstm-sequence','tcn-momentum','lightgbm-regime','catboost-direction','hmm-regime',
'timemixer-multiscale','conformal-range','arima-direction','sarima-seasonal','ets-trend','prophet-trend','svr-direction',
'knn-pattern','bilstm-sequence','cnn-lstm-hybrid','lstm-gru-hybrid','transformer-attention','sentiment-hybrid',
'garch-volatility','quantile-forest-range','production-xgboost-direction','production-lstm-sequence','production-transformer'
]

BASE_FEATURES = ['ret_1','ret_3','ret_5','ret_10','range_pct','body_pct','volume_ratio',
'ema_9_gap','ema_21_gap','ema_50_gap','rsi_14','atr_14_pct','volatility_20',
'high_20_gap','low_20_gap','trend_slope','hour_sin','hour_cos']
OPTIONAL_FEATURES = ['call_oi','put_oi','call_oi_change','put_oi_change','pcr','iv','iv_change','atm_iv','call_volume','put_volume','sentiment']

class SequenceNet(nn.Module):
    def __init__(self, kind, n_features, seq_len=60, d=64):
        super().__init__(); self.kind=kind; self.seq_len=seq_len
        if kind in ('lstm','bilstm','lstm_gru','cnn_lstm'):
            if kind=='bilstm': self.core=nn.LSTM(n_features,d,2,batch_first=True,dropout=.15,bidirectional=True); out=d*2
            elif kind=='lstm_gru':
                self.lstm=nn.LSTM(n_features,d,1,batch_first=True); self.core=nn.GRU(d,d,1,batch_first=True); out=d
            elif kind=='cnn_lstm':
                self.conv=nn.Conv1d(n_features,d,kernel_size=3,padding=1); self.core=nn.LSTM(d,d,2,batch_first=True,dropout=.15); out=d
            else: self.core=nn.LSTM(n_features,d,2,batch_first=True,dropout=.15); out=d
            self.head=nn.Sequential(nn.LayerNorm(out),nn.Linear(out,32),nn.GELU(),nn.Linear(32,1))
        elif kind=='tcn':
            self.net=nn.Sequential(nn.Conv1d(n_features,d,3,padding=1,dilation=1),nn.GELU(),nn.Conv1d(d,d,3,padding=2,dilation=2),nn.GELU(),nn.Conv1d(d,d,3,padding=4,dilation=4),nn.GELU())
            self.head=nn.Linear(d,1)
        else:
            self.proj=nn.Linear(n_features,d); self.pos=nn.Parameter(torch.zeros(1,seq_len,d))
            layer=nn.TransformerEncoderLayer(d,4,d*2,.1,batch_first=True,norm_first=True,activation='gelu')
            self.enc=nn.TransformerEncoder(layer,2)
            self.head=nn.Sequential(nn.LayerNorm(d),nn.Linear(d,32),nn.GELU(),nn.Linear(32,1))
    def forward(self,x):
        if self.kind=='bilstm':
            y,_=self.core(x); return self.head(y[:,-1])
        if self.kind=='lstm_gru':
            y,_=self.lstm(x); y,_=self.core(y); return self.head(y[:,-1])
        if self.kind=='cnn_lstm':
            y=self.conv(x.transpose(1,2)).transpose(1,2); y,_=self.core(y); return self.head(y[:,-1])
        if self.kind=='lstm':
            y,_=self.core(x); return self.head(y[:,-1])
        if self.kind=='tcn':
            return self.head(self.net(x.transpose(1,2))[:,:,-1])
        y=self.proj(x)+self.pos[:,:x.shape[1]]; y=self.enc(y); return self.head(y[:,-1])

def _sequence_arrays(df, features, seq_len=60):
    x=df[features].to_numpy(np.float32); y=df['target_up'].to_numpy(np.float32)
    xs=[]; ys=[]
    for i in range(seq_len-1,len(df)): xs.append(x[i-seq_len+1:i+1]); ys.append(y[i])
    return np.asarray(xs),np.asarray(ys)


class NBeatsNet(nn.Module):
    def __init__(self,n_features,hidden=128,blocks=3,theta=16):
        super().__init__(); self.n_features=n_features; self.theta=theta
        self.blocks=nn.ModuleList([nn.Sequential(nn.Flatten(),nn.Linear(60*n_features,hidden),nn.ReLU(),nn.Linear(hidden,hidden),nn.ReLU(),nn.Linear(hidden,theta)) for _ in range(blocks)])
        self.back=nn.ModuleList([nn.Linear(theta,60) for _ in range(blocks)])
    def forward(self,x):
        r=x; out=0
        for b,h in zip(self.blocks,self.back):
            th=b(r); out=out+h(th); r=r-out.unsqueeze(-1)/max(1,self.n_features)
        return out[:,-1]

class PatchTSTNet(nn.Module):
    def __init__(self,n_features,seq_len=60,patch=6,d=64):
        super().__init__(); self.patch=patch; self.proj=nn.Linear(n_features*patch,d)
        self.pos=nn.Parameter(torch.zeros(1,seq_len//patch,d))
        enc=nn.TransformerEncoderLayer(d,4,d*2,.1,batch_first=True,norm_first=True,activation='gelu')
        self.enc=nn.TransformerEncoder(enc,3); self.head=nn.Sequential(nn.LayerNorm(d),nn.Linear(d,32),nn.GELU(),nn.Linear(32,1))
    def forward(self,x):
        n=(x.shape[1]//self.patch)*self.patch; x=x[:,:n].reshape(x.shape[0],n//self.patch,-1)
        x=self.proj(x)+self.pos[:,:x.shape[1]]; x=self.enc(x); return self.head(x[:,-1])

class TFTNet(nn.Module):
    def __init__(self,n_features,seq_len=60,d=64):
        super().__init__(); self.var=nn.Sequential(nn.Linear(n_features,d),nn.Sigmoid()); self.inp=nn.Linear(n_features,d)
        self.lstm=nn.LSTM(d,d,2,batch_first=True,dropout=.1)
        enc=nn.TransformerEncoderLayer(d,4,d*2,.1,batch_first=True,norm_first=True,activation='gelu')
        self.attn=nn.TransformerEncoder(enc,1); self.gate=nn.Sequential(nn.Linear(d,d),nn.Sigmoid()); self.head=nn.Sequential(nn.LayerNorm(d),nn.Linear(d,32),nn.GELU(),nn.Linear(32,1))
    def forward(self,x):
        z=self.inp(x)*self.var(x); l,_=self.lstm(z); a=self.attn(l); z=l+self.gate(a)*a; return self.head(z[:,-1])

class TimeMixerNet(nn.Module):
    def __init__(self,n_features,d=64):
        super().__init__(); self.inp=nn.Linear(n_features,d)
        self.fast=nn.Conv1d(d,d,3,padding=1); self.mid=nn.Conv1d(d,d,5,padding=2); self.slow=nn.Conv1d(d,d,9,padding=4)
        self.head=nn.Sequential(nn.LayerNorm(d*3),nn.Linear(d*3,64),nn.GELU(),nn.Linear(64,1))
    def forward(self,x):
        z=self.inp(x).transpose(1,2); a=self.fast(z)[:,:,-1]; b=self.mid(z)[:,:,-1]; c=self.slow(z)[:,:,-1]
        return self.head(torch.cat([a,b,c],1))

def _seq_split(train, valid, features, seq_len):
    # Validation needs historical context from the end of train, but labels remain strictly in validation.
    scaler=StandardScaler().fit(train[features])
    context=pd.concat([train.tail(seq_len-1),valid],ignore_index=True)
    def build(frame):
        xx=scaler.transform(frame[features]).astype(np.float32); yy=frame.target_up.to_numpy(np.float32)
        xs=[];ys=[]
        for i in range(seq_len-1,len(frame)): xs.append(xx[i-seq_len+1:i+1]);ys.append(yy[i])
        return np.asarray(xs,np.float32),np.asarray(ys,np.float32)
    xt,yt=build(train)
    xv,yv=build(context)
    # context produces exactly len(valid) targets
    return xt,yt,xv,yv,scaler

def _fit_torch(model,xt,yt,xv,yv,out,scaler,epochs=20,batch=128):
    opt=torch.optim.AdamW(model.parameters(),lr=1e-3,weight_decay=1e-4); lossfn=nn.BCEWithLogitsLoss()
    dl=torch.utils.data.DataLoader(torch.utils.data.TensorDataset(torch.tensor(xt),torch.tensor(yt)),batch_size=batch,shuffle=True)
    best=None;bestloss=1e99;wait=0
    for _ in range(epochs):
        model.train()
        for xb,yb in dl:
            opt.zero_grad(); pred=model(xb).reshape(-1); loss=lossfn(pred,yb);loss.backward();nn.utils.clip_grad_norm_(model.parameters(),1);opt.step()
        model.eval()
        with torch.no_grad(): vl=float(lossfn(model(torch.tensor(xv)).reshape(-1),torch.tensor(yv)).item())
        if vl<bestloss:bestloss=vl;best={k:v.detach().cpu().clone() for k,v in model.state_dict().items()};wait=0
        else:wait+=1
        if wait>=5:break
    if best:model.load_state_dict(best)
    torch.save(model.state_dict(),out/'model.pt');joblib.dump(scaler,out/'scaler.joblib');return model,scaler

def train_neural(train, valid, kind, features, out, seq_len=60, epochs=20, batch=128):
    xt,yt,xv,yv,scaler=_seq_split(train,valid,features,seq_len)
    model=SequenceNet(kind,len(features),seq_len)
    return _fit_torch(model,xt,yt,xv,yv,out,scaler,epochs,batch)

def train_special_neural(train, valid, kind, features, out, seq_len=60, epochs=20, batch=128):
    xt,yt,xv,yv,scaler=_seq_split(train,valid,features,seq_len)
    if kind=='nbeats': model=NBeatsNet(len(features))
    elif kind=='patchtst': model=PatchTSTNet(len(features),seq_len)
    elif kind=='tft': model=TFTNet(len(features),seq_len)
    elif kind=='timemixer': model=TimeMixerNet(len(features))
    else: raise ValueError(kind)
    return _fit_torch(model,xt,yt,xv,yv,out,scaler,epochs,batch)

def train_classical(train, valid, model_id, features):
    X=train[features]; y=train.target_up
    if model_id in ('xgb-direction','xgb-breakout','production-xgboost-direction'):
        return xgb.XGBClassifier(n_estimators=450,max_depth=5,learning_rate=.03,subsample=.85,colsample_bytree=.85,reg_lambda=2,eval_metric='logloss',random_state=42).fit(X,y)
    if model_id in ('rf-direction','trend-strength','price-action'):
        return RandomForestClassifier(n_estimators=500,max_depth=10,min_samples_leaf=3,max_features='sqrt',n_jobs=-1,class_weight='balanced_subsample',random_state=42).fit(X,y)
    if model_id in ('logistic-direction','mean-reversion'):
        return Pipeline([('scaler',StandardScaler()),('model',LogisticRegression(C=.5,max_iter=2000,class_weight='balanced'))]).fit(X,y)
    if model_id in ('gb-volatility','momentum-regime','range-breakout','volatility-regime','options-flow','ensemble-voting'):
        return GradientBoostingClassifier(n_estimators=300,max_depth=3,learning_rate=.03,subsample=.9,random_state=42).fit(X,y)
    if model_id=='lightgbm-regime':
        if lgb is None: raise RuntimeError('lightgbm is required')
        return lgb.LGBMClassifier(n_estimators=400,num_leaves=31,learning_rate=.03,subsample=.9,colsample_bytree=.9,verbosity=-1,random_state=42).fit(X,y)
    if model_id=='catboost-direction':
        if cb is None: raise RuntimeError('catboost is required')
        return cb.CatBoostClassifier(iterations=400,depth=7,learning_rate=.03,verbose=False,random_seed=42).fit(X,y)
    if model_id=='svr-direction':
        return Pipeline([('scaler',StandardScaler()),('model',SVR(C=1.5,epsilon=.01,gamma='scale'))]).fit(X, train.target_return)
    if model_id=='knn-pattern':
        return Pipeline([('scaler',StandardScaler()),('model',KNeighborsClassifier(n_neighbors=25,weights='distance'))]).fit(X,y)
    if model_id=='quantile-forest-range':
        # genuine quantile regressors using ExtraTrees; intervals are empirical quantiles
        return {'q10':ExtraTreesRegressor(n_estimators=300,min_samples_leaf=5,n_jobs=-1,random_state=42).fit(X,train.target_return),
                'q50':ExtraTreesRegressor(n_estimators=300,min_samples_leaf=5,n_jobs=-1,random_state=43).fit(X,train.target_return),
                'q90':ExtraTreesRegressor(n_estimators=300,min_samples_leaf=5,n_jobs=-1,random_state=44).fit(X,train.target_return)}
    raise ValueError(model_id)

def fit_time_series(train, model_id):
    y=train.close.astype(float)
    if model_id=='arima-direction':
        if ARIMA is None: raise RuntimeError('statsmodels required')
        return ARIMA(y,order=(2,1,2)).fit()
    if model_id=='sarima-seasonal':
        if SARIMAX is None: raise RuntimeError('statsmodels required')
        # seasonal period 5 is suitable as a generic market-session proxy for daily bars; for intraday users should configure it.
        return SARIMAX(y,order=(1,1,1),seasonal_order=(1,0,1,5),trend='c').fit(disp=False)
    if model_id=='ets-trend':
        if ETSModel is None: raise RuntimeError('statsmodels required')
        return ETSModel(y,error='add',trend='add',damped_trend=True).fit(disp=False)
    if model_id=='prophet-trend':
        if Prophet is None: raise RuntimeError('prophet required')
        p=Prophet(daily_seasonality=False,weekly_seasonality=True,yearly_seasonality=False)
        p.fit(pd.DataFrame({'ds':pd.to_datetime(train.timestamp,utc=True).dt.tz_localize(None),'y':y.values}))
        return p
    if model_id=='garch-volatility':
        if arch_model is None: raise RuntimeError('arch required')
        returns=100*y.pct_change().dropna()
        return arch_model(returns,mean='Zero',vol='GARCH',p=1,q=1,dist='t').fit(disp='off')
    raise ValueError(model_id)

def fit_hmm(train, features):
    if GaussianHMM is None: raise RuntimeError('hmmlearn required')
    scaler=StandardScaler().fit(train[features]); X=scaler.transform(train[features])
    model=GaussianHMM(n_components=3,covariance_type='diag',n_iter=300,random_state=42).fit(X)
    return {'model':model,'scaler':scaler}

def save_bundle(root, symbol, timeframe, model_id, bundle, meta):
    d=Path(root)/f"{symbol}__{timeframe}__{model_id}".replace('/','_').replace(':','_').replace('|','_').replace(' ','_'); d.mkdir(parents=True,exist_ok=True)
    if isinstance(bundle,dict) and bundle.get('_torch_state'):
        torch.save(bundle['_torch_state'],d/'model.pt')
    else: joblib.dump(bundle,d/'model.joblib')
    (d/'metadata.json').write_text(json.dumps(meta,indent=2,default=str))
    return d
