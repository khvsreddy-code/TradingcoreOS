import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline';
import { buildCoreSpiritScene, validateCoreSpiritScene } from './visualScene';
import { coreSpiritChartArea, coreSpiritPanelArea, coreSpiritPoint, coreSpiritRange, validateCoreSpiritVisualPoint, validateCoreSpiritVisualGeometry } from './visualCoordinates';

const bars = Array.from({ length: 8 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, 15 + i * 5)).toISOString(),
  open: 100 + i,
  high: 103 + i,
  low: 98 + i,
  close: 101 + i,
  volume: 1000 + i * 100,
}));

export function runStage43VisualCoordinateSystemContract() {
  const source = `
    let r = rsi(close, 3)
    plot(r, chart.price, bar_index > 1, range(0, 100), "#3b82f6", 2, "RSI")
    plot(r * 0.5, panel("Momentum"), true, range(0, 100), "#8b5cf6", 1, "Half RSI")
    plot(r)
    marker(point(bar_index, close, "bar"), panel("Entries"))
    line(point(time[2], high[2]), point(time, low), panel("Structure"))
    box(point(time[3], high[3]), point(time, low[1]), panel("Structure"))
    polygon(point(time[2], high[2]), point(time[1], low[1]), point(time, high), sidePanel("Geometry"), "#38bdf8")
    text("LONG", above_bar(2))
    text("Risk: 0.25%", point(20, 20, "screen"), panel("Risk"))
    customVisual("risk-surface", "{\\\"schema\\\":\\\"risk\\\",\\\"version\\\":1}", point(0.25, 0.75, "normalized"), sidePanel("Risk"))
  `;

  const compiled = compileCoreSpirit(source, 'stage43');
  const errors = compiled.diagnostics.filter(d => d.severity === 'error');
  if (errors.length) throw new Error(errors.map(d => d.message).join('; '));

  const result = executeCoreSpirit(source, bars, 'stage43');
  const runtimeDiagnostics = result.diagnostics.filter(d => !d.startsWith('bar'));
  if (runtimeDiagnostics.length) throw new Error(runtimeDiagnostics.join('; '));

  if (!result.outputs.some(x => x.kind === 'series' && x.visual?.area.kind === 'chart' && x.visual.area.area === 'price')) throw new Error('price-area plot placement missing');
  if (!result.outputs.some(x => x.kind === 'series' && x.visual?.area.kind === 'panel' && x.visual.area.title === 'Momentum' && x.visual.range?.min === 0 && x.visual.range.max === 100)) throw new Error('panel/range plot placement missing');
  if (result.outputs.some(x => x.kind === 'series' && x.visual?.area.kind === 'chart' && x.time === new Date(bars[0].timestamp).getTime())) throw new Error('conditional plot emitted before when condition');
  if (!result.outputs.some(x => x.kind === 'line' && x.geometry?.kind === 'line' && x.visual?.area.kind === 'panel')) throw new Error('point-based line geometry/placement missing');
  if (!result.outputs.some(x => x.kind === 'marker' && x.visual?.area.kind === 'panel' && x.visual.coordinateSpace === 'bar')) throw new Error('bar-coordinate marker placement missing');
  if (!result.outputs.some(x => x.kind === 'box' && x.geometry?.kind === 'box' && x.visual?.area.kind === 'panel')) throw new Error('point-based box geometry/placement missing');
  if (!result.outputs.some(x => x.kind === 'polygon' && x.geometry?.kind === 'polygon' && x.visual?.area.kind === 'sidePanel')) throw new Error('polygon geometry/placement missing');
  if (!result.outputs.some(x => x.kind === 'label' && x.relativePosition?.kind === 'aboveBar')) throw new Error('relative bar label missing');
  if (!result.outputs.some(x => x.kind === 'label' && x.text === 'Risk: 0.25%' && x.visual?.area.kind === 'panel' && x.visual.coordinateSpace === 'screen')) throw new Error('screen/panel text placement missing');
  if (!result.outputs.some(x => x.kind === 'customVisual' && x.visual?.area.kind === 'sidePanel' && x.visual.coordinateSpace === 'normalized' && x.geometry?.kind === 'point')) throw new Error('custom visual coordinate placement missing');

  const scene = buildCoreSpiritScene({ chartId:'stage43', symbol:'NIFTY', timeframe:'5m', pane:'main' }, result.outputs, 'stage43', 0);
  const sceneErrors = validateCoreSpiritScene(scene);
  if (sceneErrors.length) throw new Error(sceneErrors.join('; '));
  const plotNode = scene.nodes.find(node => node.kind === 'series' && node.placement?.area.kind === 'chart' && node.placement.area.area === 'price');
  if (!plotNode) throw new Error('scene graph did not preserve plot placement');
  const customNode = scene.nodes.find(node => node.kind === 'customVisual');
  if (!customNode || customNode.placement?.area.kind !== 'sidePanel' || customNode.placement.coordinateSpace !== 'normalized') throw new Error('scene graph did not preserve custom side panel/coordinate placement');

  const p = coreSpiritPoint(0.5, 0.75, 'normalized');
  if (validateCoreSpiritVisualPoint(p).length) throw new Error('normalized point validation failed');
  const invalid = { kind:'point', space:'normalized', x:2, y:-1 } as any;
  if (!validateCoreSpiritVisualPoint(invalid).length) throw new Error('invalid normalized coordinate accepted');
  const mixed = validateCoreSpiritVisualGeometry({ kind:'line', from:coreSpiritPoint(1, 2, 'time'), to:coreSpiritPoint(0.5, 0.5, 'normalized') });
  if (!mixed.some(error => error.includes('same coordinate space'))) throw new Error('mixed-coordinate geometry validation missing');
  if (coreSpiritChartArea('price').kind !== 'chart' || coreSpiritPanelArea('Momentum').kind !== 'panel' || coreSpiritRange(0, 100).max !== 100) throw new Error('coordinate constructors failed');

  return 'STAGE43_VISUAL_COORDINATE_SYSTEM_OK';
}
