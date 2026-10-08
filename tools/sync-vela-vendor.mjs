#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = path.join(repoRoot, 'vendor', 'vela');
const sourceRoot = path.resolve(process.argv[2] || '');
const expectedVersion = '0.8.3';

function fail(message) {
  console.error('[vela-vendor] ERROR ' + message);
  process.exit(1);
}

if (!sourceRoot || !fs.existsSync(sourceRoot)) fail('usage: node tools/sync-vela-vendor.mjs <extracted-Vela-main>');
const packagePath = path.join(sourceRoot, 'package.json');
if (!fs.existsSync(packagePath)) fail('source package.json not found: ' + packagePath);

let pkg;
try { pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')); }
catch (error) { fail('invalid source package.json: ' + String(error)); }
if (pkg?.name !== '@luxalgo/vela') fail('source package is ' + String(pkg?.name) + ', expected @luxalgo/vela');
if (pkg?.version !== expectedVersion) fail('source version is ' + String(pkg?.version) + ', expected ' + expectedVersion);

const required = ['src', 'LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md'];
for (const entry of required) if (!fs.existsSync(path.join(sourceRoot, entry))) fail('required source entry missing: ' + entry);

const tempRoot = path.join(repoRoot, '.vela-vendor-sync-' + process.pid);
fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

try {
  fs.cpSync(path.join(sourceRoot, 'src'), path.join(tempRoot, 'src'), { recursive: true });
  for (const file of ['LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'package.json']) {
    fs.copyFileSync(path.join(sourceRoot, file), path.join(tempRoot, file));
  }

  // Replace atomically at the directory level where the platform permits it.
  // The existing vendor is kept as a backup until the new tree is fully copied.
  const backupRoot = path.join(repoRoot, '.vela-vendor-backup-' + process.pid);
  fs.rmSync(backupRoot, { recursive: true, force: true });
  if (fs.existsSync(vendorRoot)) fs.renameSync(vendorRoot, backupRoot);
  try {
    fs.renameSync(tempRoot, vendorRoot);
  } catch (error) {
    if (fs.existsSync(backupRoot)) fs.renameSync(backupRoot, vendorRoot);
    throw error;
  }
  fs.rmSync(backupRoot, { recursive: true, force: true });
  console.log('[vela-vendor] synced @luxalgo/vela@' + expectedVersion + ' into vendor/vela');
} catch (error) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fail(String(error));
}
