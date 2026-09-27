import { compileCoreSpirit } from './coreSpiritPipeline';

const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};

const source=[
  'model "Regime":',
  '  use "regime-v3"',
  '  output:',
  '    confidence: number',
  '',
  'let folded = 1 + 2',
  'let confidence = model("Regime").confidence',
  'when close > 1:',
  '  emit "LONG"',
].join('\n');

const result=compileCoreSpirit(source,'stage78-source-map');
assert(result.ir!==undefined,'compiler did not produce IR');
assert(result.diagnostics.every(d=>d.severity!=='error'),result.diagnostics.map(d=>d.message).join('; '));

const instructions=result.ir!.entry.instructions;
assert(instructions.length>0,'no instructions generated');
assert(instructions.every(instruction=>Boolean(instruction.origin)),'every compiler instruction must carry origin metadata');

const sourceMap=result.ir!.sourceMap.entries;
assert(sourceMap.length===instructions.length,'source map must contain one entry per origin-bearing instruction');
assert(sourceMap.every((entry,index)=>entry.instruction===index),'source map instruction indexes drifted');
assert(sourceMap.every((entry,index)=>entry.sourceNodeId===instructions[index].origin?.sourceNodeId),'source map lost instruction origin identity');

const folded=instructions.find(instruction=>instruction.op==='const'&&instruction.dest.startsWith('t'));
assert(Boolean(folded?.origin?.sourceNodeId.includes('binary:')),'optimized folded instruction did not retain binary source origin');

const jumpIndex=instructions.findIndex(instruction=>instruction.op==='jumpIfFalse');
assert(jumpIndex>=0,'control-flow jump missing');
assert(instructions[jumpIndex].origin?.sourceNodeId.startsWith('if:'),'jump did not retain IF source origin');

const emitIndex=instructions.findIndex(instruction=>instruction.op==='emit');
assert(emitIndex>=0,'emit instruction missing');
assert(instructions[emitIndex].origin?.sourceNodeId.includes('expressionStatement:'),'emit did not retain its source statement origin');

const modelCalls=instructions.filter(instruction=>instruction.op==='call'&&instruction.name==='__model_get');
assert(modelCalls.length>0,'model member call missing');
assert(modelCalls.every(instruction=>instruction.origin?.sourceNodeId.startsWith('member:')),'model member instructions lost member origin');

console.log('STAGE78_SOURCE_MAP_ORIGINS_OK');
