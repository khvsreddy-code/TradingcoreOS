#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const base=(process.env.TCO_BROWSER_BASE_URL || process.env.TCO_BROWSER_URL || 'http://localhost:5173').replace(/\/$/,'');
const urls=[1,4,8].map(n=>`${base}/live?velaLayout=${n}`);
const env={...process.env,TCO_BROWSER_URLS:urls.join(','),TCO_EXPECTED_CELLS:'1,4,8',TCO_REQUIRE_AUTH:'true'};
const result=spawnSync(process.execPath,['tools/verify-chart-performance.mjs'],{stdio:'inherit',env});
if(result.error)throw result.error;
process.exit(result.status ?? 1);
