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
for (const required of ['v53', 'v54', 'v55', 'v56', 'Short version history', '18.28', '18.29', 'Multi-symbol computation', 'Multi-timeframe data', 'external model ABI', 'AI is another model type', 'The model becomes a visualization source', 'Python']) {
  if (!doc.includes(required)) throw new Error(`canonical CoreSpirit document is missing '${required}'`);
}
for (const required of ['Current release', 'Stage tracker', '30 | Multi-symbol computation', '31 | Native multi-timeframe data', '32 | Strict external model ABI', '33 | External model orchestration', '34 | AI model semantics', '35 | Model visualization and explanation surfaces', 'Verification record', 'Next concrete work', 'v53 implementation record', 'v54 implementation record', 'v55 implementation record', 'v56 implementation record']) {
  if (!tracker.includes(required)) throw new Error(`CoreSpirit build tracker is missing '${required}'`);
}
if (validateCoreSpiritRoadmap().length) throw new Error('roadmap must validate before document governance can pass');
if (CORE_SPIRIT_STAGES.length !== 39) throw new Error('roadmap should contain 39 stages after visual compiler/reactive runtime deepening');
console.log('STAGE61_CORESPIRIT_DOC_SPLIT_OK');
