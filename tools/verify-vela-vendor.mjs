#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = path.join(repoRoot, 'vendor', 'vela');
const sourceRoot = path.resolve(process.argv[2] || '');

function fail(message) {
  console.error('[vela-vendor] ERROR ' + message);
  process.exit(1);
}
function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function files(root, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? path.join(prefix, entry.name) : entry.name;
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...files(abs, rel));
    else out.push(rel.replaceAll(path.sep, '/'));
  }
  return out;
}

if (!sourceRoot || !fs.existsSync(sourceRoot)) fail('usage: node tools/verify-vela-vendor.mjs <extracted-Vela-main>');
const sourcePackagePath = path.join(sourceRoot, 'package.json');
const vendorPackagePath = path.join(vendorRoot, 'package.json');
if (!fs.existsSync(sourcePackagePath)) fail('source package.json not found');
if (!fs.existsSync(vendorPackagePath)) fail('vendor package.json not found');
const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf8'));
const vendorPackage = JSON.parse(fs.readFileSync(vendorPackagePath, 'utf8'));
if (sourcePackage.name !== '@luxalgo/vela' || sourcePackage.version !== '0.8.3') fail('source is not @luxalgo/vela@0.8.3');
if (vendorPackage.name !== '@luxalgo/vela' || vendorPackage.version !== '0.8.3') fail('vendor metadata is not @luxalgo/vela@0.8.3');

const expected = files(path.join(sourceRoot, 'src'));
const actual = files(path.join(vendorRoot, 'src'));
const expectedSet = new Set(expected);
const actualSet = new Set(actual);
const missing = expected.filter(file => !actualSet.has(file));
const extra = actual.filter(file => !expectedSet.has(file));
const changed = expected.filter(file => actualSet.has(file) && hash(path.join(sourceRoot, 'src', file)) !== hash(path.join(vendorRoot, 'src', file)));

if (missing.length || changed.length) {
  console.error(JSON.stringify({ missing, changed: changed.slice(0, 100), changedCount: changed.length, extraCount: extra.length }, null, 2));
  fail('vendor source does not match supplied Vela 0.8.3 source');
}
console.log(JSON.stringify({ ok: true, version: '0.8.3', sourceFiles: expected.length, vendorFiles: actual.length, extraTcoFiles: extra }, null, 2));
