/**
 * Bounded quantitative research primitives.
 * All splits are chronological; validation/test observations are never passed
 * to the trainer. Deployment eligibility is explicit and requires OOS evidence.
 */
import {sha256HexSync} from './artifactIdentity';
export type CoreSpiritResearchDataset = Readonly<{
  datasetId:string; timestampsMs:Float64Array; features:Readonly<Record<string,Float64Array>>;
  target:Float64Array; symbol:string; timeframe:string;
}>;
export type CoreSpiritWalkForwardConfig = Readonly<{
  trainBars:number; validationBars:number; testBars:number; stepBars:number;
  purgeBars?:number; embargoBars?:number; maxFolds?:number;
}>;
export type CoreSpiritWalkForwardFold = Readonly<{
  index:number; trainStart:number; trainEnd:number; validationStart:number; validationEnd:number;
  testStart:number; testEnd:number; inferenceStartTimestampMs:number; inferenceEndTimestampMs:number;
}>;
export type CoreSpiritRegressionModel = Readonly<{
  kind:'ridge-regression'; featureNames:readonly string[]; means:readonly number[];
  scales:readonly number[]; coefficients:readonly number[]; intercept:number; ridge:number;
  trainedThroughTimestampMs:number; checksum:string;
}>;
export type CoreSpiritResearchMetrics = Readonly<{
  observations:number; mse:number; rmse:number; mae:number; directionalAccuracy:number;
  meanActual:number; meanPrediction:number; rSquared:number|null;
}>;
export type CoreSpiritResearchFoldResult = Readonly<{
  fold:CoreSpiritWalkForwardFold; model:CoreSpiritRegressionModel;
  validation:CoreSpiritResearchMetrics; test:CoreSpiritResearchMetrics;
}>;
const MAX_ROWS=2_000_000, MAX_FEATURES=64, MAX_TRAINING_ROWS=100_000, MAX_TRAINING_FEATURES=32, MAX_FOLDS=256;
function assertDataset(d:CoreSpiritResearchDataset,checkBudget?:()=>void):void {
  const n=d.timestampsMs.length, names=Object.keys(d.features);
  if(!d.datasetId||!d.symbol||!d.timeframe||n<3||n>MAX_ROWS) throw new Error('Research dataset identity or row count is invalid.');
  if(!names.length||names.length>MAX_FEATURES||d.target.length!==n) throw new Error('Research feature/target dimensions are invalid.');
  for(const name of names) if(!name||d.features[name]!.length!==n) throw new Error('Research feature column length mismatch: '+name);
  for(let i=0;i<n;i++){
    if((i&4095)===0)checkBudget?.();
    const t=d.timestampsMs[i]!;
    if(!Number.isFinite(t)||(i>0&&t<=d.timestampsMs[i-1]!)) throw new Error('Research timestamps must be finite and strictly increasing.');
    if(!Number.isFinite(d.target[i]!)) throw new Error('Research target contains a non-finite value at row '+i);
    for(const name of names) if(!Number.isFinite(d.features[name]![i]!)) throw new Error('Research feature '+name+' contains a non-finite value at row '+i);
  }
}
export function planCoreSpiritWalkForward(dataset:CoreSpiritResearchDataset,c:CoreSpiritWalkForwardConfig,checkBudget?:()=>void):CoreSpiritWalkForwardFold[]{
  assertDataset(dataset,checkBudget);
  const positive=['trainBars','validationBars','testBars','stepBars'] as const;
  for(const k of positive) if(!Number.isSafeInteger(c[k])||c[k]<=0) throw new Error(k+' must be a positive integer.');
  const purge=c.purgeBars??0, embargo=c.embargoBars??0, max=c.maxFolds??MAX_FOLDS;
  if(!Number.isSafeInteger(purge)||purge<0||!Number.isSafeInteger(embargo)||embargo<0||!Number.isSafeInteger(max)||max<1||max>MAX_FOLDS) throw new Error('Walk-forward purge, embargo or fold limit is invalid.');
  const folds:CoreSpiritWalkForwardFold[]=[];
  let trainStart=0;
  while(folds.length<max){
    const trainEnd=trainStart+c.trainBars;
    const validationStart=trainEnd+purge+embargo;
    const validationEnd=validationStart+c.validationBars;
    const testStart=validationEnd+purge+embargo;
    const testEnd=testStart+c.testBars;
    if(testEnd>dataset.timestampsMs.length) break;
    folds.push(Object.freeze({index:folds.length,trainStart,trainEnd,validationStart,validationEnd,testStart,testEnd,
      inferenceStartTimestampMs:dataset.timestampsMs[testStart]!,inferenceEndTimestampMs:dataset.timestampsMs[testEnd-1]!}));
    trainStart+=c.stepBars;
  }
  if(!folds.length) throw new Error('Dataset is too short for one leakage-safe walk-forward fold.');
  return folds;
}
function solve(a:number[][],b:number[]):number[]{
  const n=b.length, m=a.map((row,i)=>[...row,b[i]!]);
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let row=col+1;row<n;row++) if(Math.abs(m[row]![col]!)>Math.abs(m[pivot]![col]!)) pivot=row;
    if(Math.abs(m[pivot]![col]!)<1e-12) throw new Error('Ridge system is singular; increase regularization.');
    [m[col],m[pivot]]=[m[pivot]!,m[col]!];
    const divisor=m[col]![col]!;
    for(let j=col;j<=n;j++) m[col]![j]=m[col]![j]!/divisor;
    for(let row=0;row<n;row++) if(row!==col){
      const factor=m[row]![col]!;
      for(let j=col;j<=n;j++) m[row]![j]=m[row]![j]!-factor*m[col]![j]!;
    }
  }
  return m.map(row=>row[n]!);
}
function hashNumbers(values:readonly number[]):string{return sha256HexSync(values.map(value=>String(value)).join('|'));}
function trainCoreSpiritRidgeValidated(dataset:CoreSpiritResearchDataset,start:number,end:number,ridge=1e-3,checkBudget?:()=>void):CoreSpiritRegressionModel{
  const names=Object.keys(dataset.features);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>dataset.target.length||end-start<names.length+2) throw new Error('Training window is too small or invalid.');
  if(end-start>MAX_TRAINING_ROWS||names.length>MAX_TRAINING_FEATURES) throw new Error('Synchronous ridge training is capped at 100,000 rows and 32 features; dispatch larger jobs to the research worker service.');
  if(!Number.isFinite(ridge)||ridge<=0||ridge>1e6) throw new Error('Ridge regularization must be in (0, 1e6].');
  const means=names.map(name=>{let s=0;for(let i=start;i<end;i++){if(((i-start)&4095)===0)checkBudget?.();s+=dataset.features[name]![i]!;}return s/(end-start);});
  const scales=names.map((name,j)=>{let s=0;for(let i=start;i<end;i++){if(((i-start)&4095)===0)checkBudget?.();const d=dataset.features[name]![i]!-means[j]!;s+=d*d;}return Math.sqrt(s/(end-start))||1;});
  const p=names.length+1, xtx=Array.from({length:p},()=>new Array<number>(p).fill(0)),xty=new Array<number>(p).fill(0);
  for(let i=start;i<end;i++){
    if(((i-start)&1023)===0)checkBudget?.();
    const row=[1,...names.map((name,j)=>(dataset.features[name]![i]!-means[j]!)/scales[j]!)], y=dataset.target[i]!;
    for(let a=0;a<p;a++){xty[a]+=row[a]!*y;for(let b=0;b<p;b++)xtx[a]![b]+=row[a]!*row[b]!;}
  }
  for(let j=1;j<p;j++)xtx[j]![j]+=ridge;
  const beta=solve(xtx,xty), coefficients=beta.slice(1), intercept=beta[0]!-coefficients.reduce((sum,c,j)=>sum+c*means[j]!/scales[j]!,0);
  const identity=[...means,...scales,...coefficients,intercept,ridge,dataset.timestampsMs[end-1]!];
  return Object.freeze({kind:'ridge-regression',featureNames:Object.freeze(names),means:Object.freeze(means),scales:Object.freeze(scales),
    coefficients:Object.freeze(coefficients),intercept,ridge,trainedThroughTimestampMs:dataset.timestampsMs[end-1]!,checksum:hashNumbers(identity)});
}
/** Validates the dataset once, then trains the bounded synchronous reference model. */
export function trainCoreSpiritRidge(dataset:CoreSpiritResearchDataset,start:number,end:number,ridge=1e-3,checkBudget?:()=>void):CoreSpiritRegressionModel{
  assertDataset(dataset,checkBudget);
  return trainCoreSpiritRidgeValidated(dataset,start,end,ridge,checkBudget);
}
export function predictCoreSpiritRidge(model:CoreSpiritRegressionModel,dataset:CoreSpiritResearchDataset,index:number):number{
  if(index<0||index>=dataset.target.length||dataset.timestampsMs[index]!<=model.trainedThroughTimestampMs) throw new Error('Prediction must be strictly after the model training boundary.');
  let value=model.intercept;
  for(let j=0;j<model.featureNames.length;j++){const name=model.featureNames[j]!;value+=model.coefficients[j]!*(dataset.features[name]![index]!-model.means[j]!)/model.scales[j]!;}
  if(!Number.isFinite(value)) throw new Error('Model produced a non-finite prediction.');
  return value;
}
export function evaluateCoreSpiritResearch(dataset:CoreSpiritResearchDataset,start:number,end:number,predict:(index:number)=>number,checkBudget?:()=>void):CoreSpiritResearchMetrics{
  if(start<0||end>dataset.target.length||end<=start) throw new Error('Evaluation range is invalid.');
  let squared=0,absolute=0,actual=0,forecast=0,directional=0,previousActual:number|null=null,previousForecast:number|null=null;
  for(let i=start;i<end;i++){
    if(((i-start)&1023)===0)checkBudget?.();
    const y=dataset.target[i]!,p=predict(i),e=y-p;squared+=e*e;absolute+=Math.abs(e);actual+=y;forecast+=p;
    if(previousActual!==null&&previousForecast!==null&&Math.sign(y-previousActual)===Math.sign(p-previousForecast))directional++;
    previousActual=y;previousForecast=p;
  }
  const n=end-start,meanActual=actual/n,meanPrediction=forecast/n;
  let variance=0;for(let i=start;i<end;i++){if(((i-start)&4095)===0)checkBudget?.();variance+=(dataset.target[i]!-meanActual)**2;}
  const mse=squared/n;
  return Object.freeze({observations:n,mse,rmse:Math.sqrt(mse),mae:absolute/n,directionalAccuracy:n>1?directional/(n-1):0,
    meanActual,meanPrediction,rSquared:variance>0?1-squared/variance:null});
}
export function runCoreSpiritWalkForwardResearch(dataset:CoreSpiritResearchDataset,config:CoreSpiritWalkForwardConfig,ridge=1e-3,checkBudget?:()=>void):CoreSpiritResearchFoldResult[]{
  const folds=planCoreSpiritWalkForward(dataset,config,checkBudget);
  return folds.map(fold=>{
    checkBudget?.();
    const model=trainCoreSpiritRidgeValidated(dataset,fold.trainStart,fold.trainEnd,ridge,checkBudget);
    const predict=(index:number)=>predictCoreSpiritRidge(model,dataset,index);
    return Object.freeze({fold,model,
      validation:evaluateCoreSpiritResearch(dataset,fold.validationStart,fold.validationEnd,predict,checkBudget),
      test:evaluateCoreSpiritResearch(dataset,fold.testStart,fold.testEnd,predict,checkBudget)});
  });
}
export function coreSpiritResearchDeploymentGate(results:readonly CoreSpiritResearchFoldResult[],minimumFolds=3):Readonly<{eligible:boolean;reason:string;meanTestRmse:number|null}>{
  if(results.length<minimumFolds) return Object.freeze({eligible:false,reason:'Insufficient independent walk-forward folds.',meanTestRmse:null});
  const values=results.map(r=>r.test.rmse);
  if(values.some(v=>!Number.isFinite(v))) return Object.freeze({eligible:false,reason:'Out-of-sample metrics are invalid.',meanTestRmse:null});
  return Object.freeze({eligible:true,reason:'Walk-forward out-of-sample evidence exists; production risk approval is still required.',meanTestRmse:values.reduce((a,b)=>a+b,0)/values.length});
}

export type CoreSpiritResearchPromotionPolicy=Readonly<{
  minimumFolds:number;maximumMeanTestRmse:number;minimumMeanDirectionalAccuracy:number;maximumMeanTestMae:number;
}>;
export type CoreSpiritResearchDeploymentArtifact=Readonly<{
  artifactHash:string;datasetId:string;symbol:string;timeframe:string;model:CoreSpiritRegressionModel;
  trainingEndTimestampMs:number;inferenceBoundaryTimestampMs:number;walkForwardFoldCount:number;
  meanTestRmse:number;meanTestMae:number;meanTestDirectionalAccuracy:number;
  releaseStatus:'research-approved';productionEligible:false;
}>;
export interface CoreSpiritResearchArtifactStore{publish(artifact:CoreSpiritResearchDeploymentArtifact):Promise<void>;}
async function hashText(value:string):Promise<string>{
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
/** Promote only after OOS gates; production eligibility remains a separate risk approval. */
export async function promoteCoreSpiritResearchModel(
  dataset:CoreSpiritResearchDataset,results:readonly CoreSpiritResearchFoldResult[],
  policy:CoreSpiritResearchPromotionPolicy,store:CoreSpiritResearchArtifactStore,
  inferenceBoundaryTimestampMs:number,ridge=1e-3,checkBudget?:()=>void,
):Promise<CoreSpiritResearchDeploymentArtifact>{
  assertDataset(dataset,checkBudget);
  if(!Number.isSafeInteger(policy.minimumFolds)||policy.minimumFolds<3||
     !Number.isFinite(policy.maximumMeanTestRmse)||policy.maximumMeanTestRmse<0||
     !Number.isFinite(policy.minimumMeanDirectionalAccuracy)||policy.minimumMeanDirectionalAccuracy<0||policy.minimumMeanDirectionalAccuracy>1||
     !Number.isFinite(policy.maximumMeanTestMae)||policy.maximumMeanTestMae<0)throw new Error('Research promotion policy is invalid.');
  for(const [index,result] of results.entries()){
    const fold=result.fold;
    if(fold.index!==index||fold.trainStart<0||fold.trainEnd<=fold.trainStart||fold.trainEnd>fold.validationStart||
       fold.validationEnd<=fold.validationStart||fold.validationEnd>fold.testStart||fold.testEnd<=fold.testStart||fold.testEnd>dataset.timestampsMs.length||
       result.model.trainedThroughTimestampMs!==dataset.timestampsMs[fold.trainEnd-1]||
       fold.inferenceStartTimestampMs!==dataset.timestampsMs[fold.testStart]||
       result.validation.observations!==fold.validationEnd-fold.validationStart||
       result.test.observations!==fold.testEnd-fold.testStart)throw new Error('Walk-forward evidence does not match the chronological dataset boundaries.');
  }
  const gate=coreSpiritResearchDeploymentGate(results,policy.minimumFolds);
  if(!gate.eligible||gate.meanTestRmse==null)throw new Error(gate.reason);
  const meanMae=results.reduce((sum,result)=>sum+result.test.mae,0)/results.length;
  const meanDirectional=results.reduce((sum,result)=>sum+result.test.directionalAccuracy,0)/results.length;
  if(gate.meanTestRmse>policy.maximumMeanTestRmse)throw new Error('Research promotion rejected: mean out-of-sample RMSE exceeds policy.');
  if(meanMae>policy.maximumMeanTestMae)throw new Error('Research promotion rejected: mean out-of-sample MAE exceeds policy.');
  if(meanDirectional<policy.minimumMeanDirectionalAccuracy)throw new Error('Research promotion rejected: directional accuracy is below policy.');
  const trainingEndTimestampMs=dataset.timestampsMs[dataset.timestampsMs.length-1]!;
  if(!Number.isFinite(inferenceBoundaryTimestampMs)||inferenceBoundaryTimestampMs<=trainingEndTimestampMs)throw new Error('Deployment inference boundary must be strictly after the final training observation.');
  checkBudget?.();
  const model=trainCoreSpiritRidgeValidated(dataset,0,dataset.timestampsMs.length,ridge,checkBudget);
  const artifactHash=await hashText([dataset.datasetId,dataset.symbol,dataset.timeframe,JSON.stringify(model),
    trainingEndTimestampMs,inferenceBoundaryTimestampMs,gate.meanTestRmse,meanMae,meanDirectional].join('|'));
  const artifact=Object.freeze({artifactHash,datasetId:dataset.datasetId,symbol:dataset.symbol,timeframe:dataset.timeframe,model,
    trainingEndTimestampMs,inferenceBoundaryTimestampMs,walkForwardFoldCount:results.length,
    meanTestRmse:gate.meanTestRmse,meanTestMae:meanMae,meanTestDirectionalAccuracy:meanDirectional,
    releaseStatus:'research-approved' as const,productionEligible:false as const});
  await store.publish(artifact);
  return artifact;
}
