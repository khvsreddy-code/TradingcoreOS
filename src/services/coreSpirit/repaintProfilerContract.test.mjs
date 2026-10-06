import assert from 'node:assert/strict';

const { analyzeCoreSpiritRepaintSafety } = await import('./repaintSafety.ts');
const { CoreSpiritProfiler } = await import('./profiler.ts');

const identifier = (name) => ({ type:'identifier', name });
const number = (value) => ({ type:'number', value });
const call = (name, args=[]) => ({ type:'call', name, args });
const annotation = (name, args=[]) => ({ name, args });

const causalAst = {
  type:'program',
  body:[
    {
      type:'let',
      name:'fast',
      declaredType:'series<float>',
      annotations:[
        annotation('causal'),
        annotation('realtimeSafe'),
        annotation('lookahead',['false']),
      ],
      expression:call('ema',[identifier('close'), number(20)]),
    },
    {
      type:'if',
      condition:{type:'member',target:identifier('bar'),member:'confirmed'},
      thenBranch:[
        {type:'expressionStatement',expression:call('plot',[identifier('fast')])},
      ],
    },
  ],
};

const safety = analyzeCoreSpiritRepaintSafety(causalAst);
assert.equal(safety.causality, 'causal');
assert.equal(safety.lookahead, 'false');
assert.equal(safety.realtimeSafe, true);
assert.equal(safety.backtestLiveEquivalent, true);
assert.equal(safety.errors.length, 0);

const unsafeAst = {
  type:'program',
  body:[
    {
      type:'let',
      name:'suspicious',
      annotations:[annotation('causal')],
      expression:call('future_lookup',[identifier('close')]),
    },
  ],
};
const unsafeSafety = analyzeCoreSpiritRepaintSafety(unsafeAst);
assert(unsafeSafety.errors.some(message => message.includes('@causal assertion failed')), 'future-dependent inputs must invalidate @causal');

const profiler = new CoreSpiritProfiler({ enabled:true, mode:'full', retainSamples:128 });
profiler.beginBar('realtime', 3);
const instruction = { op:'call', dest:'t0', name:'ema', args:[], callId:'ema:test' };
profiler.beforeInstruction(0, instruction);
profiler.afterInstruction(0, instruction);
profiler.recordAllocation(0);
profiler.endBar();
const profile = profiler.snapshot();
assert.equal(profile.enabled, true);
assert(profile.instructions >= 1);
assert(profile.realtimeMs >= 0);
assert(profile.topNodes.some(node => node.label === 'ema'));
assert(profile.flameGraph.length >= 1);

console.log('TCO_CORESPIRIT_BRANCH14_15_REPAINT_PROFILER_CONTRACT_OK');
