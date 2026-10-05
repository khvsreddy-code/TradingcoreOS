import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const manifestPath = path.join(distDir, '.vite', 'manifest.json');

if (!fs.existsSync(distDir) || !fs.existsSync(manifestPath)) {
  throw new Error('dist/.vite/manifest.json is missing. Run vite build first.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entries = Object.entries(manifest)
  .filter(([, value]) => value?.isEntry)
  .map(([key, value]) => ({ key, file: value.file }));

if (!entries.length) throw new Error('No Vite entry chunk found in manifest');

const rows = entries.map(({ key, file }) => {
  const assetPath = path.join(distDir, file);
  const bytes = fs.statSync(assetPath).size;
  const gzipBytes = gzipSync(fs.readFileSync(assetPath), { level: 9 }).length;
  return { key, file, bytes, gzipBytes, gzipKb: gzipBytes / 1024 };
}).sort((a,b) => b.gzipBytes - a.gzipBytes);

const maxInitialGzipKb = Number(process.env.TCO_MAX_INITIAL_GZIP_KB || 350);
const primary = rows[0];

console.log('Bundle entry report:');
for (const row of rows) {
  console.log(`  ${row.file}: ${(row.bytes/1024).toFixed(1)} KB raw, ${row.gzipKb.toFixed(1)} KB gzip`);
}

if (primary.gzipKb > maxInitialGzipKb) {
  throw new Error(`Initial JS entry ${primary.file} is ${primary.gzipKb.toFixed(1)} KB gzip; budget is ${maxInitialGzipKb} KB.`);
}
