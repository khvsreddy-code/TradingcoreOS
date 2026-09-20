import type { CoreSpiritEditorModel } from './editorModel';

declare global { interface Window { require?: any; monaco?: any; } }

const MONACO_VERSION = '0.52.2';
const MONACO_LOADER = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs/loader.js`;

export type CoreSpiritMonacoAdapter = {
  editor: any;
  dispose(): void;
};

function loadScript(src: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Monaco requires a browser document'));
  if (document.querySelector(`script[data-corespirit-monaco="${MONACO_VERSION}"]`)) return new Promise(resolve => {
    if (window.require) resolve(); else setTimeout(()=>loadScript(src).then(resolve), 25);
  });
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script'); script.src=src; script.async=true; script.dataset.corespiritMonaco=MONACO_VERSION;
    script.onload=()=>resolve(); script.onerror=()=>reject(new Error('Unable to load Monaco editor')); document.head.appendChild(script);
  });
}

export async function mountCoreSpiritMonaco(container: HTMLElement, model: CoreSpiritEditorModel, onChange:(source:string)=>void): Promise<CoreSpiritMonacoAdapter> {
  await loadScript(MONACO_LOADER);
  await new Promise<void>((resolve,reject)=>window.require?.(['vs/editor/editor.main'],()=>resolve(),reject));
  const monaco=window.monaco;
  monaco.languages.register({id:'corespirit'});
  monaco.languages.setMonarchTokensProvider('corespirit',{
    tokenizer:{root:[[/\/\/.*$/,'comment'],[/\b(let|if|else|type|true|false|and|or)\b/,'keyword'],[/\b(open|high|low|close|volume|time)\b/,'variable'],[/\b[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/,'function'],[/\b\d+(?:\.\d+)?\b/,'number'],[/'(?:[^'\\]|\\.)*'/,'string'],[/"(?:[^"\\]|\\.)*"/,'string'],[/[A-Za-z_][A-Za-z0-9_]*/,'identifier']]}
  });
  monaco.languages.registerCompletionItemProvider('corespirit',{triggerCharacters:['.','('],provideCompletionItems:(m:any,p:any)=>{
    const offset=m.getOffsetAt(p); const result=model.completionAt(offset);
    return {suggestions:result.completions.map((x:any)=>({label:x.label,kind:monaco.languages.CompletionItemKind.Function,detail:x.detail,insertText:x.label,range:undefined}))};
  }});
  monaco.languages.registerHoverProvider('corespirit',{provideHover:(m:any,p:any)=>{const word=m.getWordAtPosition(p); if(!word)return; const h=model.hover(word.word); if(!h)return; return {range:new monaco.Range(p.lineNumber,word.startColumn,p.lineNumber,word.endColumn),contents:[{value:`**${h.label}**`},{value:h.detail+(h.documentation?`\n\n${h.documentation}`:'')} ]};}});
  const editor=monaco.editor.create(container,{value:model.getSource(),language:'corespirit',theme:'vs-dark',automaticLayout:true,minimap:{enabled:false},fontSize:13,lineNumbers:'on',wordWrap:'on',tabSize:2,quickSuggestions:true,suggestOnTriggerCharacters:true,scrollBeyondLastLine:false,bracketPairColorization:{enabled:true}});
  const disposable=editor.onDidChangeModelContent(()=>onChange(editor.getValue()));
  return {editor,dispose:()=>{disposable.dispose();editor.dispose();}};
}
