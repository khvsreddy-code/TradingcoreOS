import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

const required = [
  'src/server/middleware/requestContext.ts',
  'src/server/middleware/rateLimit.ts',
  'src/server/observability/requestMetrics.ts',
  'src/server/storage/AuditLogRepository.ts',
  'src/services/coreSpirit/artifactIdentity.ts',
  'src/services/coreSpirit/runManifest.ts',
  'src/services/coreSpirit/executionEnvironment.ts',
  'src/services/coreSpirit/sessionCalendar.ts',
  'src/services/coreSpirit/sourceInspector.ts',
  'supabase/migrations/20260927150000_tradingcoreos_v85_base_schema_and_hardening.sql',
];
for (const file of required) if (!exists(file)) throw new Error(`Missing v85 hardening file: ${file}`);

const server = read('server.ts');
for (const requiredText of [
  "app.use(requestContext)",
  "createRateLimiter({ windowMs: 60_000, max: 180",
  "Content-Security-Policy",
  "'/api/health/live'",
  "'/api/health/ready'",
  "'/api/health/diagnostics'",
]) if (!server.includes(requiredText)) throw new Error(`Missing server hardening contract: ${requiredText}`);

const orderRepo = read('src/server/storage/OrderIdempotencyRepository.ts');
for (const requiredText of ['recovery_required', 'markUnknown', 'canonicalSha256', 'expiresAt']) if (!orderRepo.includes(requiredText)) throw new Error(`Missing order recovery contract: ${requiredText}`);

const gateway = read('fyers-execution-gateway/server.mjs');
for (const requiredText of ['x-tradingcore-signature', 'createHmac', 'x-tradingcore-nonce', 'MAX_SKEW_MS', 'AbortController']) if (!gateway.includes(requiredText)) throw new Error(`Missing gateway security contract: ${requiredText}`);

const migration = read('supabase/migrations/20260927150000_tradingcoreos_v85_base_schema_and_hardening.sql');
for (const requiredText of ['oauth_states', 'execution_audit_log', 'prediction_model_artifacts', 'corespirit_execution_runs', 'order_idempotency_state_check', 'lifecycle_status']) if (!migration.includes(requiredText)) throw new Error(`Missing schema hardening contract: ${requiredText}`);

const cli = read('tools/corespirit-cli.mjs');
for (const command of ['check', 'normalize', 'inspect', 'graph']) if (!cli.includes(`'${command}'`)) throw new Error(`Missing CoreSpirit CLI command: ${command}`);

console.log('STAGE_V85_HARDENING_CONTRACT_OK');

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const indexHtml = readFileSync('index.html', 'utf8');
for (const retiredEntrypoint of ['/src/quickOrderHotfix.ts', '/src/workspaceHotfix.ts', '/src/workspaceChromeHotfix.ts']) {
  if (indexHtml.includes(retiredEntrypoint)) throw new Error(`legacy DOM entrypoint remains: ${retiredEntrypoint}`);
}
execFileSync(process.execPath, ['--check', 'tools/corespirit-cli.mjs'], { stdio: 'inherit' });
console.log('V85_LEGACY_BRIDGE_CLEANUP_OK');
