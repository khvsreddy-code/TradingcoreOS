import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from './compiler.ts';
import { CoreSpiritParser } from './parser.ts';
import { desugarCoreSpiritFunctions } from './functionDesugar.ts';
import { parseWithCoreSpiritFrontend } from './frontends.ts';
const source=`fn doubled(value: number) -> number {
 let result = value * 2
 return result
}
fn quad(value: number) -> number {
 return doubled(doubled(value))
}
plot(quad(close))
`;
const parsed=parseWithCoreSpiritFrontend('corescript',source);
assert.ok(parsed.ast,parsed.diagnostics.map(d=>d.message).join('\n'));
assert.equal(parsed.ast.body[0]?.type,'functionDeclaration');
const lowered=desugarCoreSpiritFunctions(parsed.ast);
assert.equal(lowered.diagnostics.length,0,lowered.diagnostics.map(d=>d.code+': '+d.message).join('\n'));
assert.equal(lowered.ast.body.some(n=>n.type==='functionDeclaration'),false);
assert.equal(lowered.ast.body.some(n=>n.type==='return'),false);
const compiled=new CoreSpiritCompiler().compileSource(source,'function-ast-desugar-contract');
assert.ok(compiled.ir,compiled.diagnostics.map(d=>d.code+': '+d.message).join('\n'));
assert.equal(compiled.ir!.entry.instructions.some(i=>i.op==='call'&&(i.name==='doubled'||i.name==='quad')),false);
const recursive=new CoreSpiritCompiler().compileSource(`fn loop(value: number) -> number { return loop(value) }
plot(loop(close))`,'function-recursion-contract');
assert.equal(recursive.ir,undefined);
assert.ok(recursive.diagnostics.some(d=>d.code==='FUNCTION_RECURSION'));
const effectful=new CoreSpiritCompiler().compileSource(`fn place(value: number) -> number {
 plot(value)
 return value
}
plot(place(close))`,'function-effect-contract');
assert.equal(effectful.ir,undefined);
assert.ok(effectful.diagnostics.some(d=>d.code==='FUNCTION_SIDE_EFFECT'));
const unsupported=new CoreSpiritCompiler().compileSource(`fn choose(value: number) -> number {
 if (value > 0) { return value }
 return 0
}
plot(choose(close))`,'function-control-contract');
assert.equal(unsupported.ir,undefined);
assert.ok(unsupported.diagnostics.some(d=>d.code==='FUNCTION_UNSUPPORTED_BODY'));
const mismatch=new CoreSpiritCompiler().compileSource(`fn expectsText(value: string) -> string { return value }
plot(expectsText(close))`,'function-type-contract');
assert.equal(mismatch.ir,undefined);
assert.ok(mismatch.diagnostics.some(d=>d.code==='FUNCTION_TYPE_MISMATCH'));
const raw=new CoreSpiritParser('fn identity(value: float) -> float { return value }').parseDetailed();
assert.equal(raw.diagnostics.length,0);
assert.equal(raw.ast.body[0]?.type,'functionDeclaration');
console.log('CORESPIRIT_FUNCTION_AST_DESUGARING_CONTRACT_OK');
