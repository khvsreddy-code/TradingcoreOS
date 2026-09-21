from __future__ import annotations
"""TradingCoreOS intraday signal optimization.

Implements optional, data-driven execution filters rather than claiming a guaranteed
win-rate improvement: triple-barrier event labeling, meta-labeling, regime gates,
OFI/OI/VIX features, and volatility-aware thresholds/position sizing metadata.
"""
import json
from pathlib import Path
from typing import Any
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score

OPT_FEATURES = [
    'ofi_z', 'book_imbalance', 'pcr', 'oi_buildup', 'gex', 'gex_regime',
    'india_vix', 'cboe_vix', 'vol_regime', 'rvi_intraday', 'tod_open_gate',
    'tod_midday', 'tod_close_gate', 'atr_14_pct', 'volatility_20',
    'ret_1', 'ret_3', 'volume_ratio'
]


def _num(df, col):
    return pd.to_numeric(df[col], errors='coerce') if col in df.columns else pd.Series(np.nan, index=df.index)


def add_market_optimization_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    # Accept common broker/data-vendor aliases without inventing missing data.
    aliases = {
        'bid_size': ['bid_size','best_bid_qty','bid_qty'], 'ask_size':['ask_size','best_ask_qty','ask_qty'],
        'bid_price':['bid_price','best_bid'], 'ask_price':['ask_price','best_ask'],
        'call_oi':['call_oi','ce_oi'], 'put_oi':['put_oi','pe_oi'],
        'call_oi_change':['call_oi_change','ce_oi_change'], 'put_oi_change':['put_oi_change','pe_oi_change'],
        'gex':['gex','net_gex','gamma_exposure'], 'india_vix':['india_vix','india_vix_level'],
        'cboe_vix':['cboe_vix','vix','cboe_vix_level'],
    }
    for dst, names in aliases.items():
        if dst not in out.columns:
            for n in names:
                if n in out.columns:
                    out[dst] = pd.to_numeric(out[n], errors='coerce'); break
    bid = _num(out,'bid_size'); ask = _num(out,'ask_size')
    out['book_imbalance'] = (bid-ask)/(bid+ask).replace(0,np.nan)
    if 'bid_price' in out.columns and 'ask_price' in out.columns:
        out['micro_price'] = (_num(out,'ask_price')*bid + _num(out,'bid_price')*ask)/(bid+ask).replace(0,np.nan)
    else:
        out['micro_price'] = np.nan
    # OFI approximation from top-of-book snapshots when tick/L2 fields exist.
    if 'bid_price' in out.columns and 'ask_price' in out.columns:
        bp, ap = _num(out,'bid_price'), _num(out,'ask_price')
        bq, aq = bid, ask
        db = bp.diff(); da = ap.diff()
        ofi = np.where(db>0,bq,0) - np.where(db<0,bq.shift(1),0) - np.where(da<0,aq,0) + np.where(da>0,aq.shift(1),0)
        out['ofi_raw'] = pd.Series(ofi,index=out.index).replace([np.inf,-np.inf],np.nan)
        mu=out.ofi_raw.rolling(50,min_periods=20).mean(); sd=out.ofi_raw.rolling(50,min_periods=20).std()
        out['ofi_z']=(out.ofi_raw-mu)/sd.replace(0,np.nan)
    else:
        out['ofi_raw']=np.nan; out['ofi_z']=np.nan
    # Options positioning alignment. Do not infer missing chain data.
    if 'pcr' not in out.columns and 'put_oi' in out.columns and 'call_oi' in out.columns:
        out['pcr']=_num(out,'put_oi')/_num(out,'call_oi').replace(0,np.nan)
    put_ch=_num(out,'put_oi_change'); call_ch=_num(out,'call_oi_change')
    if put_ch.notna().any() or call_ch.notna().any():
        out['oi_buildup'] = np.sign(put_ch.fillna(0)-call_ch.fillna(0))
    else: out['oi_buildup']=np.nan
    gex=_num(out,'gex')
    out['gex_regime']=np.sign(gex)
    # Intraday U-curve feature, market-local timestamps are expected from broker adapter.
    ts=pd.to_datetime(out['timestamp'],utc=True,errors='coerce')
    minute=ts.dt.hour*60+ts.dt.minute
    # Broad gates; India local conversion is applied when timestamp carries UTC.
    ist=ts.dt.tz_convert('Asia/Kolkata')
    im=ist.dt.hour*60+ist.dt.minute
    out['tod_open_gate']=((im>=9*60+15)&(im<9*60+45)).astype(int)
    out['tod_midday']=((im>=11*60)&(im<13*60)).astype(int)
    out['tod_close_gate']=((im>=15*60)&(im<=15*60+30)).astype(int)
    # RVI = local rolling volatility relative to opening-session volatility when available.
    vol=_num(out,'volatility_20')
    opening=vol.where(out['tod_open_gate'].eq(1)).expanding(min_periods=10).median()
    out['rvi_intraday']=vol/opening.replace(0,np.nan)
    # Volatility regime: India VIX first, Cboe VIX for US data.
    ivix=_num(out,'india_vix'); cvix=_num(out,'cboe_vix')
    v=ivix.combine_first(cvix)
    out['vol_regime']=np.select([v>=25,v>=22,v>=20],[3,2,1],default=0)
    return out.replace([np.inf,-np.inf],np.nan)


def triple_barrier_labels(df: pd.DataFrame, atr_mult_tp=1.5, atr_mult_sl=1.0, max_bars=6) -> pd.Series:
    """Event label: 1 if TP is hit before SL/time, else 0.
    For each bar we evaluate a long primary signal. A separate signed transform is
    used for short signals by the meta-labeler at inference.
    """
    c=df.close.to_numpy(float); atr=(df.atr_14_pct.to_numpy(float)*c)
    y=np.full(len(df),np.nan)
    for i in range(len(df)-1):
        a=atr[i]
        if not np.isfinite(a) or a<=0: continue
        tp=c[i]+atr_mult_tp*a; sl=c[i]-atr_mult_sl*a
        end=min(len(df)-1,i+max_bars); label=0
        for j in range(i+1,end+1):
            # Conservative same-bar ordering: if both touched, treat as stop first.
            if df.high.iloc[j]>=tp and df.low.iloc[j]<=sl: label=0; break
            if df.high.iloc[j]>=tp: label=1; break
            if df.low.iloc[j]<=sl: label=0; break
        y[i]=label
    return pd.Series(y,index=df.index,name='meta_target')


def _meta_frame(df, primary_prob):
    z=df.copy(); z['primary_prob']=np.asarray(primary_prob,float)
    z['primary_edge']=2*z.primary_prob-1
    cols=[c for c in OPT_FEATURES if c in z.columns]+['primary_prob','primary_edge']
    return z[cols].replace([np.inf,-np.inf],np.nan).fillna(0.0)


def fit_meta_labeler(train: pd.DataFrame, valid: pd.DataFrame, primary_prob_train, primary_prob_valid, out_dir: Path, threshold=.65):
    tr=train.copy(); va=valid.copy()
    tr['meta_target']=triple_barrier_labels(tr); va['meta_target']=triple_barrier_labels(va)
    tr=tr.loc[tr.meta_target.notna()].copy(); va=va.loc[va.meta_target.notna()].copy()
    n=min(len(tr),len(primary_prob_train)); tr=tr.iloc[:n]
    nv=min(len(va),len(primary_prob_valid)); va=va.iloc[:nv]
    if len(tr)<100 or tr.meta_target.nunique()<2:
        raise RuntimeError('Insufficient triple-barrier events for meta-labeler')
    X=_meta_frame(tr,primary_prob_train[:len(tr)]); y=tr.meta_target.astype(int)
    Xv=_meta_frame(va,primary_prob_valid[:len(va)]); yv=va.meta_target.astype(int)
    model=RandomForestClassifier(n_estimators=400,max_depth=6,min_samples_leaf=8,class_weight='balanced_subsample',random_state=42,n_jobs=-1)
    model.fit(X,y)
    pv=model.predict_proba(Xv)[:,1] if len(Xv) else np.array([])
    metrics={'threshold':threshold,'events_train':int(len(tr)),'events_valid':int(len(va))}
    if len(np.unique(yv))>1: metrics['roc_auc']=float(roc_auc_score(yv,pv))
    joblib.dump({'model':model,'features':list(X.columns),'threshold':threshold,
                 'tp_atr':atr_mult if False else 1.5,'sl_atr':1.0,'max_bars':6},out_dir/'meta_labeler.joblib')
    (out_dir/'meta_labeler_metrics.json').write_text(json.dumps(metrics,indent=2))
    return metrics


def execution_gate(frame: pd.DataFrame, direction: str, meta_success: float, threshold=.65, region='auto') -> dict[str,Any]:
    """Data-availability-aware gate. Missing microstructure/options data never gets
    fabricated; those gates are marked unavailable rather than treated as confirmation."""
    row=frame.iloc[-1]
    edge=1 if direction=='BULLISH' else -1 if direction=='BEARISH' else 0
    ofi=row.get('ofi_z',np.nan); gex=row.get('gex',np.nan); pcr=row.get('pcr',np.nan)
    vix=row.get('india_vix',np.nan); cvix=row.get('cboe_vix',np.nan)
    checks=[]
    if np.isfinite(ofi): checks.append(abs(float(ofi))>=2.0)
    if np.isfinite(gex): checks.append((float(gex)<0 and edge!=0) or (float(gex)>0 and edge==0))
    if np.isfinite(meta_success): checks.append(float(meta_success)>=threshold)
    # VIX/tod thresholds raise the bar instead of forcing a direction.
    threshold_adj=threshold
    if int(row.get('tod_open_gate',0)) or int(row.get('tod_close_gate',0)): threshold_adj+=.05
    if np.isfinite(vix) and float(vix)>=22: threshold_adj+=.05
    if np.isfinite(cvix) and float(cvix)>=25: threshold_adj+=.05
    checks=[c for c in checks if c is not None]
    passed=(edge!=0 and np.isfinite(meta_success) and meta_success>=threshold_adj and (all(checks) if checks else True))
    return {'entry_allowed':bool(passed),'meta_probability':float(meta_success),'threshold':float(threshold_adj),
            'ofi_z':None if not np.isfinite(ofi) else float(ofi),'gex':None if not np.isfinite(gex) else float(gex),
            'pcr':None if not np.isfinite(pcr) else float(pcr),'india_vix':None if not np.isfinite(vix) else float(vix),
            'cboe_vix':None if not np.isfinite(cvix) else float(cvix),'checks_available':len(checks)}
