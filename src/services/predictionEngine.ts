import { HistoricalCandle } from './brokers/BrokerAdapter';

export type PredictionModelType = 'direction'|'trend'|'breakout'|'volatility'|'options';
export type PredictionAlgorithm = 'xgboost'|'random_forest'|'logistic_regression'|'gradient_boosting'|'tft'|'nbeats'|'patchtst'|'lstm'|'tcn'|'lightgbm'|'catboost'|'hmm'|'conformal_ensemble'|'timemixer'|'arima'|'sarima'|'ets'|'prophet'|'svr'|'knn'|'bilstm'|'cnn_lstm'|'lstm_gru'|'transformer'|'sentiment_hybrid'|'garch'|'quantile_forest';
export interface PredictionModelDefinition { id:string; name:string; algorithm:PredictionAlgorithm; purpose:string; status:'ready'|'planned'; description:string; execution:'research-heuristic'|'server'; }
export const PREDICTION_MODELS:PredictionModelDefinition[] = [
 {id:'xgb-direction',name:'XGBoost Direction',algorithm:'xgboost',purpose:'Next-bar directional probability',status:'ready',description:'Trained Python XGBoost artifact only; unavailable until a compatible artifact is installed for this symbol/timeframe.',execution:'trained-server'},
 {id:'rf-direction',name:'Random Forest Direction',algorithm:'random_forest',purpose:'Robust directional vote',status:'ready',description:'Multi-threshold tree voting for directional classification.',execution:'research-heuristic'},
 {id:'logistic-direction',name:'Logistic Regression',algorithm:'logistic_regression',purpose:'Transparent directional baseline',status:'ready',description:'Interpretable probability model using normalized market features.',execution:'research-heuristic'},
 {id:'gb-volatility',name:'Gradient Boosting Volatility',algorithm:'gradient_boosting',purpose:'Expected-move regime',status:'ready',description:'Boosted volatility score and forward range estimator.',execution:'research-heuristic'},
 {id:'xgb-breakout',name:'XGBoost Breakout',algorithm:'xgboost',purpose:'Breakout probability',status:'ready',description:'Local rule-based research heuristic; not a trained XGBoost artifact.',execution:'research-heuristic'},
 {id:'momentum-regime',name:'Momentum Regime',algorithm:'gradient_boosting',purpose:'Trend continuation',status:'ready',description:'Scores acceleration, EMA slope and directional persistence.',execution:'research-heuristic'},
 {id:'mean-reversion',name:'Mean Reversion',algorithm:'logistic_regression',purpose:'Reversion probability',status:'ready',description:'Detects stretched price, volatility expansion and snap-back conditions.',execution:'research-heuristic'},
 {id:'trend-strength',name:'Trend Strength',algorithm:'random_forest',purpose:'Trend persistence',status:'ready',description:'Votes across short, medium and long trend structure.',execution:'research-heuristic'},
 {id:'range-breakout',name:'Range Breakout Pro',algorithm:'gradient_boosting',purpose:'Breakout + retest',status:'ready',description:'Combines range compression, breakout pressure and participation.',execution:'research-heuristic'},
 {id:'volatility-regime',name:'Volatility Regime',algorithm:'gradient_boosting',purpose:'Volatility state',status:'ready',description:'Classifies low, normal and high-volatility conditions.',execution:'research-heuristic'},
 {id:'price-action',name:'Price Action Structure',algorithm:'random_forest',purpose:'Structure direction',status:'ready',description:'Uses recent highs, lows, body pressure and rejection behavior.',execution:'research-heuristic'},
 {id:'options-flow',name:'Options Flow Bias',algorithm:'gradient_boosting',purpose:'Options-aware bias',status:'ready',description:'Price-direction proxy designed to combine with OI/PCR analytics when available.',execution:'research-heuristic'},
 {id:'ensemble-voting',name:'Core Ensemble Voting',algorithm:'gradient_boosting',purpose:'Multi-model consensus',status:'ready',description:'Consensus layer across direction, trend, breakout and volatility models.',execution:'research-heuristic'},
 {id:'tft-multihorizon',name:'Temporal Fusion Transformer',algorithm:'tft',purpose:'Multi-horizon direction + range',status:'ready',description:'Attention-inspired multi-horizon proxy using short, medium and long market features.',execution:'research-heuristic'},
 {id:'nbeats-trend',name:'N-BEATS Trend',algorithm:'nbeats',purpose:'Trend decomposition',status:'ready',description:'Residual trend/seasonality-style proxy for directional continuation and projected path.',execution:'research-heuristic'},
 {id:'patchtst-pattern',name:'PatchTST Pattern',algorithm:'patchtst',purpose:'Local pattern forecast',status:'ready',description:'Patch-based sequence proxy that compares recent price blocks and momentum structure.',execution:'research-heuristic'},
 {id:'lstm-sequence',name:'LSTM Sequence',algorithm:'lstm',purpose:'Sequential momentum',status:'ready',description:'Sequence-memory proxy for persistence, acceleration and reversal pressure.',execution:'research-heuristic'},
 {id:'tcn-momentum',name:'Temporal Convolution Network',algorithm:'tcn',purpose:'Fast momentum structure',status:'ready',description:'Multi-window convolution-style proxy for short-term momentum and impulse detection.',execution:'research-heuristic'},
 {id:'lightgbm-regime',name:'LightGBM Regime',algorithm:'lightgbm',purpose:'Regime classification',status:'ready',description:'Gradient-tree style regime proxy emphasizing volatility, volume and trend interactions.',execution:'research-heuristic'},
 {id:'catboost-direction',name:'CatBoost Direction',algorithm:'catboost',purpose:'Robust directional blend',status:'ready',description:'Categorical/feature-interaction proxy for directional probability across market states.',execution:'research-heuristic'},
 {id:'hmm-regime',name:'Hidden Markov Regime',algorithm:'hmm',purpose:'Market-state transition',status:'ready',description:'State-transition proxy for trending, ranging and volatility regime changes.',execution:'research-heuristic'},
 {id:'timemixer-multiscale',name:'TimeMixer Multi-Scale',algorithm:'timemixer',purpose:'Multi-scale forecast',status:'ready',description:'Multi-resolution mixing proxy combining fast, medium and slow price structure.',execution:'research-heuristic'},
 {id:'conformal-range',name:'Conformal Prediction Range',algorithm:'conformal_ensemble',purpose:'Adaptive uncertainty range',status:'ready',description:'Adaptive residual-style interval proxy that widens during regime shifts and volatility expansion.',execution:'research-heuristic'},
 {id:'arima-direction',name:'ARIMA Direction',algorithm:'arima',purpose:'Autoregressive short-horizon forecast',status:'ready',description:'Lightweight browser implementation using differenced returns and autoregressive drift.',execution:'research-heuristic'},
 {id:'sarima-seasonal',name:'SARIMA Seasonal',algorithm:'sarima',purpose:'Seasonal index forecast',status:'ready',description:'Seasonality-aware browser implementation for recurring intraday structure.',execution:'research-heuristic'},
 {id:'ets-trend',name:'ETS Trend',algorithm:'ets',purpose:'Exponential trend smoothing',status:'ready',description:'Error-trend-seasonality style exponential smoothing proxy.',execution:'research-heuristic'},
 {id:'prophet-trend',name:'Prophet Trend',algorithm:'prophet',purpose:'Trend + seasonality',status:'ready',description:'Trend/seasonality decomposition proxy inspired by additive forecasting.',execution:'research-heuristic'},
 {id:'svr-direction',name:'Support Vector Regression',algorithm:'svr',purpose:'Non-linear return forecast',status:'ready',description:'RBF-kernel similarity proxy over normalized market features.',execution:'research-heuristic'},
 {id:'knn-pattern',name:'KNN Pattern Match',algorithm:'knn',purpose:'Historical pattern analogue',status:'ready',description:'Nearest-pattern analogue proxy over recent return sequences.',execution:'research-heuristic'},
 {id:'bilstm-sequence',name:'Bidirectional LSTM',algorithm:'bilstm',purpose:'Sequence direction',status:'ready',description:'Bidirectional sequence-memory proxy using forward and reverse momentum structure.',execution:'research-heuristic'},
 {id:'cnn-lstm-hybrid',name:'CNN-LSTM Hybrid',algorithm:'cnn_lstm',purpose:'Local pattern + sequence',status:'ready',description:'Local-window pattern extractor blended with sequential momentum.',execution:'research-heuristic'},
 {id:'lstm-gru-hybrid',name:'LSTM-GRU Hybrid',algorithm:'lstm_gru',purpose:'Gated sequence blend',status:'ready',description:'Combined long-memory and gated-recurrence style momentum proxy.',execution:'research-heuristic'},
 {id:'transformer-attention',name:'Transformer Attention',algorithm:'transformer',purpose:'Multi-context sequence forecast',status:'ready',description:'Attention-style weighted multi-window context proxy.',execution:'research-heuristic'},
 {id:'sentiment-hybrid',name:'News + Sentiment Hybrid',algorithm:'sentiment_hybrid',purpose:'Price + sentiment framework',status:'ready',description:'Hybrid model hook combining price/volume with an external sentiment feature when available; falls back to market-only features.',execution:'research-heuristic'},
 {id:'garch-volatility',name:'GARCH Volatility',algorithm:'garch',purpose:'Conditional volatility',status:'ready',description:'Conditional-variance proxy for volatility expansion and expected range.',execution:'research-heuristic'},
 {id:'quantile-forest-range',name:'Quantile Forest Range',algorithm:'quantile_forest',purpose:'Prediction interval',status:'ready',description:'Quantile-style range proxy for asymmetric upside/downside uncertainty.',execution:'trained-server'},
 {id:'production-xgboost-direction',name:'Production XGBoost Direction',algorithm:'xgboost',purpose:'Trained server-side directional probability',status:'planned',description:'Genuine trained XGBoost artifact served by the TradingCoreOS ML service.',execution:'trained-server'},
 {id:'production-lstm-sequence',name:'Production LSTM Sequence',algorithm:'lstm',purpose:'Trained server-side sequence probability',status:'planned',description:'Genuine PyTorch LSTM artifact served by the TradingCoreOS ML service.',execution:'trained-server'},
 {id:'production-transformer',name:'Production Transformer',algorithm:'transformer',purpose:'Trained server-side attention probability',status:'planned',description:'Genuine PyTorch Transformer artifact served by the TradingCoreOS ML service.',execution:'trained-server'},
];
export const DEFAULT_PREDICTION_MODEL_IDS=['production-xgboost-direction','production-lstm-sequence','production-transformer','xgb-breakout','trend-strength'];
export const getPredictionModel=(id:string)=>PREDICTION_MODELS.find(m=>m.id===id)||PREDICTION_MODELS[0];
const PREDICTION_STORAGE_KEY = 'tradingcore:prediction-models:v2';
const PREDICTION_LEGACY_STORAGE_KEY = 'tradingcore_prediction_models';
export function getSavedPredictionModelIds(){try{if(typeof window==='undefined')return DEFAULT_PREDICTION_MODEL_IDS;const raw=window.localStorage.getItem(PREDICTION_STORAGE_KEY) || window.localStorage.getItem(PREDICTION_LEGACY_STORAGE_KEY);const ids=raw?JSON.parse(raw):DEFAULT_PREDICTION_MODEL_IDS;if(!window.localStorage.getItem(PREDICTION_STORAGE_KEY) && raw) window.localStorage.setItem(PREDICTION_STORAGE_KEY, JSON.stringify(ids));return Array.isArray(ids)&&ids.length?ids.filter((id:string)=>PREDICTION_MODELS.some(m=>m.id===id)):DEFAULT_PREDICTION_MODEL_IDS;}catch{return DEFAULT_PREDICTION_MODEL_IDS;}}
export function savePredictionModelIds(ids:string[]){try{if(typeof window==='undefined')return;window.localStorage.setItem(PREDICTION_STORAGE_KEY,JSON.stringify(ids));window.dispatchEvent(new CustomEvent('tradingcore:prediction-models-changed',{detail:ids}));}catch{}}

export interface PredictionFeature { name:string; value:number; weight:number; contribution:number; direction:'bullish'|'bearish'|'neutral'; }
export interface PredictionResult {
  /** These local calculators are explicitly heuristic and are never trained artifacts. */
  trained: false;
  provenance: 'research-heuristic';
  algorithm:PredictionAlgorithm;
  modelName:string;
  modelType:PredictionModelType; symbol:string; timeframe:string; timestamp:string; direction:'BULLISH'|'BEARISH'|'NEUTRAL';
  bullishProbability:number; neutralProbability:number; bearishProbability:number; confidence:number;
  predictedPrice:number; lowerBound:number; upperBound:number; expectedMove:number; regime:'TRENDING'|'RANGING'|'HIGH_VOL'|'LOW_VOL';
  features:PredictionFeature[]; explanation:string[]; score:number;
}
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const stdev=(a:number[])=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
const ema=(a:number[],p:number)=>{if(!a.length)return 0;const k=2/(p+1);let e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e;};
const returns=(c:HistoricalCandle[])=>c.slice(1).map((x,i)=>c[i].close?x.close/c[i].close-1:0);
const sigmoid=(x:number)=>1/(1+Math.exp(-Math.max(-12,Math.min(12,x))));
const featureVector=(trend:number,longTrend:number,momentum:number,volumeRatio:number,vol:number,breakoutUp:number,breakoutDown:number)=>[trend,longTrend,momentum*100,volumeRatio-1,vol*100,breakoutUp-breakoutDown];
const logistic=(v:number[])=>sigmoid(v[0]*0.75+v[1]*0.42+v[2]*0.08+v[3]*0.22+v[4]*-0.05+v[5]*1.35);
const forest=(v:number[])=>{const votes=[v[0]>.2,v[1]>.15,v[2]>.1,v[3]>.15,v[5]>.02,v[0]+v[3]>.1,v[1]+v[5]>.12,v[2]+v[4]>.2];return votes.filter(Boolean).length/votes.length};
const boosted=(v:number[])=>sigmoid(0.9*(v[0]>.15?1:-1)+0.65*(v[1]>.1?1:-1)+0.45*(v[2]>.05?1:-1)+0.35*(v[3]>.1?1:-1)+1.1*(v[5]>.02?1:v[5]<-.02?-1:0));
export function predict(candles:HistoricalCandle[], symbol:string, timeframe:string, type:PredictionModelType='direction'):PredictionResult|null {
 if(candles.length<30)return null;
 const closes=candles.map(c=>c.close), last=closes.at(-1)!; const r=returns(candles); const vol=stdev(r.slice(-20));
 const e9=ema(closes.slice(-60),9), e21=ema(closes.slice(-80),21), e50=ema(closes.slice(-120),50);
 const momentum=(last/(closes[Math.max(0,closes.length-6)]||last)-1);
 const trend=(e9/e21-1)*1000, longTrend=(e21/e50-1)*1000;
 const avgVol=mean(candles.slice(-20).map(x=>x.volume||0)); const volumeRatio=avgVol?((candles.at(-1)?.volume||0)/avgVol):1;
 const range20=candles.slice(-21,-1); const high=Math.max(...range20.map(x=>x.high)), low=Math.min(...range20.map(x=>x.low));
 const breakoutUp=(last-high)/Math.max(last*0.0001,high-low), breakoutDown=(low-last)/Math.max(last*0.0001,high-low);
 const v=featureVector(trend,longTrend,momentum,volumeRatio,vol,breakoutUp,breakoutDown); const score=clamp((logistic(v)+forest(v)+boosted(v))/3,0.03,0.97);
 const confidence=clamp(0.5+Math.abs(score-.5)*1.3+Math.min(0.15,Math.abs(trend)*0.03)+Math.min(.08,Math.abs(volumeRatio-1)*.05),.5,.98);
 const bull=type==='breakout'?clamp(.5+breakoutUp*.5+Math.max(0,trend)*.05):score; const bear=type==='breakout'?clamp(.5+breakoutDown*.5+Math.max(0,-trend)*.05):1-score;
 const neutral=clamp(1-Math.max(bull,bear)*.92,.04,.45); const total=bull+bear+neutral; const bp=bull/total,np=neutral/total,rp=bear/total;
 const atr=mean(candles.slice(-14).map(x=>x.high-x.low)); const expectedMove=Math.max(atr,last*vol*Math.sqrt(type==='volatility'?5:3));
 const direction=bp>rp+.08?'BULLISH':rp>bp+.08?'BEARISH':'NEUTRAL';
 const regime=vol>0.012?'HIGH_VOL':vol<0.004?'LOW_VOL':Math.abs(trend)>.8?'TRENDING':'RANGING';
 const features:PredictionFeature[]=[
  {name:'EMA 9/21 alignment',value:trend,weight:.24,contribution:trend*.24,direction:trend>0.15?'bullish':trend<-0.15?'bearish':'neutral'},
  {name:'EMA 21/50 trend',value:longTrend,weight:.18,contribution:longTrend*.18,direction:longTrend>0.15?'bullish':longTrend<-0.15?'bearish':'neutral'},
  {name:'5-bar momentum',value:momentum*100,weight:.2,contribution:momentum*20,direction:momentum>.001?'bullish':momentum<-.001?'bearish':'neutral'},
  {name:'Volume ratio',value:volumeRatio,weight:.14,contribution:(volumeRatio-1)*.14,direction:volumeRatio>1.2?'bullish':'neutral'},
  {name:'Breakout pressure',value:Math.max(breakoutUp,breakoutDown),weight:.24,contribution:(breakoutUp-breakoutDown)*.24,direction:breakoutUp>breakoutDown&&breakoutUp>0?'bullish':breakoutDown>breakoutUp&&breakoutDown>0?'bearish':'neutral'},
 ];
 const explanation=features.filter(f=>f.direction!=='neutral').sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,3).map(f=>`${f.name}: ${f.direction} (${f.value.toFixed(2)})`);
 const algorithm:PredictionAlgorithm='logistic_regression'; const modelName='Local research heuristic';
 return {trained:false,provenance:'research-heuristic',algorithm,modelName,modelType:type,symbol,timeframe,timestamp:new Date().toISOString(),direction:direction,bullishProbability:bp,neutralProbability:np,bearishProbability:rp,confidence,predictedPrice:last*(1+(bp-rp)*expectedMove/last),lowerBound:last-expectedMove,upperBound:last+expectedMove,expectedMove,regime,features,explanation:explanation.length?explanation:['Mixed signals; model remains neutral.'],score};
}
export function predictWithModel(candles:HistoricalCandle[],symbol:string,timeframe:string,modelId:string):PredictionResult|null{
 // Server-backed model IDs must never fall through to the local heuristic engine.
 // Their only valid result comes from a compatible, versioned trained artifact.
 if (getPredictionModel(modelId).execution === 'trained-server') return null;
 const base=predict(candles,symbol,timeframe,'direction'); if(!base)return null;
 const closes=candles.map(c=>c.close), last=closes.at(-1)||0, recent=closes.slice(-10), prev=closes.slice(-20,-10);
 const ret5=last/(closes[Math.max(0,closes.length-6)]||last)-1;
 const ret10=last/(closes[Math.max(0,closes.length-11)]||last)-1;
 const ret20=last/(closes[Math.max(0,closes.length-21)]||last)-1;
 const range=Math.max(1,last*0.0001), high=Math.max(...closes.slice(-20)), low=Math.min(...closes.slice(-20));
 const stretch=(last-(high+low)/2)/Math.max(range,high-low);
 const fastMean=mean(closes.slice(-5)),midMean=mean(closes.slice(-15)),slowMean=mean(closes.slice(-40));
 const accel=ret5-(closes.length>11?closes.at(-6)!/(closes.at(-11)||last)-1:0);
 const volatility=stdev(returns(candles).slice(-20));
 let bull=base.bullishProbability,bear=base.bearishProbability,neutral=base.neutralProbability;
 let moveMultiplier=1;
 const adjust=(x:number)=>{bull=Math.max(.02,Math.min(.96,bull+x));bear=Math.max(.02,Math.min(.96,bear-x));};
 if(modelId==='mean-reversion') adjust(-stretch*.18);
 else if(modelId==='momentum-regime') adjust(ret5*35);
 else if(modelId==='trend-strength') adjust((base.features[0]?.value||0)*.025+(base.features[1]?.value||0)*.02);
 else if(modelId==='range-breakout') { adjust((base.features[4]?.contribution||0)*2); moveMultiplier=1.15; }
 else if(modelId==='price-action') adjust(((recent.at(-1)||last)-(prev.at(-1)||last))/Math.max(last*.001,range)*.015);
 else if(modelId==='options-flow') adjust((base.features[3]?.value-1)*.12);
 else if(modelId==='volatility-regime') { const highVol=base.regime==='HIGH_VOL'; neutral=highVol?Math.max(.08,neutral-.04):Math.min(.55,neutral+.03); moveMultiplier=highVol?1.35:.82; }
 else if(modelId==='ensemble-voting') {
   const suite=runPredictionSuite(candles,symbol,timeframe); if(suite.length){bull=suite.reduce((a,r)=>a+r.bullishProbability,0)/suite.length;bear=suite.reduce((a,r)=>a+r.bearishProbability,0)/suite.length;neutral=suite.reduce((a,r)=>a+r.neutralProbability,0)/suite.length;}
 }
 else if(modelId==='tft-multihorizon') adjust(ret5*22+ret10*13+ret20*8+(fastMean>midMean&&midMean>slowMean?.06:fastMean<midMean&&midMean<slowMean?-.06:0));
 else if(modelId==='nbeats-trend') adjust(((fastMean-slowMean)/Math.max(last*.001,high-low))*0.08 + ret20*10);
 else if(modelId==='patchtst-pattern') { const patchA=closes.slice(-5).reduce((a,v)=>a+v,0)/5, patchB=closes.slice(-10,-5).reduce((a,v)=>a+v,0)/5; adjust((patchA/Math.max(1,patchB)-1)*42); }
 else if(modelId==='lstm-sequence') adjust(Math.tanh((ret5*28+accel*60)*5)*.20);
 else if(modelId==='tcn-momentum') adjust((ret5*32)+(ret10*14)+(base.features[4]?.contribution||0)*2);
 else if(modelId==='lightgbm-regime') { const trendScore=(base.features[0]?.value||0)+(base.features[1]?.value||0); adjust(trendScore*.022+(base.features[3]?.value-1)*.08); moveMultiplier=base.regime==='HIGH_VOL'?1.2:.95; }
 else if(modelId==='catboost-direction') adjust((base.features[0]?.value||0)*.018+(base.features[2]?.value||0)*.015+(base.features[3]?.value-1)*.06);
 else if(modelId==='hmm-regime') { const transition=volatility>0.012?(ret5>0?.07:-.07):Math.abs(ret5)<.002?.01:ret5>0?.035:-.035; adjust(transition); }
 else if(modelId==='timemixer-multiscale') adjust(ret5*18+ret10*12+ret20*8+(base.features[0]?.value||0)*.015);
 else if(modelId==='conformal-range') { neutral=Math.min(.7,neutral+.05); moveMultiplier=1+Math.min(.55,volatility*35); }
 else if(modelId==='arima-direction') { const r=returns(candles).slice(-18); const drift=mean(r.slice(-6)); const ar=mean(r.slice(-4).map((v,i)=>v*(i+1)/10)); adjust(Math.tanh((drift+ar)*900)*.18); }
 else if(modelId==='sarima-seasonal') { const r=returns(candles); const lag=Math.min(20,Math.max(5,Math.floor(r.length/3))); const seasonal=r.length>lag?mean(r.slice(-5).map((_,i)=>r[r.length-lag-5+i]||0)):0; adjust(Math.tanh((ret5*16+seasonal*90)*8)*.16); }
 else if(modelId==='ets-trend') { const level=mean(closes.slice(-8)); const prevLevel=mean(closes.slice(-16,-8)); const slope=(level-prevLevel)/Math.max(last,1); adjust(Math.tanh(slope*120)*.14); }
 else if(modelId==='prophet-trend') { const x=closes.length; const slope=(mean(closes.slice(-10))-mean(closes.slice(-30,-20)))/Math.max(last,1); const cyc=Math.sin((x%20)/20*Math.PI*2); adjust(Math.tanh(slope*80+cyc*.35)*.15); }
 else if(modelId==='svr-direction') { const z=(ret5*18+ret10*10+accel*35)*8; adjust(Math.tanh(z)*.17); }
 else if(modelId==='knn-pattern') { const r=returns(candles); const tail=r.slice(-5); let analogue=0,weight=0; for(let i=5;i<r.length-5;i++){let d=0;for(let j=0;j<5;j++)d+=Math.abs((r[i-4+j]||0)-(tail[j]||0)); const w=Math.exp(-d*250); analogue+=(r[i+1]||0)*w;weight+=w;} adjust(Math.tanh((weight?analogue/weight:0)*900)*.2); }
 else if(modelId==='bilstm-sequence') { adjust((ret5*20+ret10*14-ret20*6)+(fastMean>slowMean?.045:fastMean<slowMean?-.045:0)); }
 else if(modelId==='cnn-lstm-hybrid') { const local=(mean(closes.slice(-3))-mean(closes.slice(-8)))/Math.max(last*.001,range); adjust(local*.028+accel*45); }
 else if(modelId==='lstm-gru-hybrid') { adjust(ret5*24+accel*52+(ret10-ret20)*12); moveMultiplier=1+Math.min(.2,Math.abs(accel)*20); }
 else if(modelId==='transformer-attention') { const weights=[.50,.27,.15,.08]; const contexts=[ret5,ret10,ret20,(fastMean-slowMean)/Math.max(last,1)]; adjust(Math.tanh(contexts.reduce((a,v,i)=>a+v*weights[i],0)*240)*.21); }
 else if(modelId==='sentiment-hybrid') { const sentimentProxy=Math.tanh((ret5*20)+(base.features[3]?.value-1)*.7); adjust(sentimentProxy*.09); }
 else if(modelId==='garch-volatility') { const rs=returns(candles).slice(-30); const v=rs.reduce((a,r)=>a+r*r,0)/Math.max(1,rs.length); const recentV=rs.slice(-5).reduce((a,r)=>a+r*r,0)/Math.max(1,Math.min(5,rs.length)); const ratio=recentV/Math.max(v,1e-8); neutral=Math.min(.7,neutral+.03*Math.min(4,Math.max(0,ratio-1))); moveMultiplier=1+Math.min(.8,Math.max(0,ratio-1)*.35); }
 else if(modelId==='quantile-forest-range') { neutral=Math.min(.72,neutral+.07); moveMultiplier=1.15+Math.min(.5,volatility*30); }
 const total=bull+bear+neutral;bull/=total;bear/=total;neutral/=total;
 const expectedMove=base.expectedMove*moveMultiplier;
 const direction=bull>bear+.08?'BULLISH':bear>bull+.08?'BEARISH':'NEUTRAL';
 const confidence=Math.max(.5,Math.min(.99,.5+Math.abs(bull-bear)*.95));
 return {...base,modelName:`Research heuristic · ${getPredictionModel(modelId).name}`,algorithm:base.algorithm,modelType:modelId==='gb-volatility'||modelId==='volatility-regime'?'volatility':modelId==='xgb-breakout'||modelId==='range-breakout'?'breakout':modelId==='trend-strength'||modelId==='momentum-regime'?'trend':'direction',bullishProbability:bull,neutralProbability:neutral,bearishProbability:bear,confidence,predictedPrice:last+(bull-bear)*expectedMove,lowerBound:last-expectedMove,upperBound:last+expectedMove,expectedMove,direction,score:bull-bear,explanation:[`${getPredictionModel(modelId).name}: ${direction.toLowerCase()} bias at ${(confidence*100).toFixed(1)}% confidence.`,...base.explanation]};
}
export function runPredictionSuite(candles:HistoricalCandle[],symbol:string,timeframe:string){return (['direction','trend','breakout','volatility'] as PredictionModelType[]).map(t=>predict(candles,symbol,timeframe,t)).filter(Boolean) as PredictionResult[];}
export function runAlgorithmEnsemble(candles:HistoricalCandle[],symbol:string,timeframe:string){
 const base=predict(candles,symbol,timeframe,'direction'); if(!base)return [];
 const v=base.features.map(f=>f.contribution); const logisticP=logistic([v[0]||0,v[1]||0,(v[2]||0)*10,v[3]||0,0,(v[4]||0)*10]); const forestP=forest([v[0]||0,v[1]||0,(v[2]||0)*10,v[3]||0,0,(v[4]||0)*10]); const xgbP=boosted([v[0]||0,v[1]||0,(v[2]||0)*10,v[3]||0,0,(v[4]||0)*10]);
 return [{name:'Boosted heuristic score',algorithm:'gradient_boosting' as const,probability:xgbP},{name:'Rule-ensemble heuristic',algorithm:'random_forest' as const,probability:forestP},{name:'Logistic heuristic score',algorithm:'logistic_regression' as const,probability:logisticP}];
}
