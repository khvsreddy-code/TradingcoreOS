import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const assert=(v,m)=>{if(!v)throw new Error(m)};
const service=read('src/services/coreSpirit/indicatorPresetSystem.ts');
const panel=read('src/components/indicators/IndicatorSettingsPanel.tsx');
for(const token of ['IndicatorPresetScope','factory','script','personal','workspace','community','serializeIndicatorPreset','deserializeIndicatorPreset','createIndicatorPresetProfile','saveIndicatorPresetProfile','loadIndicatorPresetProfile','resolveIndicatorPresetStack','indicator-presets-v1']) assert(service.includes(token),`preset system missing ${token}`);
for(const token of ['listIndicatorPresets','createIndicatorPreset','saveIndicatorPreset','applyIndicatorPreset','profileId','presetScope']) assert(panel.includes(token),`preset editor missing ${token}`);
assert(service.includes('id: `factory:${preset.schemaId}`'),'factory preset identity must be deterministic');
assert(service.includes('id: `template:${schema.id}:${template.toLowerCase()}`'),'template preset identity must be deterministic');
for (const token of ['indicatorPresetProfileFingerprint','setActiveIndicatorPreset','activePresetByIndicator','createIndicatorPresetBundle','serializeIndicatorPresetBundle','deserializeIndicatorPresetBundle']) assert(service.includes(token),`deep preset lifecycle missing ${token}`);
assert(service.includes("preset.scope !== 'personal' && preset.scope !== 'workspace'"), 'preset writer scope isolation missing');
assert(service.includes('slice(-64)'), 'local preset store must be bounded');
assert(service.includes('slice(-128)'), 'profile preset set must be bounded');
assert(service.includes('updatedAt.localeCompare'), 'preset resolution must be deterministic');

assert(service.includes('activeProfile?.activePresetByIndicator'),'active profile selection must participate in resolution');
assert(service.includes('indicatorPresetProfileFingerprint'),'profile fingerprint function missing');
console.log('TCO_V114_INDICATOR_PRESET_SYSTEM_CONTRACT_OK');

assert(service.includes("candidate.scope !== 'workspace' && candidate.scope !== 'personal'"), 'active preset selection must reject read-only community presets');
