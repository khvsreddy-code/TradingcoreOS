import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CORE_SPIRIT_STAGES, validateCoreSpiritRoadmap } from './coreSpiritRoadmap';

const projectRoot = join(process.cwd());
const docs = readdirSync(join(projectRoot, 'docs')).filter(name => /^CORESPIRIT.*\.md$/i.test(name));
const expected = ['CORESPIRIT.md', 'CORESPIRIT_BUILD_TRACKER.md'];
if (docs.length !== expected.length || expected.some(name => !docs.includes(name))) throw new Error(`CoreSpirit must have exactly the architecture doc + build tracker; found: ${docs.join(', ')}`);
if (!existsSync(join(projectRoot, 'docs', 'CORESPIRIT.md'))) throw new Error('canonical CoreSpirit architecture document missing');
if (!existsSync(join(projectRoot, 'docs', 'CORESPIRIT_BUILD_TRACKER.md'))) throw new Error('CoreSpirit build tracker missing');
const doc = readFileSync(join(projectRoot, 'docs', 'CORESPIRIT.md'), 'utf8');
const tracker = readFileSync(join(projectRoot, 'docs', 'CORESPIRIT_BUILD_TRACKER.md'), 'utf8');
for (const required of ['v53', 'v54', 'v55', 'v56', 'Short version history', '18.28', '18.29', 'Multi-symbol computation', 'Multi-timeframe data', 'external model ABI', 'AI is another model type', 'The model becomes a visualization source', 'Python', 'v61', 'v62', 'v63', 'CoreSpirit v1', 'Programmable visual coordinate system', 'Core language unification', 'six-concept language', 'universal SHOW visual primitive', 'coordinate inference', 'single surface pipeline', 'Scene Graph encapsulation', 'visual projection boundary', 'Powerful underneath, inferred above', 'DATA', 'LET', 'WHEN', 'SHOW', 'MODEL', 'AUTOMATE', 'deterministic replay', 'reactive runtime', 'scene graph', 'declarative MODEL', 'model surface', 'model binding', 'model output', 'ABI remains internal', 'typed MODEL fields', 'opaque model binding', 'MODEL output completion', 'universal EVENT boundary', 'central reactive construct', 'one event concept, many destinations', 'one reactive construct, many event sources', 'Standard library discoverability', 'Readable surface syntax', 'Complexity firewall', 'invisible superpowers', 'crossesAbove', 'crossesBelow', 'market(\"NIFTY\").close']) {
  if (!doc.includes(required)) throw new Error(`canonical CoreSpirit document is missing '${required}'`);
}
for (const required of ['Current release', 'Stage tracker', '30 | Multi-symbol computation', '31 | Native multi-timeframe data', '32 | Strict external model ABI', '33 | External model orchestration', '34 | AI model semantics', '35 | Model visualization and explanation surfaces', 'Verification record', 'Next concrete work', 'v53 implementation record', 'v54 implementation record', 'v55 implementation record', 'v56 implementation record', 'v61 implementation record', 'v62 implementation record', '42 | CoreSpirit v1 converged runtime', '43 | Programmable visual coordinate system', '44 | Core language unification', '45 | Six-concept language surface', '46 | Universal SHOW visual primitive', '47 | Universal SHOW surface + coordinate inference', '48 | Scene graph encapsulation', '49 | Declarative MODEL surface', 'STAGE42_CORESPIRIT_V1_RUNTIME_OK', 'STAGE43_VISUAL_COORDINATE_SYSTEM_OK', 'STAGE44_LANGUAGE_UNIFICATION_OK', 'STAGE45_SIX_CONCEPT_LANGUAGE_OK', 'STAGE47_UNIVERSAL_SHOW_SURFACE_OK', 'STAGE48_SCENE_GRAPH_ENCAPSULATION_OK', 'STAGE49_DECLARATIVE_MODEL_SURFACE_OK', '52 | Universal EVENT emission and routing', '53 | WHEN as the central reactive construct', '56 | Standard library discoverability', '57 | Readable surface syntax', '58 | Compiler complexity absorption', '59 | Progressive authoring levels', 'STAGE52_53_EVENT_WHEN_OK', 'STAGE56_57_STDLIB_READABILITY_OK']) {
  if (!tracker.includes(required)) throw new Error(`CoreSpirit build tracker is missing '${required}'`);
}
if (validateCoreSpiritRoadmap().length) throw new Error('roadmap must validate before document governance can pass');
if (CORE_SPIRIT_STAGES.length !== 59) throw new Error('roadmap should contain 59 stages after compiler complexity absorption and progressive authoring levels');
console.log('STAGE61_CORESPIRIT_DOC_SPLIT_OK');
