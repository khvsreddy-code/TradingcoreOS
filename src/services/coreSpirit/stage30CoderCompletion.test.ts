import { CoreSpiritEditorModel } from './editorModel';
import { CoreSpiritIncrementalAst } from './incrementalAst';
import { getCoreSpiritCompletions, getCoreSpiritTypeInfo } from './languageService';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritHotReloadController } from './hotReload';

const source=`type Signal { price: number; confidence: number; direction: string }
let signal = close
`;
const parsed=new CoreSpiritParser(source).parseDetailed();
if(parsed.diagnostics.length) throw new Error(`UDT parse failed: ${parsed.diagnostics[0].message}`);
const compiler=new CoreSpiritCompiler();
const result=compiler.compile(parsed.ast,'stage30');
if(!result.ir?.sourceMap?.entries?.length) throw new Error('source map missing');
const member=getCoreSpiritCompletions('pr',{mode:'member',cursor:source.length},source);
if(!member.some(x=>x.label==='price')) throw new Error('member completion missing');
const info=getCoreSpiritTypeInfo('let s = close',11); if(!info || info.type!=='series<number>') throw new Error('type inference failed');
const incremental=new CoreSpiritIncrementalAst(); incremental.update('let a = close'); const second=incremental.update('let a = close\nlet b = volume'); if(second.reusedNodes<1) throw new Error('incremental AST reuse failed');
const model=new CoreSpiritEditorModel('let a = close\nplot(a)'); model.updateSource('let a = close\nplot(a)\nplot(volume)'); if(!model.compile().ir?.sourceMap) throw new Error('editor source map missing');
const hot=new CoreSpiritHotReloadController();
hot.reload(new CoreSpiritParser('plot(close)').parse()).then(r=>{if(!r.committed) throw new Error('hot reload failed');});
