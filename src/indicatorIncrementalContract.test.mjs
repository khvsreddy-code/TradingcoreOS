import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const kernel = read('src/services/coreSpirit/statefulIndicatorKernel.ts');
const engine = read('src/services/marketData/incrementalIndicatorEngine.ts');
const indicatorEngine = read('src/services/marketData/indicatorEngine.ts');
const worker = read('src/services/marketData/indicator.worker.ts');
const coordinator = read('src/services/marketData/chartComputeCoordinator.ts');
const live = read('src/components/workspace/LiveChart.tsx');
const runtime = read('src/services/core/chart/ChartRuntimeController.ts');
const indicatorController = read('src/services/core/chart/controllers/ChartIndicatorController.ts');
const overlay = read('src/components/workspace/ChartOverlay.tsx');
const settings = read('src/components/indicators/IndicatorSettingsPanel.tsx');
const viewer = read('src/components/indicators/IndicatorCodeViewer.tsx');
const buildTracker = read('docs/CORESPIRIT_BUILD_TRACKER.md');
const indicatorDocs = read('docs/04_INDICATORS_AND_PLATFORM.md');

for (const token of [
  'class RollingMean', 'class RollingVariance', 'class RollingMinMax', 'class RollingSum',
  'class RollingAbsoluteDeviation', 'class EMAState', 'class WilderState', 'class ATRState',
  'class WMAState', 'class VWAPSessionState',
]) {
  if (!kernel.includes(token)) throw new Error(`Incremental kernel primitive missing: ${token}`);
}
for (const kind of ['EMA','SMA','HMA','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI','Supertrend','Ichimoku Cloud','Adaptive Ehlers','Fractional EMA Kalman Filter','Trend Pressure','Trend Target Ribbon','Trinity','Neural Weight Oscillator']) {
  if (!engine.includes(`'${kind}'`)) throw new Error(`Incremental kind missing: ${kind}`);
}
for (const fn of ['bollinger','donchian','stochastic','cci','mfi','hma','ichimoku']) {
  const re = new RegExp(`export function ${fn}\\b[\\s\\S]*?(?=\\nexport function|\\nfunction groupedBy|\\nfunction wma|\\nexport function supertrend|$)`);
  const match = indicatorEngine.match(re);
  if (!match) throw new Error(`Could not locate refactored function: ${fn}`);
  if (/\.slice\(/.test(match[0]) || /\.reduce\(/.test(match[0]) || /Math\.(?:max|min)\(\.\.\./.test(match[0])) {
    throw new Error(`Window-rescan pattern remains inside ${fn}`);
  }
}
if (/const rollingStd = .*\.slice\(/.test(indicatorEngine) || /const normalized = .*\.slice\(/.test(indicatorEngine)) throw new Error('Advanced rolling helper still uses slice windows');
if (!/mode\?:'snapshot'\|'incremental'/.test(worker) || !/operation\?:'replace'\|'append'/.test(worker)) throw new Error('Incremental worker protocol missing');
if (!/incrementalMode:'update'/.test(worker) || !/incrementalMode:'reset'/.test(worker)) throw new Error('Incremental worker result modes missing');
if (!/tailKey/.test(coordinator) || !/JSON\.stringify\(\[market\.open\[i\], market\.high\[i\], market\.low\[i\], market\.close\[i\], market\.volume\[i\]\]\)/.test(coordinator)) throw new Error('Same-bar indicator cache identity is not tail-aware');
if (!/indicatorQueue\.run\(payload, incrementalKey, transfer, \{/.test(coordinator) ||
    !/private readonly affinity = new Map<string, Worker>\(\)/.test(coordinator) ||
    !/this\.affinity\.set\(item\.affinityKey, idle\)/.test(coordinator)) {
  throw new Error('Incremental snapshot/tick worker affinity is not pinned');
}
if (!/if \(result\.resetRequired\)/.test(coordinator) || !/seedOnMiss: true/.test(coordinator)) throw new Error('Incremental reset/resync path missing');
if (!/requestIndicatorWorker\(data,visibleLogicalRangeRef\.current,'incremental'/.test(live+runtime+indicatorController)) throw new Error('Live chart does not request incremental forming-bar updates');
if (!/series\.update|\.update\(points\[points\.length-1\]/.test(indicatorController)) throw new Error('Indicator controller lacks tail-only series updates');
if (!/if\(!preserveWorkerSeries\)/.test(indicatorController)) throw new Error('Legacy renderer path can still clear incremental series on every tick');
if (!/IndicatorCodeViewer/.test(overlay) || !/title="Indicator settings"/.test(overlay) || !/title="View code"/.test(overlay)) throw new Error('Live indicator dialogue settings/code actions missing');
if (!/Settings2/.test(settings) || !/Code2/.test(settings) || !/> Code<\//.test(settings)) throw new Error('Indicator settings panel gear/code affordances missing');
if (!/getIndicatorSourceTemplate/.test(viewer) || !/navigator\.clipboard/.test(viewer)) throw new Error('Indicator code viewer source/copy path missing');
for (const token of ['v107 incremental indicator execution','RollingAbsoluteDeviation','series.update','IndicatorCodeViewer']) {
  if (!buildTracker.includes(token) && !indicatorDocs.includes(token)) throw new Error(`incremental-indicator documentation marker missing: ${token}`);
}
console.log('TRADINGCORE_V107_INCREMENTAL_INDICATOR_CONTRACT_OK');
