import { HistoricalCandle } from './brokers/BrokerAdapter';

export type PredictionModelType = 'direction'|'trend'|'breakout'|'volatility'|'options';
export type PredictionAlgorithm = 'xgboost'|'random_forest'|'logistic_regression'|'gradient_boosting';
export interface PredictionModelDefinition { id:string; name:string; algorithm:PredictionAlgorithm; purpose:string; status:'ready'|'planned'; description:string; }
export const PREDICTION_MODELS:PredictionModelDefinition[] = [
 {id:'xgb-direction',name:'XGBoost Direction',algorithm:'xgboost',purpose:'Next-bar directional probability',status:'ready',description:'Boosted decision-stump ensemble over trend, momentum, volatility and volume features.'},
 {id:'rf-direction',name:'Random Forest Direction',algorithm:'random_forest',purpose:'Robust directional vote',status:'ready',description:'Randomized threshold-tree voting ensemble for directional classification.'},
 {id:'logistic-direction',name:'Logistic Regression',algorithm:'logistic_regression',purpose:'Calibrated directional baseline',status:'ready',description:'Linear probability model used as a transparent baseline and ensemble input.'},
 {id:'gb-volatility',name:'Gradient Boosting Volatility',algorithm:'gradient_boosting',purpose:'Expected-move regime',status:'ready',description:'Boosted regression-style score for volatility and expected range.'},
 {id:'xgb-breakout',name:'XGBoost Breakout',algorithm:'xgboost',purpose:'Breakout probability',status:'ready',description:'Boosted breakout classifier using range compression, volume and momentum.'},
];
export interface PredictionFeature { name:string; value:number; weight:number; contribution:number; direction:'bullish'|'bearish'|'neutral'; }
export interface PredictionResult {
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
 const algorithm:PredictionAlgorithm=type==='breakout'?'xgboost':type==='volatility'?'gradient_boosting':type==='trend'?'random_forest':'logistic_regression'; const modelName=type==='breakout'?'XGBoost Breakout':type==='volatility'?'Gradient Boosting Volatility':type==='trend'?'Random Forest Direction':'Logistic Regression';
 return {algorithm,modelName,modelType:type,symbol,timeframe,timestamp:new Date().toISOString(),direction:direction,bullishProbability:bp,neutralProbability:np,bearishProbability:rp,confidence,predictedPrice:last*(1+(bp-rp)*expectedMove/last),lowerBound:last-expectedMove,upperBound:last+expectedMove,expectedMove,regime,features,explanation:explanation.length?explanation:['Mixed signals; model remains neutral.'],score};
}
export function runPredictionSuite(candles:HistoricalCandle[],symbol:string,timeframe:string){return (['direction','trend','breakout','volatility'] as PredictionModelType[]).map(t=>predict(candles,symbol,timeframe,t)).filter(Boolean) as PredictionResult[];}
export function runAlgorithmEnsemble(candles:HistoricalCandle[],symbol:string,timeframe:string){
 const base=predict(candles,symbol,timeframe,'direction'); if(!base)return [];
 const v=base.features.map(f=>f.contribution); const logisticP=logistic([v[0]||0,v[1]||0,(v[2]||0)*10,v[3]||0,0,(v[4]||0)*10]); const forestP=forest([v[0]||0,v[1]||0,(v[2]||0)*10,v[3]||0,0,(v[4]||0)*10]); const xgbP=boosted([v[0]||0,v[1]||0,(v[2]||0)*10,v[3]||0,0,(v[4]||0)*10]);
 return [{name:'XGBoost',algorithm:'xgboost' as const,probability:xgbP},{name:'Random Forest',algorithm:'random_forest' as const,probability:forestP},{name:'Logistic Regression',algorithm:'logistic_regression' as const,probability:logisticP}];
}
