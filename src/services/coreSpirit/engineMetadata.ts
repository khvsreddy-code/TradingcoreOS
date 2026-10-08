import type { CoreSpiritLanguageConcept } from './languageConcepts';

export const CORE_SPIRIT_RUNTIME_METADATA_VERSION = 1 as const;

export type CoreSpiritParameterType =
  | 'int'
  | 'float'
  | 'bool'
  | 'string'
  | 'source'
  | 'color'
  | 'price'
  | 'time'
  | 'session'
  | 'timeframe'
  | 'symbol'
  | 'text_area';

export type CoreSpiritParameterValue = number | string | boolean;

export type CoreSpiritParameterSchema = Readonly<{
  key: string;
  title: string;
  type: CoreSpiritParameterType;
  defval: CoreSpiritParameterValue;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  group?: string;
  inline?: string;
  tab?: string;
  tooltip?: string;
}>;

export type CoreSpiritDeclarationKind = 'indicator' | 'strategy';

export type CoreSpiritDeclarationMetadata = Readonly<{
  kind: CoreSpiritDeclarationKind;
  name: string;
  title: string;
  shorttitle?: string;
  overlay?: boolean;
  precision?: number;
  format?: string;
  start: number;
  end: number;
}>;

export type CoreSpiritRuntimeMetadata = Readonly<{
  version: typeof CORE_SPIRIT_RUNTIME_METADATA_VERSION;
  inputs: readonly CoreSpiritParameterSchema[];
  props: readonly CoreSpiritParameterSchema[];
  declaration?: CoreSpiritDeclarationMetadata;
  viewportDependent: boolean;
  concepts: readonly CoreSpiritLanguageConcept[];
}>;

type Scope = {
  kind: 'indicator' | 'strategy' | 'model' | 'automation';
  indent: number;
  brace: boolean;
  start: number;
};

const PARAM_TYPES = new Set<CoreSpiritParameterType>([
  'int',
  'float',
  'bool',
  'string',
  'source',
  'color',
  'price',
  'time',
  'session',
  'timeframe',
  'symbol',
  'text_area',
]);

const INDICATOR_PROPS: Readonly<Record<string, CoreSpiritParameterType>> = Object.freeze({
  precision: 'int',
  overlay: 'bool',
  shorttitle: 'string',
  format: 'string',
});

const STRATEGY_PROPS: Readonly<Record<string, CoreSpiritParameterType>> = Object.freeze({
  initialCapital: 'float',
  commission: 'float',
  precision: 'int',
  overlay: 'bool',
  shorttitle: 'string',
  format: 'string',
});

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (value) => value.toUpperCase());
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) return trimmed;
  try {
    if (quote === '"') return JSON.parse(trimmed) as string;
  } catch {
    // Fall through to the single-quoted/simple escape path.
  }
  return trimmed.slice(1, -1).replace(/\\([\\'"])/g, '$1').replace(/\\n/g, '\n');
}

function scalar(value: string, type: CoreSpiritParameterType): CoreSpiritParameterValue {
  const trimmed = value.trim();
  if (type === 'string' || type === 'source' || type === 'color' || type === 'price' || type === 'time' || type === 'session' || type === 'timeframe' || type === 'symbol' || type === 'text_area') {
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return unquote(trimmed);
    if (type === 'price' || type === 'time') {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric : trimmed;
    }
    return trimmed;
  }
  if (type === 'bool') {
    if (/^true$/i.test(trimmed)) return true;
    if (/^false$/i.test(trimmed)) return false;
    throw new Error('boolean parameter defaults must be true or false');
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) throw new Error('numeric parameter defaults must be finite numbers');
  return numeric;
}

function readToken(text: string, start: number): { token: string; next: number } {
  let i = start;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  const begin = i;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let paren = 0;
  let bracket = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '(') paren += 1;
    else if (ch === ')' && paren > 0) paren -= 1;
    else if (ch === '[') bracket += 1;
    else if (ch === ']' && bracket > 0) bracket -= 1;
    else if (paren === 0 && bracket === 0 && /\s/.test(ch)) break;
    i += 1;
  }
  return { token: text.slice(begin, i), next: i };
}

function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i += 1;
    if (i >= text.length) break;
    const keyStart = i;
    while (i < text.length && /[A-Za-z0-9_]/.test(text[i]!)) i += 1;
    if (i === keyStart) {
      i += 1;
      continue;
    }
    const key = text.slice(keyStart, i);
    while (i < text.length && /\s/.test(text[i]!)) i += 1;
    if (text[i] !== '=') {
      while (i < text.length && !/\s/.test(text[i]!)) i += 1;
      continue;
    }
    i += 1;
    const token = readToken(text, i);
    if (token.token) out[key] = token.token;
    i = token.next;
  }
  return out;
}

function normalizeType(raw: string | undefined): CoreSpiritParameterType {
  const value = String(raw ?? 'float').trim().toLowerCase();
  if (value === 'number') return 'float';
  if (value === 'bool' || value === 'boolean') return 'bool';
  if (value === 'int' || value === 'integer') return 'int';
  if (value === 'float' || value === 'string' || value === 'source' || value === 'color' || value === 'price' || value === 'time' || value === 'session' || value === 'timeframe' || value === 'symbol' || value === 'text_area') return value;
  throw new Error(`Unsupported CoreSpirit input type "${raw}".`);
}

function parseParameterLine(trimmed: string): { schema: CoreSpiritParameterSchema; kind: 'input' | 'prop' } | null {
  const input = trimmed.match(/^input\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*)?=\\s*(.+)$/i);
  const prop = trimmed.match(/^prop\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*)?=\\s*(.+)$/i);
  const match = input ?? prop;
  if (!match) return null;

  const name = match[1]!;
  let type: CoreSpiritParameterType | undefined = match[2] ? normalizeType(match[2]) : undefined;
  let rhs = match[3]!.trim();

  const callForm = rhs.match(/^(int|integer|float|number|bool|boolean|string|color|price|time|session|timeframe|symbol|source|text_area)\\s*\\((.*)\\)$/i);
  if (!type && callForm) {
    type = normalizeType(callForm[1]);
    rhs = callForm[2].trim();
  }
  type ??= /^true$|^false$/i.test(rhs) ? 'bool' : /^-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)$/.test(rhs) ? 'float' : 'string';

  const { token: defaultToken, next } = readToken(rhs, 0);
  if (!defaultToken) throw new Error(`CoreSpirit parameter "${name}" is missing a default value.`);
  const rest = rhs.slice(next);
  const attrs = attributes(rest);

  const value = scalar(defaultToken, type);
  const numericAttr = (key: string): number | undefined => {
    const raw = attrs[key];
    if (raw == null) return undefined;
    const n = Number(unquote(raw));
    if (!Number.isFinite(n)) throw new Error(`CoreSpirit parameter "${name}" has a non-numeric ${key}=${raw}.`);
    return n;
  };

  const optionsRaw = attrs.options;
  let options: readonly string[] | undefined;
  if (optionsRaw) {
    const inside = optionsRaw.trim().replace(/^\\[/, '').replace(/\\]$/, '');
    options = Object.freeze(inside.split(',').map((entry) => unquote(entry.trim())).filter(Boolean));
  }

  const schema: CoreSpiritParameterSchema = Object.freeze({
    key: name,
    title: attrs.title ? unquote(attrs.title) : humanizeKey(name),
    type,
    defval: value,
    ...(numericAttr('min') !== undefined ? { min: numericAttr('min') } : {}),
    ...(numericAttr('max') !== undefined ? { max: numericAttr('max') } : {}),
    ...(numericAttr('step') !== undefined ? { step: numericAttr('step') } : {}),
    ...(options?.length ? { options } : {}),
    ...(attrs.group ? { group: unquote(attrs.group) } : {}),
    ...(attrs.inline ? { inline: unquote(attrs.inline) } : {}),
    ...(attrs.tab ? { tab: unquote(attrs.tab) } : {}),
    ...(attrs.tooltip ? { tooltip: unquote(attrs.tooltip) } : {}),
  });
  return { schema, kind: input ? 'input' : 'prop' };
}

function propFromAssignment(name: string, rhs: string, declaration: CoreSpiritDeclarationMetadata): CoreSpiritParameterSchema | null {
  const map = declaration.kind === 'indicator' ? INDICATOR_PROPS : STRATEGY_PROPS;
  const type = map[name];
  if (!type) return null;
  const { token, next } = readToken(rhs.trim(), 0);
  if (!token) return null;
  const value = scalar(token, type);
  const rest = rhs.slice(next);
  const attrs = attributes(rest);
  return Object.freeze({
    key: name,
    title: attrs.title ? unquote(attrs.title) : humanizeKey(name),
    type,
    defval: value,
    ...(name === 'precision' ? { min: 0, max: 12, step: 1 } : {}),
    ...(name === 'initialCapital' ? { min: 0, step: 1 } : {}),
    ...(name === 'commission' ? { min: 0, step: 0.01 } : {}),
    ...(name === 'shorttitle' ? {} : {}),
    ...(attrs.group ? { group: unquote(attrs.group) } : {}),
    ...(attrs.tooltip ? { tooltip: unquote(attrs.tooltip) } : {}),
  });
}

function declarationFromHeader(kind: 'indicator' | 'strategy', name: string, start: number): CoreSpiritDeclarationMetadata {
  return {
    kind,
    name,
    title: name,
    overlay: kind === 'indicator' ? true : undefined,
    start,
    end: start,
  };
}

function parseHeader(trimmed: string): { kind: 'indicator' | 'strategy'; name: string; brace: boolean } | null {
  const header = trimmed.match(/^(indicator|strategy)\\s+(?:["']([^"']+)["']|([A-Za-z_][A-Za-z0-9_]*))(\\s*:\\s*|\\s*\\{\\s*|\\s*)$/i);
  if (!header) return null;
  return {
    kind: header[1]!.toLowerCase() as 'indicator' | 'strategy',
    name: header[2] ?? header[3] ?? (header[1] === 'strategy' ? 'Strategy' : 'Indicator'),
    brace: /\\{\\s*$/.test(trimmed),
  };
}

function parseLegacyStrategyCall(trimmed: string, start: number): CoreSpiritDeclarationMetadata | null {
  const match = trimmed.match(/^strategy\\s*\\(\\s*(?:"([^"]+)"|'([^']+)')(.+)?\\)\\s*;?$/i);
  if (!match) return null;
  const name = match[1] ?? match[2] ?? 'Strategy';
  const declaration = declarationFromHeader('strategy', name, start);
  declaration.end = start + trimmed.length;
  return declaration;
}

function isViewportFunctionName(name: string): boolean {
  return /^(?:vpvr|volumeProfile|visual\\.volumeProfile|visible_(?:bar|range|time)|chart\\.(?:left|right)(?:_visible)?)/i.test(name);
}

export function extractCoreSpiritRuntimeMetadata(source: string): CoreSpiritRuntimeMetadata {
  const lines = String(source ?? '').replace(/\\r\\n?/g, '\n').split('\n');
  const inputs: CoreSpiritParameterSchema[] = [];
  const props: CoreSpiritParameterSchema[] = [];
  const scopes: Scope[] = [];
  let declaration: CoreSpiritDeclarationMetadata | undefined;
  let offset = 0;
  let viewportDependent = false;

  const closeIndentScopes = (indent: number, position: number): void => {
    while (scopes.length && !scopes[scopes.length - 1]!.brace && indent <= scopes[scopes.length - 1]!.indent) {
      const closed = scopes.pop()!;
      if ((closed.kind === 'indicator' || closed.kind === 'strategy') && declaration?.start === closed.start) declaration = { ...declaration, end: Math.max(declaration.end, position) };
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^[ \\t]*/)?.[0].replace(/\\t/g, '  ').length ?? 0;

    if (trimmed) closeIndentScopes(indent, offset);

    const legacyStrategy = parseLegacyStrategyCall(trimmed, offset);
    if (legacyStrategy) {
      declaration = legacyStrategy;
      offset += raw.length + 1;
      continue;
    }

    const header = parseHeader(trimmed);
    if (header) {
      declaration = { ...declarationFromHeader(header.kind, header.name, offset), end: offset + raw.length };
      scopes.push({ kind: header.kind, indent, brace: header.brace, start: offset });
      offset += raw.length + 1;
      continue;
    }

    if (trimmed === '}') {
      const closed = scopes.pop();
      if (closed && (closed.kind === 'indicator' || closed.kind === 'strategy') && declaration?.start === closed.start) declaration = { ...declaration, end: offset + raw.length };
      offset += raw.length + 1;
      continue;
    }

    const parsed = parseParameterLine(trimmed);
    if (parsed) {
      if (parsed.kind === 'input') inputs.push(parsed.schema);
      else props.push(parsed.schema);
    } else if (declaration && (declaration.kind === 'indicator' || declaration.kind === 'strategy')) {
      const property = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.+)$/);
      if (property) {
        const schema = propFromAssignment(property[1]!, property[2]!, declaration);
        if (schema) {
          const existing = props.findIndex((item) => item.key === schema.key);
          if (existing >= 0) props.splice(existing, 1, schema);
          else props.push(schema);
          if (schema.key === 'precision') declaration = { ...declaration, precision: Number(schema.defval) };
          else if (schema.key === 'overlay') declaration = { ...declaration, overlay: Boolean(schema.defval) };
          else if (schema.key === 'shorttitle') declaration = { ...declaration, shorttitle: String(schema.defval) };
          else if (schema.key === 'format') declaration = { ...declaration, format: String(schema.defval) };
        }
      }
    }

    if (/\\b(?:vpvr|volumeProfile)\\s*\\(/i.test(trimmed)) viewportDependent = true;
    if (/\\b(?:visible_(?:bar|range|time)|chart\\.(?:left|right)(?:_visible)?)\\b/i.test(trimmed)) viewportDependent = true;

    const callNames = [...trimmed.matchAll(/\\b([A-Za-z_][A-Za-z0-9_.]*)\\s*\\(/g)].map((match) => match[1]!);
    if (callNames.some(isViewportFunctionName)) viewportDependent = true;

    offset += raw.length + 1;
  }

  const unique = (rows: readonly CoreSpiritParameterSchema[]): readonly CoreSpiritParameterSchema[] => {
    const seen = new Set<string>();
    return Object.freeze(rows.filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    }).map((row) => Object.freeze({ ...row })));
  };

  return Object.freeze({
    version: CORE_SPIRIT_RUNTIME_METADATA_VERSION,
    inputs: unique(inputs),
    props: unique(props),
    ...(declaration ? { declaration: Object.freeze(declaration) } : {}),
    viewportDependent,
    concepts: Object.freeze([]),
  });
}
