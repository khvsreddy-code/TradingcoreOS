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
  /onBrokerConnected=\{\(\) => \{[\s\S]*?tco:broker-readiness[\s\S]*?status: 'connected'[\s\S]*?navigate\('\/dashboard'\);[\s\S]*?\}\}/,
);
assert.doesNotMatch(
  brokerRoute,
  /onBrokerConnected=\{\(\) => \{(?:(?!navigate\('\/dashboard'\);)[\s\S])*?\}\}/,
);

const liveRoute = source.slice(workspaceRouteStart);
assert.match(
  liveRoute,
  /workspacePath === '\/live'\s*\?\s*<LiveTradingShell\s*\/>/,
  'the /live workspace route must remain owned by the live trading shell',
);
assert.match(
  liveRoute,
  /<TradingWorkspaceShell\s+route=\{workspacePath\}/,
  'dashboard and research routes must remain in the workspace shell',
);

console.log('BROKER_LAUNCH_WORKSPACE_CONTRACT_OK');
