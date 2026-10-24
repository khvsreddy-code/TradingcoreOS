#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor/vela');
const SNAPSHOT = path.join(VENDOR, 'UPSTREAM-DIFF.json');
const PATCH_MANIFEST = path.join(VENDOR, 'patches.json');
const UPSTREAM_COMMIT = '596cbbdeba15406cfb72465afd07f8c60c6b1852';
const args = new Set(process.argv.slice(2));
const upstreamArg = process.argv.slice(2).find((arg) => arg.startsWith('--upstream-dir='));
const upstreamIndex = process.argv.indexOf('--upstream-dir');
const upstreamDir = path.resolve(upstreamArg ? upstreamArg.slice('--upstream-dir='.length) : (upstreamIndex >= 0 ? process.argv[upstreamIndex + 1] || '' : ''));
const write = args.has('--write');
const check = args.has('--check') || !write;

function fail(message) {
  console.error(`[vela-overlay] ${message}`);
  process.exit(1);
}

if (!upstreamDir || upstreamDir === ROOT || !fs.existsSync(path.join(upstreamDir, '.git'))) {
  fail('pass --upstream-dir pointing to a clean clone of LuxAlgo/Vela at the pinned commit');
}
const head = spawnSync('git', ['-C', upstreamDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
if (head.status !== 0) fail(head.stderr || 'could not read upstream git HEAD');
if (head.stdout.trim() !== UPSTREAM_COMMIT) {
  fail(`expected upstream HEAD ${UPSTREAM_COMMIT}, got ${head.stdout.trim()}`);
}
const status = spawnSync('git', ['-C', upstreamDir, 'status', '--porcelain'], { encoding: 'utf8' });
if (status.status !== 0) fail(status.stderr || 'could not verify upstream working tree');
if (status.stdout.trim()) fail('upstream checkout must be clean before generating the source diff');

const patchManifest = JSON.parse(fs.readFileSync(PATCH_MANIFEST, 'utf8'));
const patches = patchManifest.patches;
function patchFor(relativePath) {
  for (const patch of patches) {
    for (const pattern of patch.pathPatterns) {
      if (pattern.endsWith('/**') && relativePath.startsWith(pattern.slice(0, -2))) return patch;
      if (pattern === relativePath) return patch;
    }
  }
  return null;
}

function walkFiles(dir, prefix = '') {
  const result = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) fail(`symbolic links are not supported in source comparison: ${path.join(prefix, entry.name)}`);
    const abs = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [name, info] of walkFiles(abs, rel)) result.set(name, info);
    } else if (entry.isFile()) {
      const bytes = fs.readFileSync(abs);
      const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
      const blob = crypto.createHash('sha1').update(header).update(bytes).digest('hex');
      result.set(rel, { abs, blob });
    }
  }
  return result;
}

const upstreamSource = path.join(upstreamDir, 'src');
const localSource = path.join(VENDOR, 'src');
if (!fs.existsSync(upstreamSource) || !fs.existsSync(localSource)) fail('both source directories must exist');
const upstreamFiles = walkFiles(upstreamSource, 'src');
const localFiles = walkFiles(localSource, 'src');
const identical = [];
const modified = [];
const localOnly = [];
const upstreamOnly = [];

for (const [relativePath, local] of [...localFiles].sort(([a], [b]) => a.localeCompare(b))) {
  const upstream = upstreamFiles.get(relativePath);
  if (!upstream) {
    const patch = patchFor(relativePath);
    if (!patch) fail(`unmapped TCO-only file: ${relativePath}; add it to vendor/vela/patches.json`);
    localOnly.push({ path: relativePath, localBlob: local.blob, patchId: patch.id });
  } else if (upstream.blob === local.blob) {
    identical.push({ path: relativePath, blob: local.blob });
  } else {
    const patch = patchFor(relativePath);
    if (!patch) fail(`unmapped modified upstream file: ${relativePath}; add it to vendor/vela/patches.json`);
    modified.push({ path: relativePath, upstreamBlob: upstream.blob, localBlob: local.blob, patchId: patch.id });
  }
}
for (const [relativePath, upstream] of [...upstreamFiles].sort(([a], [b]) => a.localeCompare(b))) {
  if (!localFiles.has(relativePath)) upstreamOnly.push({ path: relativePath, upstreamBlob: upstream.blob });
}

const snapshot = {
  schemaVersion: 1,
  generatedBy: 'tools/vela-overlay-manifest.mjs',
  upstream: {
    repository: 'https://github.com/LuxAlgo/Vela',
    tag: 'v0.8.5',
    commit: UPSTREAM_COMMIT
  },
  comparison: 'Git blob SHA-1; only src/ is compared so local provenance/docs remain separate',
  counts: {
    identical: identical.length,
    modified: modified.length,
    localOnly: localOnly.length,
    upstreamOnly: upstreamOnly.length
  },
  identical,
  modified,
  localOnly,
  upstreamOnly
};
const serialized = JSON.stringify(snapshot, null, 2) + '\n';
if (write) {
  fs.writeFileSync(SNAPSHOT, serialized);
  console.log(`[vela-overlay] wrote ${SNAPSHOT}; ${modified.length} modified, ${localOnly.length} local-only, ${upstreamOnly.length} upstream-only files`);
} else if (check) {
  if (!fs.existsSync(SNAPSHOT)) fail('vendor/vela/UPSTREAM-DIFF.json is missing; rerun with --write');
  const current = fs.readFileSync(SNAPSHOT, 'utf8');
  if (current !== serialized) fail('UPSTREAM-DIFF.json is stale; rerun with --write against the pinned commit');
  console.log(`[vela-overlay] verified snapshot: ${modified.length} modified, ${localOnly.length} local-only, ${upstreamOnly.length} upstream-only files`);
}
