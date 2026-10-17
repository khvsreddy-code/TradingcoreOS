import assert from 'node:assert/strict';
import { buildCoreScriptCapabilityReport } from './services/coreSpirit/capabilityMaturity.js';

const stages = [
  'parsed', 'semantically-valid', 'executable', 'incremental',
  'research-validated', 'production-ready',
];

const complete = buildCoreScriptCapabilityReport({
  featureId: 'sma',
  languageVersion: 1,
  evidence: stages.map((stage) => ({
    stage,
    state: 'passed',
    evidence: 'test-suite:' + stage,
  })),
});
assert.equal(complete.highestVerifiedStage, 'production-ready');
assert.equal(complete.releaseEligible, true);
assert.equal(complete.stages.length, 6);

const compileOnly = buildCoreScriptCapabilityReport({
  featureId: 'hmm-training',
  languageVersion: 1,
  evidence: [
    { stage: 'parsed', state: 'passed', evidence: 'parser-fixture' },
    { stage: 'semantically-valid', state: 'passed', evidence: 'semantic-fixture' },
    { stage: 'executable', state: 'unknown', reason: 'No verified training backend' },
    { stage: 'production-ready', state: 'passed', evidence: 'must-not-leapfrog' },
  ],
});
assert.equal(compileOnly.highestVerifiedStage, 'semantically-valid');
assert.equal(compileOnly.releaseEligible, false);
assert.equal(compileOnly.stages[2]?.state, 'unknown');
assert.equal(compileOnly.stages[5]?.state, 'passed');

assert.throws(() => buildCoreScriptCapabilityReport({
  featureId: 'bad', languageVersion: 1,
  evidence: [{ stage: 'parsed', state: 'passed' }],
}), /evidence reference/);
assert.throws(() => buildCoreScriptCapabilityReport({
  featureId: 'bad', languageVersion: 1,
  evidence: [
    { stage: 'parsed', state: 'unknown' },
    { stage: 'parsed', state: 'unknown' },
  ],
}), /Duplicate evidence/);

console.log('CoreScript capability maturity contract: PASS');
