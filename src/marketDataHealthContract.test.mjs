import assert from 'node:assert/strict';import fs from 'node:fs';
const s=fs.readFileSync(new URL('./services/marketData/dataHealth.ts',import.meta.url),'utf8');
const chart=fs.readFileSync(new URL('./components/workspace/LiveChart.tsx',import.meta.url),'utf8');
const dock=fs.readFileSync(new URL('./components/workspace/RightTerminalDock.tsx',import.meta.url),'utf8');
const ticket=fs.readFileSync(new URL('./components/workspace/AdvancedOrderTicket.tsx',import.meta.url),'utf8');
const coreSpirit=fs.readFileSync(new URL('./components/corespirit/CoreSpiritDock.tsx',import.meta.url),'utf8');
assert.match(s,/source!=='fyers'&&source!=='upstox'/);assert.match(s,/isTradableFreshness:state==='live'/);assert.match(s,/ageMs!>expected\*3/);assert.match(chart,/DATA \{marketHealth.label\}/);assert.match(dock,/health.label/);assert.match(ticket,/marketHealth.label/);assert.match(coreSpirit,/DATA \{marketHealth.label\}/);
console.log('market-data-health contract: ok');
