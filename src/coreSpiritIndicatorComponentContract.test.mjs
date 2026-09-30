import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const assert = (value, message) => { if (!value) throw new Error(message); };

const file = 'src/services/coreSpirit/coreSpiritIndicatorComponent.ts';
assert(exists(file), 'CoreSpirit first-class indicator component implementation missing');
const src = read(file);
for (const token of [
  'CoreSpiritIndicatorComponent',
  'CoreSpiritIndicatorAuthoringOptions',
  'settingsSchema',
  'calculation:',
  'state:',
  'events:',
  'plots:',
  'visuals:',
  'alerts:',
  'metadata:',
  'createCoreSpiritIndicatorComponent',
  'CoreSpiritIndicatorRegistry',
  "kind: 'indicator'",
  'compileCoreSpirit(source',
  'coreSpiritComponentRegistry.register',
]) assert(src.includes(token), `first-class indicator component contract missing '${token}'`);
assert(src.includes("eligibleBackends: Object.freeze(stateful ? ['cpu']") && src.includes("['cpu', 'wasm', 'gpu']"), 'indicator backend eligibility boundary missing');
assert(src.includes('incrementalEligible'), 'indicator incremental eligibility metadata missing');
assert(src.includes('rendererNeutral: true'), 'renderer-neutral visual boundary missing');
assert(src.includes('validateCoreSpiritIndicatorComponent'), 'indicator validation guard missing');
console.log('CORESPIRIT_V111_INDICATOR_COMPONENT_CONTRACT_OK');
