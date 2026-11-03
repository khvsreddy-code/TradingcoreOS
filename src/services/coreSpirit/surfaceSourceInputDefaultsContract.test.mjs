import assert from 'node:assert/strict';
import {
  extractCoreSpiritSurfaceMetadata,
  parseCoreSpiritInputDeclaration,
  parseCoreSpiritDeclarationProperty,
} from './languageConcepts.ts';
import { normalizeCoreSpiritSource } from './syntax.ts';
import { CoreSpiritParser } from './parser.ts';

const bareSource = parseCoreSpiritInputDeclaration('input source = close');
assert.equal(bareSource?.type, 'source');
assert.equal(bareSource?.defval, 'close');

const typedSource = parseCoreSpiritInputDeclaration('input src: source = hlc3');
assert.equal(typedSource?.type, 'source');
assert.equal(typedSource?.defval, 'hlc3');

const aliasSource = parseCoreSpiritInputDeclaration('input priceSource = ohlc4');
assert.equal(aliasSource?.type, 'source');
assert.equal(aliasSource?.defval, 'ohlc4');

const inferredSource = parseCoreSpiritInputDeclaration('input price = close');
assert.equal(inferredSource?.type, 'source', 'a recognized OHLCV default infers source semantics even when the variable has a custom name');
assert.equal(inferredSource?.defval, 'close');

const explicitFloat = parseCoreSpiritInputDeclaration('input length: int = 14 min=1 max=200');
assert.equal(explicitFloat?.type, 'int');
assert.equal(explicitFloat?.defval, 14);

const legacyConstructorInput = parseCoreSpiritInputDeclaration('input length = int(20, min: 1)');
assert.equal(legacyConstructorInput?.type, 'int');
assert.equal(legacyConstructorInput?.defval, 20);
assert.equal(legacyConstructorInput?.min, 1,
  'existing locally-saved drafts using int(default, min: value) remain compilable');


const boolInput = parseCoreSpiritInputDeclaration('input useFilter: bool = true');
assert.equal(boolInput?.type, 'bool');
assert.equal(boolInput?.defval, true);

const stringInput = parseCoreSpiritInputDeclaration('input label: string = "Trend"');
assert.equal(stringInput?.type, 'string');
assert.equal(stringInput?.defval, 'Trend');

assert.throws(() => parseCoreSpiritInputDeclaration('input mode = Close'), /defaults must be numeric, boolean, or quoted strings/);
assert.equal(parseCoreSpiritDeclarationProperty('overlay = true')?.defval, true);
assert.equal(parseCoreSpiritDeclarationProperty('title = "Trend"')?.defval, 'Trend');

assert.equal(parseCoreSpiritInputDeclaration('input lineColor: color = color.green')?.defval, '#089981',
  'typed color inputs should accept known CoreSpirit color constants and normalize them to CSS colors');
assert.equal(parseCoreSpiritInputDeclaration('input lineColor: color = "#ff0000"')?.defval, '#ff0000',
  'quoted CSS colors should remain supported');
assert.equal(parseCoreSpiritDeclarationProperty('format = format.price')?.defval, 'price',
  'format enum defaults should normalize to the property value expected by the renderer');
assert.equal(parseCoreSpiritDeclarationProperty('format = format.volume')?.defval, 'volume');
assert.throws(() => parseCoreSpiritInputDeclaration('input lineColor: color = color.notAColor'), /Unsupported CoreSpirit color default/);


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

const braceSurface = extractCoreSpiritSurfaceMetadata(`
indicator("CoreSpirit Trend") {
    overlay: true
    input length: int = 20 min=1
}

fast = ema(close, length)
plot fast
`);
assert.equal(braceSurface.declarations[0]?.name, 'CoreSpirit Trend',
  'the brace-style indicator declaration emitted by the live editor must be recognized');
assert.deepEqual(braceSurface.inputs?.map(input => [input.key, input.type, input.defval, input.min]), [
  ['length', 'int', 20, 1],
]);
assert.deepEqual(braceSurface.props?.map(prop => [prop.property, prop.defval]), [
  ['overlay', true],
]);

const executableSample = normalizeCoreSpiritSource(`
indicator("CoreSpirit Trend") {
    overlay: true
    input length: int = 20 min=1
}

fast = ema(close, length)
slow = ema(close, length * 2)
plot fast
plot slow

if fast crossesAbove slow {
    signal "BUY"
}

if fast crossesBelow slow {
    signal "SELL"
}
`);
const parsedSample = new CoreSpiritParser(executableSample).parseDetailed();
assert.deepEqual(parsedSample.diagnostics, [],
  'the editor starter sample must normalize to valid CoreSpirit syntax, including nested if-block braces');
assert.equal(
  (executableSample.match(/^\\s*}\\s*$/gm) ?? []).length,
  2,
  'only the two executable if-blocks may contribute closing braces; the indicator declaration close must be removed',
);

console.log('CORESPIRIT_SOURCE_INPUT_DEFAULTS_CONTRACT_OK');
