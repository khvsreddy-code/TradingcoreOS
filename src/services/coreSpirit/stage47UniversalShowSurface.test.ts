import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline';
import { normalizeCoreSpiritSource } from './surfaceForms';
import { inferCoreSpiritCoordinateSpace, parseCoreSpiritCoordinatePair } from './visualSurface';
import { datasetFromBars } from './platformRuntime';

const bars = [
  { timestamp: '2026-01-01T09:15:00Z', open: 25100, high: 25150, low: 25090, close: 25120, volume: 1000 },
  { timestamp: '2026-01-01T09:20:00Z', open: 25120, high: 25200, low: 25110, close: 25190, volume: 1200 },
  { timestamp: '2026-01-01T09:25:00Z', open: 25190, high: 25250, low: 25160, close: 25210, volume: 1400 },
];

export function runStage47UniversalShowSurfaceContract() {
  const source = `
fast = ema(close, 2)
show fast on price
show fast in panel "Momentum"
show line from [time[2], low[2]] to [time, high]
show line from [bar_index, low] to [bar_index, high]
show box at [0.1, 0.2] to [0.5, 0.8]
show zone from 25100 to 25200
show signal "LONG" above bar
show fast when bar_index > 0
`.trim();

  const normalized = normalizeCoreSpiritSource(source);
  const expected = [
    'show("series", fast, chart.price);',
    'show("series", fast, panel("Momentum"));',
    'show("line", "line", point(time[2], low[2], "time"), point(time, high, "time"), chart.price);',
    'show("line", "line", point(bar_index, low, "bar"), point(bar_index, high, "bar"), chart.price);',
    'show("box", point(0.1, 0.2, "normalized"), point(0.5, 0.8, "normalized"), chart.price);',
    'show("zone", 25100, 25200, chart.price, "viewport");',
    'show("signal", "LONG", above_bar(0), chart.price);',
    'if (bar_index > 0) {',
  ];
  for (const fragment of expected) {
    if (!normalized.includes(fragment)) throw new Error(`universal SHOW surface missing: ${fragment}`);
  }

  const pair = parseCoreSpiritCoordinatePair('[time[2], low[2]]');
  if (!pair || pair[0] !== 'time[2]' || pair[1] !== 'low[2]') throw new Error('coordinate pair parser lost indexed expressions');

  const timeInference = inferCoreSpiritCoordinateSpace('time[2]', 'low[2]');
  if (timeInference.space !== 'time') throw new Error('time/price geometry did not infer time space');

  const barInference = inferCoreSpiritCoordinateSpace('bar_index', 'close');
  if (barInference.space !== 'bar') throw new Error('bar-index geometry did not infer bar space');

  const normalizedInference = inferCoreSpiritCoordinateSpace('0.1', '0.8');
  if (normalizedInference.space !== 'normalized') throw new Error('0..1 pair did not infer normalized space');

  const compiled = compileCoreSpirit(source, 'stage47-universal-show');
  if (!compiled.ir) throw new Error(compiled.diagnostics.map(d => d.message).join('; '));
  const shows = compiled.ir.entry.instructions.filter((i: any) => i.op === 'emit' && i.kind === 'show');
  if (shows.length !== 8) throw new Error(`expected 7 universal SHOW emissions, found ${shows.length}`);

  const result = executeCoreSpirit(source, bars, 'stage47-universal-show');
  const series = result.outputs.filter(x => x.kind === 'series');
  if (series.length < 3) throw new Error('universal SHOW did not produce expected series projections');
  const panelSeries = series.find(x => x.visual?.area.kind === 'panel');
  if (!panelSeries) throw new Error('SHOW panel surface did not reach runtime visual semantics');
  const line = (result.outputs as any[]).find(x => x.kind === 'line' && x.geometry?.kind === 'line' && x.geometry.from.space === 'bar');
  if (!line) throw new Error('SHOW bar-coordinate geometry did not reach runtime semantics');
  const box = (result.outputs as any[]).find(x => x.kind === 'box' && x.geometry?.kind === 'box');
  if (!box || box.geometry?.kind !== 'box' || box.geometry.from.space !== 'normalized') throw new Error('SHOW normalized geometry did not reach runtime semantics');
  const zone = result.outputs.find(x => x.kind === 'zone');
  if (!zone || zone.metadata?.domain !== 'viewport') throw new Error('SHOW zone lost viewport-domain semantics');
  const signal = (result.outputs as any[]).find(x => x.kind === 'label' && x.metadata?.semanticRole === 'signal');
  if (!signal || !signal.relativePosition || signal.relativePosition.kind !== 'aboveBar') throw new Error('SHOW signal lost relative placement semantics');

  return 'STAGE47_UNIVERSAL_SHOW_SURFACE_OK';
}

console.log(runStage47UniversalShowSurfaceContract());
