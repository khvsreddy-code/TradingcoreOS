import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const kernel = read('src/services/marketData/incrementalIndicatorKernel.ts');
const engine = read('src/services/marketData/incrementalIndicatorEngine.ts');
const indicatorEngine = read('src/services/marketData/indicatorEngine.ts');
const worker = read('src/services/marketData/indicator.worker.ts');
const coordinator = read('src/services/marketData/chartComputeCoordinator.ts');
const live = read('src/components/workspace/LiveChart.tsx');
const settings = read('src/components/indicators/IndicatorSettingsPanel.tsx');
const viewer = read('src/components/indicators/IndicatorCodeViewer.tsx');
const tracker = read('TRADINGCORE_REPAIR_TRACKER.md');
const buildTracker = read('docs/CORESPIRIT_BUILD_TRACKER.md');
const history = read('docs/history/v107-incremental-indicator-execution.md');

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
if (!/tailKey/.test(coordinator) || !/JSON\.stringify\(\[tail\.open,\s*tail\.high,\s*tail\.low,\s*tail\.close,\s*tail\.volume\]\)/.test(coordinator)) throw new Error('Same-bar indicator cache identity is not tail-aware');
if (!/indicatorQueue\.run\(payload, incrementalConfigs\.length > 0 \? incrementalKey : datasetKey\)/.test(coordinator)) throw new Error('Incremental snapshot/tick worker affinity is not pinned');
if (!/if \(result\.resetRequired\)/.test(coordinator) || !/seedOnMiss: true/.test(coordinator)) throw new Error('Incremental reset/resync path missing');
if (!/requestIndicatorWorker\(data,undefined,'incremental'/.test(live)) throw new Error('Live chart does not request incremental forming-bar updates');
if (!/seriesApi\.update/.test(live) && !/\.update\(points\[points\.length-1\]/.test(live)) throw new Error('Live chart lacks tail-only series updates');
if (!/if\(!preserveWorkerSeries\)/.test(live)) throw new Error('Legacy renderer path can still clear incremental series on every tick');
if (!/IndicatorCodeViewer/.test(live) || !/title="Indicator settings"/.test(live) || !/title="View indicator code"/.test(live)) throw new Error('Live indicator dialogue settings/code actions missing');
if (!/Settings2/.test(settings) || !/Code2/.test(settings) || !/> Code<\//.test(settings)) throw new Error('Indicator settings panel gear/code affordances missing');
if (!/getIndicatorSourceTemplate/.test(viewer) || !/navigator\.clipboard/.test(viewer)) throw new Error('Indicator code viewer source/copy path missing');
for (const token of ['TC-PERF-42','TC-PERF-43','TC-PERF-44','TC-PERF-45','TC-PERF-46','TC-PERF-47','TC-PERF-48','TC-PERF-49']) {
  if (!tracker.includes(token)) throw new Error(`Repair tracker item missing: ${token}`);
}
for (const token of ['v107 incremental indicator execution','RollingAbsoluteDeviation','series.update','IndicatorCodeViewer']) {
  if (!buildTracker.includes(token) && !history.includes(token)) throw new Error(`v107 documentation marker missing: ${token}`);
}
console.log('TRADINGCORE_V107_INCREMENTAL_INDICATOR_CONTRACT_OK');
