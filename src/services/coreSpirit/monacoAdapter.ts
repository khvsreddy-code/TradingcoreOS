import type { CoreSpiritEditorModel } from './editorModel';
import type { CoreSpiritCompileDiagnostic, CoreSpiritCompileSymbol } from './compiler';

declare global { interface Window { require?: any; monaco?: any; } }

const MONACO_VERSION = '0.52.2';
const MONACO_LOADER = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs/loader.js`;

export type CoreSpiritMonacoAdapter = {
  editor:any;
  setSource(source:string):void;
  setDiagnostics(diagnostics:readonly CoreSpiritCompileDiagnostic[], source?:string):void;
  setSymbolInfo(symbols:readonly CoreSpiritCompileSymbol[]):void;
  dispose():void;
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

  monaco.editor.defineTheme('corespirit-luxalgo-dark',{
    base:'vs-dark',
    inherit:true,
    rules:[
      {token:'comment',foreground:'7D899B',fontStyle:'italic'},
      {token:'keyword',foreground:'C792EA'},
      {token:'variable',foreground:'82AAFF'},
      {token:'function',foreground:'89B4FA'},
      {token:'number',foreground:'F78C6C'},
      {token:'string',foreground:'C3E88D'},
      {token:'identifier',foreground:'D6DEEB'},
    ],
    colors:{
      'editor.background':'#131722',
      'editor.foreground':'#D6DEEB',
      'editorGutter.background':'#131722',
      'editorLineNumber.foreground':'#647188',
      'editorLineNumber.activeForeground':'#C1CBD9',
      'editorCursor.foreground':'#A9C7FF',
      'editor.lineHighlightBackground':'#1B2232',
      'editor.selectionBackground':'#283D5E',
      'editor.inactiveSelectionBackground':'#212F45',
      'editorWhitespace.foreground':'#344055',
      'editorIndentGuide.background1':'#2B3444',
      'editorIndentGuide.activeBackground1':'#455570',
      'editorBracketMatch.background':'#26354C',
      'editorBracketMatch.border':'#5878A5',
      'editorWidget.background':'#1B2230',
      'editorWidget.border':'#303D52',
      'editorSuggestWidget.background':'#1B2230',
      'editorSuggestWidget.border':'#39475D',
      'editorSuggestWidget.selectedBackground':'#293C57',
      'editorError.foreground':'#F17078',
      'editorWarning.foreground':'#E5B567',
    },
  });
  let symbolInfo:readonly CoreSpiritCompileSymbol[]=[];
  const completionProvider=monaco.languages.registerCompletionItemProvider('corespirit',{triggerCharacters:['.','('],provideCompletionItems:(m:any,p:any)=>{
    const offset=m.getOffsetAt(p); const result=model.completionAt(offset);
    const prefix=String(result.prefix||'');
    const suggestions=result.completions.map((x:any)=>({label:x.label,kind:x.kind==='variable'?monaco.languages.CompletionItemKind.Variable:monaco.languages.CompletionItemKind.Function,detail:x.detail,insertText:x.insertText||x.label,range:undefined}));
    const seen=new Set(suggestions.map((x:any)=>String(x.label)));
    for(const symbol of symbolInfo){
      if(!symbol.name.startsWith(prefix)||seen.has(symbol.name))continue;
      suggestions.push({label:symbol.name,kind:symbol.kind==='type'?monaco.languages.CompletionItemKind.Class:monaco.languages.CompletionItemKind.Variable,detail:symbol.type,insertText:symbol.name,range:undefined});
      seen.add(symbol.name);
    }
    return {suggestions};
  }});
  const hoverProvider=monaco.languages.registerHoverProvider('corespirit',{provideHover:(m:any,p:any)=>{
    const word=m.getWordAtPosition(p); if(!word)return;
    const typed=symbolInfo.find(item=>item.name===word.word);
    const h=model.hover(word.word);
    if(typed)return {range:new monaco.Range(p.lineNumber,word.startColumn,p.lineNumber,word.endColumn),contents:[{value:`**${typed.name}: ${typed.type}**`},{value:typed.kind==='type'?'CoreScript user-defined type.':'Type resolved by the CoreSpirit compiler worker.'}]};
    if(!h)return;
    return {range:new monaco.Range(p.lineNumber,word.startColumn,p.lineNumber,word.endColumn),contents:[{value:`**${h.label}**`},{value:h.detail+(h.documentation?`\n\n${h.documentation}`:'')} ]};
  }});
  const definitionProvider=monaco.languages.registerDefinitionProvider('corespirit',{provideDefinition:(m:any,p:any)=>{
    const definition=model.definitionAt(m.getOffsetAt(p));
    if(!definition)return;
    return {uri:m.uri,range:new monaco.Range(definition.line,definition.column,definition.line,definition.column+definition.name.length)};
  }});
  const editor=monaco.editor.create(container,{value:model.getSource(),language:'corespirit',theme:'corespirit-luxalgo-dark',automaticLayout:true,minimap:{enabled:false},fontSize:13,lineHeight:22,fontFamily:"'JetBrains Mono','SFMono-Regular',Consolas,monospace",padding:{top:10,bottom:10},lineNumbers:'on',wordWrap:'on',tabSize:2,quickSuggestions:true,suggestOnTriggerCharacters:true,scrollBeyondLastLine:false,scrollbar:{verticalScrollbarSize:8,horizontalScrollbarSize:8},cursorBlinking:'smooth',renderLineHighlight:'line',smoothScrolling:true,bracketPairColorization:{enabled:true},guides:{indentation:true,highlightActiveIndentation:true}});
  let suppressProgrammaticChange=false;
  const disposable=editor.onDidChangeModelContent(()=>{
    if(suppressProgrammaticChange){suppressProgrammaticChange=false;return;}
    onChange(editor.getValue());
  });
  const positionAt=(source:string,offset:number)=>{
    const safe=Math.max(0,Math.min(source.length,offset));
    const before=source.slice(0,safe);
    const line=before.split(/\r?\n/).length;
    return {lineNumber:line,column:safe-(before.lastIndexOf('\n')+1)+1};
  };
  return {
    editor,
    setSource:(source)=>{if(editor.getValue()===source)return;suppressProgrammaticChange=true;editor.setValue(source);},
    setSymbolInfo:(symbols)=>{symbolInfo=Object.freeze([...symbols]);},
    setDiagnostics:(diagnostics,source=model.getSource())=>{
      const activeModel=editor.getModel(); if(!activeModel)return;
      const markers=diagnostics.map(d=>{
        const start=typeof d.start==='number'?positionAt(source,d.start):{lineNumber:Math.max(1,d.line||1),column:Math.max(1,d.column||1)};
        const end=typeof d.end==='number'?positionAt(source,Math.max((d.start??0)+1,d.end)):{lineNumber:start.lineNumber,column:start.column+1};
        return {
          severity:d.severity==='error'?monaco.MarkerSeverity.Error:d.severity==='warning'?monaco.MarkerSeverity.Warning:monaco.MarkerSeverity.Info,
          message:d.message,
          startLineNumber:start.lineNumber,startColumn:start.column,
          endLineNumber:end.lineNumber,endColumn:Math.max(start.column+1,end.column),
          source:'CoreSpirit compiler',
          code:d.code,
        };
      });
      monaco.editor.setModelMarkers(activeModel,'corespirit-compiler',markers);
    },
    dispose:()=>{
      disposable.dispose();
      completionProvider.dispose();hoverProvider.dispose();definitionProvider.dispose();
      const activeModel=editor.getModel();if(activeModel)monaco.editor.setModelMarkers(activeModel,'corespirit-compiler',[]);
      editor.dispose();
    },
  };
}
