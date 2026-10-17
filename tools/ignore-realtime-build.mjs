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
  const normalized = String(filename || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized) return false;
  if (NON_RUNTIME_SERVER_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  return EXACT_RUNTIME_FILES.has(normalized) || RUNTIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function shouldBuildRealtime(changedPaths) {
  return changedPaths.some(isRealtimeRuntimePath);
}

function commitObjectExists(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vercel often checks out a shallow Git history. A missing previous commit is
 * not evidence that runtime files changed: try fetching that exact reachable
 * commit from the configured remote before falling back to a safe rebuild.
 */
function ensureCommitObjectAvailable(sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return false;
  if (commitObjectExists(sha)) return true;

  let remotes = [];
  try {
    remotes = execFileSync('git', ['remote'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return false;
  }
  const remote = remotes.includes('origin') ? 'origin' : remotes[0];
  if (!remote) return false;

  try {
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', remote, sha], {
      stdio: 'ignore',
      timeout: 20_000,
    });
  } catch (error) {
    console.warn(
      `[realtime-ignore] Could not fetch comparison commit ${sha.slice(0, 12)}; rebuilding safely.`,
      error instanceof Error ? error.message : '',
    );
    return false;
  }
  return commitObjectExists(sha);
}

export function readChangedPaths(previousSha, currentSha) {
  if (!ensureCommitObjectAvailable(previousSha) || !ensureCommitObjectAvailable(currentSha)) {
    throw new Error('Could not load both commits needed to prove the realtime runtime diff.');
  }
  return execFileSync('git', [
    'diff', '--name-only', '--no-renames', previousSha, currentSha, '--',
  ], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((filename) => filename.trim())
    .filter(Boolean);
}

function realtimeServiceConfigChanged(previousSha, currentSha) {
  const readConfig = (sha) => {
    const raw = execFileSync('git', ['show', `${sha}:vercel.json`], { encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('vercel.json is not an object');
    return parsed.services?.realtimegateway ?? null;
  };

  // Rewrites, headers and web/API service changes do not affect the realtime
  // process. Only rebuild if the actual realtime service definition changed.
  return JSON.stringify(readConfig(previousSha)) !== JSON.stringify(readConfig(currentSha));
}

export function runRealtimeIgnoreCommand(env = process.env) {
  if (env.TCO_REALTIME_FORCE_BUILD === '1') {
    console.log('[realtime-ignore] Forced rebuild requested; rebuilding the realtime image.');
    return 1;
  }

  let previousSha = String(env.VERCEL_GIT_PREVIOUS_SHA || '').trim();
  let currentSha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();

  // Service-level ignore commands may not receive Vercel's Git SHA variables on
  // every Services build path. Prefer the exact Vercel SHA, but use the checked-out
  // commit as a verifiable fallback rather than forcing an unnecessary container build.
  if (!currentSha) {
    try {
      currentSha = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { encoding: 'utf8' }).trim();
      console.warn('[realtime-ignore] Current deployment SHA unavailable; using checked-out HEAD.');
    } catch (error) {
      console.warn('[realtime-ignore] Current deployment SHA and checked-out HEAD unavailable; rebuilding safely.', error instanceof Error ? error.message : '');
      return 1;
    }
  }

  // Some Vercel multi-service builds do not expose VERCEL_GIT_PREVIOUS_SHA to a
  // service-level ignore command. For that case, compare the deployed commit with
  // its first parent. This still rebuilds for a runtime change in this commit (or
  // a realtimegateway service-config change), while frontend-only commits can reuse
  // the last successful gateway image instead of consuming another registry slot.
  // If the parent cannot be proved locally, fail open and rebuild.
  if (!previousSha) {
    try {
      previousSha = execFileSync('git', ['rev-parse', '--verify', `${currentSha}^1`], { encoding: 'utf8' }).trim();
      console.warn('[realtime-ignore] Previous deployment SHA missing; comparing with the current commit parent.');
    } catch (error) {
      console.warn('[realtime-ignore] Previous deployment SHA and current parent unavailable; rebuilding safely.', error instanceof Error ? error.message : '');
      return 1;
    }
  }

  try {
    // Fetch missing commits from the configured Git remote when Vercel's checkout
    // is shallow. If either commit still cannot be proved, the outer catch safely
    // forces a rebuild rather than accidentally reusing a stale gateway image.
    const changed = readChangedPaths(previousSha, currentSha);
    const relevant = changed.filter(isRealtimeRuntimePath);

    if (changed.includes('vercel.json') && realtimeServiceConfigChanged(previousSha, currentSha)) {
      relevant.push('vercel.json (realtimegateway service configuration)');
    }

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
