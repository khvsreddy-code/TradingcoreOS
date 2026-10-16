import assert from 'node:assert/strict';
import {
  extractCoreSpiritSurfaceMetadata,
  parseCoreSpiritInputDeclaration,
  parseCoreSpiritDeclarationProperty,
} from './languageConcepts.ts';

const bareSource = parseCoreSpiritInputDeclaration('input source = close');
assert.equal(bareSource?.type, 'source');
assert.equal(bareSource?.defval, 'close');

const typedSource = parseCoreSpiritInputDeclaration('input src: source = hlc3');
assert.equal(typedSource?.type, 'source');
assert.equal(typedSource?.defval, 'hlc3');

const aliasSource = parseCoreSpiritInputDeclaration('input priceSource = ohlc4');
assert.equal(aliasSource?.type, 'source');
assert.equal(aliasSource?.defval, 'ohlc4');

const explicitFloat = parseCoreSpiritInputDeclaration('input length: int = 14 min=1 max=200');
assert.equal(explicitFloat?.type, 'int');
assert.equal(explicitFloat?.defval, 14);

const boolInput = parseCoreSpiritInputDeclaration('input useFilter: bool = true');
assert.equal(boolInput?.type, 'bool');
assert.equal(boolInput?.defval, true);

const stringInput = parseCoreSpiritInputDeclaration('input label: string = "Trend"');
assert.equal(stringInput?.type, 'string');
assert.equal(stringInput?.defval, 'Trend');

assert.throws(() => parseCoreSpiritInputDeclaration('input mode = Close'), /defaults must be numeric, boolean, or quoted strings/);
assert.equal(parseCoreSpiritDeclarationProperty('overlay = true')?.defval, true);
assert.equal(parseCoreSpiritDeclarationProperty('title = "Trend"')?.defval, 'Trend');

const surface = extractCoreSpiritSurfaceMetadata(`
indicator "Source selector"
    input source = close
    input length: int = 14 min=1 max=200
    plot(ema(source, length))
`);
assert.deepEqual(surface.inputs?.map(input => [input.key, input.type, input.defval]), [
  ['source', 'source', 'close'],
  ['length', 'int', 14],
]);

console.log('CORESPIRIT_SOURCE_INPUT_DEFAULTS_CONTRACT_OK');
