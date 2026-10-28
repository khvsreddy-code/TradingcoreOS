import assert from 'node:assert/strict';
import { structureCoreSpiritRuntimeDiagnostics } from './runtimeDiagnostics.ts';

const diagnostics = structureCoreSpiritRuntimeDiagnostics([
  'bar 12: division by zero',
  'output zone at bar 3: invalid geometry',
  'unsupported optional feature',
]);

assert.deepEqual(diagnostics.map(item => ({
  severity: item.severity,
  code: item.code,
  barIndex: item.barIndex ?? null,
  outputKind: item.outputKind ?? null,
  message: item.message,
})), [
  {
    severity: 'error',
    code: 'RUNTIME_BAR_EXECUTION',
    barIndex: 12,
    outputKind: null,
    message: 'division by zero',
  },
  {
    severity: 'error',
    code: 'RUNTIME_OUTPUT_VALIDATION',
    barIndex: 3,
    outputKind: 'zone',
    message: 'invalid geometry',
  },
  {
    severity: 'error',
    code: 'RUNTIME_DIAGNOSTIC_UNCLASSIFIED',
    barIndex: null,
    outputKind: null,
    message: 'unsupported optional feature',
  },
], 'known runtime failure envelopes must produce stable diagnostics; unknown messages fail closed');

assert.ok(diagnostics.every(Object.isFrozen), 'diagnostic objects are immutable at the worker boundary');
console.log('CORESPIRIT_RUNTIME_DIAGNOSTICS_CONTRACT_OK');
