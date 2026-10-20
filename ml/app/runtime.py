
from __future__ import annotations
import json, math, hashlib
from pathlib import Path
import joblib, numpy as np, pandas as pd, torch
from .features import build_features, FEATURE_COLUMNS, FEATURE_SCHEMA_VERSION, TIMEZONE_FEATURE_SCHEMA_VERSION, LEGACY_FEATURE_SCHEMA_VERSION
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

def _contract_field(contract, snake_name, camel_name, default=None):
    value = contract.get(camel_name, contract.get(snake_name, default))
    return default if value is None else value


def _validate_model_contract(meta, contract, symbol, timeframe, model_id, features, feature_version, target_kind, horizon, lookback):
    if not contract:
        # Read pre-contract artifacts for backwards compatibility, while keeping their
        # legacy feature schema explicit instead of silently upgrading their ABI.
        return {
            'schema_hash': hashlib.sha256('|'.join(features).encode('utf-8')).hexdigest(),
            'release_status': str(meta.get('release_status', meta.get('status', 'candidate'))),
            'calibration_status': str(meta.get('calibration_status', 'not_calibrated')),
            'validation_metrics': meta.get('metrics', {}),
        }

    if int(_contract_field(contract, 'contract_version', 'contractVersion', 0)) != 1:
        raise ValueError('Unsupported model contract version.')
    identity = contract.get('identity', contract.get('model_identity', {}))
    if not isinstance(identity, dict):
        raise ValueError('Model contract identity must be an object.')
    contract_id = str(identity.get('id', identity.get('model_id', model_id)))
    contract_symbol = str(identity.get('symbol', meta.get('symbol', symbol)))
    contract_timeframe = str(identity.get('timeframe', meta.get('timeframe', timeframe)))
    artifact_symbol = str(meta.get('symbol', symbol))
    artifact_timeframe = str(meta.get('timeframe', timeframe))
    if (contract_id != model_id or contract_symbol != symbol or contract_timeframe != timeframe
            or artifact_symbol != symbol or artifact_timeframe != timeframe):
        raise ValueError('Model artifact identity does not match the requested symbol, timeframe and model family.')

    strict_schema = 'featureSchema' in contract
    schema = contract.get('featureSchema', contract.get('feature_schema', {}))
    if not isinstance(schema, dict):
        raise ValueError('Model feature schema must be an object.')
    ordered_names = schema.get('orderedNames', schema.get('ordered_names', features))
    schema_version = str(schema.get('version', feature_version))
    schema_hash = str(schema.get('hash', ''))
    actual_hash = hashlib.sha256('|'.join(features).encode('utf-8')).hexdigest()
    # New camel-case contracts are strict and hash-pinned. Older snake-case v1
    # contracts are read through a compatibility adapter because early Python
    # artifacts sometimes recorded the common base features before model-specific
    # optional columns were attached to the fitted estimator.
    if strict_schema and list(ordered_names) != list(features):
        raise ValueError('Model feature order does not match its sealed feature schema.')
    if strict_schema and schema_hash and schema_hash != actual_hash:
        raise ValueError('Model feature schema hash does not match its ordered feature names.')
    if schema_version != feature_version:
        raise ValueError(f'Model feature schema version mismatch: metadata declares {schema_version}, runtime selected {feature_version}.')

    lookback_contract = contract.get('lookback', {})
    declared_minimum = int(_contract_field(lookback_contract, 'min_bars', 'minBars', lookback))
    declared_maximum = int(_contract_field(lookback_contract, 'max_bars', 'maxBars', 5000))
    if declared_minimum < 1 or declared_maximum < declared_minimum or declared_maximum > 5000:
        raise ValueError('Model lookback contract must satisfy 1 <= minimum <= maximum <= 5000.')
    if lookback < declared_minimum:
        raise ValueError('Model required lookback is below the contract minimum.')

    target = contract.get('target', {})
    declared_target = str(target.get('kind', target_kind))
    declared_horizon = int(_contract_field(target, 'forecast_horizon_bars', 'forecastHorizonBars', horizon))
    if declared_target != target_kind or declared_horizon != horizon:
        raise ValueError('Model target semantics or forecast horizon do not match the artifact contract.')

    temporal = contract.get('temporal', {})
    if temporal and temporal.get('trainingRequiresConfirmedBars', temporal.get('training_requires_confirmed_bars', True)) is not True:
        raise ValueError('Model contract must require confirmed historical bars during training.')
    availability_rule = temporal.get('availabilityRule', temporal.get('availability_rule', 'availableAt<=timestamp'))
    if availability_rule != 'availableAt<=timestamp':
        raise ValueError('Model contract has an unsupported temporal availability rule.')

    validation = contract.get('validation', {})
    calibration = str(_contract_field(validation, 'calibration_status', 'calibrationStatus',
                                      meta.get('calibration_status', 'not_calibrated')))
    release_status = str(_contract_field(contract, 'release_status', 'releaseStatus',
                                         meta.get('release_status', meta.get('status', 'candidate'))))
    if release_status not in ('candidate', 'approved', 'revoked', 'retired'):
        raise ValueError('Model release status is invalid.')
    if calibration not in ('calibrated', 'not_calibrated', 'not_applicable'):
        raise ValueError('Model probability calibration status is invalid.')
    metrics = _contract_field(validation, 'metrics', 'metrics', meta.get('metrics', {}))
    if not isinstance(metrics, dict):
        raise ValueError('Model validation metrics must be an object.')
    return {
        'schema_hash': actual_hash,
        'release_status': release_status,
        'calibration_status': calibration,
        'validation_metrics': metrics,
    }


def predict_artifact(root, symbol, timeframe, model_id, candles, requested_horizon=1):
    d, meta, a = load_artifact(root, symbol, timeframe, model_id)
    if not isinstance(candles, (list, tuple)) or len(candles) > 5000:
        raise ValueError('Prediction candle window must contain at most 5000 rows.')

    model_contract = meta.get('model_contract') if isinstance(meta.get('model_contract'), dict) else {}
    contract_target = model_contract.get('target') if isinstance(model_contract.get('target'), dict) else {}
    target_kind = str(meta.get('target_kind', contract_target.get('kind', 'direction')))
    contract_horizon = _contract_field(contract_target, 'forecast_horizon_bars', 'forecastHorizonBars', 1)
    forecast_horizon = int(meta.get('forecast_horizon_bars', meta.get('horizon', contract_horizon)))
    if forecast_horizon < 1 or forecast_horizon > 500:
        raise ValueError('Artifact forecast horizon is outside the supported [1, 500] bar range.')
    if requested_horizon != forecast_horizon:
        raise ValueError(f'Artifact was trained for a {forecast_horizon}-bar target; requested horizon {requested_horizon} is not compatible.')

    contract_schema = model_contract.get('featureSchema', model_contract.get('feature_schema', {}))
    if not isinstance(contract_schema, dict):
        contract_schema = {}
    feature_version = str(meta.get(
        'feature_schema_version',
        contract_schema.get('version', model_contract.get('feature_schema_version', LEGACY_FEATURE_SCHEMA_VERSION)),
    ))
    if feature_version not in (FEATURE_SCHEMA_VERSION, TIMEZONE_FEATURE_SCHEMA_VERSION, LEGACY_FEATURE_SCHEMA_VERSION):
        raise ValueError(f'Unsupported artifact feature schema version: {feature_version}')
    temporal = model_contract.get('temporal', {}) if isinstance(model_contract.get('temporal'), dict) else {}
    timezone = str(meta.get('exchange_timezone', temporal.get('exchangeTimezone', temporal.get('exchange_timezone', 'Asia/Kolkata'))))
    session_open = str(meta.get('session_open', temporal.get('sessionOpen', temporal.get('session_open', '09:15'))))
    session_close = str(meta.get('session_close', temporal.get('sessionClose', temporal.get('session_close', '15:30'))))
    session_holidays = meta.get('session_holidays', temporal.get('sessionHolidays', temporal.get('session_holidays', [])))
    if not isinstance(session_holidays, (list, tuple)):
        raise ValueError('Artifact session_holidays must be a list of exchange-local YYYY-MM-DD dates.')
    session_holidays = [str(day) for day in session_holidays]
    frame = build_features(
        candles,
        exchange_timezone=timezone,
        session_open=session_open,
        session_close=session_close,
        feature_schema_version=feature_version,
        session_holidays=session_holidays,
    )
    if frame.empty:
        raise ValueError('Feature pipeline produced no valid rows from the supplied OHLCV history.')

    kind = a.get('kind') if isinstance(a, dict) else 'classical'
    neural_sequence = int(meta.get('sequence_length', 60)) if kind == 'neural' else 0
    contract_lookback = model_contract.get('lookback', {}) if isinstance(model_contract.get('lookback'), dict) else {}
    contract_minimum = _contract_field(contract_lookback, 'min_bars', 'minBars', 80)
    required_lookback = max(
        int(meta.get('required_lookback_bars', max(80, neural_sequence))),
        int(contract_minimum),
        neural_sequence,
    )
    if not 1 <= required_lookback <= 5000:
        raise ValueError('Artifact required lookback must be in [1, 5000].')
    if len(frame) < required_lookback:
        raise ValueError(f"Insufficient feature history for {model_id}: artifact requires {required_lookback} bars, received {len(frame)} validated rows.")
    features = list(a.get('features', meta.get('neural_features', meta.get('feature_schema', FEATURE_COLUMNS)))) if isinstance(a, dict) else list(meta.get('feature_schema', FEATURE_COLUMNS))
    missing_features = [name for name in features if name not in frame.columns]
    if missing_features:
        raise ValueError(f'Artifact feature schema is not available from this pipeline: {missing_features}')
    contract_validation = _validate_model_contract(
        meta, model_contract, symbol, timeframe, model_id, features,
        feature_version, target_kind, forecast_horizon, required_lookback,
    )
    latest = float(frame.close.iloc[-1])
    if not math.isfinite(latest) or latest <= 0:
        raise ValueError('Latest validated close is not a positive finite price.')

    predicted_price = None
    lower = None
    upper = None
    expected_return = None
    expected_move = None
    return_estimate_kind = 'unavailable_direction_only'
    probability_semantics = 'uncalibrated_direction_score'
    p = 0.5

    if kind == 'classical':
        X = frame[features].tail(1)
        model = a['model']
        if hasattr(model, 'predict_proba'):
            p = float(model.predict_proba(X)[0, 1])
            probability_semantics = 'classifier_probability_not_calibrated'
        else:
            score = float(np.asarray(model.predict(X)).reshape(-1)[0])
            p = float(1 / (1 + np.exp(-np.clip(score, -20, 20))))
            probability_semantics = 'sigmoid_of_model_score_not_calibrated'
            # Only a model explicitly trained against a return target may emit a return estimate.
            if target_kind in ('return', 'expected_return'):
                expected_return = score
                predicted_price = latest * (1 + expected_return)
                expected_move = abs(latest * expected_return)
                return_estimate_kind = 'trained_return_regressor'
                lower = predicted_price
                upper = predicted_price
    elif kind == 'ensemble':
        X = frame[features].tail(1)
        probabilities = []
        for member in a['model'].values():
            if not hasattr(member, 'predict_proba'):
                raise ValueError('Ensemble contains a non-classifier member; refusing to infer return from direction scores.')
            probabilities.append(float(member.predict_proba(X)[0, 1]))
        p = float(np.mean(probabilities))
        probability_semantics = 'mean_of_classifier_probabilities_not_calibrated'
    elif kind == 'neural':
        seq = int(meta.get('sequence_length', 60))
        if seq < 1 or seq > 5000:
            raise ValueError('Neural sequence_length must be in [1, 5000].')
        if len(frame) < seq:
            raise ValueError(f'Neural artifact requires {seq} rows, received {len(frame)}.')
        x = a['scaler'].transform(frame[features].tail(seq)).astype(np.float32)
        with torch.no_grad():
            logit = float(a['model'](torch.tensor(x[None])).squeeze().item())
        p = float(1 / (1 + np.exp(-np.clip(logit, -20, 20))))
        probability_semantics = 'sigmoid_of_neural_direction_logit_not_calibrated'
    elif kind == 'quantile':
        X = frame[features].tail(1)
        expected_return = float(a['q50'].predict(X)[0])
        q10 = float(a['q10'].predict(X)[0])
        q90 = float(a['q90'].predict(X)[0])
        if not all(math.isfinite(value) for value in (expected_return, q10, q90)) or q10 > q90:
            raise ValueError('Quantile model returned invalid return forecasts.')
        predicted_price = latest * (1 + expected_return)
        lower = latest * (1 + q10)
        upper = latest * (1 + q90)
        expected_move = abs(latest * expected_return)
        return_estimate_kind = 'trained_quantile_return_model'
        p = float(1 / (1 + np.exp(-np.clip(expected_return * 100, -20, 20))))
        probability_semantics = 'heuristic_transform_of_expected_return_not_direction_probability'
    elif kind == 'conformal':
        X = frame[features].tail(1)
        expected_return = float(a['model'].predict(X)[0])
        residual_quantile = float(a['q90'])
        if not math.isfinite(expected_return) or not math.isfinite(residual_quantile) or residual_quantile < 0:
            raise ValueError('Conformal model returned invalid forecast or residual calibration.')
        predicted_price = latest * (1 + expected_return)
        lower = latest * (1 + expected_return - residual_quantile)
        upper = latest * (1 + expected_return + residual_quantile)
        expected_move = abs(latest * expected_return)
        return_estimate_kind = 'trained_conformal_return_model'
        p = float(1 / (1 + np.exp(-np.clip(expected_return * 100, -20, 20))))
        probability_semantics = 'heuristic_transform_of_expected_return_not_direction_probability'
    elif kind == 'hmm':
        X = a['scaler'].transform(frame[features])
        state = int(a['model'].predict(X[-1:].reshape(1, -1))[0])
        means = a['model'].means_[:, 0] if a['model'].means_.shape[1] else a['model'].means_.ravel()
        state_mean = float(means[state])
        p = float(1 / (1 + np.exp(-np.clip(state_mean, -20, 20))))
        probability_semantics = 'heuristic_transform_of_regime_emission_not_direction_probability'
    elif kind == 'timeseries':
        model = a['model']
        if model_id == 'garch-volatility':
            forecast = model.forecast(horizon=forecast_horizon, reindex=False)
            volatility = float(np.sqrt(forecast.variance.values[-1, -1])) / 100
            if not math.isfinite(volatility) or volatility < 0:
                raise ValueError('GARCH model returned an invalid volatility estimate.')
            lower = latest * (1 - volatility)
            upper = latest * (1 + volatility)
            probability_semantics = 'not_applicable_volatility_model'
            return_estimate_kind = 'volatility_interval_only'
        else:
            prediction = model.forecast(steps=forecast_horizon)
            point_forecast = float(np.asarray(prediction).reshape(-1)[-1])
            if not math.isfinite(point_forecast) or point_forecast <= 0:
                raise ValueError('Time-series model returned an invalid price forecast.')
            predicted_price = point_forecast
            expected_return = point_forecast / latest - 1
            expected_move = abs(point_forecast - latest)
            lower = point_forecast
            upper = point_forecast
            return_estimate_kind = 'trained_price_forecast'
            p = float(1 / (1 + np.exp(-np.clip(expected_return * 500, -20, 20))))
            probability_semantics = 'heuristic_transform_of_price_forecast_not_direction_probability'
    else:
        raise RuntimeError(f'Unsupported artifact kind: {kind}')

    bull, neutral, bear, edge = _probs_from_p(p)
    direction = 'BULLISH' if edge > .08 else 'BEARISH' if edge < -.08 else 'NEUTRAL'
    gate = _apply_meta_gate(root, symbol, timeframe, frame, p, direction)
    release_status = contract_validation['release_status']
    if release_status != 'approved':
        # A fitted artifact is not automatically a production-released model. Keep
        # inference available for research/paper use but deny the execution gate until
        # an audited release-control record has approved this exact artifact.
        gate = {
            **gate,
            'entry_allowed': False,
            'status': 'release_blocked',
            'release_status': release_status,
            'release_block_reason': 'Model artifact is not approved for production execution.',
        }

    # A developing input bar is useful for a preview, but it is not silently equated
    # with a confirmed close and should not be used as a historical training label.
    latest_candle = candles[-1] if candles else {}
    latest_phase = str(latest_candle.get('phase', 'unknown')) if isinstance(latest_candle, dict) else 'unknown'
    latest_confirmed = latest_candle.get('confirmed') if isinstance(latest_candle, dict) else None
    latest_available_at = latest_candle.get('availableAt') if isinstance(latest_candle, dict) else None
    calibration = contract_validation['calibration_status']
    release_status = contract_validation['release_status']
    feature_schema_hash = contract_validation['schema_hash']

    return {
        'model_version': meta.get('version', meta.get('model_id', 'trained')),
        'artifact_hash': meta.get('artifact_hash'),
        'algorithm': meta.get('algorithm', model_id),
        'direction': direction,
        'bullish_probability': bull,
        'neutral_probability': neutral,
        'bearish_probability': bear,
        'confidence': float(max(bull, bear)),
        'confidence_semantics': 'directional strength; not a proven accuracy estimate',
        'probability_semantics': probability_semantics,
        'probability_calibration': calibration,
        'predicted_price': predicted_price,
        'expected_return': expected_return,
        'return_estimate_kind': return_estimate_kind,
        'lower_bound': lower,
        'upper_bound': upper,
        'expected_move': expected_move,
        'latest_price': latest,
        'feature_schema': features,
        'feature_schema_version': feature_version,
        'feature_schema_hash': feature_schema_hash,
        'required_lookback_bars': required_lookback,
        'forecast_horizon_bars': forecast_horizon,
        'temporal_provenance': {
            'latest_bar_phase': latest_phase,
            'latest_bar_confirmed': latest_confirmed,
            'latest_bar_available_at': latest_available_at,
            'training_requires_confirmed_bars': True,
        },
        'validation_metrics': contract_validation['validation_metrics'],
        'model_contract': model_contract,
        'execution_gate': gate,
        'trained': True,
        'status': meta.get('status', 'paper'),
        'release_status': release_status,
        'production_eligible': release_status == 'approved' and bool(gate.get('entry_allowed', False)),
        'session_calendar_policy': frame.attrs.get('session_calendar_policy', 'legacy-utc-clock/v1'),
        'session_calendar_holidays': frame.attrs.get('session_holidays', []),
    }

def predict_many(root, symbol, timeframe, model_ids, candles, horizon=1):
    out = {}
    for model_id in model_ids:
        try:
            out[model_id] = predict_artifact(root, symbol, timeframe, model_id, candles, requested_horizon=horizon)
        except Exception as error:
            out[model_id] = {
                'error': str(error),
                'trained': False,
                'status': 'unavailable',
                'release_status': 'unavailable',
            }
    return out
