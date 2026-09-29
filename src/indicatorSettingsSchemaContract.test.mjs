import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const schema = read('src/services/coreSpirit/indicatorSettingsSchema.ts');
const panel = read('src/components/indicators/IndicatorSettingsPanel.tsx');
const dock = read('src/components/workspace/IndicatorDock.tsx');
const live = read('src/components/workspace/LiveChart.tsx');
const workspace = read('src/services/workspace/workspaceState.ts');
const engine = read('src/services/marketData/indicatorEngine.ts');
const publication = read('src/services/coreSpirit/indicatorPublicationService.ts');
const studio = read('src/components/indicators/IndicatorSourceEditor.tsx');
const roadmap = read('src/services/coreSpirit/coreSpiritRoadmap.ts');

assert(exists('docs/INDICATOR_SETTINGS_SCHEMA.md'), 'canonical indicator settings schema document missing');
for (const section of ['inputs', 'style', 'display', 'behavior', 'alerts', 'visualization']) assert(schema.includes(`id: '${section}'`), `schema section ${section} missing`);
for (const contract of ['identity', 'layout', 'outputs', 'capabilities', 'sections']) assert(schema.includes(contract), `schema contract member ${contract} missing`);
for (const kind of ['integer', 'number', 'select', 'color', 'range', 'boolean', 'text']) assert(schema.includes(`'${kind}'`), `schema field kind ${kind} missing`);
assert(schema.includes('visibleWhen'), 'schema conditional visibility missing');
assert(schema.includes('advanced?: boolean'), 'schema advanced-level field missing');
assert(schema.includes('SAFE_SETTING_PATH') && schema.includes('UNSAFE_SETTING_SEGMENTS'), 'schema path hardening missing');
assert(schema.includes('schema.identity.kind !== kind'), 'custom schema identity must match the indicator kind');
assert(schema.includes('unsupported settings section'), 'schema section identity must be runtime-validated');
assert(schema.includes('if (!isSafeSettingPath(path)) return {};'), 'nested writer does not reject unsafe paths defensively');
assert(schema.includes('const patch: Record<string, unknown> = {};') && schema.includes('writeIndicatorSettingValue(patch,'), 'nested default patch merge must preserve siblings');

assert(panel.includes('getIndicatorSettingsSchema'), 'universal panel is not schema-driven');
assert(panel.includes('writeIndicatorSettingValue'), 'universal panel does not write by schema path');
assert(panel.includes('matchesVisibility'), 'universal panel does not implement declarative visibility');
assert(panel.includes('showAdvanced'), 'universal panel does not expose advanced/basic complexity control');
for (const forbidden of ["x.kind === 'MACD'", "x.kind==='MACD'", 'periodKinds', 'sourceKinds', 'supportsSource']) assert(!panel.includes(forbidden), `manual indicator UI branch remains in universal panel: ${forbidden}`);

assert(dock.includes('IndicatorSettingsPanel'), 'indicator dock lost universal settings panel');
assert(!dock.includes('periodKinds') && !dock.includes('sourceKinds'), 'indicator dock retains manual settings category lists');
assert(live.includes('IndicatorSettingsPanel'), 'live chart is not using the universal settings panel');
assert(live.includes('buildIndicatorSettingsSnapshot'), 'live chart does not observe schema-derived settings changes');
assert(!live.includes('Chart indicators · TradingView-style settings'), 'live chart still labels settings as vendor-specific');
assert(!live.includes('supportsSource('), 'live chart still has a second manual source-settings registry');

assert(engine.includes('settingsSchema?: IndicatorSettingsSchema'), 'indicator config lacks schema attachment contract');
assert(engine.includes('CORE_PRICE_SOURCE_OPTIONS'), 'engine and schema do not share price-source options');
assert(workspace.includes("indicator-settings-v7"), 'workspace indicator settings version was not advanced');
assert(workspace.includes('getIndicatorSettingsSchema') && workspace.includes('writeIndicatorSettingValue'), 'workspace normalization is not schema-driven');

assert(publication.includes('buildIndicatorSettingsSnapshot'), 'publication service does not build canonical settings schema snapshots');
assert(publication.includes('settingsSchema: schemaSnapshot.schema'), 'publication snapshot does not persist the schema');
assert(publication.includes('settingsSchema: draftSettings?.schema'), 'draft metadata does not retain schema metadata');
assert(studio.includes('getIndicatorSettingsSchema'), 'indicator studio does not attach schema metadata to saved drafts');

const stageIds = [...roadmap.matchAll(/id:\s*(\d+),/g)].map(m => Number(m[1]));
assert(stageIds.includes(145), 'roadmap stage 145 missing');
assert(roadmap.includes('CORE_SPIRIT_STAGES.length !== 145'), 'roadmap length gate was not updated to 145');
assert(stageIds.filter(id => id >= 131 && id <= 145).length === 15, 'roadmap stages 131-145 are incomplete');
console.log('TCO_V109_INDICATOR_SCHEMA_CONTRACT_OK');
