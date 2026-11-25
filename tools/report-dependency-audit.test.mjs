import assert from 'node:assert/strict';
import { summarizeDependencyAudit } from './report-dependency-audit.mjs';

const report = {
  auditReportVersion: 2,
  metadata: { vulnerabilities: { info: 0, low: 1, moderate: 1, high: 1, critical: 0, total: 3 } },
  vulnerabilities: {
    'prod-direct': {
      severity: 'high', isDirect: true, range: '<2.0.0',
      nodes: ['node_modules/prod-direct'], effects: [],
      via: [{ source: 1001, title: 'Direct production issue', severity: 'high', range: '<2.0.0', url: 'https://example.test/advisory/1001' }],
      fixAvailable: { name: 'prod-direct', version: '2.0.0', isSemVerMajor: false },
    },
    'dev-direct': {
      severity: 'low', isDirect: true, range: '<1.2.0',
      nodes: ['node_modules/dev-direct'], effects: [],
      via: [{ source: 1002, title: 'Direct development issue', severity: 'low' }],
      fixAvailable: false,
    },
    'nested-package': {
      severity: 'moderate', isDirect: false, range: '<3.0.0',
      nodes: ['node_modules/prod-parent/node_modules/nested-package'], effects: ['prod-parent'],
      via: ['prod-parent'],
      fixAvailable: true,
    },
  },
};
const lockfile = {
  lockfileVersion: 3,
  packages: {
    '': { dependencies: { 'prod-direct': '^1.0.0', 'prod-parent': '^1.0.0' }, devDependencies: { 'dev-direct': '^1.0.0' } },
    'node_modules/prod-direct': { version: '1.5.0' },
    'node_modules/dev-direct': { version: '1.1.0', dev: true },
    'node_modules/prod-parent': { version: '1.5.0' },
    'node_modules/prod-parent/node_modules/nested-package': { version: '2.0.0' },
  },
};
const summary = summarizeDependencyAudit(report, lockfile);
assert.equal(summary.totals.total, 3);
assert.equal(summary.findings.find(item => item.name === 'prod-direct').scope, 'production');
assert.equal(summary.findings.find(item => item.name === 'prod-direct').directness, 'direct');
assert.equal(summary.findings.find(item => item.name === 'dev-direct').scope, 'development');
assert.equal(summary.findings.find(item => item.name === 'nested-package').scope, 'production');
assert.equal(summary.findings.find(item => item.name === 'nested-package').directness, 'transitive');
assert.equal(summary.releaseGate.passed, false);
assert.equal(summary.releaseGate.blockers.length, 1);
assert.throws(
  () => summarizeDependencyAudit({ error: { code: 'ENETWORK' } }, lockfile),
  /incomplete or is an error response/,
);
console.log('DEPENDENCY_AUDIT_CLASSIFICATION_CONTRACT_OK');
