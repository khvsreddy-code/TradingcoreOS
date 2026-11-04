import assert from 'node:assert/strict';
import { compileCoreSpirit, parseCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { normalizeCoreSpiritSource } from './services/coreSpirit/syntax.ts';
import { readCoreScriptEdition } from './services/coreSpirit/languageEdition.ts';
import { validateCoreSpiritIr } from './services/coreSpirit/irContract.ts';

const compact = `edition@1.2
plot vwap() color=white width=1 style=line`;
const expanded = `edition@1.2
plot(vwap(), "white", 1, 0, null);`;

assert.equal(readCoreScriptEdition(compact).edition, '1.2');
assert.equal(readCoreScriptEdition('plot(vwap());').edition, '1.0');
assert.equal(normalizeCoreSpiritSource(compact), normalizeCoreSpiritSource(expanded),
  'v1.2 shorthand must lower to the exact canonical source form');
assert.deepEqual(parseCoreSpirit(compact), parseCoreSpirit(expanded),
  'compact and expanded source must produce the same canonical AST');

const compactResult = compileCoreSpirit(compact, 'corescript-v12-compact');
const expandedResult = compileCoreSpirit(expanded, 'corescript-v12-expanded');
assert.deepEqual(compactResult.diagnostics.filter(d => d.severity === 'error'), []);
assert.deepEqual(expandedResult.diagnostics.filter(d => d.severity === 'error'), []);
assert.ok(compactResult.ir && expandedResult.ir, 'both source forms must produce executable IR');
assert.equal(compactResult.ir.languageVersion, 1, 'the stable IR language ABI must not be bumped by a source edition');
assert.equal(compactResult.ir.languageEdition, '1.2');
assert.equal(expandedResult.ir.languageEdition, '1.2');
assert.deepEqual(compactResult.ir.entry.instructions, expandedResult.ir.entry.instructions,
  'equivalent surface forms must compile to identical VM instructions');
assert.ok(validateCoreSpiritIr(compactResult.ir));

const legacy = compileCoreSpirit('plot(vwap());', 'corescript-v10-legacy');
const explicitV10 = compileCoreSpirit('edition@1.0\nplot(vwap());', 'corescript-v10-explicit');
assert.ok(legacy.ir && explicitV10.ir);
assert.equal(legacy.ir.languageEdition, '1.0');
assert.equal(explicitV10.ir.languageEdition, '1.0');
assert.deepEqual(legacy.diagnostics.filter(d => d.severity === 'error'), []);
assert.deepEqual(explicitV10.diagnostics.filter(d => d.severity === 'error'), []);

for (const [source, code] of [
  ['edition@1.3\nplot(vwap());', 'EDITION_UNSUPPORTED'],
  ['plot(vwap());\nedition@1.2', 'EDITION_HEADER_POSITION'],
  ['edition@1.2\nedition@1.0\nplot(vwap());', 'EDITION_DUPLICATE'],
  ['edition@one.two\nplot(vwap());', 'EDITION_HEADER_SYNTAX'],
]) {
  const result = compileCoreSpirit(source, 'corescript-invalid-edition-' + code);
  assert.ok(result.diagnostics.some(d => d.code === code), 'expected ' + code + ' for source: ' + source);
  assert.equal(result.artifact, undefined, 'invalid editions must never produce an executable artifact');
}

const v10CompactMustNotBeReinterpreted = compileCoreSpirit(
  'edition@1.0\nplot vwap() color=white width=1 style=line',
  'corescript-v10-no-v12-sugar',
);
assert.ok(!v10CompactMustNotBeReinterpreted.artifact,
  'v1.2 shorthand must not silently change the grammar of edition 1.0');

console.log('CORESCRIPT_EDITION_V12_FOUNDATION_OK');
