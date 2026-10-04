import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const transport = fs.readFileSync(path.join(root, 'src/services/core/data/canonicalMarketDataTransport.ts'), 'utf8');
const coordinator = fs.readFileSync(path.join(root, 'src/services/marketData/chartComputeCoordinator.ts'), 'utf8');
const indicatorWorker = fs.readFileSync(path.join(root, 'src/services/marketData/indicator.worker.ts'), 'utf8');
const analyticsWorker = fs.readFileSync(path.join(root, 'src/services/marketData/chartAnalytics.worker.ts'), 'utf8');
const provider = fs.readFileSync(path.join(root, 'src/TcoVelaDataProvider.ts'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'src/LiveTradingWorkspace.tsx'), 'utf8');
const altWheel = fs.readFileSync(path.join(root, 'vendor/vela/src/widget/alt-wheel.ts'), 'utf8');
const dataPlane = fs.readFileSync(path.join(root, 'src/services/marketData/chartDataPlane.ts'), 'utf8');
const marketStore = fs.readFileSync(path.join(root, 'src/services/core/data/marketDataStore.ts'), 'utf8');

assert.match(transport, /CanonicalMarketDataPacket/);
assert.match(transport, /Float64Array/);
assert.match(transport, /packetTransferables/);
assert.match(transport, /new Float64Array\(sliced\.time\)/);
assert.match(coordinator, /market\?: CanonicalMarketDataPacket/);
assert.doesNotMatch(coordinator, /market\?: HistoricalCandle\[\]/);
assert.match(coordinator, /packetTransferables\(packet\)/);
assert.match(indicatorWorker, /packetToCandles/);
assert.match(analyticsWorker, /packetToCandles/);
assert.match(provider, /plane\.readCanonical\(\)/);
assert.match(provider, /marketViewToBars/);
assert.match(dataPlane, /replaceHistoricalCandleRows/);
assert.match(dataPlane, /activeWindow\(fresh, requestedLimit\)/);
assert.match(marketStore, /replaceHistoricalCandleRows/);
assert.match(workspace, /bars: 5000/);
assert.match(workspace, /maxWebglCells: 8/);
assert.match(workspace, /indicatorPicker: true/);
assert.doesNotMatch(workspace, /indicatorWheelOpen/);
assert.match(altWheel, /event\.key !== 'Alt'/);
assert.match(altWheel, /onSelect/);
assert.match(altWheel, /onPanels/);
assert.match(workspace, /AltDrawingWheel|alt-wheel/);

console.log('TRADINGCORE_V115_CANONICAL_MARKET_TRANSPORT_CONTRACT_OK');
