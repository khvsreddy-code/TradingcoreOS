import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline';
import { describeCoreSpiritSurface, normalizeCoreSpiritSource } from './surfaceForms';
import { CoreSpiritParser } from './parser';
import { CoreSpiritRuntime, type CoreSpiritModelOutputResolver } from './runtime';
import { getCoreSpiritCompletions } from './languageService';

export function runStage49DeclarativeModelSurfaceContract() {
  const source = `
model "Regime":
  use "nifty-regime-v3"

  input:
    price: number
    volume: number
    volatility: number

  output:
    regime: string
    confidence: number

when Regime.confidence > 0.8:
  show Regime
`.trim();

  const surface = describeCoreSpiritSurface(source);
  const model = surface.declarations.find((item) => item.kind === 'model');
  if (!model || model.kind !== 'model') throw new Error('MODEL declaration missing');
  if (model.name !== 'Regime') throw new Error('MODEL name mismatch');
  if (!model.binding || model.binding.kind !== 'registry' || model.binding.locator !== 'nifty-regime-v3') {
    throw new Error('registry model binding missing');
  }
  for (const input of ['price', 'volume', 'volatility']) {
    if (!model.inputs.includes(input)) throw new Error(`MODEL input missing: ${input}`);
  }
  for (const output of ['regime', 'confidence']) {
    if (!model.outputs.includes(output)) throw new Error(`MODEL output missing: ${output}`);
  }
  if (model.outputTypes.regime !== 'string' || model.outputTypes.confidence !== 'number') {
    throw new Error('MODEL output types were not captured');
  }
  if (model.inputTypes.price !== 'number' || model.inputTypes.volume !== 'number') {
    throw new Error('MODEL input types were not captured');
  }

  const pythonSource = `
model "Regime":
  use python "models/regime.py"
  input:
    price
  output:
    confidence: number
`.trim();
  const pythonModel = describeCoreSpiritSurface(pythonSource).declarations.find((item) => item.kind === 'model');
  if (!pythonModel || pythonModel.kind !== 'model' || pythonModel.binding?.kind !== 'python' || pythonModel.binding.locator !== 'models/regime.py') {
    throw new Error('python model binding missing');
  }

  const normalized = normalizeCoreSpiritSource(source);
  if (/^\s*model\s+/mi.test(normalized)) throw new Error('MODEL wrapper leaked into core parser input');
  if (/^\s*use\s+/mi.test(normalized)) throw new Error('MODEL use binding leaked into core parser input');
  if (/^\s*input(?:s)?\s*:/mi.test(normalized)) throw new Error('MODEL input declaration leaked into core parser input');
  if (/^\s*output(?:s)?\s*:/mi.test(normalized)) throw new Error('MODEL output declaration leaked into core parser input');
  if (!normalized.includes('if (model("Regime").confidence > 0.8) {')) {
    throw new Error('MODEL qualified output reference did not lower to the core expression grammar');
  }
  if (!normalized.includes('show("model", model("Regime"), chart.price);')) {
    throw new Error('SHOW MODEL projection did not lower through the universal SHOW primitive');
  }

  const unknownOutputSource = `
model "Regime":
  output:
    confidence: number

when Regime.unknown > 0.8:
  show Regime
`.trim();
  const unknownOutput = compileCoreSpirit(unknownOutputSource, 'stage49-model-unknown-output');
  if (!unknownOutput.diagnostics.some((d) => d.severity === 'error' && /unknown|output/i.test(d.message))) {
    throw new Error('invalid MODEL output reference was not rejected');
  }

  const completions = getCoreSpiritCompletions('', {
    mode: 'member',
    cursor: source.indexOf('Regime.confidence') + 'Regime.'.length,
  }, source);
  if (!completions.some((item) => item.label === 'confidence')) {
    throw new Error('MODEL output completion did not expose declarative outputs');
  }

  const compiled = compileCoreSpirit(source, 'stage49-model-surface');
  if (!compiled.ir) throw new Error(compiled.diagnostics.map((d) => d.message).join('; '));
  if (!compiled.ir.surface?.declarations.some((item) => item.kind === 'model')) throw new Error('MODEL surface metadata did not attach to executable IR');
  const hasModelCall = compiled.ir.entry.instructions.some((instruction: any) =>
    instruction.op === 'call' && instruction.name === 'model',
  );
  const hasModelGet = compiled.ir.entry.instructions.some((instruction: any) =>
    instruction.op === 'call' && instruction.name === '__model_get',
  );
  const hasModelShow = compiled.ir.entry.instructions.some((instruction: any) =>
    instruction.op === 'emit' && instruction.kind === 'show',
  );
  if (!hasModelCall || !hasModelGet || !hasModelShow) throw new Error('MODEL surface did not converge into shared Core IR');

  const resolver: CoreSpiritModelOutputResolver = ({ modelName, field, binding }) => {
    if (modelName !== 'Regime') throw new Error(`unexpected model ${modelName}`);
    if (!binding || binding.kind !== 'registry' || binding.locator !== 'nifty-regime-v3') {
      throw new Error('host resolver did not receive opaque MODEL binding metadata');
    }
    if (field === 'confidence') return 0.91;
    if (field === '*') return { regime: 'TREND', confidence: 0.91 };
    return 'TREND';
  };

  const runtime = new CoreSpiritRuntime({
    sourceId: 'stage49-model-surface',
    modelOutputResolver: resolver,
    executionMode: 'historical',
  });
  const parser = new CoreSpiritParser(normalized);
  const parsed = parser.parseDetailed();
  if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map((d) => d.message).join('; '));

  runtime.loadProgram({
    version: 1,
    id: 'stage49-model-surface',
    source: normalized,
    ast: parsed.ast,
    surface,
  });

  const result = runtime.executeBar({
    timestamp: '2026-09-27T09:15:00Z',
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000,
  });
  if (!result.outputs.some((output) => output.kind === 'customVisual' && output.metadata?.semanticRole === 'model')) {
    throw new Error('SHOW MODEL did not reach runtime visual projection');
  }

  // `executeCoreSpirit` remains the same generic public path; it has no host
  // resolver by default and therefore does not fabricate external model output.
  const generic = executeCoreSpirit('show close on price', [{
    timestamp: '2026-09-27T09:15:00Z', open: 100, high: 101, low: 99, close: 100.5, volume: 1000,
  }], 'stage49-generic');
  if (!generic.outputs.length) throw new Error('generic runtime regression');

  return 'STAGE49_DECLARATIVE_MODEL_SURFACE_OK';
}

console.log(runStage49DeclarativeModelSurfaceContract());
