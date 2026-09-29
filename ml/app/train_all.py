
from __future__ import annotations
import argparse, json, random, traceback
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score, log_loss
from .features import build_features, make_supervised, FEATURE_COLUMNS
from .optimization import fit_meta_labeler, OPT_FEATURES
from .all_models import *

MODEL_NAMES = {
'xgb-direction':'XGBoost Direction','rf-direction':'Random Forest Direction','logistic-direction':'Logistic Regression',
'gb-volatility':'Gradient Boosting Volatility','xgb-breakout':'XGBoost Breakout','momentum-regime':'Momentum Regime',
'mean-reversion':'Mean Reversion','trend-strength':'Trend Strength','range-breakout':'Range Breakout Pro',
'volatility-regime':'Volatility Regime','price-action':'Price Action Structure','options-flow':'Options Flow Bias',
'ensemble-voting':'Core Ensemble Voting','tft-multihorizon':'Temporal Fusion Transformer','nbeats-trend':'N-BEATS Trend',
'patchtst-pattern':'PatchTST Pattern','lstm-sequence':'LSTM Sequence','tcn-momentum':'Temporal Convolution Network',
'lightgbm-regime':'LightGBM Regime','catboost-direction':'CatBoost Direction','hmm-regime':'Hidden Markov Regime',
'timemixer-multiscale':'TimeMixer Multi-Scale','conformal-range':'Conformal Prediction Range',
'arima-direction':'ARIMA Direction','sarima-seasonal':'SARIMA Seasonal','ets-trend':'ETS Trend',
'prophet-trend':'Prophet Trend','svr-direction':'Support Vector Regression','knn-pattern':'KNN Pattern Match',
'bilstm-sequence':'Bidirectional LSTM','cnn-lstm-hybrid':'CNN-LSTM Hybrid','lstm-gru-hybrid':'LSTM-GRU Hybrid',
'transformer-attention':'Transformer Attention','sentiment-hybrid':'News + Sentiment Hybrid',
'garch-volatility':'GARCH Volatility','quantile-forest-range':'Quantile Forest Range',
'production-xgboost-direction':'Production XGBoost Direction','production-lstm-sequence':'Production LSTM Sequence',
'production-transformer':'Production Transformer'
}

NEURAL_KIND={'lstm-sequence':'lstm','production-lstm-sequence':'lstm','transformer-attention':'transformer',
'production-transformer':'transformer','bilstm-sequence':'bilstm','cnn-lstm-hybrid':'cnn_lstm','lstm-gru-hybrid':'lstm_gru',
'tcn-momentum':'tcn','tft-multihorizon':'tft','nbeats-trend':'nbeats','patchtst-pattern':'patchtst','timemixer-multiscale':'timemixer'}

def split(df):
    n=len(df); a=int(n*.70); b=int(n*.85)
    return df.iloc[:a].copy(),df.iloc[a:b].copy(),df.iloc[b:].copy()

def evaluate(model, frame, features):
    X=frame[features]; y=frame.target_up.to_numpy()
    if isinstance(model,dict): return {}
    if hasattr(model,'predict_proba'): p=model.predict_proba(X)[:,1]
    else:
        r=model.predict(X); p=1/(1+np.exp(-np.clip(np.asarray(r,float),-20,20)))
    pred=(p>=.5).astype(int)
    return {'accuracy':float(accuracy_score(y,pred)),'precision':float(precision_score(y,pred,zero_division=0)),
            'recall':float(recall_score(y,pred,zero_division=0)),
            'roc_auc':float(roc_auc_score(y,p)) if len(np.unique(y))>1 else None,
            'log_loss':float(log_loss(y,np.clip(p,1e-6,1-1e-6)))}

def main():
    ap=argparse.ArgumentParser(description='Train all TradingCoreOS production models from real historical data.')
    ap.add_argument('--csv',required=True);ap.add_argument('--symbol',required=True);ap.add_argument('--timeframe',default='5m')
    ap.add_argument('--out',default='models');ap.add_argument('--horizon',type=int,default=1);ap.add_argument('--epochs',type=int,default=20)
    args=ap.parse_args(); random.seed(42);np.random.seed(42); 
    df=pd.read_csv(args.csv)
    ren={c:{'date':'timestamp','datetime':'timestamp','shares_traded':'volume'}.get(c.strip().lower().replace(' ','_'),c.strip().lower().replace(' ','_')) for c in df.columns}
    df=df.rename(columns=ren)
    supervised=make_supervised(df,args.horizon)
    train,valid,test=split(supervised)
    root=Path(args.out);root.mkdir(parents=True,exist_ok=True)
    report={'symbol':args.symbol,'timeframe':args.timeframe,'horizon':args.horizon,'models':{}}
    base=FEATURE_COLUMNS
    # options/sentiment models require real columns. No synthetic fallback is used.
    opt=[c for c in OPTIONAL_FEATURES if c in supervised.columns and c!='sentiment']
    special=base+opt
    if 'sentiment' in supervised.columns: special.append('sentiment')
    for model_id in ALL_MODEL_IDS:
        d=root/f"{args.symbol}__{args.timeframe}__{model_id}"; d.mkdir(parents=True,exist_ok=True)
        meta={'model_id':model_id,'name':MODEL_NAMES[model_id],'algorithm':TREE_MODELS.get(model_id,model_id.split('-')[0]),
              'symbol':args.symbol,'timeframe':args.timeframe,'horizon':args.horizon,'status':'paper',
              'trained_on':'real historical CSV supplied to train_all.py','feature_schema':base}
        try:
            if model_id in TREE_MODELS:
                features=base
                if model_id=='options-flow':
                    if not all(c in supervised.columns for c in ['pcr','iv']): raise RuntimeError('Options Flow requires pcr and iv/OI features in the training data')
                    features=special
                if model_id=='ensemble-voting':
                    members={}
                    for member in ('xgb-direction','rf-direction','logistic-direction','gb-volatility'):
                        members[member]=train_classical(train,valid,member,features)
                    m=members; kind='ensemble'
                else:
                    m=train_classical(train,valid,model_id,features)
                    kind='quantile' if model_id=='quantile-forest-range' else 'classical'
                joblib.dump({'kind':kind,'model':m,'features':features, **(m if kind=='quantile' else {})},d/'model.joblib')
                meta['feature_schema']=features;meta['metrics']=evaluate(m,test,features)
            elif model_id in NEURAL_MODELS:
                kind=NEURAL_KIND[model_id];features=base
                if kind in ('nbeats','patchtst','tft','timemixer'): train_special_neural(train,valid,kind,features,d,epochs=args.epochs)
                else: train_neural(train,valid,kind,features,d,epochs=args.epochs)
                # store architecture metadata for loader
                meta.update({'kind':kind,'sequence_length':60,'neural_features':features})
                # validate quickly using test
                meta['metrics']={'note':'test metrics are computed by inference service for sequence artifacts'}
            elif model_id in TIME_SERIES_MODELS:
                m=fit_time_series(train,model_id);joblib.dump({'kind':'timeseries','model':m},d/'model.joblib')
                meta['metrics']={'note':'time-series forecast metrics require horizon-aware evaluation'}
            elif model_id=='hmm-regime':
                b=fit_hmm(train,base);joblib.dump({'kind':'hmm','model':b},d/'model.joblib');meta['feature_schema']=base
            elif model_id=='conformal-range':
                # Train a genuine base regressor then calibrate absolute residual quantile on validation.
                base_model=GradientBoostingRegressor(n_estimators=300,max_depth=3,learning_rate=.03,random_state=42).fit(train[base],train.target_return)
                residual=np.abs(valid.target_return.to_numpy()-base_model.predict(valid[base]))
                q=float(np.quantile(residual,.90,method='higher'))
                joblib.dump({'kind':'conformal','model':base_model,'features':base,'q90':q},d/'model.joblib');meta['interval_method']='split_conformal_abs_residual';meta['q90']=q
            elif model_id=='sentiment-hybrid':
                if 'sentiment' not in supervised.columns: raise RuntimeError('Sentiment Hybrid requires a real sentiment feature column')
                features=base+['sentiment'];m=train_classical(train,valid,'logistic-direction',features);joblib.dump({'kind':'classical','model':m,'features':features},d/'model.joblib');meta['feature_schema']=features
            else: raise RuntimeError('Unhandled model')
            (d/'metadata.json').write_text(json.dumps(meta,indent=2,default=str));report['models'][model_id]=meta
        except Exception as e:
            meta['status']='blocked';meta['error']=str(e);(d/'metadata.json').write_text(json.dumps(meta,indent=2));report['models'][model_id]=meta
    # Shared event-driven meta-labeler: filters primary directional signals using
    # triple-barrier outcomes plus microstructure/options/volatility/time-of-day evidence.
    try:
        meta_dir=root/f"{args.symbol}__{args.timeframe}__meta-labeler"; meta_dir.mkdir(parents=True,exist_ok=True)
        primary=train_classical(train,valid,'xgb-direction',FEATURE_COLUMNS)
        p_tr=primary.predict_proba(train[FEATURE_COLUMNS])[:,1]
        p_va=primary.predict_proba(valid[FEATURE_COLUMNS])[:,1]
        meta_metrics=fit_meta_labeler(train,valid,p_tr,p_va,meta_dir,threshold=0.65)
        report['meta_labeler']={'status':'trained','path':str(meta_dir),'metrics':meta_metrics,
            'method':'triple_barrier + RandomForest meta-labeler','threshold':0.65,
            'tp_atr':1.5,'sl_atr':1.0,'max_bars':6}
    except Exception as e:
        report['meta_labeler']={'status':'blocked','error':str(e)}
    (root/f"{args.symbol}__{args.timeframe}__training_report.json").write_text(json.dumps(report,indent=2,default=str))
    print(json.dumps({'symbol':args.symbol,'timeframe':args.timeframe,'trained':sum(v.get('status')=='paper' for v in report['models'].values()),'blocked':sum(v.get('status')=='blocked' for v in report['models'].values())},indent=2))
if __name__=='__main__': main()
