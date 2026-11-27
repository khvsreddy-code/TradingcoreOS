import assert from 'node:assert/strict';
import {
  CORESCRIPT_PROGRAM_MODE_POLICIES,
  canExecuteCoreScriptProgramMode,
  getCoreScriptProgramModePolicy,
  isCoreScriptProgramMode,
  validateCoreScriptProgramMode,
} from './coreScriptProgramModes.ts';

assert.deepEqual(Object.keys(CORESCRIPT_PROGRAM_MODE_POLICIES).sort(), ['automation','indicator','prediction','strategy']);
assert.equal(isCoreScriptProgramMode('indicator'), true);
assert.equal(isCoreScriptProgramMode('script'), false);
assert.ok(getCoreScriptProgramModePolicy('indicator').permissions.includes('model.infer'));
assert.ok(!getCoreScriptProgramModePolicy('indicator').permissions.includes('model.train'));
assert.ok(!getCoreScriptProgramModePolicy('indicator').permissions.some(x=>x.startsWith('order-intent')));
assert.ok(getCoreScriptProgramModePolicy('strategy').permissions.includes('order-intent.simulated'));
assert.ok(!getCoreScriptProgramModePolicy('strategy').permissions.includes('order-intent.risk-gated'));
assert.ok(getCoreScriptProgramModePolicy('prediction').permissions.includes('model.train'));
assert.ok(!getCoreScriptProgramModePolicy('prediction').permissions.some(x=>x.startsWith('order-intent')));
assert.ok(getCoreScriptProgramModePolicy('automation').permissions.includes('order-intent.risk-gated'));

assert.equal(canExecuteCoreScriptProgramMode({mode:'indicator',target:'chart'}), true);
assert.equal(canExecuteCoreScriptProgramMode({mode:'strategy',target:'simulator'}), true);
assert.equal(canExecuteCoreScriptProgramMode({mode:'strategy',target:'live-broker',liveExecutionApproved:true}), false,
  'strategy must never become live-broker capable, even if a live session is approved');
assert.equal(canExecuteCoreScriptProgramMode({mode:'prediction',target:'research',requestedPermissions:['order-intent.risk-gated']}), false);
assert.equal(canExecuteCoreScriptProgramMode({mode:'indicator',target:'chart',requestedPermissions:['model.train']}), false);
assert.equal(canExecuteCoreScriptProgramMode({mode:'automation',target:'automation-host',requestedPermissions:['order-intent.risk-gated']}), false,
  'automation order intents fail closed without a positive host risk-gate decision');
assert.equal(canExecuteCoreScriptProgramMode({mode:'automation',target:'automation-host',requestedPermissions:['order-intent.risk-gated'],riskGateGranted:true}), true);

const strategyLive = validateCoreScriptProgramMode({mode:'strategy',target:'live-broker'});
assert.equal(strategyLive[0]?.code,'CORESCRIPT_STRATEGY_LIVE_DENIED');
const predictionOrder = validateCoreScriptProgramMode({mode:'prediction',target:'research',requestedPermissions:['order-intent.risk-gated']});
assert.equal(predictionOrder[0]?.code,'CORESCRIPT_PREDICTION_ORDER_DENIED');

console.log('CORESCRIPT_PROGRAM_MODE_SECURITY_CONTRACT_OK');
