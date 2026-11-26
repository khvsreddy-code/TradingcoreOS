import assert from 'node:assert/strict';
import { CORE_SPIRIT_IR_OPERATION_SPECIFICATION, classifyCoreSpiritIrInstruction, validateCoreSpiritIrInstructionShape } from './irSpecification.ts';
import { CORE_SPIRIT_IR_OPCODES, validateCoreSpiritIr } from './irContract.ts';

assert.deepEqual(Object.keys(CORE_SPIRIT_IR_OPERATION_SPECIFICATION).sort(),[...CORE_SPIRIT_IR_OPCODES].sort());
for(const opcode of CORE_SPIRIT_IR_OPCODES) {
  const spec=CORE_SPIRIT_IR_OPERATION_SPECIFICATION[opcode];
  assert.ok(spec.requiredOperands.length,opcode+' must specify required operands');
  assert.ok(spec.effects && spec.optimizer && spec.errors && spec.historical && spec.realtime,
    opcode+' must specify effects, optimizer eligibility and execution behavior');
}
assert.equal(validateCoreSpiritIrInstructionShape({op:'loadSeries',dest:'r0',name:'close',offset:0}),true);
assert.equal(validateCoreSpiritIrInstructionShape({op:'loadSeries',dest:'r0',name:'close',offset:-1}),false);
assert.equal(validateCoreSpiritIrInstructionShape({op:'binary',dest:'r1',operator:'+',left:'r0',right:'r0'}),true);
assert.equal(validateCoreSpiritIrInstructionShape({op:'binary',dest:'r1',operator:'??',left:'r0',right:'r0'}),true,
  'operand validation must not redefine operator semantics');
assert.equal(validateCoreSpiritIrInstructionShape({op:'emit',kind:'plot',args:['r0']}),true);
assert.equal(validateCoreSpiritIrInstructionShape({op:'emit',kind:'plot',args:'r0'}),false);
assert.equal(validateCoreSpiritIrInstructionShape({op:'jump',target:-1}),false);
assert.equal(classifyCoreSpiritIrInstruction({op:'call',dest:'r0',name:'market',args:[]}), 'data-request');
assert.equal(classifyCoreSpiritIrInstruction({op:'call',dest:'r0',name:'hmmFit',args:[]}), 'models');
assert.equal(classifyCoreSpiritIrInstruction({op:'emit',kind:'plot',args:['r0']}), 'visual');
assert.equal(classifyCoreSpiritIrInstruction({op:'emit',kind:'orderIntent',args:['r0']}), 'events');

const program={
  version:1,sourceId:'ir-spec-test',
  entry:{instructions:[{op:'const',dest:'r0',value:1},{op:'jumpIfFalse',condition:'r0',target:2},{op:'jump',target:2}]},
  locals:[],maxLookback:0,diagnostics:[],sourceMap:{version:1,sourceId:'ir-spec-test',entries:[]},
};
assert.equal(validateCoreSpiritIr(program),true);
assert.equal(validateCoreSpiritIr({...program,entry:{instructions:[{op:'jump',target:8}]}}),false);
console.log('CORESPIRIT_IR_SPECIFICATION_CONTRACT_OK');
