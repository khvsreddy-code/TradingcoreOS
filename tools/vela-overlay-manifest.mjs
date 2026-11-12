#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor/vela');
const SNAPSHOT = path.join(VENDOR, 'UPSTREAM-DIFF.json');
const RELEASE_SNAPSHOT = path.join(VENDOR, 'UPSTREAM-RELEASE-DIFF.json');
const PATCH_MANIFEST = path.join(VENDOR, 'patches.json');
const UPSTREAM_BASE_COMMIT = '34d11f1a8a88c7dd5657c9b3a791abf43560218d';
const UPSTREAM_COMMIT = 'f6769868c5c0e78ba7977a5c89640df896a8f2f3';
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
if (head.status !== 0) ¶»§q«^