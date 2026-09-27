import { normalizeCoreSpiritSource, describeCoreSpiritSurface } from './surfaceForms';
import { CORE_SPIRIT_LANGUAGE_CONCEPTS } from './languageConcepts';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import { getCoreSpiritLanguageConcepts } from './languageService';

function assertIncludes(text: string, fragment: string, message: string) {
  if (!text.includes(fragment)) throw new Error(message);
}

export function runStage45SixConceptLanguageContract() {
  const source = `
indicator "Momentum":
  fast = ema(close, 20)
  slow = ema(close, 50)
  r = rsi(close, 14)

  show fast, slow on price
  show r on panel("Momentum")

  when crossesAbove(fast, slow):
    signal "LONG"

model "Regime":
  features:
    momentum = ema(close, 20)
    volatility = stdev(close, 20)
  predict regime

automate "Momentum":
  when "LONG":
    buy(1, "entry")
`;

  const metadata = describeCoreSpiritSurface(source);
  if (metadata.version !== 1) throw new Error('surface metadata version mismatch');
  if (metadata.primaryConcept !== 'mixed') throw new Error('mixed source was not classified as mixed');
  for (const concept of CORE_SPIRIT_LANGUAGE_CONCEPTS) {
    if (!metadata.concepts.includes(concept)) throw new Error(`concept ${concept} was not discovered`);
  }
  const model = metadata.declarations.find(x => x.kind === 'model');
  if (!model || model.kind !== 'model' || model.name !== 'Regime' || !model.features.includes('momentum') || !model.predictions.includes('regime')) {
    throw new Error('model declaration metadata is incomplete');
  }
  const automation = metadata.declarations.find(x => x.kind === 'automation');
  if (!automation || automation.kind !== 'automation' || !automation.triggers.includes('"LONG"')) {
    throw new Error('automation trigger metadata is incomplete');
  }

  const normalized = normalizeCoreSpiritSource(source);
  assertIncludes(normalized, 'show("series", fast, chart.price);', 'SHOW price lowering failed');
  assertIncludes(normalized, 'show("series", slow, chart.price);', 'SHOW multi-value lowering failed');
  assertIncludes(normalized, 'show("series", r, panel("Momentum"));', 'SHOW panel lowering failed');
  assertIncludes(normalized, 'if (crossover(fast, slow)) {', 'WHEN condition lowering failed');
  assertIncludes(normalized, 'if (event("LONG")) {', 'WHEN event lowering failed');
  if (normalized.includes('plot(fast, chart.price);')) throw new Error('SHOW regressed to compatibility plot lowering');
  if (/^\s*model\s+/mi.test(normalized) || /^\s*automate\s+/mi.test(normalized)) throw new Error('model/automation wrappers leaked into core parser input');
  if (/^\s*predict\s+/mi.test(normalized) || /^\s*features\s*:/mi.test(normalized)) throw new Error('declaration-only model syntax leaked into core parser input');

  const indicatorSource = `
    indicator "Momentum":
      fast = ema(close, 20)
      slow = ema(close, 50)
      show fast, slow on price
      when crossesAbove(fast, slow):
        signal "LONG"
  `;
  const parsed = new CoreSpiritParser(normalizeCoreSpiritSource(indicatorSource)).parseDetailed();
  if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(d => d.message).join('; '));
  const compiled = new CoreSpiritCompiler().compile(parsed.ast, 'stage45:indicator', { layer: 'script', surface: describeCoreSpiritSurface(indicatorSource) });
  if (!compiled.ir) throw new Error(compiled.diagnostics.map(d => d.message).join('; '));
  if (!compiled.ir.surface?.concepts.includes('SHOW') || !compiled.ir.surface?.concepts.includes('WHEN')) throw new Error('surface metadata was not attached to executable IR');

  const automationSource = `
    automate "Momentum":
      when "LONG":
        buy(1, "entry")
  `;
  const automationParsed = new CoreSpiritParser(normalizeCoreSpiritSource(automationSource)).parseDetailed();
  if (automationParsed.diagnostics.length) throw new Error(automationParsed.diagnostics.map(d => d.message).join('; '));
  const automationCompiled = new CoreSpiritCompiler().compile(automationParsed.ast, 'stage45:automation', { layer: 'automation', surface: describeCoreSpiritSurface(automationSource) });
  if (!automationCompiled.ir) throw new Error(automationCompiled.diagnostics.map(d => d.message).join('; '));
  const automationRuntime = new CoreSpiritRuntime({
    sourceId: 'stage45:automation',
    layer: 'automation',
    executionMode: 'historical',
    eventResolver: eventName => eventName === 'LONG',
  });
  automationRuntime.loadProgram({ version:1, id:'stage45:automation', source:normalizeCoreSpiritSource(automationSource), ast:automationParsed.ast, surface:describeCoreSpiritSurface(automationSource) });
  const result = automationRuntime.executeBar({ timestamp:'2026-09-26T10:00:00Z', open:100, high:101, low:99, close:100.5, volume:1000 });
  if (!result.outputs.some(output => output.kind === 'orderIntent')) throw new Error('automation WHEN event did not reach order-intent creation');

  const conceptCompletion = getCoreSpiritLanguageConcepts();
  if (conceptCompletion.length !== 6 || !conceptCompletion.some(item => item.concept === 'SHOW') || !conceptCompletion.some(item => item.concept === 'AUTOMATE')) {
    throw new Error('language-service concept model is incomplete');
  }

  return 'STAGE45_SIX_CONCEPT_LANGUAGE_OK';
}

console.log(runStage45SixConceptLanguageContract());
