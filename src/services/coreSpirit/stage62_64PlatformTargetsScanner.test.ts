const assert = (condition: unknown, message?: string) => { if (!condition) throw new Error(message || 'assertion failed'); };
const equal = (actual: unknown, expected: unknown, message?: string) => { if (actual !== expected) throw new Error(message || `expected ${String(expected)}, got ${String(actual)}`); };
import { CoreSpiritCompiler } from './compiler';
import { parseCoreSpirit } from './coreSpiritPipeline';
import { makeExecutableArtifact } from './artifact';
import { CoreSpiritScanner } from './scanner';
import { CoreSpiritHistoricalExecutionHost } from './executionHost';
import { CORE_SPIRIT_EXECUTION_TARGET_PROFILES } from './executionTarget';
import type { CoreSpiritMarketDataset } from './marketData';

function dataset(symbol: string, closes: number[]): CoreSpiritMarketDataset {
  return {
    version: 1,
    id: `${symbol}:day`,
    symbol,
    timeframe: '1D',
    source: 'research',
    bars: closes.map((close, i) => ({
      timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + i,
    })),
  };
}

async function main() {
  assert(CORE_SPIRIT_EXECUTION_TARGET_PROFILES.chart.capabilities.includes('visuals'));
  assert(!CORE_SPIRIT_EXECUTION_TARGET_PROFILES.scanner.capabilities.includes('visuals'));
  assert(CORE_SPIRIT_EXECUTION_TARGET_PROFILES.scanner.capabilities.includes('market-universe'));
  assert(CORE_SPIRIT_EXECUTION_TARGET_PROFILES.automation.capabilities.includes('order-intents'));

  const scanSource = `\nscan.universe("TEST");\nlet fast = ema(close, 2);\nlet slow = ema(close, 3);\nif (crossover(fast, slow)) { scan.emit(100, "LONG", meta("reason", "ema_cross")); }\n`;
  const compiler = new CoreSpiritCompiler();
  const compiled = compiler.compile(parseCoreSpirit(scanSource), 'scan-example');
  assert(compiled.artifact, compiled.diagnostics.map(d => d.message).join('; '));
  const artifact = makeExecutableArtifact(compiled.ir!);

  const universe = {
    id: 'TEST_UNIVERSE',
    items: [
      { symbol: 'AAA', dataset: dataset('AAA', [1,1,2,3,4]) },
      { symbol: 'BBB', dataset: dataset('BBB', [1,2,1,3,4]) },
      { symbol: 'CCC', dataset: dataset('CCC', [4,4,4,4,4]) },
    ],
  } as const;

  const scanner = new CoreSpiritScanner();
  const result = await scanner.runArtifact(artifact, universe, { concurrency: 2, topN: 2, runIdPrefix: 'stage62' });
  equal(result.version, 1);
  equal(result.scanned, 3);
  equal(result.universeId, 'TEST_UNIVERSE');
  assert(result.candidates.length <= 2);
  assert(result.candidates.every(candidate => candidate.symbol));
  assert(result.candidates.every(candidate => candidate.metadata.reason === 'ema_cross'));

  const visualSource = `visual.liquidityZone("z", 100, 90, 82, "right");`;
  const visualCompiled = compiler.compile(parseCoreSpirit(visualSource), 'visual-target');
  assert(visualCompiled.artifact, visualCompiled.diagnostics.map(d => d.message).join('; '));
  const visualArtifact = makeExecutableArtifact(visualCompiled.ir!);
  const historicalHost = new CoreSpiritHistoricalExecutionHost();
  const chartRun = historicalHost.run(visualArtifact, dataset('AAA', [1,2,3]), 'chart-run', 'chart');
  equal(chartRun.diagnostics.length, 0);
  const scannerRun = historicalHost.run(visualArtifact, dataset('AAA', [1,2,3]), 'scanner-run', 'scanner');
  assert(scannerRun.diagnostics.some(message => message.includes("does not allow capability 'visuals'")));


  const appSource = `app.create("Scanner Workspace", "scanner-workspace"); app.targets("chart", "replay"); app.require("orderbook"); app.panel("right", "orderbook");`;
  const appCompiled = compiler.compile(parseCoreSpirit(appSource), 'app-targets');
  assert(appCompiled.artifact, appCompiled.diagnostics.map(d => d.message).join('; '));
  const appHost = new CoreSpiritHistoricalExecutionHost();
  const appRun = appHost.run(makeExecutableArtifact(appCompiled.ir!), dataset('AAA', [1,2,3]), 'app-run', 'chart');
  equal(appRun.diagnostics.length, 0);
  assert(appRun.finalState.workspaceState.app?.supportedTargets?.includes('replay'));
  assert(appRun.finalState.workspaceState.app?.requiredFeatures?.includes('orderbook'));

  const artifactAgain = makeExecutableArtifact(compiled.ir!);
  equal(artifact.checksum, artifactAgain.checksum, 'same source must produce same artifact checksum');

  console.log('STAGE62_64_EXECUTION_TARGETS_SCANNER_OK');
}

main().catch(error => { console.error(error); throw error; });
