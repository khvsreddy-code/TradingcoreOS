/**
 * CoreSpirit v1 user mental model.
 *
 * The platform has many implementation capabilities, but the source language is
 * organized around six semantic concepts. These are deliberately not six new
 * parser productions: surface syntax and callable contracts converge into the
 * existing parser/AST/IR/VM pipeline.
 */

export const CORE_SPIRIT_LANGUAGE_CONCEPTS = Object.freeze([
  'DATA',
  'LET',
  'WHEN',
  'SHOW',
  'MODEL',
  'AUTOMATE',
] as const);

export type CoreSpiritLanguageConcept = typeof CORE_SPIRIT_LANGUAGE_CONCEPTS[number];

export type CoreSpiritSurfaceInputType = 'int'|'float'|'bool'|'string'|'source'|'color'|'price'|'time'|'session'|'timeframe'|'symbol'|'text_area';
export type CoreSpiritSurfaceLiteral = number|string|boolean;
export type CoreSpiritSurfaceCapability =
  | 'market.tick'
  | 'order.fill'
  | 'position.update'
  | 'risk.evaluate'
  | 'execution.route'
  | 'webhooks'
  | 'automation';

export const CORE_SPIRIT_SURFACE_CAPABILITIES = Object.freeze([
  'market.tick','order.fill','position.update','risk.evaluate','execution.route','webhooks','automation',
] as const);

function normalizeSurfaceCapability(value:string):CoreSpiritSurfaceCapability|undefined {
  const normalized=value.trim().toLowerCase();
  if((CORE_SPIRIT_SURFACE_CAPABILITIES as readonly string[]).includes(normalized)) return normalized as CoreSpiritSurfaceCapability;
  if(normalized==='market-events')return 'market.tick';
  if(normalized==='order-events')return 'order.fill';
  if(normalized==='position-events')return 'position.update';
  if(normalized==='risk')return 'risk.evaluate';
  if(normalized==='execution-routing')return 'execution.route';
  if(normalized==='automation')return 'automation';
  return undefined;
}

export function parseCoreSpiritCapabilityRequirement(line:string):CoreSpiritSurfaceCapability[]|undefined {
  const match=line.trim().match(/^requires\s+(.+?)\s*;?$/i);
  if(!match)return undefined;
  const values=match[1]!.split(',').map(value=>value.trim()).filter(Boolean);
  if(!values.length)throw new Error('CoreScript requires at least one capability.');
  const out:CoreSpiritSurfaceCapability[]=[];
  for(const value of values){
    const capability=normalizeSurfaceCapability(value);
    if(!capability)throw new Error(`Unknown CoreScript capability '${value}'. Valid capabilities: ${CORE_SPIRIT_SURFACE_CAPABILITIES.join(', ')}.`);
    if(!out.includes(capability))out.push(capability);
  }
  return out;
}


export type CoreSpiritSurfaceInput = {
  key:string;
  title:string;
  type:CoreSpiritSurfaceInputType;
  defval:CoreSpiritSurfaceLiteral;
  min?:number;
  max?:number;
  step?:number;
  options?:string[];
  group?:string;
  inline?:string;
  tab?:string;
  tooltip?:string;
  start:number;
  end:number;
};

export type CoreSpiritSurfaceProp = CoreSpiritSurfaceInput & { property:string };

const KNOWN_INPUT_ATTRIBUTES = new Set(['min','max','step','title','group','inline','tab','tooltip','options']);
const CORESPIRIT_PROP_DEFINITIONS: Readonly<Record<string,{ key:string; type:CoreSpiritSurfaceInputType; min?:number; max?:number; defval?:CoreSpiritSurfaceLiteral }>> = Object.freeze({
  title:{key:'title',type:'string'}, shorttitle:{key:'shorttitle',type:'string'},
  overlay:{key:'overlay',type:'bool'}, precision:{key:'precision',type:'int',min:0,max:16}, format:{key:'format',type:'string'},
  initialCapital:{key:'initialCapital',type:'float',min:0}, initial_capital:{key:'initialCapital',type:'float',min:0},
  commission:{key:'commission',type:'float',min:0}, slippage:{key:'slippage',type:'float',min:0},
  pyramiding:{key:'pyramiding',type:'int',min:0,max:100}, processOrdersOnClose:{key:'processOrdersOnClose',type:'bool'},
});

function prettySurfaceKey(key:string):string {
  return key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().replace(/(^|\s)\w/g,m=>m.toUpperCase());
}

function parseSurfaceLiteral(value:string):CoreSpiritSurfaceLiteral {
  const raw=value.trim();
  if(/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(raw)){const n=Number(raw);if(!Number.isFinite(n))throw new Error('CoreSpirit input/property literal is not finite.');return n;}
  if(raw==='true')return true;
  if(raw==='false')return false;
  if((raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'"))){
    const q=raw.slice(1,-1);
    return q.replace(/\\([\\"'nrt])/g,(_m,e)=>e==='n'?'\n':e==='r'?'\r':e==='t'?'\t':e);
  }
  throw new Error('CoreSpirit input/property defaults must be numeric, boolean, or quoted strings.');
}

function scanSurfaceAttributes(text:string):{base:string;attrs:Record<string,string>} {
  const attrs:Record<string,string>={};
  const token=/\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\[(?:[^\]\\]|\\.)*\]|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+)/g;
  let first=-1;
  for(const match of text.matchAll(token)){
    const key=match[1]!;
    if(!KNOWN_INPUT_ATTRIBUTES.has(key)) continue;
    const index=match.index ?? -1;
    if(index<0) continue;
    if(first<0) first=index;
    attrs[key]=match[2]!;
  }
  return {
    base:(first<0?text:text.slice(0,first)).trim(),
    attrs,
  };
}

function parseOptionsLiteral(value:string):string[] {
  const raw=value.trim(); if(!raw.startsWith('[')||!raw.endsWith(']')) throw new Error('CoreSpirit input options must use ["A", "B"] syntax.');
  const inner=raw.slice(1,-1).trim(); if(!inner)return [];
  const out:string[]=[]; let start=0; let quote:'"'|"'"|null=null; let escaped=false;
  for(let i=0;i<inner.length;i+=1){
    const ch=inner[i];
    if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch===','){
      const parsed=parseSurfaceLiteral(inner.slice(start,i).trim());
      if(typeof parsed!=='string')throw new Error('CoreSpirit input options must be strings.');
      out.push(parsed); start=i+1;
    }
  }
  const parsed=parseSurfaceLiteral(inner.slice(start).trim());
  if(typeof parsed!=='string')throw new Error('CoreSpirit input options must be strings.');
  out.push(parsed); return out;
}

function normalizeInputType(type:string|undefined, defval:CoreSpiritSurfaceLiteral):CoreSpiritSurfaceInputType {
  const t=String(type??'').toLowerCase();
  if(t==='number'||t==='float')return 'float';
  if(t==='int'||t==='integer')return 'int';
  if(t==='bool'||t==='boolean')return 'bool';
  if(t==='string')return 'string';
  if(['source','color','price','time','session','timeframe','symbol','text_area'].includes(t))return t as CoreSpiritSurfaceInputType;
  if(t)throw new Error(`Unsupported CoreSpirit input type '${type}'.`);
  if(typeof defval==='boolean')return 'bool';
  if(typeof defval==='number')return Number.isInteger(defval)?'int':'float';
  return 'string';
}

export function parseCoreSpiritInputDeclaration(line:string,start:number,end:number=start+line.length):CoreSpiritSurfaceInput|undefined {
  const match=line.trim().match(/^input\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?\s*=\s*(.+)$/i);
  if(!match)return undefined;
  const scanned=scanSurfaceAttributes(match[3]); const defval=parseSurfaceLiteral(scanned.base); const type=normalizeInputType(match[2],defval);
  const attrNum=(name:string)=>scanned.attrs[name]!==undefined?Number(scanned.attrs[name]):undefined;
  const title=scanned.attrs.title ? String(parseSurfaceLiteral(scanned.attrs.title)) : prettySurfaceKey(match[1]);
  const out:CoreSpiritSurfaceInput={key:match[1],title,type,defval,start,end};
  const min=attrNum('min'),max=attrNum('max'),step=attrNum('step');
  if(min!==undefined){if(!Number.isFinite(min))throw new Error(`CoreSpirit input '${match[1]}' has an invalid min.`);out.min=min;}
  if(max!==undefined){if(!Number.isFinite(max))throw new Error(`CoreSpirit input '${match[1]}' has an invalid max.`);out.max=max;}
  if(step!==undefined){if(!Number.isFinite(step)||step<=0)throw new Error(`CoreSpirit input '${match[1]}' has an invalid step.`);out.step=step;}
  if(out.min!==undefined&&out.max!==undefined&&out.min>out.max)throw new Error(`CoreSpirit input '${match[1]}' has min greater than max.`);
  if(scanned.attrs.options!==undefined)out.options=parseOptionsLiteral(scanned.attrs.options);
  for(const key of ['group','inline','tab','tooltip'] as const)if(scanned.attrs[key]!==undefined){const value=parseSurfaceLiteral(scanned.attrs[key]);if(typeof value!=='string')throw new Error(`CoreSpirit input '${match[1]}' attribute '${key}' must be a string.`);out[key]=value;}
  if(type==='int'&&typeof defval==='number'&&!Number.isInteger(defval))throw new Error(`CoreSpirit integer input '${match[1]}' requires an integer default.`);
  return out;
}

export function parseCoreSpiritDeclarationProperty(line:string,start:number,end:number=start+line.length):CoreSpiritSurfaceProp|undefined {
  const match=line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if(!match)return undefined;
  const definition=CORESPIRIT_PROP_DEFINITIONS[match[1]]; if(!definition)return undefined;
  const value=parseSurfaceLiteral(match[2]);
  if(definition.type==='int'&&typeof value==='number'&&!Number.isInteger(value))throw new Error(`CoreSpirit property '${match[1]}' requires an integer.`);
  if(definition.type==='bool'&&typeof value!=='boolean')throw new Error(`CoreSpirit property '${match[1]}' requires a boolean.`);
  if((definition.type==='float'||definition.type==='price'||definition.type==='int')&&typeof value!=='number')throw new Error(`CoreSpirit property '${match[1]}' requires a number.`);
  if(definition.type==='string'&&typeof value!=='string')throw new Error(`CoreSpirit property '${match[1]}' requires a string.`);
  return {key:definition.key,property:match[1],title:prettySurfaceKey(definition.key),type:definition.type,defval:value,min:definition.min,max:definition.max,start,end};
}

export function formatCoreSpiritSurfaceLiteral(value:CoreSpiritSurfaceLiteral):string { return typeof value==='string'?JSON.stringify(value):String(value); }

export type CoreSpiritModelSurfaceBinding = {
  kind: 'registry' | 'python' | 'cpp' | 'rust' | 'wasm' | 'onnx' | 'remote';
  locator: string;
};

export type CoreSpiritModelSurfaceFieldType = 'unknown' | 'number' | 'string' | 'boolean' | 'series<number>' | 'prediction<number>' | 'forecast<number>' | 'probability' | 'feature<number>' | 'vector<float>' | 'matrix<float>' | 'tensor<float>' | 'distribution<float>';

export type CoreSpiritEventDestination =
  | { kind: 'webhook'; target: string }
  | { kind: 'automation'; target: string }
  | { kind: 'notification'; target?: string }
  | { kind: 'alert'; target?: string };

export type CoreSpiritEventRoute = {
  eventName: string;
  destinations: CoreSpiritEventDestination[];
  start: number;
  end: number;
};

export type CoreSpiritSurfaceDeclaration =
  | {
      kind: 'indicator';
      name: string;
      role?: 'indicator'|'strategy';
      start: number;
      end: number;
    }
  | {
      kind: 'model';
      name: string;
      /** Typed algorithm family, e.g. HMM<float>, retained in the source artifact. */
      modelType?: string;
      states?: number;
      emission?: 'gaussian';
      covariance?: 'full' | 'diagonal';
      binding?: CoreSpiritModelSurfaceBinding;
      inputs: string[];
      outputs: string[];
      inputTypes: Record<string, CoreSpiritModelSurfaceFieldType>;
      outputTypes: Record<string, CoreSpiritModelSurfaceFieldType>;
      /** Compatibility aliases for the earlier feature/predict vocabulary. */
      features: string[];
      predictions: string[];
      /** Target/predict expression retained as research metadata, never executed as model code. */
      target?: string;
      start: number;
      end: number;
    }
  | {
      kind: 'automation';
      name: string;
      triggers: string[];
      start: number;
      end: number;
    };

export type CoreSpiritCompositionMetadata = {
  version: 2;
  sourceGraphVersion?: 1;
  nodes: ReadonlyArray<{ id: string; kind: string; name: string; contract: string }>;
  edges: ReadonlyArray<{ from: string; to: string; relation: string }>;
};

export type CoreSpiritSurfaceMetadata = {
  version: 1;
  primaryConcept: CoreSpiritLanguageConcept | 'mixed';
  concepts: CoreSpiritLanguageConcept[];
  declarations: CoreSpiritSurfaceDeclaration[];
  eventRoutes?: CoreSpiritEventRoute[];
  inputs?: CoreSpiritSurfaceInput[];
  props?: CoreSpiritSurfaceProp[];
  requiredCapabilities?: CoreSpiritSurfaceCapability[];
  composition?: CoreSpiritCompositionMetadata;
};

/**
 * Classification is intentionally semantic. A builtin such as plot() is still
 * an implementation callable; to the user it belongs to SHOW.
 */
const DATA_NAMES = new Set([
  'open','high','low','close','volume','time',
  'market','timeframe','request','requestBatch','lowerTf',
  'bid','ask','spread','mid','trade','orderbook','footprint','volumeProfile','vpvr',
  'intrabarCount','intrabarSum','intrabarHigh','intrabarLow','intrabarDelta',
  'depthImbalance','footprintDelta','footprintBuy','footprintSell',
  'footprintPoc','footprintVah','footprintVal','footprintRows',
]);

const SHOW_NAMES = new Set([
  'show','plot','marker','label','labelAt','line','zone','box','band','fill',
  'gradient','arrow','shape','heatmap','polyline','hline','bg',
  'barcolor','table','text','polygon','customVisual',
]);

const AUTOMATE_NAMES = new Set([
  'order','entry','exit','buy','sell','alert','webhook',
]);

const MODEL_NAMES = new Set([
  'predict','score','probability',
]);

export function classifyCoreSpiritIdentifier(name: string): CoreSpiritLanguageConcept | undefined {
  if (DATA_NAMES.has(name)) return 'DATA';
  if (SHOW_NAMES.has(name)) return 'SHOW';
  if (AUTOMATE_NAMES.has(name)) return 'AUTOMATE';
  if (MODEL_NAMES.has(name)) return 'MODEL';
  return undefined;
}

export function makeCoreSpiritSurfaceMetadata(
  concepts: Iterable<CoreSpiritLanguageConcept>,
  declarations: CoreSpiritSurfaceDeclaration[] = [],
  eventRoutes: CoreSpiritEventRoute[] = [],
  inputs: CoreSpiritSurfaceInput[] = [],
  props: CoreSpiritSurfaceProp[] = [],
  requiredCapabilities: CoreSpiritSurfaceCapability[] = [],
): CoreSpiritSurfaceMetadata {
  const ordered = CORE_SPIRIT_LANGUAGE_CONCEPTS.filter(concept => Array.from(concepts).includes(concept));
  const unique = [...new Set(ordered)];
  const primaryConcept = unique.length === 1 ? unique[0] : unique.length ? 'mixed' : 'LET';
  return {
    version: 1,
    primaryConcept,
    concepts: unique,
    ...(inputs.length ? { inputs: inputs.map(input => ({ ...input, ...(input.options ? { options:[...input.options] } : {}) })) } : {}),
    ...(props.length ? { props: props.map(prop => ({ ...prop, ...(prop.options ? { options:[...prop.options] } : {}) })) } : {}),
    ...(requiredCapabilities.length ? { requiredCapabilities:[...new Set(requiredCapabilities)] } : {}),
    declarations: declarations.map(declaration => ({
      ...declaration,
      ...(declaration.kind === 'model' ? {
        ...(declaration.binding ? { binding: { ...declaration.binding } } : {}),
        inputs: [...declaration.inputs],
        outputs: [...declaration.outputs],
        inputTypes: { ...declaration.inputTypes },
        outputTypes: { ...declaration.outputTypes },
        features: [...declaration.features],
        predictions: [...declaration.predictions],
        ...(declaration.target ? { target: declaration.target } : {}),
      } : declaration.kind === 'automation' ? {
        triggers: [...declaration.triggers],
      } : {}),
    })),
    ...(eventRoutes.length ? {
      eventRoutes: eventRoutes.map(route => ({
        ...route,
        destinations: route.destinations.map(destination => ({ ...destination })),
      })),
    } : {}),
  };
}

function lineIndent(raw: string): number {
  return raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
}

function splitModelBindingList(value: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    else if ((ch === ',' || /\s/.test(ch)) && depth === 0) {
      const item = value.slice(start, i).trim();
      if (item) out.push(item);
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}
function parseModelField(value: string): { name: string; type: CoreSpiritModelSurfaceFieldType } | undefined {
  const match = value.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(number|string|boolean|series<number>|prediction<number>|forecast<number>|probability|feature<number>))?$/i);
  if (!match) return undefined;
  return {
    name: match[1],
    type: (match[2]?.toLowerCase() ?? 'unknown') as CoreSpiritModelSurfaceFieldType,
  };
}

function bareModelName(value: string): boolean {
  return Boolean(parseModelField(value));
}

/**
 * Extract user-facing declarations before normalization. This metadata is not a
 * second AST; it is stable intent attached to the same executable IR artifact.
 */
export function extractCoreSpiritSurfaceMetadata(source: string): CoreSpiritSurfaceMetadata {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const declarations: CoreSpiritSurfaceDeclaration[] = [];
  const concepts = new Set<CoreSpiritLanguageConcept>();

  type Active =
    | { kind: 'model'; declaration: CoreSpiritSurfaceDeclaration & { kind: 'model' }; indent: number; modelSection?: 'input' | 'output' }
    | { kind: 'automation'; declaration: CoreSpiritSurfaceDeclaration & { kind: 'automation' }; indent: number }
    | { kind: 'indicator'; declaration: CoreSpiritSurfaceDeclaration & { kind: 'indicator' }; indent: number };

  const active: Active[] = [];
  const surfaceInputs: CoreSpiritSurfaceInput[] = [];
  const surfaceProps: CoreSpiritSurfaceProp[] = [];
  const requiredCapabilities = new Set<CoreSpiritSurfaceCapability>();

  const finishToIndent = (indent: number, offset: number) => {
    while (active.length && indent <= active[active.length - 1].indent) {
      const item = active.pop()!;
      item.declaration.end = Math.max(item.declaration.start, offset);
      declarations.push(item.declaration);
    }
  };

  let offset = 0;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = lineIndent(raw);
    if (indent === 0) {
      const capabilities = parseCoreSpiritCapabilityRequirement(trimmed);
      if (capabilities) { for (const capability of capabilities) requiredCapabilities.add(capability); offset += raw.length + 1; continue; }
    }
    // Blank/comment lines never close an indentation-based declaration.
    if (!trimmed || trimmed.startsWith('//')) {
      offset += raw.length + 1;
      continue;
    }

    finishToIndent(indent, offset);
    if (trimmed === '}') {
      offset += raw.length + 1;
      continue;
    }

    const model = trimmed.match(/^model\s+(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:<[^{}]+>)?))?\s*(?::|\{)\s*$/i);
    if (model) {
      concepts.add('MODEL');
      const name = model[1] ?? model[2] ?? model[3] ?? 'Model';
      const declaration = {
        kind: 'model' as const,
        name,
        modelType: model[4]?.trim(),
        states: model[4] && /^HMM(?:<.*>)?$/i.test(model[4].trim()) ? 3 : undefined,
        emission: model[4] && /^HMM(?:<.*>)?$/i.test(model[4].trim()) ? 'gaussian' as const : undefined,
        covariance: model[4] && /^HMM(?:<.*>)?$/i.test(model[4].trim()) ? 'full' as const : undefined,
        binding: undefined as CoreSpiritModelSurfaceBinding | undefined,
        inputs: [] as string[],
        outputs: [] as string[],
        inputTypes: {} as Record<string, CoreSpiritModelSurfaceFieldType>,
        outputTypes: {} as Record<string, CoreSpiritModelSurfaceFieldType>,
        features: [] as string[],
        predictions: [] as string[],
        target: undefined as string | undefined,
        start: offset,
        end: offset + raw.length,
      };
      active.push({ kind: 'model', declaration, indent });
      offset += raw.length + 1;
      continue;
    }

    const strategy = trimmed.match(/^strategy\s+(?:"([^"]+)"|'([^']+)')\s*(?::|\{)?\s*$/i);
    if (strategy) {
      concepts.add('AUTOMATE');
      const name = strategy[1] ?? strategy[2] ?? 'Strategy';
      const declaration = { kind:'indicator' as const, name, role:'strategy' as const, start:offset, end:offset+raw.length };
      active.push({ kind:'indicator', declaration, indent });
      offset += raw.length + 1;
      continue;
    }

    const automate = trimmed.match(/^automate\s+(?:"([^"]+)"|'([^']+)')\s*:\s*$/i);
    if (automate) {
      concepts.add('AUTOMATE');
      const name = automate[1] ?? automate[2] ?? 'Automation';
      const declaration = {
        kind: 'automation' as const,
        name,
        triggers: [],
        start: offset,
        end: offset + raw.length,
      };
      active.push({ kind: 'automation', declaration, indent });
      offset += raw.length + 1;
      continue;
    }

    const indicator = trimmed.match(/^indicator\s+(?:"([^"]+)"|'([^']+)')\s*(?::|\{)?\s*$/i);
    if (indicator) {
      const name = indicator[1] ?? indicator[2] ?? 'Indicator';
      const declaration = {
        kind: 'indicator' as const,
        name,
        role: 'indicator' as const,
        start: offset,
        end: offset + raw.length,
      };
      active.push({ kind: 'indicator', declaration, indent });
      offset += raw.length + 1;
      continue;
    }

    if (active.length) {
      const current = active[active.length - 1];
      if (current.kind === 'indicator') {
        const input = parseCoreSpiritInputDeclaration(trimmed, offset, offset + raw.length);
        if (input) { surfaceInputs.push(input); concepts.add('LET'); concepts.add('DATA'); offset += raw.length + 1; continue; }
        const prop = parseCoreSpiritDeclarationProperty(trimmed, offset, offset + raw.length);
        if (prop) { surfaceProps.push(prop); concepts.add('LET'); offset += raw.length + 1; continue; }
      }
      if (current.kind === 'model') {
        if (current.declaration.modelType && /^HMM(?:<.*>)?$/i.test(current.declaration.modelType)) {
          const states = trimmed.match(/^states\\s*=\\s*(\\d+)\\s*;?$/i);
          const emission = trimmed.match(/^emission\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*;?$/i);
          const covariance = trimmed.match(/^covariance\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*;?$/i);
          if (states) { current.declaration.states = Number(states[1]); offset += raw.length + 1; continue; }
          if (emission) {
            if (emission[1]!.toLowerCase() === 'gaussian') current.declaration.emission = 'gaussian';
            concepts.add('MODEL'); offset += raw.length + 1; continue;
          }
          if (covariance) {
            const value = covariance[1]!.toLowerCase();
            if (value === 'full' || value === 'diagonal') current.declaration.covariance = value;
            concepts.add('MODEL'); offset += raw.length + 1; continue;
          }
        }
        const field = current.modelSection ? parseModelField(trimmed) : undefined;
        if (/^(?:input(?:s)?|feature(?:s)?)\s*:\s*$/i.test(trimmed)) { current.modelSection = 'input'; offset += raw.length + 1; continue; }
        if (/^output(?:s)?\s*:\s*$/i.test(trimmed)) { current.modelSection = 'output'; offset += raw.length + 1; continue; }

        const addModelInput = (entry: string): void => {
          const value = entry.trim().replace(/,$/, '').trim();
          if (!value) return;
          const field = parseModelField(value);
          const fieldName = field?.name ?? value;
          if (!current.declaration.inputs.includes(fieldName)) current.declaration.inputs.push(fieldName);
          current.declaration.inputTypes[fieldName] = field?.type ?? 'unknown';
          if (!current.declaration.features.includes(fieldName)) current.declaration.features.push(fieldName);
        };
        const addModelOutput = (entry: string): void => {
          const value = entry.trim().replace(/,$/, '').trim();
          if (!value) return;
          const field = parseModelField(value);
          const fieldName = field?.name ?? value;
          if (!current.declaration.outputs.includes(fieldName)) current.declaration.outputs.push(fieldName);
          current.declaration.outputTypes[fieldName] = field?.type ?? 'unknown';
          if (!current.declaration.predictions.includes(fieldName)) current.declaration.predictions.push(fieldName);
        };

        const isModelStructuralLine = /^(?:use|input(?:s)?|feature(?:s)?|output(?:s)?|target|predict)\b/i.test(trimmed);
        if (current.modelSection === 'input' && !isModelStructuralLine) {
          for (const entry of splitModelBindingList(trimmed)) addModelInput(entry);
          concepts.add('MODEL');
          offset += raw.length + 1;
          continue;
        }
        if (current.modelSection === 'output' && !isModelStructuralLine) {
          for (const entry of splitModelBindingList(trimmed)) addModelOutput(entry);
          concepts.add('MODEL');
          offset += raw.length + 1;
          continue;
        }
        const useRegistry = trimmed.match(/^use\s+(?:"([^"]+)"|'([^']+)')\s*$/i);
        const useExternal = trimmed.match(/^use\s+(python|cpp|rust|wasm|onnx|remote)\s+(?:"([^"]+)"|'([^']+)')\s*$/i);
        const inputLine = trimmed.match(/^(?:input(?:s)?|feature(?:s)?)\s*:\s*(\S.*)$/i);
        const outputLine = trimmed.match(/^output(?:s)?\s*:\s*(\S.*)$/i);
        const bareName = trimmed.match(/^[A-Za-z_][A-Za-z0-9_]*$/);
        if (useRegistry) {
          current.declaration.binding = { kind: 'registry', locator: useRegistry[1] ?? useRegistry[2] ?? '' };
          concepts.add('MODEL');
        } else if (useExternal) {
          current.declaration.binding = { kind: useExternal[1].toLowerCase() as CoreSpiritModelSurfaceBinding['kind'], locator: useExternal[2] ?? useExternal[3] ?? '' };
          concepts.add('MODEL');
        } else if (inputLine) {
          const names = inputLine[1].trim() ? splitModelBindingList(inputLine[1]) : [];
          for (const entry of names) {
            const field = parseModelField(entry);
            const fieldName = field?.name ?? entry.trim();
            if (!fieldName) continue;
            if (!current.declaration.inputs.includes(fieldName)) current.declaration.inputs.push(fieldName);
            current.declaration.inputTypes[fieldName] = field?.type ?? 'unknown';
            if (!current.declaration.features.includes(fieldName)) current.declaration.features.push(fieldName);
          }
          concepts.add('MODEL');
        } else if (outputLine) {
          const names = outputLine[1].trim() ? splitModelBindingList(outputLine[1]) : [];
          for (const entry of names) {
            const field = parseModelField(entry);
            const fieldName = field?.name ?? entry.trim();
            if (!fieldName) continue;
            if (!current.declaration.outputs.includes(fieldName)) current.declaration.outputs.push(fieldName);
            current.declaration.outputTypes[fieldName] = field?.type ?? 'unknown';
            if (!current.declaration.predictions.includes(fieldName)) current.declaration.predictions.push(fieldName);
          }
          concepts.add('MODEL');
        } else if (/^(?:target|predict)\s*:/i.test(trimmed)) {
          current.modelSection = undefined;
          const target = trimmed.replace(/^(?:target|predict)\s*:\s*/i, '').trim();
          if (target) current.declaration.target = target;
          if (!current.declaration.outputs.includes('prediction')) current.declaration.outputs.push('prediction');
          current.declaration.outputTypes.prediction = 'prediction<number>';
          if (!current.declaration.predictions.includes('prediction')) current.declaration.predictions.push('prediction');
          concepts.add('MODEL');
        } else if (/^(?:target|predict)\s+/.test(trimmed)) {
          current.modelSection = undefined;
          const name = trimmed.replace(/^(?:target|predict)\s+/i, '').trim();
          if (name) current.declaration.outputs.push(name), current.declaration.predictions.push(name);
          concepts.add('MODEL');
        } else {
          const feature = trimmed.match(/^(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          const featureList = trimmed.replace(/,$/, '').split(/[,\s]+/).filter(Boolean).every(value => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
            ? trimmed.replace(/,$/, '').split(/[,\s]+/).filter(Boolean)
            : [];
          if (feature) {
            current.declaration.features.push(feature[1]);
            if (!current.declaration.inputs.includes(feature[1])) current.declaration.inputs.push(feature[1]);
            concepts.add('MODEL');
          } else if (featureList.length && current.modelSection === 'input') {
            for (const value of featureList) {
              if (!current.declaration.features.includes(value)) current.declaration.features.push(value);
              if (!current.declaration.inputs.includes(value)) current.declaration.inputs.push(value);
              current.declaration.inputTypes[value] = 'unknown';
            }
            concepts.add('MODEL');
          }
        }
      } else if (current.kind === 'automation') {
        const trigger = trimmed.match(/^when\s+(.+?)\s*:\s*$/i);
        if (trigger) {
          current.declaration.triggers.push(trigger[1].trim());
          concepts.add('WHEN');
        }
      }
    }

    if (/^when\b/i.test(trimmed)) concepts.add('WHEN');
    if (/^show\b/i.test(trimmed)) concepts.add('SHOW');
    if (/^(?:let\b|[A-Za-z_][A-Za-z0-9_]*\s*=)/.test(trimmed)) concepts.add('LET');
    if (/\b(?:open|high|low|close|volume|time|market|timeframe)\b/.test(trimmed)) concepts.add('DATA');

    for (const name of [...SHOW_NAMES, ...AUTOMATE_NAMES, ...MODEL_NAMES, ...DATA_NAMES]) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(trimmed)) {
        concepts.add(classifyCoreSpiritIdentifier(name)!);
      }
    }

    offset += raw.length + 1;
  }

  finishToIndent(-1, offset);

  const eventRoutes: CoreSpiritEventRoute[] = [];
  const routeLine = /^\s*route\s+(?:"([^"]+)"|'([^']+)')\s+to\s+(.+?)\s*$/i;
  const emitRouteLine = /^\s*emit\s+(?:"([^"]+)"|'([^']+)')\s+to\s+(.+?)\s*$/i;
  const destination = (value: string): CoreSpiritEventDestination | undefined => {
    const text = value.trim();
    const webhook = text.match(/^webhook\s+(?:"([^"]+)"|'([^']+)')$/i);
    if (webhook) return { kind: 'webhook', target: webhook[1] ?? webhook[2] ?? '' };
    const automation = text.match(/^automation\s+(?:"([^"]+)"|'([^']+)')$/i);
    if (automation) return { kind: 'automation', target: automation[1] ?? automation[2] ?? '' };
    if (/^notification$/i.test(text)) return { kind: 'notification' };
    if (/^alert$/i.test(text)) return { kind: 'alert' };
    return undefined;
  };
  const sourceLines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const route = line.match(routeLine);
    const emitRoute = line.match(emitRouteLine);
    if (route || emitRoute) {
      const m = route ?? emitRoute!;
      const eventName = m[1] ?? m[2] ?? '';
      const d = destination(m[3]);
      if (d) eventRoutes.push({ eventName, destinations: [d], start: source.indexOf(line), end: source.indexOf(line) + line.length });
      continue;
    }
    const block = line.match(/^\s*emit\s+(?:"([^"]+)"|'([^']+)')\s+to\s*:\s*$/i);
    if (block) {
      const eventName = block[1] ?? block[2] ?? '';
      const parentIndent = lineIndent(line);
      const destinations: CoreSpiritEventDestination[] = [];
      let j = i + 1;
      while (j < sourceLines.length) {
        const next = sourceLines[j];
        const nextTrimmed = next.trim();
        if (!nextTrimmed) { j++; continue; }
        if (lineIndent(next) <= parentIndent) break;
        const d = destination(nextTrimmed);
        if (d) destinations.push(d);
        j++;
      }
      if (destinations.length) eventRoutes.push({ eventName, destinations, start: source.indexOf(line), end: source.indexOf(line) + line.length });
      i = j - 1;
    }
  }

  const mergedEventRoutes: CoreSpiritEventRoute[] = [];
  for (const route of eventRoutes) {
    const existing = mergedEventRoutes.find(item => item.eventName.toUpperCase() === route.eventName.toUpperCase());
    if (existing) {
      for (const item of route.destinations) {
        const duplicate = existing.destinations.some(existingDestination =>
          existingDestination.kind === item.kind &&
          ('target' in existingDestination ? existingDestination.target : undefined) === ('target' in item ? item.target : undefined),
        );
        if (!duplicate) existing.destinations.push(item);
      }
      existing.end = Math.max(existing.end, route.end);
    } else {
      mergedEventRoutes.push({
        ...route,
        destinations: [...route.destinations],
      });
    }
  }
  return makeCoreSpiritSurfaceMetadata(concepts, declarations, mergedEventRoutes, surfaceInputs, surfaceProps, [...requiredCapabilities]);
}
