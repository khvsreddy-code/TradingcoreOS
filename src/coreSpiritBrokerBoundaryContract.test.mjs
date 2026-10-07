import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CORE_SPIRIT_ARCHITECTURE_NODES,
  CORE_SPIRIT_EXECUTION_GRAPH,
  CORE_SPIRIT_FORBIDDEN_DEPENDENCIES,
  CORE_SPIRIT_BROKER_BOUNDARY,
  validateCoreSpiritArchitectureEdges,
  validateCoreSpiritBrokerBoundarySource,
} from './services/coreSpirit/architectureContract.ts';

const root = process.cwd();

assert.equal(CORE_SPIRIT_BROKER_BOUNDARY.owner, 'tradingcoreos-host');
assert.equal(CORE_SPIRIT_BROKER_BOUNDARY.allowedExecutionOutput, 'orderIntent');
assert.equal(CORE_SPIRIT_BROKER_BOUNDARY.executionAuthority, 'host-owned');
assert.equal(CORE_SPIRIT_BROKER_BOUNDARY.brokerAccess, 'adapter-only');

assert.ok(CORE_SPIRIT_ARCHITECTURE_NODES.some(node => node.id === 'execution-authority' && node.owner === 'tradingcoreos-host'));
assert.deepEqual([...CORE_SPIRIT_EXECUTION_GRAPH].slice(-5), ['risk', 'order-intent', 'execution-authority', 'execution', 'broker']);
assert.ok(CORE_SPIRIT_FORBIDDEN_DEPENDENCIES.includes(['vm', 'broker']));
assert.ok(CORE_SPIRIT_FORBIDDEN_DEPENDENCIES.includes(['execution-authority', 'broker']));
assert.deepEqual(validateCoreSpiritArchitectureEdges([['vm', 'broker'], ['execution-authority', 'broker']]), [
  'forbidden direct dependency: vm -> broker',
  'forbidden direct dependency: execution-authority -> broker',
]);

const fixtures = [
  ["import { BrokerAdapter } from '../brokers/BrokerAdapter';", 'dependency import'],
  ["await adapter.placeOrder(order);", 'broker method'],
  ["fetch('/api/trading/fyers/order')", 'trading endpoint'],
  ["// adapter.placeOrder(order)", 'comment-only fixture should pass'],
  ["const label = 'BrokerAdapter';", 'string-only fixture should pass'],
];
assert.ok(validateCoreSpiritBrokerBoundarySource(fixtures[0][0], 'fixture').some(error => /dependency import/.test(error)));
assert.ok(validateCoreSpiritBrokerBoundarySource(fixtures[1][0], 'fixture').some(error => /placeOrder/.test(error)));
assert.ok(validateCoreSpiritBrokerBoundarySource(fixtures[2][0], 'fixture').some(error => /trading endpoint/.test(error)));
assert.deepEqual(validateCoreSpiritBrokerBoundarySource(fixtures[3][0], 'fixture'), []);
assert.deepEqual(validateCoreSpiritBrokerBoundarySource(fixtures[4][0], 'fixture'), []);

function collectFiles(relativeDir) {
  const directory = path.join(root, relativeDir);
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const child = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) output.push(...collectFiles(child));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) output.push(child);
  }
  return output;
}

const files = [...collectFiles('src/services/coreSpirit'), 'src/CoreSpiritVelaEngine.ts'];
const violations = [];
for (const file of files) {
  // The boundary policy contains the forbidden vocabulary by design; it is the
  // scanner's trusted specification, not an executable CoreSpirit dependency.
  if (file === 'src/services/coreSpirit/brokerBoundary.ts') continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  violations.push(...validateCoreSpiritBrokerBoundarySource(source, file));
}

assert.deepEqual(violations, [], violations.join('\n'));

const architecture = fs.readFileSync(path.join(root, 'src/architecture/architectureContract.ts'), 'utf8');
assert.match(architecture, /coreSpirit.*mayDependOn/);
assert.doesNotMatch(architecture, /{ id: 'coreSpirit',[^\n]*mayDependOn:\s*\[[^\]]*'trading'/);

console.log('CORESPIRIT_BROKER_BOUNDARY_CONTRACT_OK');
