import type { CoreSpiritIrInstruction } from './ir';

export type CoreSpiritIrGroup =
  | 'numeric' | 'temporal' | 'stateful' | 'collection' | 'control'
  | 'data-request' | 'visual' | 'events' | 'models' | 'dispatch';

export type CoreSpiritIrOperationSpecification = Readonly<{
  group: CoreSpiritIrGroup;
  requiredOperands: readonly string[];
  output: 'none' | 'register' | 'state' | 'control-flow' | 'observable';
  outputType: 'none' | 'constant' | 'series' | 'state-element' | 'call-contract' | 'indexed-element' | 'runtime-defined';
  outputQualifier: 'none' | 'const' | 'series' | 'propagated' | 'runtime-defined';
  dependencies: 'none' | 'series' | 'state' | 'runtime-call' | 'control-flow' | 'output';
  stateful: boolean;
  historical: 'none' | 'bar' | 'lookback' | 'runtime-defined';
  realtime: 'same-as-historical' | 'revision-aware' | 'stateful-revision' | 'runtime-defined';
  effects: 'pure' | 'state-write' | 'observable' | 'dynamic';
  optimizer: 'constant-fold' | 'pure-cse' | 'versioned' | 'never';
  errors: 'compile' | 'runtime' | 'host-policy' | 'branch-contract';
}>;

const spec = (
  group: CoreSpiritIrGroup,
  requiredOperands: readonly string[],
  output: CoreSpiritIrOperationSpecification['output'],
  outputType: CoreSpiritIrOperationSpecification['outputType'],
  outputQualifier: CoreSpiritIrOperationSpecification['outputQualifier'],
  dependencies: CoreSpiritIrOperationSpecification['dependencies'],
  stateful: boolean,
  historical: CoreSpiritIrOperationSpecification['historical'],
  realtime: CoreSpiritIrOperationSpecification['realtime'],
  effects: CoreSpiritIrOperationSpecification['effects'],
  optimizer: CoreSpiritIrOperationSpecification['optimizer'],
  errors: CoreSpiritIrOperationSpecification['errors'],
): CoreSpiritIrOperationSpecification => Object.freeze({
  group,requiredOperands,output,outputType,outputQualifier,dependencies,
  stateful,historical,realtime,effects,optimizer,errors,
});

/**
 * Canonical IR opcode semantics. The VM, optimizer and validators consume the
 * same ABI declaration; this describes observable meaning without imposing a
 * particular backend implementation.
 */
export const CORE_SPIRIT_IR_OPERATION_SPECIFICATION:
  Readonly<Record<CoreSpiritIrInstruction['op'], CoreSpiritIrOperationSpecification>> = Object.freeze({
    const: spec('numeric',['dest','value'],'register','constant','const','none',false,'none','same-as-historical','pure','constant-fold','compile'),
    loadSeries: spec('temporal',['dest','name','offset'],'register','series','series','series',false,'lookback','revision-aware','pure','versioned','runtime'),
    loadState: spec('stateful',['dest','name'],'register','state-element','propagated','state',true,'runtime-defined','stateful-revision','dynamic','versioned','runtime'),
    move: spec('control',['dest','source'],'register','runtime-defined','propagated','none',false,'none','same-as-historical','pure','pure-cse','runtime'),
    unary: spec('numeric',['dest','operator','operand'],'register','runtime-defined','propagated','none',false,'none','same-as-historical','pure','constant-fold','runtime'),
    binary: spec('numeric',['dest','operator','left','right'],'register','runtime-defined','propagated','none',false,'none','same-as-historical','pure','constant-fold','runtime'),
    call: spec('dispatch',['dest','name','args'],'register','call-contract','runtime-defined','runtime-call',true,'runtime-defined','runtime-defined','dynamic','versioned','runtime'),
    index: spec('collection',['dest','target','index'],'register','indexed-element','propagated','series',false,'lookback','revision-aware','pure','versioned','runtime'),
    setLocal: spec('stateful',['name','source'],'none','none','none','state',true,'bar','stateful-revision','state-write','never','runtime'),
    setState: spec('stateful',['name','source'],'state','state-element','propagated','state',true,'bar','stateful-revision','state-write','never','runtime'),
    eventGate: spec('events',['eventName','target'],'control-flow','none','none','control-flow',false,'bar','revision-aware','dynamic','never','branch-contract'),
    jumpIfFalse: spec('control',['condition','target'],'control-flow','none','none','control-flow',false,'none','same-as-historical','pure','never','branch-contract'),
    jump: spec('control',['target'],'control-flow','none','none','control-flow',false,'none','same-as-historical','pure','never','branch-contract'),
    emit: spec('visual',['kind','args'],'observable','none','none','output',true,'bar','stateful-revision','observable','never','host-policy'),
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
function validIndex(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

/** Structural operand validation only; operator meaning remains a semantic contract. */
export function validateCoreSpiritIrInstructionShape(value: unknown): value is CoreSpiritIrInstruction {
  if (!isRecord(value) || typeof value.op !== 'string') return false;
  const specification=CORE_SPIRIT_IR_OPERATION_SPECIFICATION[value.op as CoreSpiritIrInstruction['op']];
  if (!specification) return false;
  for (const operand of specification.requiredOperands) {
    if (!Object.prototype.hasOwnProperty.call(value,operand)) return false;
  }
  if ('dest' in value && !nonEmptyString(value.dest)) return false;
  if ('name' in value && !nonEmptyString(value.name)) return false;
  if ('source' in value && !nonEmptyString(value.source)) return false;
  if ('operand' in value && !nonEmptyString(value.operand)) return false;
  if ('left' in value && !nonEmptyString(value.left)) return false;
  if ('right' in value && !nonEmptyString(value.right)) return false;
  if ('condition' in value && !nonEmptyString(value.condition)) return false;
  if ('eventName' in value && !nonEmptyString(value.eventName)) return false;
  if ('args' in value && !stringArray(value.args)) return false;
  if ('seriesArgs' in value && !stringArray(value.seriesArgs)) return false;
  if ('callId' in value && typeof value.callId !== 'string') return false;
  if ('componentId' in value && typeof value.componentId !== 'string') return false;
  if ('componentPure' in value && typeof value.componentPure !== 'boolean') return false;
  if ('componentStateful' in value && typeof value.componentStateful !== 'boolean') return false;
  if ('componentDeterministic' in value && typeof value.componentDeterministic !== 'boolean') return false;
  if ('series' in value && typeof value.series !== 'boolean') return false;
  if ('initialize' in value && typeof value.initialize !== 'boolean') return false;
  if ('sourceKind' in value && value.sourceKind !== 'register' && value.sourceKind !== 'local') return false;
  if ('offset' in value && !validIndex(value.offset)) return false;
  if ('value' in value && !(['string','number','boolean'].includes(typeof value.value) || value.value === null)) return false;
  if ('operator' in value && !nonEmptyString(value.operator)) return false;
  if ('target' in value && (value.op === 'jump' || value.op === 'jumpIfFalse' || value.op === 'eventGate') && !validIndex(value.target)) return false;
  if (value.op === 'index' && !nonEmptyString(value.target)) return false;
  if (value.op === 'unary' && !['!','+','-'].includes(String(value.operator))) return false;
  if (value.op === 'call' && (!nonEmptyString(value.name) || !Array.isArray(value.args))) return false;
  if (value.op === 'emit' && (!nonEmptyString(value.kind) || !stringArray(value.args))) return false;
  if ('outputId' in value && typeof value.outputId !== 'string') return false;
  if ('seriesSources' in value) {
    if (!Array.isArray(value.seriesSources)) return false;
    if (!value.seriesSources.every(item => {
      if (!isRecord(item)) return false;
      return typeof item.ref === 'string' &&
        ['open','high','low','close','volume','time'].includes(String(item.field));
    })) return false;
  }
  return true;
}

export function classifyCoreSpiritIrInstruction(instruction: CoreSpiritIrInstruction): CoreSpiritIrGroup {
  if (instruction.op === 'emit') {
    if (['entry','exit','buy','sell','orderIntent','order_intent','alert','alertcondition','webhook','event','signal','scanCandidate'].includes(instruction.kind)) return 'events';
    if (instruction.kind === 'show') return 'dispatch';
    return 'visual';
  }
  if (instruction.op !== 'call') return CORE_SPIRIT_IR_OPERATION_SPECIFICATION[instruction.op].group;
  const name=instruction.name.toLowerCase();
  if (/^(market|timeframe|series|request\.|__market_)/.test(name)) return 'data-request';
  if (/^(model|__model_|hmm)/.test(name)) return 'models';
  if (/^(array|map|vector|matrix|tensor|__array|__map|__collection)/.test(name)) return 'collection';
  if (/^(ema|rma|sma|wma|hma|rsi|atr|highest|lowest|stdev|variance|rolling|change|vwap)/.test(name)) return 'stateful';
  if (/^(plot|line|label|box|zone|band|shape|marker|polyline|polygon|hline|table|barcolor|background)/.test(name)) return 'visual';
  return 'numeric';
}
