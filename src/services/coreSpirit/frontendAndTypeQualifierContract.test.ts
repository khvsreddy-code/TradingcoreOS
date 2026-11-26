import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from './compiler.ts';
import { getCoreSpiritFrontend, parseWithCoreSpiritFrontend, CoreScriptFrontend } from './frontends.ts';
import { semanticTypeForDeclaredName, semanticTypeQualifier } from './semanticTypeSystem.ts';

assert.ok(getCoreSpiritFrontend('corescript') instanceof CoreScriptFrontend);
const parsed=parseWithCoreSpiritFrontend('corescript','let trend = ema(close, 9)');
assert.ok(parsed.ast);
assert.equal(parsed.frontend,'corescript');
assert.equal(parsed.diagnostics.length,0);
const pine=parseWithCoreSpiritFrontend('pine-v6','//@version=6\nplot(close)');
assert.equal(pine.ast,undefined);
assert.equal(pine.diagnostics[0]?.code,'FRONTEND_NOT_REGISTERED');
assert.match(pine.diagnostics[0]?.message ?? '',/not registered.*not parsed as CoreScript/i);

const valid=new CoreSpiritCompiler().compileSource('let constant: const<float> = 10','qualifier-constant');
assert.ok(valid.ir,valid.diagnostics.map(d=>d.code+': '+d.message).join('\n'));
const invalid=new CoreSpiritCompiler().compileSource('let dailyPrice: simple<float> = close','qualifier-series-to-simple');
assert.equal(invalid.ir,undefined);
assert.ok(invalid.diagnostics.some(d=>d.code==='TYPE_QUALIFIER_MISMATCH'),invalid.diagnostics.map(d=>d.code+': '+d.message).join('\n'));
assert.equal(semanticTypeForDeclaredName('simple<float>')?.qualifier,'simple');
assert.equal(semanticTypeQualifier(semanticTypeForDeclaredName('series<float>')),'series');
assert.equal(semanticTypeForDeclaredName('const<int>')?.qualifier,'const');
assert.equal(semanticTypeForDeclaredName('input<bool>')?.qualifier,'input');
console.log('CORESPIRIT_FRONTEND_AND_TYPE_QUALIFIER_CONTRACT_OK');
