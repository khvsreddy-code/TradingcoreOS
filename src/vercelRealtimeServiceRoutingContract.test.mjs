import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const services = config.services ?? {};
const rewrites = config.rewrites ?? [];
const realtimePaths = ['/api/realtime/healthz', '/api/realtime/ws'];

for (const rewrite of rewrites) {
  const serviceName = rewrite.destination?.service;
  if (serviceName) assert.ok(services[serviceName], `rewrite ${rewrite.source} points to missing Vercel service ${serviceName}`);
}
const destinations = realtimePaths.map(path => {
  const route = rewrites.find(item => item.source === path);
  assert.ok(route, `missing realtime route ${path}`);
  assert.equal(typeof route.destination?.service, 'string', `realtime route ${path} must target a named Vercel service`);
  return route.destination.service;
});
assert.equal(new Set(destinations).size, 1, 'health and websocket routes must target the same gateway service');
const gateway = services[destinations[0]];
assert.equal(gateway.root, '.');
assert.equal(gateway.entrypoint, 'Dockerfile');
assert.equal(gateway.runtime, 'container');
console.log('VERCEL_REALTIME_SERVICE_ROUTING_CONTRACT_OK');
