import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import { extractCoreSpiritSurfaceMetadata, formatCoreSpiritSurfaceLiteral, parseCoreSpiritDeclarationProperty, parseCoreSpiritInputDeclaration, parseCoreSpiritCapabilityRequirement } from './languageConcepts';
import { inferCoreSpiritPointCall, parseCoreSpiritCoordinatePair } from './visualSurface';
import { modelSurfaceNames, normalizeCoreSpiritModelReferences, normalizedModelReference, isModelNameExpression } from './modelSurface';
import { normalizeCoreSpiritAutomationSource } from './automationSurface';
import { normalizeCoreSpiritEventSource, normalizeCoreSpiritWhenCondition } from './eventSurface';
import { buildCoreSpiritCompositionGraph } from './composability';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { normalizeReadableOperatorsWithTokens, withProtectedCoreSpiritSurfaceText } from './surfaceCst';

export type CoreSpiritSurfaceSyntaxContext = {
  wrapperDepth: number;
  blockStack?: Array<{ indent: number; kind: 'when' }>;
};

export type CoreSpiritSurfaceTransformResult = string | { line: string; lines?: string[] };
export type CoreSpiritSurfaceTransform = {
  id: string;
  apply(line: string): CoreSpiritSurfaceTransformResult;
};

export type CoreSpiritSurfacePreludeResult = { action:'keep'|'drop'|'transform'; line:string };

export function prepareCoreSpiritSurfaceLine(raw: string, context: CoreSpiritSurfaceSyntaxContext): CoreSpiritSurfacePreludeResult {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('//')) return { action:'keep', line:raw };
  // Kept for compatibility with callers that perform their own line iteration.
  // Full structural handling now lives in normalizeCoreSpiritSource().
  return { action:'transform', line:raw };
}

function indentation(raw: string): number {
  return raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
}

/** Return true only when the opening parenthesis encloses the complete condition. */
function hasSingleOuterParentheses(value: string): boolean {
  const text = value.trim();
  if (!text.startsWith('(') || !text.endsWith(')')) return false;

  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth < 0) return false;
      // A close of the outer pair before the end means the tail is also part
      // of the condition (for example: "(a) == true" or "(a) and (b)").
      if (depth === 0 && index < text.length - 1) return false;
    }
  }
  return depth === 0 && quote === null;
}

function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function showTarget(target: string): string | null {
  const t = target.trim();
  if (t === 'price' || t === 'volume' || t === 'indicator' || t === 'custom') return `chart.${t}`;
  if (/^(?:panel|sidePanel|floatingArea)\s*\(/.test(t)) return t;
  if (/^chart\.(?:price|volume|indicator|custom)$/.test(t)) return t;
  return null;
}

function inferShowPoint(x: string, y: string): string {
  return inferCoreSpiritPointCall(x, y);
}

function showAreaSuffix(text: string): { body: string; area: string } {
  const trimmed = text.trim();
  let m = trimmed.match(/^(.*)\s+(?:on|in)\s+(?:panel)\s*(?:\(\s*"([^"]+)"\s*\)|"([^"]+)")\s*$/i);
  if (m) return { body: m[1].trim(), area: `panel("${m[2] ?? m[3]}")` };
  m = trimmed.match(/^(.*)\s+(?:on|in)\s+(?:sidePanel)\s*(?:\(\s*"([^"]+)"\s*\)|"([^"]+)")\s*$/i);
  if (m) return { body: m[1].trim(), area: `sidePanel("${m[2] ?? m[3]}")` };
  m = trimmed.match(/^(.*)\s+(?:on|in)\s+(?:floatingArea)\s*(?:\(\s*"([^"]+)"\s*\)|"([^"]+)")\s*$/i);
  if (m) return { body: m[1].trim(), area: `floatingArea("${m[2] ?? m[3]}")` };
  m = trimmed.match(/^(.*)\s+(?:on|in)\s+(price|volume|indicator|custom)\s*$/i);
  if (m) return { body: m[1].trim(), area: showTarget(m[2].toLowerCase())! };
  return { body: trimmed, area: 'chart.price' };
}

function transformShow(line: string, modelNames: ReadonlySet<string>): string | string[] {
  const match = line.match(/^(\s*)show\s+(.+?)\s*;?$/i);
  if (!match) return line;
  const indent = match[1];
  let rest = match[2].trim();

  let condition: string | undefined;
  const whenMatch = rest.match(/^(.*)\s+when\s+(.+)$/i);
  if (whenMatch) {
    rest = whenMatch[1].trim();
    condition = whenMatch[2].trim();
  }

  const wrap = (canonical: string): string[] => {
    if (!condition) return [`${indent}${canonical};`];
    return [
      `${indent}if (${whenCondition(condition, modelNames)}) {`,
      `${indent}  ${canonical};`,
      `${indent}}`,
    ];
  };

  const areaInfo = showAreaSuffix(rest);
  rest = areaInfo.body;
  const area = areaInfo.area;

  // `show line|resistance|support from [x,y] to [x,y]`
  let geometry = rest.match(/^(line|resistance|support)\s+from\s+(.+?)\s+to\s+(.+)$/i);
  if (geometry) {
    const parsePair = (pair: string): [string,string] | null => parseCoreSpiritCoordinatePair(pair);
    const lp = parsePair(geometry[2]), rp = parsePair(geometry[3]);
    if (!lp || !rp) return line;
    const role = geometry[1].toLowerCase();
    return wrap(`show("line", "${role}", ${inferShowPoint(lp[0], lp[1])}, ${inferShowPoint(rp[0], rp[1])}, ${area})`);
  }

  // `show box at [x,y] to [x,y]`
  const box = rest.match(/^box\s+at\s+(\[[^\]]+\])\s+to\s+(\[[^\]]+\])$/i);
  if (box) {
    const parseBoxPair = (pair: string): [string,string] | null => parseCoreSpiritCoordinatePair(pair);
    const lp = parseBoxPair(box[1]), rp = parseBoxPair(box[2]);
    if (!lp || !rp) return line;
    return wrap(`show("box", ${inferShowPoint(lp[0], lp[1])}, ${inferShowPoint(rp[0], rp[1])}, ${area})`);
  }

  // `show zone from 25100 to 25200` represents a price-domain region.
  const zone = rest.match(/^zone\s+from\s+(.+?)\s+to\s+(.+)$/i);
  if (zone) {
    return wrap(`show("zone", ${zone[1].trim()}, ${zone[2].trim()}, ${area}, "viewport")`);
  }

  const bareSignal = rest.match(/^signal\s+("[^"]*"|'[^']*'|\S+)$/i);
  if (bareSignal) return wrap(`show("signal", ${bareSignal[1]}, above_bar(0), ${area})`);
  const signalCall = rest.match(/^signal\s*\((.+)\)$/i);
  if (signalCall) return wrap(`show("signal", ${signalCall[1]}, above_bar(0), ${area})`);

  // `show signal "LONG" above|below bar` is a visual projection, not signal emission.
  const signal = rest.match(/^signal\s+("[^"]*"|'[^']*'|\S+)\s+(above|below)(?:\s+bar)?$/i);
  if (signal) {
    const relative = signal[2].toLowerCase() === 'above' ? 'above_bar(0)' : 'below_bar(0)';
    return wrap(`show("signal", ${signal[1]}, ${relative}, ${area})`);
  }

  // `show line(value)` is a beginner-friendly series projection, not geometry.
  const lineSeries = rest.match(/^line\s*\((.+)\)$/i);
  if (lineSeries) return wrap(`show("series", ${normalizeCoreSpiritModelReferences(lineSeries[1], modelNames)}, ${area})`);

  // MODEL projections are their own semantic SHOW category; the model ABI stays
  // behind the runtime resolver.
  if (isModelNameExpression(rest, modelNames)) {
    return wrap(`show("model", ${normalizedModelReference(rest)}, ${area})`);
  }
  // Series/value projection: SHOW is the one user-facing visual primitive.
  const expressions = splitTopLevel(rest);
  if (!expressions.length) return line;
  return expressions.flatMap(expression => wrap(`show("series", ${normalizeCoreSpiritModelReferences(expression, modelNames)}, ${area})`));
}

function whenCondition(condition: string, modelNames: ReadonlySet<string>): string {
  return normalizeCoreSpiritWhenCondition(condition, modelNames);
}
/**
 * Surface forms are deliberately isolated from AST/IR semantics. The core parser
 * remains small; these rules only make concise source spellings equivalent to
 * the canonical core grammar.
 */
export const CORE_SPIRIT_SURFACE_TRANSFORMS: readonly CoreSpiritSurfaceTransform[] = [
  {
    id: 'system-capabilities',
    apply: line => parseCoreSpiritCapabilityRequirement(line) ? '' : line,
  },
  {
    id: 'broker-route',
    apply: line => line.replace(
      /^(\s*)route\s+order\s+through\s+broker\s*\(\s*(["'])([^"']+)\2\s*\)\s*;?$/i,
      '$1automation.route("broker.$3")',
    ),
  },

  {
    id:'structured-input',
    apply: line => {
      const declaration = parseCoreSpiritInputDeclaration(line, 0, line.length);
      if (!declaration) return line;
      const indent = line.match(/^\s*/)?.[0] ?? '';
      return `${indent}let ${declaration.key} = __input(${JSON.stringify(declaration.key)}, ${formatCoreSpiritSurfaceLiteral(declaration.defval)});`;
    },
  },
  {
    id: 'typed-input',
    apply: line => line.replace(/^(\s*)input\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(int|float|number|bool|string)\s*\(\s*([^,)]*).*\)\s*;?$/i, '$1let $2: $3 = $4;'),
  },
  {
    id: 'input',
    apply: line => line.replace(/^(\s*)input\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i, '$1let $2 = $3'),
  },
  {
    id: 'implicit-assignment',
    apply: line => {
      const assignment = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if (assignment && !/^\s*(if|let|plot|signal|indicator|input)\b/.test(line)) {
        return { line: `${assignment[1]}let ${assignment[2]} = ${assignment[3]}` };
      }
      return { line };
    },
  },
  {
    id: 'if-inline-or-shorthand',
    apply: line => {
      const inlineIf = line.match(/^(\s*)if\s+(.+?)\s*\{\s*(.*?)\s*\}\s*$/);
      if (inlineIf) {
        const condition = inlineIf[2].trim();
        const body = inlineIf[3].trim();
        return { line, lines: [`${inlineIf[1]}if (${condition}) {`, `${inlineIf[1]}  ${body}`, `${inlineIf[1]}}`] };
      }
      const ifMatch = line.match(/^(\s*)if\s+(.+?)\s*\{\s*$/);
      if (ifMatch) {
        const condition = ifMatch[2].trim();
        if (!hasSingleOuterParentheses(condition)) {
          return { line: ifMatch[1] + 'if (' + condition + ') {' };
        }
      }
      return { line };
    },
  },
  {
    id: 'entry-long-short',
    apply: line => line.replace(/^(\s*)entry\s*\(\s*["'](long|short)["']\s*\)\s*;?$/i, '$1entry(true, "$2");'),
  },
  {
    id: 'exit-long-short',
    apply: line => line.replace(/^(\s*)exit\s*\(\s*["'](long|short)["']\s*\)\s*;?$/i, '$1exit(true, "$2");'),
  },
  {
    id: 'plot-bare',
    apply: line => {
      const match = line.match(/^(\s*)plot\s+(.+?)\s*;?$/);
      return match && !match[2].startsWith('(') ? { line: `${match[1]}plot(${match[2]});` } : { line };
    },
  },
  {
    id: 'plot-name-compat',
    apply: line => line.replace(/plot\(([^,()]+),\s*name\s*=\s*[^)]+\)/g, 'plot($1)'),
  },
  {
    id: 'signal-bare',
    apply: line => {
      const match = line.match(/^(\s*)signal\s+(.+?)\s*;?$/);
      return match && !match[2].startsWith('(') ? { line: `${match[1]}signal(${match[2]});` } : { line };
    },
  },
];

function lowerCoreSpiritInlineFunctions(source: string): string {
  type InlineFunction = { params: string[]; locals: Array<{name:string; expression:string}>; body: string; returnType: string };
  const functions = new Map<string, InlineFunction>();
  const inputLines = source.split('\n');
  const outputLines: string[] = [];

  for (let i = 0; i < inputLines.length; i += 1) {
    const line = inputLines[i]!;
    if (!/^\s*fn\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line)) {
      outputLines.push(line);
      continue;
    }

    const headerLines = [line];
    let headerLineIndex = i;
    while (!/\)\s*(?:->\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?)?\s*\{\s*$/.test(headerLines.join('\n'))) {
      headerLineIndex += 1;
      if (headerLineIndex >= inputLines.length) throw new Error('Unterminated CoreScript fn signature');
      headerLines.push(inputLines[headerLineIndex]!);
    }
    const header = headerLines.join('\n').match(/^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*(?:->\s*([A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?))?\s*\{\s*$/);
    if (!header) throw new Error('Invalid CoreScript fn declaration; expected fn name(arguments) -> type {');
    const name = header[1]!;
    if (!header[3]) throw new Error("CoreScript function '" + name + "' must declare a return type after ->");
    if (functions.has(name)) throw new Error("Duplicate CoreScript function '" + name + "'");
    const params = splitTopLevel(header[2] ?? '').filter(item => item.trim()).map(item => {
      const part = item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?)$/);
      if (!part) throw new Error("Invalid parameter in function '" + name + "'; expected name: type");
      return part[1]!;
    });
    const duplicateParams = params.filter((param, index) => params.indexOf(param) !== index);
    if (duplicateParams.length) throw new Error("Duplicate parameter '" + duplicateParams[0] + "' in function '" + name + "'");

    const bodyLines: string[] = [];
    let closingLine = headerLineIndex + 1;
    for (; closingLine < inputLines.length && inputLines[closingLine]!.trim() !== '}'; closingLine += 1) {
      bodyLines.push(inputLines[closingLine]!);
    }
    if (closingLine >= inputLines.length) throw new Error("Unterminated body for CoreScript function '" + name + "'");
    const cleanedBody = bodyLines.map(item => item.replace(/\/\/.*$/, '').trim()).filter(Boolean).join('\n');
    const statements = cleanedBody.split(/[;\n]/).map(item => item.trim()).filter(Boolean);
    const locals: Array<{name:string; expression:string}> = [];
    const localNames = new Set(params);
    let returnExpression = '';
    for (let statementIndex = 0; statementIndex < statements.length; statementIndex += 1) {
      const statement = statements[statementIndex]!;
      const returned = statement.match(/^return\s+([\s\S]+)$/);
      if (returned) {
        if (statementIndex !== statements.length - 1) throw new Error("CoreScript function '" + name + "' must return after its local declarations");
        returnExpression = returned[1]!.trim();
        continue;
      }
      const local = statement.match(/^(?:let|const)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?)?\s*=\s*([\s\S]+)$/);
      if (!local) {
        throw new Error("CoreScript function '" + name + "' supports typed local assignments followed by one return expression; loops and control-flow bodies are not yet supported in this inline execution tier");
      }
      const localName = local[1]!;
      if (localNames.has(localName)) throw new Error("Duplicate local or parameter '" + localName + "' in function '" + name + "'");
      localNames.add(localName);
      locals.push({ name: localName, expression: local[2]!.trim() });
    }
    if (!returnExpression) throw new Error("CoreScript function '" + name + "' must end with return expression");
    functions.set(name, { params, locals, body: returnExpression, returnType: header[3]!.trim() });
    i = closingLine;
  }

  if (!functions.size) return source;

  const matchingParen = (text: string, open: number): number => {
    let depth = 0;
    let quote: '"' | "'" | null = null;
    let escaped = false;
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i]!;
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '/' && text[i + 1] === '/') {
        const end = text.indexOf('\n', i + 2);
        if (end < 0) return -1;
        i = end;
        continue;
      }
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };

  const substitute = (text: string, values: Map<string, string>): string => {
    let result = '';
    let quote: '"' | "'" | null = null;
    let escaped = false;
    for (let i = 0; i < text.length;) {
      const ch = text[i]!;
      if (quote) {
        result += ch;
        i += 1;
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; result += ch; i += 1; continue; }
      if (ch === '/' && text[i + 1] === '/') {
        const end = text.indexOf('\n', i + 2);
        if (end < 0) { result += text.slice(i); break; }
        result += text.slice(i, end);
        i = end;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let end = i + 1;
        while (end < text.length && /[A-Za-z0-9_]/.test(text[end]!)) end += 1;
        const identifier = text.slice(i, end);
        const value = values.get(identifier);
        result += value === undefined ? identifier : '(' + value + ')';
        i = end;
        continue;
      }
      result += ch;
      i += 1;
    }
    return result;
  };

  const expandCalls = (text: string, stack: string[] = [], depth = 0): string => {
    if (depth > 32) throw new Error('CoreScript inline function expansion exceeded 32 nested calls');
    let result = '';
    let quote: '"' | "'" | null = null;
    let escaped = false;
    for (let i = 0; i < text.length;) {
      const ch = text[i]!;
      if (quote) {
        result += ch;
        i += 1;
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; result += ch; i += 1; continue; }
      if (ch === '/' && text[i + 1] === '/') {
        const end = text.indexOf('\n', i + 2);
        if (end < 0) { result += text.slice(i); break; }
        result += text.slice(i, end);
        i = end;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let end = i + 1;
        while (end < text.length && /[A-Za-z0-9_]/.test(text[end]!)) end += 1;
        const identifier = text.slice(i, end);
        let open = end;
        while (open < text.length && /\s/.test(text[open]!)) open += 1;
        const previous = result.trimEnd().slice(-1);
        const definition = functions.get(identifier);
        if (definition && text[open] === '(' && previous !== '.') {
          if (stack.includes(identifier)) throw new Error("Recursive CoreScript function '" + identifier + "' cannot be inlined in this execution tier");
          const close = matchingParen(text, open);
          if (close < 0) throw new Error("Unclosed call to CoreScript function '" + identifier + "'");
          const args = splitTopLevel(text.slice(open + 1, close));
          if (args.length !== definition.params.length) throw new Error("Function '" + identifier + "' expects " + definition.params.length + ' arguments; received ' + args.length);
          const bindings = new Map<string, string>(definition.params.map((param, index) => [param, args[index]!.trim()] as const));
          for (const local of definition.locals) bindings.set(local.name, substitute(local.expression, bindings));
          const expandedBody = substitute(definition.body, bindings);
          result += '(' + expandCalls(expandedBody, [...stack, identifier], depth + 1) + ')';
          i = close + 1;
          continue;
        }
        result += identifier;
        i = end;
        continue;
      }
      result += ch;
      i += 1;
    }
    return result;
  };

  return expandCalls(outputLines.join('\n'));
}

function normalizeCoreSpiritQuantSurfaceSyntax(source: string): string {
  let out = source;
  // `.tf(...)` is a concise market reference spelling; the canonical IR uses `timeframe(...)`.
  out = out.replace(/(market\([^()]*\))\.tf\s*\(/gi, '$1.timeframe(');
  out = out.replace(/\b(?!stats\.|ta\.)([A-Za-z_][A-Za-z0-9_]*)\.zscore\s*\(([^()]+)\)/g, 'zscore($1, $2)');
  out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.returns\b/g, 'returns($1)');
  out = out.replace(/\bmarket\(([^()]*)\)\.returns\b/g, 'returns(market($1))');

  const marker=/\bregime\.detect\s*\(/gi;
  let cursor=0;
  let rebuilt='';
  for(;;){
    const match=marker.exec(out);
    if(!match){ rebuilt+=out.slice(cursor); break; }
    const open=out.indexOf('(',match.index);
    if(open<0){ rebuilt+=out.slice(cursor); break; }

    let depth=0;
    let quote:'"'|"'"|null=null;
    let escaped=false;
    let close=-1;
    for(let i=open;i<out.length;i+=1){
      const ch=out[i];
      if(quote){
        if(escaped){escaped=false;continue;}
        if(ch==='\\'){escaped=true;continue;}
        if(ch===quote)quote=null;
        continue;
      }
      if(ch==='"'||ch==="'"){quote=ch;continue;}
      if(ch==='(')depth+=1;
      else if(ch===')'){
        depth-=1;
        if(depth===0){close=i;break;}
      }
    }
    if(close<0){rebuilt+=out.slice(cursor);break;}

    const inner=out.slice(open+1,close);
    const parts=splitTopLevel(inner);
    const values=parts.map(part=>part.replace(/^\s*(?:volatility|trend)\s*=\s*/i,'').trim());
    rebuilt+=out.slice(cursor,match.index)+`regimeDetect(${values.join(', ')})`;
    cursor=close+1;
    marker.lastIndex=cursor;
  }
  // Lower typed HMM and dataset syntax to the shared parser/IR/runtime.
  const hmmNames = new Set(Array.from(out.matchAll(/^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*HMM(?:<[^>]+>)?\s*\{/gim), match => match[1]!));
  const sourceLines = rebuilt.split('\n');
  const loweredLines = [];
  for (let i = 0; i < sourceLines.length; i += 1) {
    const line = sourceLines[i];
    const datasetHeader = line.match(/^(\s*)(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*dataset\s*\{\s*$/i);
    if (datasetHeader) {
      const fields = [];
      let j = i + 1;
      for (; j < sourceLines.length; j += 1) {
        const candidate = sourceLines[j];
        if (candidate.trim() === '}') break;
        if (!candidate.trim() || candidate.trim().startsWith('//')) continue;
        const field = candidate.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*,?$/);
        if (!field || !field[2]) throw new Error('dataset blocks require fieldName: numericExpression entries');
        fields.push(JSON.stringify(field[1]), field[2].replace(/,\s*$/, '').trim());
      }
      if (j >= sourceLines.length) throw new Error('Unterminated dataset block; expected a closing brace');
      if (!fields.length) throw new Error('dataset blocks require at least one feature');
      loweredLines.push(datasetHeader[1] + 'let ' + datasetHeader[2] + ' = dataset(' + fields.join(', ') + ');');
      i = j;
      continue;
    }
    const fit = line.match(/^(\s*)fit\s+([A-Za-z_][A-Za-z0-9_]*)\s+on\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i);
    if (fit && hmmNames.has(fit[2])) {
      loweredLines.push(fit[1] + 'hmmFit(' + JSON.stringify(fit[2]) + ', ' + fit[3] + ');');
      continue;
    }
    loweredLines.push(line);
  }

  const lowered = loweredLines.map(line => {
    const method = line.match(/^(\s*)(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\.(decode|probability|posterior)\s*\((.*)\)\s*;?$/i);
    if (!method || !hmmNames.has(method[3])) return line;
    const functionName = method[4].toLowerCase() === 'decode' ? 'hmmDecode'
      : method[4].toLowerCase() === 'probability' ? 'hmmProbability' : 'hmmPosterior';
    return method[1] + 'let ' + method[2] + ' = ' + functionName + '(' + JSON.stringify(method[3]) +
      (method[5].trim() ? ', ' + method[5].trim() : '') + ');';
  }).join('\n');
  return lowerCoreSpiritInlineFunctions(lowered);
}

export function normalizeCoreSpiritSource(source: string): string {
  source = normalizeCoreSpiritQuantSurfaceSyntax(source);
  // Normalize readable crossing syntax structurally before any legacy line transforms.
  // This pass is token-aware, so strings/comments and nested call expressions are not
  // rewritten accidentally.
  source = normalizeReadableOperatorsWithTokens(source);
  source = normalizeCoreSpiritEventSource(source);
  source = normalizeCoreSpiritAutomationSource(source);
  const sourceLines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  for (let i=0;i<sourceLines.length;i+=1) {
    const current=sourceLines[i];
    const match=current.match(/^(\s*)when\s+(.+)$/i);
    if (match && !current.trim().endsWith(':')) {
      let merged=current;
      const baseIndent=indentation(current);
      let j=i+1;
      while (j<sourceLines.length) {
        const candidate=sourceLines[j];
        const candidateTrim=candidate.trim();
        if (candidateTrim && indentation(candidate)===baseIndent && /^(?:and|or)\s+/i.test(candidateTrim)) {
          merged += ' ' + candidateTrim;
          j+=1;
          continue;
        }
        break;
      }
      if (j>i+1) {
        lines.push(merged);
        i=j-1;
        continue;
      }
    }
    lines.push(current);
  }
  const modelNames = modelSurfaceNames(source);
  const out: string[] = [];
  const whenBlocks: number[] = [];
  const eventBlocks: number[] = [];
  const wrappers: Array<{ indent: number; kind: 'indicator' | 'strategy' | 'model' | 'automation' }> = [];
  const modelBraceIndents: number[] = [];
  // Track braces nested inside a brace-style indicator/strategy wrapper so an if-block
  // closing brace cannot be mistaken for the end of the indicator declaration.
  let indicatorInnerBraceDepth = 0;
  let researchSkipIndent: number | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = indentation(raw);

    if (!trimmed) {
      out.push('');
      continue;
    }
    if (trimmed.startsWith('//')) {
      out.push(raw);
      continue;
    }

    if (researchSkipIndent !== null) {
      if (!trimmed || indent > researchSkipIndent) continue;
      researchSkipIndent = null;
      if (trimmed === '}') continue;
    }

    if (/^backtest\s+/i.test(trimmed)) { researchSkipIndent = indent; continue; }
    if (/^evaluate\s*\{?\s*$/i.test(trimmed)) {
      researchSkipIndent = indent;
      continue;
    }

    while (whenBlocks.length && indent <= whenBlocks[whenBlocks.length - 1]) {
      const blockIndent = whenBlocks.pop()!;
      out.push(`${' '.repeat(blockIndent)}}`);
    }

    // Indentation-style event declarations lower to the parser's canonical
    // brace block. Close nested WHEN blocks first, then their containing event.
    while (eventBlocks.length && indent <= eventBlocks[eventBlocks.length - 1]!) {
      eventBlocks.pop();
      out.push('}');
    }

    const eventHeader = trimmed.match(/^on\s+([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*$/i);
    if (eventHeader) {
      const indentText = raw.match(/^[ \\t]*/)?.[0] ?? '';
      out.push(`${indentText}on ${eventHeader[1]} {`);
      eventBlocks.push(indent);
      continue;
    }

    const dataDecl = trimmed.match(/^data\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;?$/i);
    if (dataDecl) {
      const value = dataDecl[2].trim();
      const market = value.match(/^market\s*\((.*)\)$/is);
      const parts = market ? splitTopLevel(market[1]) : [];
      if (market && (parts.length === 1 || parts.length === 2)) {
        const indentText = raw.match(/^[ \t]*/)?.[0] ?? '';
        const ref = parts.length === 2 ? `market(${parts[0]}).timeframe(${parts[1]})` : `market(${parts[0]})`;
        out.push(`${indentText}let ${dataDecl[1]} = ${ref};`);
        continue;
      }
      if (/^(?:timeframe|series)\s*\(/i.test(value)) {
        const indentText = raw.match(/^[ \t]*/)?.[0] ?? '';
        out.push(`${indentText}let ${dataDecl[1]} = ${value};`);
        continue;
      }
    }

    const braceModel = trimmed.match(/^model\s+(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))(?:\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?)?\s*\{\s*$/i);
    if (braceModel) {
      wrappers.push({ indent, kind:'model' });
      modelBraceIndents.push(indent);
      // Model declarations are metadata plus a canonical executable model reference.
      // The body remains declarative research metadata and never becomes VM code.
      const indentText=raw.match(/^[ \t]*/)?.[0] ?? '';
      const modelName=braceModel[1] ?? braceModel[2] ?? braceModel[3] ?? 'Model';
      out.push(`${indentText}let ${modelName} = model(${JSON.stringify(modelName)});`);
      continue;
    }

    if (modelBraceIndents.length && trimmed === '}' && indent <= modelBraceIndents[modelBraceIndents.length - 1]!) {
      modelBraceIndents.pop();
      if (wrappers.length && wrappers[wrappers.length - 1]?.kind === 'model') wrappers.pop();
      continue;
    }

    // Remove the declaration's own closing brace from executable source, but
    // preserve nested control-flow braces such as if-condition blocks.
    const activeIndicatorWrapper = wrappers[wrappers.length - 1];
    if (trimmed === '}' && activeIndicatorWrapper &&
        (activeIndicatorWrapper.kind === 'indicator' || activeIndicatorWrapper.kind === 'strategy')) {
      if (indicatorInnerBraceDepth > 0) {
        indicatorInnerBraceDepth -= 1;
        out.push(raw);
        continue;
      } else {
        wrappers.pop();
        continue;
      }
    }

    while (wrappers.length && indent <= wrappers[wrappers.length - 1].indent) {
      wrappers.pop();
    }

    const topLevel = wrappers.length === 0;
    if (topLevel && /^strategy\s*\(.*\)\s*$/i.test(trimmed)) continue;

    // Lower indentation-style model declarations to the same canonical model handle
    // used by brace-style declarations. The indented body remains declarative metadata.
    const indentedModelHeader = trimmed.match(/^model\s+(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))\s*:\s*$/i);
    if (indentedModelHeader) {
      const modelName = indentedModelHeader[1] ?? indentedModelHeader[2] ?? indentedModelHeader[3] ?? 'Model';
      wrappers.push({ indent, kind:'model' });
      const indentText = raw.match(/^[ \t]*/)?.[0] ?? '';
      out.push(`${indentText}let ${modelName} = model(${JSON.stringify(modelName)});`);
      continue;
    }

    const wrapperHeader = trimmed.match(/^(indicator|strategy|model|automate)\s+(?:"[^"]*"|'[^']*')\s*(?::)?\s*$/i);
    if (wrapperHeader) {
      wrappers.push({ indent, kind: wrapperHeader[1].toLowerCase() as any });
      continue;
    }

    const oldIndicatorBrace = trimmed.match(/^(indicator|strategy)\s*(?:\([^)]*\)|["'][^"']*["'])\s*\{\s*$/i);
    if (oldIndicatorBrace) {
      wrappers.push({ indent, kind: oldIndicatorBrace[1].toLowerCase() as 'indicator'|'strategy' });
      indicatorInnerBraceDepth = 0;
      continue;
    }

    if (wrappers.length && wrappers[wrappers.length - 1].kind === 'model') {
      // MODEL bodies are declarative research metadata. Their feature/target
      // expressions are captured by languageConcepts/researchSurface and are not
      // executable indicator statements.
      continue;
    }

    if (wrappers.length && (wrappers[wrappers.length - 1].kind === 'indicator' || wrappers[wrappers.length - 1].kind === 'strategy')) {
      const prop = parseCoreSpiritDeclarationProperty(trimmed, 0, raw.length);
      if (prop) {
        continue;
      }
      // Ordinary statements that open a nested block contribute a brace pair
      // inside the wrapper; the wrapper's own brace is removed separately.
      if (/\{\s*$/.test(trimmed)) indicatorInnerBraceDepth += 1;
    }

    // Dedicated WHEN concept: indentation/colon is only a source convenience.
    const whenMatch = trimmed.match(/^when\s+(.+?)\s*:\s*$/i);
    if (whenMatch) {
      out.push(`if (${whenCondition(whenMatch[1], modelNames)}) {`);
      whenBlocks.push(indent);
      continue;
    }

    const bareWhen = trimmed.match(/^when\s+(.+?)$/i);
    if (bareWhen && !trimmed.endsWith(':')) {
      out.push(`if (${whenCondition(bareWhen[1], modelNames)}) {`);
      whenBlocks.push(indent);
      continue;
    }

    // SHOW is one semantic concept even when multiple expressions are listed.
    if (/^show\b/i.test(trimmed)) {
      const shown = transformShow(raw, modelNames);
      out.push(...(Array.isArray(shown) ? shown : [shown]));
      continue;
    }

    // Ignore declaration-only model prediction lines; the model declaration is
    // retained in surface metadata attached to the same compiled artifact.
    if (wrappers.length && wrappers[wrappers.length - 1].kind === 'model' && /^predict\s+/i.test(trimmed)) continue;

    let currentLines: string[] = [raw];
    for (const transform of CORE_SPIRIT_SURFACE_TRANSFORMS) {
      currentLines = currentLines.flatMap(line => {
        const result = withProtectedCoreSpiritSurfaceText(line, protectedLine => transform.apply(protectedLine));
        return typeof result === 'string' ? [result] : (result.lines || [result.line]);
      });
    }
    out.push(...currentLines);
  }

  while (whenBlocks.length) {
    out.push('}');
    whenBlocks.pop();
  }
  while (eventBlocks.length) {
    out.push('}');
    eventBlocks.pop();
  }

  return out.join('\n');
}

export function describeCoreSpiritSurface(source: string, options: { components?: CoreSpiritComponentRegistryLike } = {}): CoreSpiritSurfaceMetadata {
  const traceSmcSurface = source.includes('Smart Money Concepts [CoreSpirit]') && source.includes('swingBullBreak');
  const trace = (stage: string): void => { if (traceSmcSurface) console.log('SMC_SURFACE_TRACE', stage); };
  trace('extract:start');
  const surface = extractCoreSpiritSurfaceMetadata(source);
  trace('extract:done');
  trace('normalize:start');
  const normalized = normalizeCoreSpiritSource(source);
  trace('normalize:done');
  trace('parse:start');
  const parsed = new CoreSpiritParser(normalized).parseDetailed();
  trace('parse:done');
  trace('semantic:start');
  const semantic = parsed.diagnostics.length ? null : analyzeCoreSpirit(parsed.ast,{ surface, components: options.components });
  trace('semantic:done');
  if (!semantic) return surface;
  trace('composition-graph:start');
  const graph = buildCoreSpiritCompositionGraph(parsed.ast,semantic,surface);
  trace('composition-graph:done');
  return {
    ...surface,
    composition: {
      version: graph.version,
      sourceGraphVersion: graph.sourceGraphVersion,
      nodes: graph.nodes.map(node => ({ id: node.id, kind: node.kind, name: node.name, contract: node.contract })),
      edges: graph.edges.map(edge => ({ from: edge.from, to: edge.to, relation: edge.relation })),
    },
  };
}