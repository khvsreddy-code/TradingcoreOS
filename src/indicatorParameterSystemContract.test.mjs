import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (v, m) => { if (!v) throw new Error(m); };
const schema = read('src/services/coreSpirit/indicatorSettingsSchema.ts');
const panel = read('src/components/indicators/IndicatorSettingsPanel.tsx');
const component = read('src/services/coreSpirit/coreSpiritIndicatorComponent.ts');
const workspace = read('src/services/workspace/workspaceState.ts');
const publication = read('src/services/coreSpirit/indicatorPublicationService.ts');
for (const token of [
  "INDICATOR_SETTINGS_SCHEMA_VERSION = 3",
  "IndicatorParameterType",
  "IndicatorParameterDefinition",
  "dependency?: IndicatorSettingCondition",
  "visibilityCondition?: IndicatorSettingCondition",
  "group?: string",
  "tooltip?: string",
  "validation?: IndicatorSettingValidation",
  "parameters: readonly IndicatorParameterDefinition[]",
  "evaluateIndicatorSettingCondition",
  "validateIndicatorSettingValue",
  "source",
  "timeframe",
  "symbol",
  "session",
  "price",
  "duration",
  "decimal",
]) assert(schema.includes(token), `parameter schema missing '${token}'`);
for (const token of [
  "field.kind === 'enum'",
  "field.kind === 'source'",
  "field.kind === 'timeframe'",
  "field.kind === 'symbol'",
  "field.kind === 'session'",
  "field.kind === 'price' || field.kind === 'decimal'",
  "field.kind === 'duration'",
  "field.kind === 'decimal'",
  'resolveIndicatorParameterState',
  'parameterState.visible',
  'parameterState.enabled',
  'validateIndicatorSettingValue',
  'field.tooltip',
  'field.group',
]) assert(panel.includes(token), `universal editor missing '${token}'`);
assert(component.includes('parameters = Object.freeze([...settingsSchema.parameters])'), 'indicator component does not expose canonical parameter ABI');
assert(component.includes('parameters,\n    declaration:'), 'indicator component return does not carry parameters');
assert(component.includes('outputs,\n      parameters,\n      calculation,'), 'indicator declaration does not carry parameters');
assert(workspace.includes('indicator-settings-v9'), 'workspace settings version was not advanced for parameter ABI');
assert(publication.includes('parameterSchema: schemaSnapshot.parameters'), 'publication does not expose canonical parameter schema');
for (const token of ['buildIndicatorParameterDependencyGraph','getIndicatorParameterDependents','dependencyGraph','enabledWhen','visibilityCondition']) assert(schema.includes(token),`parameter dependency graph missing ${token}`);
for (const token of ['number','integer','decimal','boolean','enum','color','source','timeframe','symbol','session','price','duration','string']) assert(schema.includes(`'${token}'`),`universal parameter kind missing ${token}`);
for (const token of ['min','max','step','defaultValue','group','tooltip','dependency','validation']) assert(schema.includes(token),`universal parameter constraint '${token}' missing`);
assert(schema.includes('dependencyGraph'), 'resolved parameter state must expose its dependency graph');
console.log('TCO_V114_UNIVERSAL_PARAMETER_SYSTEM_CONTRACT_OK');

for (const token of ['must be text','must be numeric','must be boolean','valid color value','unsupported timeframe format','HHMM-HHMM']) assert(schema.includes(token), `parameter value-domain guard missing '${token}'`);
