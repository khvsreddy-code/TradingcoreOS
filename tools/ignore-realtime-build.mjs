import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * Decide whether the Vercel "realtime" container service needs a new image.
 *
 * Vercel's Container Registry has a per-plan image limit. The realtime service
 * is part of the same Vercel project as the web app, but most web/UI/CoreSpirit
 * commits do not change the long-lived FYERS socket process. Rebuilding that
 * container on every frontend commit burns an image slot for no runtime benefit.
 *
 * Vercel ignoreCommand semantics:
 *   exit 0 => skip this service's build and reuse the previously successful service
 *   exit 1 => continue this service's build
 *
 * This is deliberately fail-open for builds: when Git SHAs/diff are unavailable,
 * build the realtime service rather than risk shipping stale broker-stream code.
 */

const EXACT_RUNTIME_FILES = new Set([
  '.npmrc',
  'Dockerfile',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'tsconfig.json',
  'tsconfig.build.json',
]);

const RUNTIME_PREFIXES = [
  'realtime-gateway/',
  'src/server/',
  'src/types/',
  'src/services/brokers/',
  'src/services/boundary/',
  'src/utils/',
];

const NON_RUNTIME_SERVER_PREFIXES = [
  // HTTP route changes do not enter the independent realtime gateway process.
  'src/server/routes/',
  // The symbol-master HTTP/search endpoints are not imported by the gateway.
  'src/server/fyers/symbols/',
];

export function isRealtimeRuntimePath(filename) {
  const normalized = String(filename || '').replaceAll('\\\\', '/').replace(/^\.\//, '');
  if (!normalized) return false;
  if (NON_RUNTIME_SERVER_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  return EXACT_RUNTIME_FILES.has(normalized) || RUNTIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function shouldBuildRealtime(changedPaths) {
  return changedPaths.some(isRealtimeRuntimePath);
}

export function readChangedPaths(previousSha, currentSha) {
  return execFileSync('git', [
    'diff', '--name-only', '--no-renames', previousSha, currentSha, '--',
  ], { encoding: 'utf8' })
    .split(/\\r?\\n/)
    .map((filename) => filename.trim())
    .filter(Boolean);
}

export function runRealtimeIgnoreCommand(env = process.env) {
  if (env.TCO_REALTIME_FORCE_BUILD === '1') {
    console.log('[realtime-ignore] Forced rebuild requested; rebuilding the realtime image.');
    return 1;
  }

  const previousSha = String(env.VERCEL_GIT_PREVIOUS_SHA || '').trim();
  const currentSha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();

  if (!previousSha || !currentSha) {
    console.warn('[realtime-ignore] Previous/current deployment SHA unavailable; rebuilding safely.');
    return 1;
  }

  try {
    // Ensure both commits exist locally before trusting a path-only diff. A shallow
    // checkout or missing previous object must never silently skip the service build.
    execFileSync('git', ['cat-file', '-e', `${previousSha}^{commit}`], { stdio: 'ignore' });
    execFileSync('git', ['cat-file', '-e', `${currentSha}^{commit}`], { stdio: 'ignore' });
    const changed = readChangedPaths(previousSha, currentSha);
    const relevant = changed.filter(isRealtimeRuntimePath);

    if (relevant.length) {
      console.log('[realtime-ignore] Realtime runtime dependency changes detected; rebuilding:');
      for (const filename of relevant.slice(0, 30)) console.log(`  - ${filename}`);
      if (relevant.length > 30) console.log(`  ... and ${relevant.length - 30} more`);
      return 1;
    }

    console.log(`[realtime-ignore] Skipping container rebuild; ${changed.length} changed path(s), none affect the realtime runtime.`);
    return 0;
  } catch (error) {
    console.warn('[realtime-ignore] Could not verify the Git diff; rebuilding safely.', error instanceof Error ? error.message : '');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runRealtimeIgnoreCommand();
}
