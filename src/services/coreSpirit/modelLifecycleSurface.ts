/**
 * Declarative research/training lifecycle syntax for CoreScript.
 *
 * These directives are control-plane metadata, not executable chart-VM
 * statements. They are parsed separately, then removed before the existing
 * CoreSpirit compiler receives the model/feature program.
 */
export type CoreSpiritModelLifecyclePlan = Readonly<{
  version: 1;
  artifactSymbol?: string;
  training?: Readonly<{
    modelName: string;
    datasetName: string;
    from?: string;
    to?: string;
  }>;
  saveAs?: string;
  loadModelName?: string;
  loadBinding?: string;
}>;

function unquote(value: string): string {
  const text = value.trim();
  if (text.length < 2 || !((text[0] === '"' && text.at(-1) === '"') ||
      (text[0] === "'" && text.at(-1) === "'"))) {
    throw new Error('Expected a quoted string in CoreScript model lifecycle directive.');
  }
  return text.slice(1, -1).replace(/\\([\\\"'nrt])/g, (_match, code: string) =>
    code === 'n' ? '\n' : code === 'r' ? '\r' : code === 't' ? '\t' : code);
}

function validName(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(value)) {
    throw new Error(label + ' must be a valid CoreScript identifier.');
  }
  return value;
}

function validateRange(from: string | undefined, to: string | undefined): void {
  if ((from && !to) || (!from && to)) throw new Error('CoreScript train directive must specify both from and to dates.');
  if (!from || !to) return;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    throw new Error('CoreScript train range must contain valid dates with from < to.');
  }
}

export function parseCoreSpiritModelLifecycleSurface(source: string): CoreSpiritModelLifecyclePlan {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  let artifactSymbol: string | undefined;
  let training: { modelName: string; datasetName: string; from?: string; to?: string } | undefined;
  let saveAs: string | undefined;
  let loadModelName: string | undefined;
  let loadBinding: string | undefined;
  let activeTrainIndent = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const indent = raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;

    const artifactMatch = line.match(/^model\s+artifact\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i);
    if (artifactMatch) {
      if (artifactSymbol) throw new Error('Only one model artifact declaration is allowed per research source.');
      artifactSymbol = validName(artifactMatch[1]!, 'Model artifact name');
      continue;
    }

    const trainMatch = line.match(/^train\s+([A-Za-z_][A-Za-z0-9_]*)\s+using\s+dataset\s*\(\s*("[^"]+"|'[^']+')\s*\)(?:\s+from\s+("[^"]+"|'[^']+'))?(?:\s+to\s+("[^"]+"|'[^']+'))?\s*;?$/i);
    if (trainMatch) {
      if (training) throw new Error('Only one training declaration is supported per research artifact.');
      training = {
        modelName: validName(trainMatch[1]!, 'Training model name'),
        datasetName: unquote(trainMatch[2]!),
        ...(trainMatch[3] ? { from: unquote(trainMatch[3]) } : {}),
        ...(trainMatch[4] ? { to: unquote(trainMatch[4]) } : {}),
      };
      activeTrainIndent = indent;
      validateRange(training.from, training.to);
      continue;
    }

    if (training && activeTrainIndent >= 0 && indent > activeTrainIndent) {
      const fromMatch = line.match(/^from\s+("[^"]+"|'[^']+')\s*;?$/i);
      const toMatch = line.match(/^to\s+("[^"]+"|'[^']+')\s*;?$/i);
      if (fromMatch) {
        if (training.from) throw new Error('Duplicate from date in CoreScript train directive.');
        training = { ...training, from: unquote(fromMatch[1]!) };
        if (training.from && training.to) validateRange(training.from, training.to);
        continue;
      }
      if (toMatch) {
        if (training.to) throw new Error('Duplicate to date in CoreScript train directive.');
        training = { ...training, to: unquote(toMatch[1]!) };
        if (training.from && training.to) validateRange(training.from, training.to);
        continue;
      }
    }
    if (indent <= activeTrainIndent) activeTrainIndent = -1;

    const saveMatch = line.match(/^save\s+([A-Za-z_][A-Za-z0-9_]*)\s+as\s+("[^"]+"|'[^']+')\s*;?$/i);
    if (saveMatch) {
      if (saveAs) throw new Error('Only one save-as model name is supported per research artifact.');
      const modelName = validName(saveMatch[1]!, 'Saved model reference');
      if (training && modelName !== training.modelName) {
        throw new Error('save target must match the model declared in train.');
      }
      saveAs = unquote(saveMatch[2]!);
      if (!saveAs.trim() || saveAs.length > 120) throw new Error('Saved model name must be 1–120 characters.');
      continue;
    }

    const loadMatch = line.match(/^(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*loadModel\s*\(\s*("[^"]+"|'[^']+')\s*\)\s*;?$/i);
    if (loadMatch) {
      if (loadModelName) throw new Error('Only one loadModel binding is supported in a research source.');
      loadBinding = validName(loadMatch[1]!, 'loadModel binding');
      loadModelName = unquote(loadMatch[2]!);
      if (!loadModelName.trim() || loadModelName.length > 120) throw new Error('loadModel requires a non-empty model name or SHA-256 hash.');
    }
  }

  if (training) {
    validateRange(training.from, training.to);
    if (artifactSymbol && artifactSymbol !== training.modelName) {
      throw new Error('model artifact declaration must match the model named by train.');
    }
  }
  return Object.freeze({
    version: 1 as const,
    ...(artifactSymbol ? { artifactSymbol } : {}),
    ...(training ? { training: Object.freeze(training) } : {}),
    ...(saveAs ? { saveAs } : {}),
    ...(loadModelName ? { loadModelName, loadBinding } : {}),
  });
}

/**
 * Strip orchestration-only statements before compilation. If the same source
 * also contains a loadModel binding, compile only the research/model section
 * before that binding; live inference policy belongs to its separate runtime
 * script and must not be silently embedded in the training artifact.
 */
export function lowerCoreSpiritResearchSource(source: string, plan = parseCoreSpiritModelLifecycleSurface(source)): string {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const hasTrainingDirectives = Boolean(plan.artifactSymbol || plan.training || plan.saveAs);
  let limit = lines.length;
  if (hasTrainingDirectives && plan.loadModelName) {
    const loadIndex = lines.findIndex(line => /^(?:\s*let\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*loadModel\s*\(/i.test(line.trim()));
    if (loadIndex >= 0) limit = loadIndex;
  }

  const kept: string[] = [];
  let skipTrainContinuationAtIndent: number | null = null;
  for (let index = 0; index < limit; index += 1) {
    const raw = lines[index]!;
    const line = raw.trim();
    const indent = raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
    if (skipTrainContinuationAtIndent !== null) {
      if (!line || indent > skipTrainContinuationAtIndent && /^(?:from|to)\s+["']/.test(line)) continue;
      skipTrainContinuationAtIndent = null;
    }
    if (/^model\s+artifact\s+[A-Za-z_][A-Za-z0-9_]*\s*;?$/i.test(line)) continue;
    if (/^train\s+[A-Za-z_][A-Za-z0-9_]*\s+using\s+dataset\s*\(/i.test(line)) {
      skipTrainContinuationAtIndent = indent;
      continue;
    }
    if (/^save\\s+[A-Za-z_][A-Za-z0-9_]*\\s+as\\s+["']/i.test(line)) continue;
    kept.push(raw);
  }
  return kept.join('\n').trim();
}
