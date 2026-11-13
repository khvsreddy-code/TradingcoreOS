#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const base = String(process.env.TCO_BROWSER_BASE_URL || process.env.TCO_BROWSER_URL || '').replace(/\/$/, '');
if (!base) throw new Error('TCO_BROWSER_BASE_URL or TCO_BROWSER_URL must point to an authenticated live TradingCoreOS terminal.');
const urls = ['1','4','8'].map(layout => `${base}?velaLayout=${layout}`);

const result = spawnSync(process.execPath, ['tools/verify-chart-performance.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TCO_BROWSER_URLS: urls.join(','),
    TCO_EXPECTED_CELLS: '1,4,8',
    TCO_REQUIRE_AUTH: process.env.TCO_REQUIRE_AUTH || 'true',
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
