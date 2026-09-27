import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts';
import { normalizeCoreSpiritSource } from './syntax';
import { buildCoreSpiritSemanticDependencyGraph } from './semanticDependencyGraph';
import { buildCoreSpiritCompositionGraph, validateCoreSpiritCompositionGraph } from './composability';

const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};

const source=[
  'model "Regime":',
  '  use "regime-v3"',
  '  output:',
  '    confidence: number',
  '',
  'let value = close',
  'let closeText = "hello close"',
  'let marketRef = market("NIFTY")',
  'let niftyClose = marketRef.close',
  'let regime = model("Regime")',
  '',
  'when regime.confidence > 0.8 and value > 0:',
  '  emit "LONG"',
].join('\\n');

const normalized=normalizeCoreSpiritSource(source);
const parsed=new CoreSpiritParser(normalized).parseDetailed();
assert(parsed.diagnostics.length===0,'semantic composition fixture failed to parse');
const surface=extractCoreSpiritSurfaceMetadata(source);
const semantic=analyzeCoreSpirit(parsed.ast,{surface});
assert(semantic.diagnostics.length===0,semantic.diagnostics.map(d=>d.message).join('; '));

const semanticGraph=buildCoreSpiritSemanticDependencyGraph(parsed.ast,semantic,surface);
const edges=semanticGraph.edges;

assert(edges.some(e=>e.from==='data:close'&&e.to==='symbol:value'),'close series dependency missing');
assert(!edges.some(e=>e.from==='data:close'&&e.to==='symbol:closeText'),'string literal became a data dependency');
assert(edges.some(e=>e.from==='data:market:NIFTY'&&e.to==='data:market:NIFTY.close'),'market member dependency missing');
assert(edges.some(e=>e.from==='model:Regime'&&e.to==='model-output:Regime:confidence'),'model output dependency missing');

const composition=buildCoreSpiritCompositionGraph(parsed.ast,semantic,surface);
const errors=validateCoreSpiritCompositionGraph(composition);
assert(errors.length===0,errors.join('; '));
assert(composition.nodes.some(n=>n.id==='model:Regime'&&n.kind==='model'),'model node missing');
assert(composition.nodes.some(n=>n.id==='model-output:Regime:confidence'&&n.kind==='model-output'),'model output node missing');
assert(composition.nodes.some(n=>n.id==='data:close'&&n.kind==='data'),'data node missing');
assert(composition.nodes.some(n=>n.id==='event:LONG'&&n.kind==='event'),'event node missing');
assert(composition.edges.some(e=>e.from==='model-output:Regime:confidence'&&e.to.startsWith('condition:')&&e.relation==='feeds'),'model output -> condition edge missing');
assert(composition.edges.some(e=>e.from.startsWith('condition:')&&e.to==='event:LONG'&&e.relation==='triggers'),'condition -> event edge missing');

export const STAGE77_SEMANTIC_COMPOSABILITY_OK=true;
console.log('STAGE77_SEMANTIC_COMPOSABILITY_OK');
