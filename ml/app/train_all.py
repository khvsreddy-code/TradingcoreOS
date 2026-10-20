
from __future__ import annotations
import argparse, hashlib, json, random, traceback
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score, log_loss
from .features import build_features, make_supervised, FEATURE_COLUMNS, FEATURE_SCHEMA_VERSION
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

def split(df, horizon=1):
    # Purge the last target-horizon rows from each earlier window. Their labels use
    # outcomes in the next window and must not contaminate validation/test metrics.
    n=len(df); a=int(n*.70); b=int(n*.85); purge=max(1,int(horizon))
    train_end=max(0,a-purge)
    valid_end=max(a,b-purge)
    return df.iloc[:train_end].copy(),df.iloc[a:valid_end].copy(),df.iloc[b:].copy()

def target_kind_for(model_id):
    if model_id in ('quantile-forest-range','conformal-range'): return 'return'
    if model_id == 'garch-volatility': return 'volatility'
    if model_id == 'hmm-regime': return 'regime'
    if model_id in TIME_SERIES_MODELS: return 'price'
    return 'direction'

def _ordered_feature_hash(features):
    return __import__('hashlib').sha256('|'.join(features).encode('utf-8')).hexdigest()


def persist_immutable_dataset_snapshot(root, supervised, *, symbol, timeframe, horizon,
                                      exchange_timezone, session_open, session_close,
                                      session_holidays, session_calendar_hash):
    """Persist canonical post-feature rows by content hash; never mutate an existing snapshot."""
    if len(supervised) < 2:
        raise ValueError('Dataset snapshot requires at least two chronologically ordered rows.')
    from_timestamp = pd.Timestamp(supervised['timestamp'].iloc[0])
    to_timestamp = pd.Timestamp(supervised['timestamp'].iloc[-1])
    if pd.isna(from_timestamp) or pd.isna(to_timestamp) or from_timestamp >= to_timestamp:
        raise ValueError('Dataset snapshot must have a valid increasing timestamp range.')

    # DataFrame.to_json normalizes NumPy/Pandas scalars and writes non-finite values as
    # JSON null. The complete feature/target frame is sealed before model-specific fits,
    # so every model from this training invocation refers to the exact same dataset.
    rows = json.loads(supervised.to_json(orient='records', date_format='iso', double_precision=15))
    envelope = {
        'schema': 'tradingcore-ml-dataset-snapshot/1',
        'symbol': str(symbol),
        'timeframe': str(timeframe),
        'forecast_horizon_bars': int(horizon),
        'feature_schema_version': FEATURE_SCHEMA_VERSION,
        'source': 'user_supplied',
        'exchange_timezone': str(exchange_timezone),
        'session_open': str(session_open),
        'session_close': str(session_close),
        'session_calendar_policy': 'weekday-session+explicit-holidays/v1',
        'session_calendar_hash': str(session_calendar_hash),
        'session_holidays': list(session_holidays),
        'from': from_timestamp.isoformat(),
        'to': to_timestamp.isoformat(),
        'row_count': len(rows),
        'rows': rows,
    }
    serialized = json.dumps(envelope, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')
    digest = hashlib.sha256(serialized).hexdigest()
    snapshots_dir = Path(root) / 'dataset-snapshots'
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = snapshots_dir / f'{digest}.json'

    # Exclusive create makes snapshots append-only across concurrent training runs.
    try:
        with snapshot_path.open('xb') as stream:
            stream.write(serialized)
    except FileExistsError:
        existing = snapshot_path.read_bytes()
        if hashlib.sha256(existing).hexdigest() != digest or existing != serialized:
            raise RuntimeError('Existing content-addressed dataset snapshot failed integrity verification.')

    return {
        'hash': digest,
        'version': digest,
        'rows': len(rows),
        'source': 'user_supplied',
        'from': from_timestamp.isoformat(),
        'to': to_timestamp.isoformat(),
        'immutable': True,
        'path': str(snapshot_path.relative_to(root)),
    }


def build_model_contract(meta, features, metrics, session_holidays):
    # This JSON contract intentionally matches src/services/coreSpirit/modelArtifacts.ts.
    # Older artifact-specific root fields remain alongside it for rollout compatibility.
    model_id = str(meta['model_id'])
    target_kind = target_kind_for(model_id)
    numeric_metrics = {
        str(name): float(value)
        for name, value in (metrics or {}).items()
        if isinstance(value, (int, float, np.integer, np.floating))
        and not isinstance(value, (bool, np.bool_))
        and np.isfinite(float(value))
    }
    required = int(meta['required_lookback_bars'])
    preferred = max(required, min(512, 5000))
    schema_hash = _ordered_feature_hash(features)
    return {
        'contractVersion': 1,
        'identity': {'id': model_id, 'version': f'{model_id}/1'},
        'featureSchema': {
            'version': FEATURE_SCHEMA_VERSION,
            'orderedNames': list(features),
            'types': ['float64'] * len(features),
            'hash': schema_hash,
        },
        'lookback': {'minBars': required, 'preferredBars': preferred, 'maxBars': 5000},
        'datasetSnapshot': {
            key: meta['dataset_snapshot'][key]
            for key in ('hash', 'version', 'rows', 'source', 'from', 'to', 'immutable')
        },
        'target': {'kind': target_kind, 'forecastHorizonBars': int(meta['forecast_horizon_bars'])},
        'temporal': {
            'trainingRequiresConfirmedBars': True,
            'availabilityRule': 'availableAt<=timestamp',
            'validationProtocol': 'purged-chronological-v1',
            'exchangeTimezone': str(meta['exchange_timezone']),
            'sessionOpen': str(meta['session_open']),
            'sessionClose': str(meta['session_close']),
            'sessionCalendarPolicy': str(meta.get('session_calendar_policy', 'weekday-session+explicit-holidays/v1')),
            'sessionCalendarHash': str(meta.get('session_calendar_hash', '')),
        },
        'validation': {
            'protocol': 'purged-chronological-v1',
            'metrics': numeric_metrics,
            'calibrationStatus': 'not_calibrated',
        },
        'releaseStatus': 'candidate',
    }


def classification_calibration_metrics(y_true, probability, bins=10):
    y = np.asarray(y_true, dtype=float)
    p = np.clip(np.asarray(probability, dtype=float), 0.0, 1.0)
    if len(y) == 0 or len(y) != len(p) or not np.all(np.isfinite(y)) or not np.all(np.isfinite(p)):
        return {}
    brier = float(np.mean((p - y) ** 2))
    ece = 0.0
    bin_count = 0
    for index in range(bins):
        left = index / bins
        right = (index + 1) / bins
        mask = (p >= left) & ((p < right) if index < bins - 1 else (p <= right))
        if not np.any(mask):
            continue
        bin_count += 1
        ece += float(np.mean(mask)) * abs(float(np.mean(p[mask])) - float(np.mean(y[mask])))
    return {'brier_score': brier, 'expected_calibration_error': float(ece), 'calibration_bin_count': float(bin_count)}

def evaluate(model, frame, features, target_kind='direction'):
    X=frame[features]
    if frame.empty: return {'status':'insufficient_test_rows'}
    if target_kind in ('return','price'):
        y=frame.target_return.to_numpy() if target_kind=='return' else frame.close.to_numpy()
        if isinstance(model,dict) and {'q10','q50','q90'}.issubset(model):
            pred=np.asarray(model['q50'].predict(X),float); lo=np.asarray(model['q10'].predict(X),float); hi=np.asarray(model['q90'].predict(X),float)
            return {'mae':float(np.mean(np.abs(y-pred))),'rmse':float(np.sqrt(np.mean((y-pred)**2))),
                    'interval_coverage':float(np.mean((y>=lo)&(y<=hi))),'sample_count':int(len(y))}
        if isinstance(model,dict): return {'status':'not_available_for_ensemble'}
        pred=np.asarray(model.predict(X),float)
        return {'mae':float(np.mean(np.abs(y-pred))),'rmse':float(np.sqrt(np.mean((y-pred)**2))),'sample_count':int(len(y))}
    y=frame.target_up.to_numpy()
    if isinstance(model,dict): return {'status':'member_metrics_recorded_individually'}
    if hasattr(model,'predict_proba'): p=model.predict_proba(X)[:,1]
    else:
        r=model.predict(X); p=1/(1+np.exp(-np.clip(np.asarray(r,float),-20,20)))
    p=np.clip(np.asarray(p,float),1e-6,1-1e-6)
    pred=(p>=.5).astype(int)
    metrics={'accuracy':float(accuracy_score(y,pred)),'precision':float(precision_score(y,pred,zero_division=0)),
            'recall':float(recall_score(y,pred,zero_division=0)),
            'roc_auc':float(roc_auc_score(y,p)) if len(np.unique(y))>1 else None,
            'log_loss':float(log_loss(y,p)),
            'sample_count':int(len(y))}
    metrics.update(classification_calibration_metrics(y,p))
    metrics['probability_semantics']='uncalibrated_classifier_probability'
    return metrics

def main():
    ap=argparse.ArgumentParser(description='Train all TradingCoreOS production models from real historical data.')
    ap.add_argument('--csv',required=True);ap.add_argument('--symbol',required=True);ap.add_argument('--timeframe',default='5m')
    ap.add_argument('--out',default='models');ap.add_argument('--horizon',type=int,default=1);ap.add_argument('--epochs',type=int,default=20)
    ap.add_argument('--exchange-timezone',default='Asia/Kolkata');ap.add_argument('--session-open',default='09:15');ap.add_argument('--session-close',default='15:30')
    ap.add_argument('--session-holidays',default='',help='comma-separated exchange-local YYYY-MM-DD holidays for the feature calendar')
    args=ap.parse_args(); random.seed(42);np.random.seed(42)
    session_holidays=sorted({value.strip() for value in args.session_holidays.split(',') if value.strip()})
    if any(not __import__('re').fullmatch(r'\d{4}-\d{2}-\d{2}', value) for value in session_holidays):
        raise ValueError('--session-holidays accepts comma-separated YYYY-MM-DD dates')
    df=pd.read_csv(args.csv)
    ren={c:{'date':'timestamp','datetime':'timestamp','shares_traded':'volume'}.get(c.strip().lower().replace(' ','_'),c.strip().lower().replace(' ','_')) for c in df.columns}
    df=df.rename(columns=ren)
    supervised=make_supervised(df,args.horizon,exchange_timezone=args.exchange_timezone,session_open=args.session_open,session_close=args.session_close,feature_schema_version=FEATURE_SCHEMA_VERSION,session_holidays=session_holidays,require_confirmed=True)
    train,valid,test=split(supervised,args.horizon)
    if min(len(train),len(valid),len(test)) < 12: raise ValueError('Purged chronological training requires at least 12 rows in each train/validation/test window.')
    root=Path(args.out);root.mkdir(parents=True,exist_ok=True)
    session_calendar_hash=hashlib.sha256('|'.join(session_holidays).encode('utf-8')).hexdigest()
    dataset_snapshot=persist_immutable_dataset_snapshot(
        root, supervised, symbol=args.symbol, timeframe=args.timeframe, horizon=args.horizon,
        exchange_timezone=args.exchange_timezone, session_open=args.session_open,
        session_close=args.session_close, session_holidays=session_holidays,
        session_calendar_hash=session_calendar_hash,
    )
    report={'symbol':args.symbol,'timeframe':args.timeframe,'horizon':args.horizon,'feature_schema_version':FEATURE_SCHEMA_VERSION,'session_calendar_policy':'weekday-session+explicit-holidays/v1','session_calendar_hash':session_calendar_hash,'session_holidays':session_holidays,'dataset_snapshot':{key:dataset_snapshot[key] for key in ('hash','version','rows','source','from','to','immutable','path')},'models':{}}
    base=FEATURE_COLUMNS
    # options/sentiment models require real columns. No synthetic fallback is used.
    opt=[c for c in OPTIONAL_FEATURES if c in supervised.columns and c!='sentiment']
    special=base+opt
    if 'sentiment' in supervised.columns: special.append('sentiment')
    for model_id in ALL_MODEL_IDS:
        d=root/f"{args.symbol}__{args.timeframe}__{model_id}"; d.mkdir(parents=True,exist_ok=True)
        target_kind=target_kind_for(model_id)
        required_lookback=max(80, 60+20 if model_id in NEURAL_KIND else 80)
        meta={'model_id':model_id,'name':MODEL_NAMES[model_id],'algorithm':TREE_MODELS.get(model_id,model_id.split('-')[0]),
              'symbol':args.symbol,'timeframe':args.timeframe,'horizon':args.horizon,'status':'paper',
              'trained_on':'real historical CSV supplied to train_all.py','feature_schema':base,
              'feature_schema_version':FEATURE_SCHEMA_VERSION,'feature_schema_hash':__import__('hashlib').sha256('|'.join(base).encode('utf-8')).hexdigest(),
              'exchange_timezone':args.exchange_timezone,'session_open':args.session_open,'session_close':args.session_close,
              'session_holidays':session_holidays,'session_calendar_policy':'weekday-session+explicit-holidays/v1','session_calendar_hash':session_calendar_hash,
              'dataset_hash':dataset_snapshot['hash'],'dataset_snapshot':dataset_snapshot,
              'target_kind':target_kind,'forecast_horizon_bars':args.horizon,'required_lookback_bars':required_lookback,
              'model_contract':{'contract_version':1,'model_identity':{'id':model_id,'symbol':args.symbol,'timeframe':args.timeframe},
                  'feature_schema':{'version':FEATURE_SCHEMA_VERSION,'ordered_names':base,'hash':__import__('hashlib').sha256('|'.join(base).encode('utf-8')).hexdigest()},
                  'lookback':{'minimum_bars':required_lookback,'preferred_bars':max(required_lookback,500),'maximum_bars':5000},
                  'target':{'kind':target_kind,'forecast_horizon_bars':args.horizon},
                  'temporal_availability':{'training_requires_confirmed_bars':True,'availability_rule':'availableAt<=timestamp','validation_protocol':'purged-chronological-v1'},
                  'validation':{'protocol':'purged-chronological-v1','calibration_status':'not_calibrated','purged_bars_per_boundary':args.horizon},
                  'release_status':'candidate'},
              'calibration_status':'not_calibrated','release_status':'candidate',
              'validation_protocol':'purged-chronological-v1','purged_bars_per_boundary':args.horizon}
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
                meta['feature_schema']=features;meta['model_contract']['feature_schema']['ordered_names']=features;meta['model_contract']['feature_schema']['hash']=__import__('hashlib').sha256('|'.join(features).encode('utf-8')).hexdigest();meta['metrics']=evaluate(m,test,features,'return' if model_id=='quantile-forest-range' else 'direction')
            elif model_id in NEURAL_MODELS:
                kind=NEURAL_KIND[model_id];features=base
                if kind in ('nbeats','patchtst','tft','timemixer'): train_special_neural(train,valid,kind,features,d,epochs=args.epochs)
                else: train_neural(train,valid,kind,features,d,epochs=args.epochs)
                # store architecture metadata for loader
                meta.update({'kind':kind,'sequence_length':60,'required_lookback_bars':80,'neural_features':features,'feature_schema':features});meta['model_contract']['feature_schema']['ordered_names']=features;meta['model_contract']['feature_schema']['hash']=__import__('hashlib').sha256('|'.join(features).encode('utf-8')).hexdigest()
                # validate quickly using test
                meta['metrics']=evaluate(m,test,features,'direction');meta['metrics']['note']='direction metrics; probability calibration remains not_calibrated'
            elif model_id in TIME_SERIES_MODELS:
                m=fit_time_series(train,model_id);joblib.dump({'kind':'timeseries','model':m},d/'model.joblib')
                meta['metrics']={'note':'point forecast metrics must be measured on a separate horizon-matched holdout','validation_protocol':'purged-chronological-v1'}
            elif model_id=='hmm-regime':
                b=fit_hmm(train,base);joblib.dump({'kind':'hmm','model':b,'features':base},d/'model.joblib');meta['feature_schema']=base;meta['metrics']={'sample_count':int(len(test)),'note':'regime state metrics require state-alignment validation'}
            elif model_id=='conformal-range':
                # Train a genuine base regressor then calibrate absolute residual quantile on validation.
                base_model=GradientBoostingRegressor(n_estimators=300,max_depth=3,learning_rate=.03,random_state=42).fit(train[base],train.target_return)
                residual=np.abs(valid.target_return.to_numpy()-base_model.predict(valid[base]))
                q=float(np.quantile(residual,.90,method='higher'))
                joblib.dump({'kind':'conformal','model':base_model,'features':base,'q90':q},d/'model.joblib');meta['interval_method']='split_conformal_abs_residual';meta['q90']=q
            elif model_id=='sentiment-hybrid':
                if 'sentiment' not in supervised.columns: raise RuntimeError('Sentiment Hybrid requires a real sentiment feature column')
                features=base+['sentiment'];m=train_classical(train,valid,'logistic-direction',features);joblib.dump({'kind':'classical','model':m,'features':features},d/'model.joblib');meta['feature_schema']=features;meta['model_contract']['feature_schema']['ordered_names']=features;meta['model_contract']['feature_schema']['hash']=__import__('hashlib').sha256('|'.join(features).encode('utf-8')).hexdigest()
            else: raise RuntimeError('Unhandled model')
            sealed_features=list(meta.get('feature_schema', base))
            meta['feature_schema']=sealed_features
            meta['feature_schema_hash']=_ordered_feature_hash(sealed_features)
            meta['model_contract']=build_model_contract(meta, sealed_features, meta.get('metrics', {}), session_holidays)
            (d/'metadata.json').write_text(json.dumps(meta,indent=2,default=str));report['models'][model_id]=meta
        except Exception as e:
            meta['status']='blocked';meta['error']=str(e)
            fallback_features=list(meta.get('feature_schema', base))
            meta['feature_schema']=fallback_features
            meta['feature_schema_hash']=_ordered_feature_hash(fallback_features)
            meta['model_contract']=build_model_contract(meta, fallback_features, meta.get('metrics', {}), session_holidays)
            (d/'metadata.json').write_text(json.dumps(meta,indent=2,default=str));report['models'][model_id]=meta
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
