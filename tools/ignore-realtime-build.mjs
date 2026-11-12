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
  '.dockerignore',
  'Dockerfile',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'tsconfig.json',
  'tsconfig.build.json',
]);

// Track the gateway's actual runtime dependency surface, not the entire HTTP/API
// server. Broadly watching src/server/ caused unrelated API, CoreSpirit storage,
// and order-execution edits to rebuild the container and consume VCR image slots.
const EXACT_RUNTIME_PATHS = new Set([
  'src/server/brokers/BrokerRequestGate.ts',
  'src/server/coordination/UpstashRedisRest.ts',
  'src/server/encryption/EncryptionService.ts',
  'src/server/latency/budgets.ts',
  'src/server/marketData/FyersMarketDataTransport.ts',
  'src/server/marketData/MarketEventBus.ts',
  'src/server/realtime/ticket.ts',
  'src/server/storage/BrokerRepository.ts',
  'src/server/utils/canonicalJson.ts',
  'src/types/market.ts',
  'src/types/market-events.ts',
]);

const RUNTIME_PREFIXES = [
  'realtime-gateway/',
  // The gateway imports the FYERS API client/capability resolver and order
  // stream/state pipeline from these two narrowly scoped directories.
  'src/server/fyers/core/',
  'src/server/fyers/trading/',
];

const REALTIME_PACKAGE_SCRIPT_KEYS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'realtime:gateway',
];

export function isRealtimeRuntimePath(filename) {
  const normalized = String(filename || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized) return false;
  return EXACT_RUNTIME_FILES.has(normalized) ||
    EXACT_RUNTIME_PATHS.has(normalized) ||
    RUNTIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function realtimePackageRuntimeConfig(packageJson) {
  const scripts = packageJson?.scripts ?? {};
  return {
    type: packageJson?.type ?? null,
    engines: packageJson?.engines ?? null,
    packageManager: packageJson?.packageManager ?? null,
    dependencies: packageJson?.dependencies ?? null,
    devDependencies: packageJson?.devDependencies ?? null,
    optionalDependencies: packageJson?.optionalDependencies ?? null,
    peerDependencies: packageJson?.peerDependencies ?? null,
    peerDependenciesMeta: packageJson?.peerDependenciesMeta ?? null,
    overrides: packageJson?.overrides ?? null,
    scripts: Object.fromEntries(
      REALTIME_PACKAGE_SCRIPT_KEYS.map((key) => [key, scripts[key] ?? null]),
    ),
  };
}

function realtimePackageConfigChanged(previousSha, currentSha) {
  const readPackage = (sha) => {
    const raw = execFileSync('git', ['show', `${sha}:package.json`], { encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('package.json is not an object');
    return realtimePackageRuntimeConfig(parsed);
  };
  return JSON.stringify(readPackage(previousSha)) !== JSON.stringify(readPackage(currentSha));
}

export function shouldBuildRealtime(changedPaths) {
  return changedPaths.some(isRealtimeRuntimePath);
}

export function readChangedPaths(previousSha, currentSha) {
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
    const service = parsed.services?.['realtimegatewayfresh'];
    if (!service) return null;
    // ignoreCommand only controls whether a new build is needed. Treating that
    // policy change as an image-runtime change creates a loop: if a deployment
    // fails on the VCR cap, VERCEL_GIT_PREVIOUS_SHA can stay old and every retry
    // keeps rebuilding the gateway. Keep all real service settings in the diff.
    const { ignoreCommand: _ignoreCommand, ...runtimeConfig } = service;
    return runtimeConfig;
  };

  // Top-level routing and web/API service settings do not affect the gateway image.
  return JSON.stringify(readConfig(previousSha)) !== JSON.stringify(readConfig(currentSha));
}

function ensureCommitAvailable(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    // Vercel frequently gives the service a shallow checkout. Its previous
    // deployment SHA can be valid on GitHub but absent locally; fetch that exact
    // public commit before failing open and rebuilding a container unnecessarily.
    try {
      execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', sha], {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 15_000,
      });
      execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
      console.log(`[realtime-ignore] Fetched missing Git commit ${sha.slice(0, 12)} for an accurate dependency diff.`);
      return true;
    } catch (error) {
      console.warn(`[realtime-ignore] Could not fetch commit ${sha.slice(0, 12)}; the gateway will rebuild safely.`, error instanceof Error ? error.message : '');
      return false;
    }
  }
}

export function runRealtimeIgnoreCommand(env = process.env) {
  console.log('[realtime-ignore] Evaluating whether this commit changes the realtime gateway image.');
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
  // a realtimegatewayfresh service-config change), while frontend-only commits can reuse
  // the last successful gateway image instead of consuming another registry slot.
  // If the parent cannot be proved locally, fail open and rebuild.
  if (!previousSha) {
    try {
      // Prefer the parent already present in the checkout. This is both cheaper
      // and more reliable for local/CI fixtures that deliberately have no remote.
      // Only deepen/fetch when the current commit or its parent is genuinely absent.
      try {
        previousSha = execFileSync('git', ['rev-parse', '--verify', `${currentSha}^1`], { encoding: 'utf8' }).trim();
        console.warn('[realtime-ignore] Previous deployment SHA missing; using the verified current-parent diff already available locally.');
      } catch {
        // A shallow Vercel checkout may contain HEAD but not its parent object.
        // Fetch depth two only after proving that the local parent is unavailable.
        execFileSync('git', ['fetch', '--no-tags', '--depth=2', 'origin', currentSha], {
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 15_000,
        });
        previousSha = execFileSync('git', ['rev-parse', '--verify', `${currentSha}^1`], { encoding: 'utf8' }).trim();
        console.warn('[realtime-ignore] Previous deployment SHA missing; fetched and compared with the current commit parent.');
      }
    } catch (error) {
      console.warn('[realtime-ignore] Previous deployment SHA and parent could not be verified; rebuilding safely.', error instanceof Error ? error.message : '');
      return 1;
    }
  }

  try {
    // The current checkout is authoritative; previous deployment commits may need
    // a one-commit fetch because Vercel's default source clone can be shallow.
    if (!ensureCommitAvailable(currentSha)) return 1;
    if (!ensureCommitAvailable(previousSha)) {
      // If Vercel supplies a previous-deployment SHA that is not fetchable from the
      // build checkout, compare the current commit to its verified parent. This keeps
      // frontend-only commits from needlessly rebuilding the gateway in a shallow
      // checkout. Gateway changes in the current commit are still detected below.
      try {
        execFileSync('git', ['fetch', '--no-tags', '--depth=2', 'origin', currentSha], {
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 15_000,
        });
        previousSha = execFileSync('git', ['rev-parse', '--verify', `${currentSha}^1`], { encoding: 'utf8' }).trim();
        if (!ensureCommitAvailable(previousSha)) return 1;
        console.warn('[realtime-ignore] Previous deployment SHA unavailable; using the verified current-parent diff.');
      } catch (error) {
        console.warn('[realtime-ignore] Could not verify the current parent; rebuilding safely.', error instanceof Error ? error.message : '');
        return 1;
      }
    }
    const changed = readChangedPaths(previousSha, currentSha);
    const relevant = changed.filter(isRealtimeRuntimePath);

    // package.json contains frontend build/test scripts that are unrelated to
    // the gateway. Rebuild only when its install/runtime contract changed.
    if (changed.includes('package.json') && realtimePackageConfigChanged(previousSha, currentSha)) {
      relevant.push('package.json (realtime runtime package configuration)');
    }

    if (changed.includes('vercel.json') && realtimeServiceConfigChanged(previousSha, currentSha)) {
      relevant.push('vercel.json (realtimegatewayfresh service configuration)');
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
