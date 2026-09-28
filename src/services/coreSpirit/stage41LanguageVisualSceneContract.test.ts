import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline';
import {
  CORE_SPIRIT_LANGUAGE_PHASES,
  CORE_SPIRIT_LANGUAGE_VERSION,
  validateCoreSpiritLanguageFoundation,
} from './languageFoundation';
import {
  buildCoreSpiritScene,
  diffCoreSpiritScenes,
  validateCoreSpiritScene,
  CORE_SPIRIT_SCENE_VERSION,
  CORE_SPIRIT_VISUAL_PRIMITIVES,
} from './visualScene';

const bars = Array.from({ length: 32 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 8, 25, 3, i * 5)).toISOString(),
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 1000 + i * 10,
}));

const source = `
  fast = ema(close, 5)
  slow = ema(close, 12)
  plot(fast)
  plot(slow)
  line(time[5], low[5], time, high)
  zone(time[10], time, highest(high, 10), lowest(low, 10))
  label(time, high, "Liquidity")
  shape(low, "arrowUp")
  table("topRight", 0, 0, "CoreSpirit")
  signal(crossover(fast, slow), "LONG")
`;

export function runCoreSpiritStage41LanguageVisualContractTest(): void {
  if (CORE_SPIRIT_LANGUAGE_VERSION !== 1) throw new Error('language version changed unexpectedly');
  if (CORE_SPIRIT_SCENE_VERSION !== 1) throw new Error('scene version changed unexpectedly');
  if (CORE_SPIRIT_LANGUAGE_PHASES.length !== 7) throw new Error('language phase contract incomplete');
  if (validateCoreSpiritLanguageFoundation().length) throw new Error('language foundation contract invalid');
  if (!CORE_SPIRIT_VISUAL_PRIMITIVES.includes('zone')) throw new Error('visual primitive contract incomplete');

  const compiled = compileCoreSpirit(source, 'stage41');
  if (compiled.diagnostics.some(d => d.severity === 'error')) {
    throw new Error(`stage41 compile failed: ${compiled.diagnostics.map(d => d.message).join('; ')}`);
  }

  const result = executeCoreSpirit(source, bars, 'stage41');
  if (result.diagnostics.length) throw new Error(result.diagnostics.join('; '));

  const scene = buildCoreSpiritScene(
    { chartId: 'stage41-chart', symbol: 'NSE:NIFTY50', timeframe: '5m', pane: 'main' },
    result.outputs,
    'stage41',
    1,
  );
  const sceneErrors = validateCoreSpiritScene(scene);
  if (sceneErrors.length) throw new Error(sceneErrors.join('; '));

  const scene2 = buildCoreSpiritScene(
    scene.identity,
    [...result.outputs, { kind: 'hline', id: 'support', price: 105 } as any],
    'stage41',
    2,
  );
  const diff = diffCoreSpiritScenes(scene, scene2);
  if (!diff.added.some(node => node.id === 'stage41:support')) throw new Error('scene diff failed to detect added node');
}

runCoreSpiritStage41LanguageVisualContractTest();
console.log('STAGE41_LANGUAGE_VISUAL_SCENE_OK');
