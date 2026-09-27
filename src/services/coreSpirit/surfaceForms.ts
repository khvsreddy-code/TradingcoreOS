import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts';
import { inferCoreSpiritPointCall, parseCoreSpiritCoordinatePair } from './visualSurface';
import { modelSurfaceNames, normalizeCoreSpiritModelReferences, normalizedModelReference, isModelNameExpression } from './modelSurface';
import { normalizeCoreSpiritAutomationSource } from './automationSurface';
import { normalizeCoreSpiritEventSource, normalizeCoreSpiritWhenCondition } from './eventSurface';
import { buildCoreSpiritCompositionGraph } from './composability';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
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

  // `show signal "LONG" above|below bar` is a visual projection, not signal emission.
  const signal = rest.match(/^signal\s+("[^"]*"|'[^']*'|\S+)\s+(above|below)(?:\s+bar)?$/i);
  if (signal) {
    const relative = signal[2].toLowerCase() === 'above' ? 'above_bar(0)' : 'below_bar(0)';
    return wrap(`show("signal", ${signal[1]}, ${relative}, ${area})`);
  }

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
      if (ifMatch && !ifMatch[2].startsWith('(')) return { line: `${ifMatch[1]}if (${ifMatch[2].trim()}) {` };
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

export function normalizeCoreSpiritSource(source: string): string {
  // Normalize readable crossing syntax structurally before any legacy line transforms.
  // This pass is token-aware, so strings/comments and nested call expressions are not
  // rewritten accidentally.
  source = normalizeReadableOperatorsWithTokens(source);
  source = normalizeCoreSpiritEventSource(source);
  source = normalizeCoreSpiritAutomationSource(source);
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const modelNames = modelSurfaceNames(source);
  const out: string[] = [];
  const whenBlocks: number[] = [];
  const wrappers: Array<{ indent: number; kind: 'indicator' | 'model' | 'automation' }> = [];

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

    // Explicit braces remain authoritative. Generated indentation blocks are
    // closed when source indentation returns to the block's parent level.
    while (whenBlocks.length && indent <= whenBlocks[whenBlocks.length - 1]) {
      const blockIndent = whenBlocks.pop()!;
      out.push(`${' '.repeat(blockIndent)}}`);
    }

    while (wrappers.length && indent <= wrappers[wrappers.length - 1].indent) {
      wrappers.pop();
    }

    const topLevel = wrappers.length === 0;
    if (topLevel && /^strategy\s*\(.*\)\s*$/i.test(trimmed)) continue;

    const wrapperHeader = trimmed.match(/^(indicator|model|automate)\s+(?:"[^"]*"|'[^']*')\s*:\s*$/i);
    if (wrapperHeader) {
      wrappers.push({ indent, kind: wrapperHeader[1].toLowerCase() as any });
      continue;
    }

    const oldIndicatorBrace = trimmed.match(/^indicator\s*(?:\([^)]*\)|["'][^"']*["'])\s*\{\s*$/i);
    if (oldIndicatorBrace) {
      wrappers.push({ indent, kind: 'indicator' });
      continue;
    }

    if (wrappers.length && wrappers[wrappers.length - 1].kind === 'model') {
      if (/^(?:features|inputs?|outputs?)\s*:\s*$/i.test(trimmed)) continue;
      if (/^use\s+(?:(?:python|cpp|rust|wasm|onnx|remote)\s+)?(?:"[^"]+"|'[^']+')\s*$/i.test(trimmed)) continue;
      if (/^predict\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i.test(trimmed)) continue;
      if (/^[A-Za-z_][A-Za-z0-9_]*(?:\s*:\s*(?:number|string|boolean|series<number>))?\s*(?:,\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*:\s*(?:number|string|boolean|series<number>))?)*$/i.test(trimmed)) continue;
    }

    // Dedicated WHEN concept: indentation/colon is only a source convenience.
    const whenMatch = trimmed.match(/^when\s+(.+?)\s*:\s*$/i);
    if (whenMatch) {
      out.push(`if (${whenCondition(whenMatch[1], modelNames)}) {`);
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

  return out.join('\n');
}

export function describeCoreSpiritSurface(source: string): CoreSpiritSurfaceMetadata {
  const surface = extractCoreSpiritSurfaceMetadata(source);
  const normalized = normalizeCoreSpiritSource(source);
  const parsed = new CoreSpiritParser(normalized).parseDetailed();
  const semantic = parsed.diagnostics.length ? null : analyzeCoreSpirit(parsed.ast,{ surface });
  if (!semantic) return surface;
  const graph = buildCoreSpiritCompositionGraph(parsed.ast,semantic,surface);
  return {
    ...surface,
    composition: {
      version: graph.version,
      nodes: graph.nodes.map(node => ({ id: node.id, kind: node.kind, name: node.name, contract: node.contract })),
      edges: graph.edges.map(edge => ({ from: edge.from, to: edge.to, relation: edge.relation })),
    },
  };
}