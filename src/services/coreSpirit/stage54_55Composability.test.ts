import { compileCoreSpirit } from './coreSpiritPipeline';
import { describeCoreSpiritSurface, normalizeCoreSpiritSource } from './surfaceForms';
import { validateCoreSpiritCompositionGraph, buildCoreSpiritCompositionGraph } from './composability';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';

export function runStage54_55ComposabilityContract() {
  const source = `
indicator "Momentum":
  momentum = ema(close, 20) - ema(close, 50)
  show momentum

model "Regime":
  use "nifty-regime-v3"
  output:
    regime: string
    confidence: number

when Regime.confidence > 0.8 and momentum > 0:
  emit "LONG"

automate "Momentum":
  when "LONG":
    order long 1% risk
`.trim();

  const surface = describeCoreSpiritSurface(source);
  if (!surface.composition) throw new Error('composition metadata missing');
  const parsed = new CoreSpiritParser(normalizeCoreSpiritSource(source)).parseDetailed();
  if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(d=>d.message).join('; '));
  const semantic = analyzeCoreSpirit(parsed.ast,{ surface });
  const graph = buildCoreSpiritCompositionGraph(parsed.ast,semantic,surface);
  const graphErrors = validateCoreSpiritCompositionGraph(graph);
  if (graphErrors.length) throw new Error(graphErrors.join('; '));

  const ids = new Set(graph.nodes.map(node => node.id));
  for (const id of ['indicator:Momentum', 'model:Regime', 'event:LONG', 'automation:Momentum']) {
    if (!ids.has(id)) throw new Error(`composition node missing: ${id}`);
  }
  if (!graph.edges.some(edge => edge.from === 'model:Regime' && edge.relation === 'feeds')) throw new Error('MODEL -> WHEN composition missing');
  if (!graph.edges.some(edge => edge.from.startsWith('condition:') && edge.to === 'event:LONG' && edge.relation === 'triggers')) throw new Error('WHEN -> EVENT composition missing');
  if (!graph.edges.some(edge => edge.to === 'automation:Momentum' && edge.relation === 'triggers')) throw new Error('WHEN -> AUTOMATE composition missing');
  if (!graph.edges.some(edge => edge.from.startsWith('condition:') && edge.to.startsWith('order-intent:') && edge.relation === 'triggers')) throw new Error('CONDITION -> ORDER composition missing');

  const simple = compileCoreSpirit('show ema(close, 20)', 'stage54-simple');
  if (!simple.ir || simple.diagnostics.some(d => d.severity === 'error')) throw new Error('simplest CoreSpirit example failed');

  const advanced = compileCoreSpirit(`
fast = ema(close, 20)
slow = ema(close, 50)
show fast, slow
when crossesAbove(fast, slow):
  emit "LONG"
`, 'stage55-progression');
  if (!advanced.ir || advanced.diagnostics.some(d => d.severity === 'error')) {
    throw new Error(advanced.diagnostics.map(d => d.message).join('; ') || 'progression example failed');
  }

  const normalized = normalizeCoreSpiritSource('when crossesAbove(fast, slow):\n  emit "LONG"');
  if (!normalized.includes('crossover(fast, slow)') || !normalized.includes('emit("LONG");')) {
    throw new Error('simple WHEN/crossing syntax did not converge to core grammar');
  }

  return 'STAGE54_55_COMPOSABILITY_OK';
}

console.log(runStage54_55ComposabilityContract());
