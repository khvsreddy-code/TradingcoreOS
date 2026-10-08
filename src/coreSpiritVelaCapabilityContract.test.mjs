import assert from 'node:assert/strict';
import { extractCoreSpiritSurfaceMetadata } from './services/coreSpirit/languageConcepts.ts';
import { normalizeCoreSpiritSource } from './services/coreSpirit/surfaceForms.ts';

const source = `
indicator "Trend"
    input fastLength: int = 20 min=1 max=500
    input slowLength: int = 50 min=2 max=1000
    precision = 2
    overlay = true
    plot(ema(close, fastLength))

strategy "Momentum"
    initialCapital = 100000
    commission = 0.03
`;

const surface = extractCoreSpiritSurfaceMetadata(source);
assert.equal(surface.inputs?.length, 2);
assert.deepEqual(surface.inputs?.map(input => input.key), ['fastLength','slowLength']);
assert.equal(surface.inputs?.[0]?.type, 'int');
assert.equal(surface.inputs?.[0]?.defval, 20);
assert.equal(surface.inputs?.[0]?.min, 1);
assert.equal(surface.inputs?.[0]?.max, 500);
assert.deepEqual(surface.props?.map(prop => prop.property), ['precision','overlay','initialCapital','commission']);
assert.equal(surface.props?.find(prop => prop.property === 'precision')?.defval, 2);
assert.equal(surface.props?.find(prop => prop.property === 'initialCapital')?.defval, 100000);
assert.equal(surface.declarations.find(item => item.name === 'Momentum')?.role, 'strategy');

const normalized = normalizeCoreSpiritSource(source);
assert.match(normalized, /let fastLength = __input\("fastLength", 20\);/);
assert.match(normalized, /let slowLength = __input\("slowLength", 50\);/);
assert.doesNotMatch(normalized, /precision\s*=\s*2/);
assert.doesNotMatch(normalized, /initialCapital\s*=\s*100000/);

const engine = await import('../src/CoreSpiritVelaEngine.ts');
assert.equal(engine.CoreSpiritVelaEngine.prototype.capabilities, undefined, 'capabilities must be an instance field, not a prototype field');
const instance = new engine.CoreSpiritVelaEngine();
assert.deepEqual(instance.capabilities, { streaming:true, visibleRange:true, inputs:true, props:true });

const metadata = await instance.prepare(source, 'contract:vela-capability');
assert.equal(metadata.inputs.length, 2);
assert.equal(metadata.inputs[0].key, 'fastLength');
assert.equal(metadata.props?.length, 4);
assert.equal(metadata.reactsToViewport, false);

const viewportSource = `
indicator "Viewport Profile"
    input rows: int = 24 min=2 max=400 step=1 title="Profile Rows"
    plot(vpvr(rows))
`;
const viewportPrepared = await instance.prepare(viewportSource, 'contract:vela-viewport-capability');
assert.equal(viewportPrepared.reactsToViewport, true);
assert.equal(viewportPrepared.inputs[0].key, 'rows');
assert.equal(viewportPrepared.inputs[0].min, 2);
assert.equal(viewportPrepared.inputs[0].max, 400);
assert.equal(viewportPrepared.inputs[0].title, 'Profile Rows');

console.log('CORESPIRIT_VELA_FULL_CAPABILITY_CONTRACT_OK');
