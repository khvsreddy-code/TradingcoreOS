import { buildCoreSpiritGraphBundle } from './semanticGraph.ts';
import { buildCoreSpiritExecutionPlanVisualization } from './executionPlanVisualizer.ts';

const assert=(value, message)=>{ if(!value) throw new Error(message); };

const instructions=[
  { op:'loadSeries', dest:'t0', name:'close', offset:0 },
  { op:'const', dest:'t1', value:20 },
  { op:'call', dest:'t2', name:'ema', args:['t0','t1'], seriesArgs:['close'] },
  { op:'const', dest:'t3', value:14 },
  { op:'call', dest:'t4', name:'rsi', args:['t0','t3'], seriesArgs:['close'] },
  { op:'emit', kind:'signal', args:['t4','t4'], outputId:'signal:test' },
];

const program={
  version:1,
  sourceId:'execution-plan-contract',
  entry:{instructions},
  locals:[],
  maxLookback:19,
  diagnostics:[],
  sourceMap:{version:1,sourceId:'execution-plan-contract',entries:[]},
};

program.graphs=buildCoreSpiritGraphBundle(program);
program.executionPlan={
  version:1,
  strategy:'cpu-fused',
  assignments:[{backend:'cpu',nodeIds:['i:2','i:4']}],
  barriers:['i:5'],
  chronologicalPasses:1,
  seriesFusion:{
    groups:[{
      nodeIds:['i:2','i:4'],
      instructions:[2,4],
      operations:[{name:'ema',length:20},{name:'rsi',length:14}],
      intermediateSeriesAllocations:0,
      eligibleBackends:['cpu'],
      strategy:'single-pass',
    }],
    fusedInstructionCount:2,
  },
};

const view=buildCoreSpiritExecutionPlanVisualization(program);
assert(view.ascii.includes('close'),'plan must expose the close input');
assert(view.ascii.includes('EMA(20)'),`plan must label EMA period; nodes=${JSON.stringify(view.nodes.map(node=>({id:node.id,instruction:node.instruction,label:node.label,op:node.op,fused:node.fusedKernelId})))}, ascii=${JSON.stringify(view.ascii)}`);
assert(view.ascii.includes('RSI(14)'),'plan must label RSI period');
assert(view.ascii.includes('signal'),'plan must expose signal output');
assert(view.summary.fusedOperationCount===2,'plan must expose fused operation count');
assert(view.summary.traversalCount===1,'plan must expose one chronological traversal');
assert(view.summary.intermediateArrays===0,'plan must expose zero intermediate arrays');
assert(view.summary.computeOperationCount===2,'plan must count the two fused compute operations');
assert(view.kernels.some(kernel=>kernel.label==='CPU fused kernel #1' && kernel.operationCount===2),'plan must expose the fused CPU kernel');
assert(view.executionText.some(line=>line==='CPU fused kernel #1'),'plan text must expose the selected kernel');
assert(!view.ascii.includes('undefined'),'plan ascii must remain renderable');

console.log('CORE_SPIRIT_EXECUTION_PLAN_VISUALIZER_CONTRACT_OK');
