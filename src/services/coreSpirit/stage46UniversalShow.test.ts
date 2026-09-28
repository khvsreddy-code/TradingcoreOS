import { compileCoreSpirit, executeCoreSpirit, normalizeCoreSpirit } from './coreSpiritPipeline';
import { CoreSpiritParser } from './parser';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary';
import { getCoreSpiritCompletions } from './languageService';
import { validateCoreSpiritVisualGeometry } from './visualCoordinates';
import { buildCoreSpiritScene, validateCoreSpiritScene } from './visualScene';

const bars = Array.from({ length: 6 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, 15 + i * 5)).toISOString(),
  open: 100 + i,
  high: 103 + i,
  low: 98 + i,
  close: 101 + i * 1.5,
  volume: 1000 + i * 100,
}));

export function runStage46UniversalShowContract() {
  const source = `
    fast = ema(close, 3)
    r = rsi(close, 3)

    show fast on price
    show r in panel "Momentum"
    show resistance from [time[2], high[2]] to [time, low]
    show box at [0.1, 0.2] to [0.5, 0.8]
    show zone from 99 to 104
    show signal "LONG" above bar
    show r on price when bar_index > 2
  `;

  const normalized = normalizeCoreSpirit(source);
  if (!normalized.includes('show("series", fast, chart.price);')) throw new Error('SHOW price form did not lower to universal show');
  if (!normalized.includes('show("series", r, panel("Momentum"));')) throw new Error('SHOW panel form did not lower to universal show');
  if (!normalized.includes('show("line", "resistance", point(time[2], high[2], "time"), point(time, low, "time"), chart.price);')) {
    throw new Error('SHOW resistance form did not infer time/price coordinates');
  }
  if (!normalized.includes('point(0.1, 0.2, "normalized")') || !normalized.includes('point(0.5, 0.8, "normalized")')) {
    throw new Error('SHOW box did not infer normalized coordinates');
  }
  if (!normalized.includes('show("zone", 99, 104, chart.price, "viewport");')) throw new Error('SHOW zone form missing viewport-domain intent');
  if (!normalized.includes('show("signal", "LONG", above_bar(0), chart.price);')) throw new Error('SHOW signal visual form missing');

  const parsed = new CoreSpiritParser(normalized).parseDetailed();
  if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(d => d.message).join('; '));
  const compiled = compileCoreSpirit(source, 'stage46');
  const errors = compiled.diagnostics.filter(d => d.severity === 'error');
  if (errors.length) throw new Error(errors.map(d => d.message).join('; '));
  if (!compiled.ir) throw new Error('universal SHOW did not compile to IR');
  const showInstructions = compiled.ir.entry.instructions.filter((i: any) => i.op === 'emit' && i.kind === 'show');
  const plotInstructions = compiled.ir.entry.instructions.filter((i: any) => i.op === 'emit' && i.kind === 'plot');
  if (showInstructions.length < 6) throw new Error(`expected universal SHOW IR emissions, found ${showInstructions.length}`);
  if (plotInstructions.length !== 0) throw new Error('SHOW must not lower through plot emission');

  const result = executeCoreSpirit(source, bars, 'stage46');
  const runtimeDiagnostics = result.diagnostics.filter(d => !d.startsWith('bar'));
  if (runtimeDiagnostics.length) throw new Error(runtimeDiagnostics.join('; '));
  if (!result.outputs.some(x => x.kind === 'series' && x.visual?.area.kind === 'chart' && x.visual.area.area === 'price')) throw new Error('SHOW series did not reach price scene semantics');
  if (!result.outputs.some(x => x.kind === 'series' && x.visual?.area.kind === 'panel' && x.visual.area.title === 'Momentum')) throw new Error('SHOW series did not reach named panel semantics');
  if (!result.outputs.some(x => x.kind === 'line' && x.metadata?.semanticRole === 'resistance' && x.geometry?.kind === 'line')) throw new Error('SHOW resistance did not reach line scene object');
  if (!result.outputs.some(x => x.kind === 'box' && x.geometry?.kind === 'box' && x.geometry.from.space === 'normalized')) throw new Error('SHOW box did not preserve inferred normalized geometry');
  if (!result.outputs.some(x => x.kind === 'zone' && x.metadata?.domain === 'viewport')) throw new Error('SHOW zone did not preserve viewport domain');
  if (!result.outputs.some(x => x.kind === 'label' && x.metadata?.semanticRole === 'signal' && x.relativePosition?.kind === 'aboveBar')) throw new Error('SHOW signal did not reach semantic label placement');
  const scene = buildCoreSpiritScene(
    { chartId:'stage46', symbol:'TEST', timeframe:'5m', pane:'main' },
    result.outputs,
    'stage46',
    1,
  );
  const sceneErrors = validateCoreSpiritScene(scene);
  if (sceneErrors.length) throw new Error(sceneErrors.join('; '));
  if (!scene.nodes.some(node => node.kind === 'series' && node.placement?.area.kind === 'panel')) throw new Error('SHOW output did not enter the renderer-neutral scene graph');
  if (!scene.nodes.some(node => node.kind === 'line' && node.metadata?.semanticRole === 'resistance')) throw new Error('SHOW geometry semantic role did not survive scene projection');
  if (!scene.nodes.some(node => node.kind === 'box' && node.placement?.coordinateSpace === 'normalized')) throw new Error('SHOW inferred normalized placement did not survive scene projection');
  const viewportZone = scene.nodes.find(node => node.kind === 'zone' && node.metadata?.domain === 'viewport');
  if (!viewportZone) throw new Error('SHOW viewport zone is missing from the scene graph');
  if (viewportZone.timeRange) throw new Error('viewport zone must not acquire hidden time range geometry');
  if (result.outputs.filter(x => x.kind === 'series').length < 4) throw new Error('conditional SHOW execution missing expected visible bars');

  if (!CORE_SPIRIT_BUILTINS.get('show')?.emitKind) throw new Error('show builtin has no canonical emit contract');
  const completions = getCoreSpiritCompletions('pl', { mode:'global', prefix:'pl' }, source);
  if (!completions.some(item => item.label === 'plot' && item.kind === 'visual')) throw new Error('compatibility plot completion should remain available as advanced visual API');
  const normalizedCompletions = getCoreSpiritCompletions('sh', { mode:'global', prefix:'sh' }, source);
  if (!normalizedCompletions.some(item => item.label === 'show' && item.kind === 'keyword')) throw new Error('SHOW primary completion missing');

  const mixed = validateCoreSpiritVisualGeometry({
    kind:'line',
    from:{kind:'point',space:'time',x:1,y:2},
    to:{kind:'point',space:'normalized',x:0.2,y:0.8},
  } as any);
  if (!mixed.some(error => error.includes('same coordinate space'))) throw new Error('advanced mixed-coordinate safety rule regressed');

  console.log('STAGE46_UNIVERSAL_SHOW_OK');
}

console.log(runStage46UniversalShowContract());
