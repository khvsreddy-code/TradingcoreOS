import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

const brokerRouteStart = source.indexOf("if (isAuthenticated && user && currentView === 'broker-connection')");
const workspaceRouteStart = source.indexOf("if (currentView === 'app')");
assert.ok(brokerRouteStart >= 0, 'broker route must exist');
assert.ok(workspaceRouteStart > brokerRouteStart, 'workspace route must follow broker route');

const brokerRoute = source.slice(brokerRouteStart, workspaceRouteStart);
assert.match(brokerRoute, /<BrokerConnectionRequiredPage\s+/);
assert.match(
  brokerRoute,
  /onBrokerConnected=\{\(\) => \{[\s\S]*?setHasConnectedBroker\(true\);[\s\S]*?navigate\('\/dashboard'\);[\s\S]*?\}\}/,
);
assert.doesNotMatch(
  brokerRoute,
  /onBrokerConnected=\{\(\) => \{[\s\S]*?setHasConnectedBroker\(true\);\s*\}\}/,
);

const liveRoute = source.slice(workspaceRouteStart);
assert.match(
  liveRoute,
  /setHasConnectedBroker\(true\);[\s\S]*?navigate\('\/live'\);/,
  'live broker gate should still return to /live after connection',
);

console.log('BROKER_LAUNCH_WORKSPACE_CONTRACT_OK');
