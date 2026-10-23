import assert from 'node:assert/strict';
import { optimizeCoreSpiritIr } from './optimizer.ts';
import { CoreSpiritExecutionVM } from './executionVM.ts';
import { CoreSpiritOutputCollector } from './outputCollector.ts';

const normalize=(value)=>JSON.stringify(value,(_key,item)=>
  typeof item==='number'&&Number.isNaN(item)?'__NaN__':item===Infinity?'__Infinity__':item===-Infinity?'__-Infinity__':item);
function execute(instructions, seed) {
  const output=new CoreSpiritOutputCollector(128);
  const state={locals:{},states:{},effects:[]};
  const host={
    maxStepsPerBar:128,throwIfAborted(){},loadSeries(name,offset){const sample=[null,1,2,Number.NaN,Number.POSITIVE_INFINITY,-3];return name==='close'?sample[(seed+offset+sample.length)%sample.length]:null;},
    moveLocal(name){return state.locals[name];},loadState(name){return state.states[name]??null;},
    setLocal(name,value){state.locals[name]=value;state.effects.push(['local',name,value]);},
    setState(name,value){state.states[name]=value;state.effects.push(['state',name,value]);},
    unary(op,value){if(op==='!')return !value;if(op==='-')return -Number(value);return Number(value);},
    binary(op,left,right){if(op==='+')return Number(left)+Number(right);if(op==='-')return Number(left)-Number(right);if(op==='*')return Number(left)*Number(right);if(op==='==')return left===right;return null;},
    tryFused(){return false;},call(ins,args){state.effects.push(['call',ins.name,...args]);return ins.name==='pureDouble'?Number(args[0])*2:args[0];},
    loadIndexed(ins,index){if(index<0||!Number.isInteger(index))throw new Error('invalid historical index '+index);if(index>3)throw new Error('historical data unavailable');return [null,Number.NaN,Number.POSITIVE_INFINITY,7][index];},
    truthy(value){return !!value;},eventActive(name){return name==='bar';},
    emit(ins,values,out){const payload={kind:ins.kind,time:seed,value:values.get(ins.args[0]),seriesId:ins.outputId??ins.kind};state.effects.push(['emit',ins.kind,payload.value]);if(ins.kind==='plot'||ins.kind==='series')out.push(payload);},
  };
  try { new CoreSpiritExecutionVM().run(instructions,seed,host,output);return {output:output.values().map(x=>({...x})),state:{...state},error:null}; }
  catch(error) { return {output:output.values().map(x=>({...x})),state:{...state},error:String(error?.message??error)}; }
}
let random=0xc0e5f1;
function rand(max){random=(Math.imul(random,1664525)+1013904223)>>>0;return random%max;}

for(let sample=0;sample<128;sample++){
  const instructions=[];const count=3+rand(5);
  for(let i=0;i<count;i++){
    const dest='r'+(i%4);
    const action=rand(5);
    if(action===0)instructions.push({op:'loadSeries',dest,name:'close',offset:0});
    else instructions.push({op:'const',dest,value:[0,1,2,-2][rand(4)]});
    if(rand(3)===0)instructions.push({op:'binary',dest,operator:['+','-','*','=='][rand(4)],left:dest,right:'r'+rand(4)});
    if(rand(4)===0)instructions.push({op:'unary',dest,operator:['-','+','!'][rand(3)],operand:dest});
    if(rand(3)===0)instructions.push({op:'setState',name:'state'+(i%2),source:dest});
    if(rand(2)===0)instructions.push({op:'setLocal',name:'local'+(i%2),source:dest,series:false});
    if(rand(4)===0)instructions.push({op:'call',dest:'c'+i,name:'pureDouble',args:[dest],componentPure:true,componentStateful:false,componentDeterministic:true});
  }
  instructions.push({op:'emit',kind:'plot',args:['r'+rand(4)],outputId:'seed:'+sample});
  const program={version:1,sourceId:'optimizer-differential:'+sample,entry:{instructions},locals:[],maxLookback:4,diagnostics:[],sourceMap:{version:1,sourceId:'optimizer-differential:'+sample,entries:[]}};
  const optimized=optimizeCoreSpiritIr(program);
  for(let seed=0;seed<6;seed++){
    assert.equal(normalize(execute(optimized.entry.instructions,seed)),normalize(execute(instructions,seed)),`optimizer differential mismatch sample=${sample}, seed=${seed}`);
  }
}
// A non-loop control-flow graph exercises remapped branch destinations with side effects and two output families.
const branchInstructions=[
 {op:'const',dest:'condition',value:true},
 {op:'jumpIfFalse',condition:'condition',target:5},
 {op:'const',dest:'selected',value:41},
 {op:'emit',kind:'plot',args:['selected'],outputId:'branch:true'},
 {op:'jump',target:7},
 {op:'const',dest:'selected',value:99},
 {op:'emit',kind:'plot',args:['selected'],outputId:'branch:false'},
 {op:'const',dest:'orderValue',value:7},
 {op:'emit',kind:'order',args:['orderValue'],outputId:'order:1'},
 {op:'const',dest:'alertValue',value:3},
 {op:'emit',kind:'alert',args:['alertValue'],outputId:'alert:1'},
];
const branchProgram={version:1,sourceId:'branch-differential',entry:{instructions:branchInstructions},locals:[],maxLookback:0,diagnostics:[],sourceMap:{version:1,sourceId:'branch-differential',entries:[]}};
const branchOptimized=optimizeCoreSpiritIr(branchProgram);
for(const seed of [0,1,2]){
 assert.equal(normalize(execute(branchOptimized.entry.instructions,seed)),normalize(execute(branchInstructions,seed)),'control-flow/effect order must survive optimization');
}
console.log('CORESPIRIT_OPTIMIZER_GENERATED_DIFFERENTIAL_OK');
