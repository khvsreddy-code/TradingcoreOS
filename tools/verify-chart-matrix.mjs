#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { buildChartLayoutUrls } from './browser-test-urls.mjs';

const base = String(process.env.TCO_BROWSER_BASE_URL || process.env.TCO_BROWSER_URL || '').trim();
if (!base) throw new Error('TCO_BROWSER_BASE_URL or TCO_BROWSER_URL must point to an authenticated /live TradingCoreOS terminal.');

const layouts = String(process.env.TCO_BROWSER_LAYOUTS || '1,4,5,8')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const urls = buildChartLayoutUrls(base, layouts);

const result = spawnSync(process.execPath, ['tools/verify-chart-performance.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TCO_BROWSER_URLS: urls.join(','),
    // Each requested Vela layout is also the expected chart-cell count.
    TCO_EXPECTED_CELLS: layouts.map(value => String(Number(value))).join(','),
    TCO_REQUIRE_AUTH: process.env.TCO_REQUIRE_AUTH || 'true',
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
