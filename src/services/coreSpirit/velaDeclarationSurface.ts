/**
 * CoreSpirit declaration metadata used at the Vela scripting boundary.
 * This module contains no renderer, broker, DOM, or network dependencies.
 */
export type CoreSpiritDeclarationValue = number | string | boolean;

export type CoreSpiritDeclarationField = Readonly<{
  key: string;
  typeName?: string;
  defval: CoreSpiritDeclarationValue;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
  tooltip?: string;
  group?: string;
  inline?: string;
  tab?: string;
  options?: readonly string[];
}>;

export type CoreSpiritScriptDeclaration = Readonly<{
  kind: 'indicator' | 'strategy';
  name: string;
  inputs: readonly CoreSpiritDeclarationField[];
  props: readonly CoreSpiritDeclarationField[];
}>;

const INPUT_ATTRIBUTE_KEYS = new Set(['min','max','step','title','tooltip','group','inline','tab','options']);
const INDICATOR_PROP_KEYS = new Set(['title','shorttitle','overlay','precision','format']);
const STRATEGY_PROP_KEYS = new Set([
  ...INDICATOR_PROP_KEYS,
  'initialcapital','initial_capital',
  'commission','commissionpercent','commission_percent',
  'pyramiding','slippage',
  'calconorderfills','calc_on_order_fills',
  'processordersonclose','process_orders_on_close',
]);

function unquote(value: string): string {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    const body = text.slice(1, -1);
    return body.replace(/\\(["'])/g, '$1').replace(/\\\\/g, '\\');
  }
  return text;
}

function parseLiteral(value: string): CoreSpiritDeclarationValue {
  const text = value.trim();
  if (/^(?:true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return Number(text);
  const quoted = (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"));
  if (quoted) return unquote(text);
  const constructor = text.match(/^(?:int|float|number|bool|string|color|price|time|duration)\((.*)\)$/i);
  if (constructor) return parseLiteral(constructor[1]!);
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text;
  return unquote(text);
}

function splitTail(value: string): { primary: string; attributes: Map<string,string> } {
  const attributes = new Map<string,string>();
  let splitAt = -1;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth += 1; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth = Math.max(0, depth - 1); continue; }
    if (depth !== 0 || !/\s/.test(ch)) continue;

    let j = i;
    while (j < value.length && /\s/.test(value[j]!)) j += 1;
    const keyMatch = value.slice(j).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/);
    if (!keyMatch) continue;
    const key = keyMatch[1]!.toLowerCase();
    if (!INPUT_ATTRIBUTE_KEYS.has(key)) continue;

    if (splitAt < 0) splitAt = i;
    const valueStart = j + keyMatch[0].length;
    let k = valueStart;
    let localDepth = 0;
    let localQuote: '"' | "'" | null = null;
    let localEscaped = false;
    for (; k < value.length; k += 1) {
      const c = value[k]!;
      if (localQuote) {
        if (localEscaped) { localEscaped = false; continue; }
        if (c === '\\') { localEscaped = true; continue; }
        if (c === localQuote) localQuote = null;
        continue;
      }
      if (c === '"' || c === "'") { localQuote = c; continue; }
      if (c === '(' || c === '[' || c === '{') { localDepth += 1; continue; }
      if (c === ')' || c === ']' || c === '}') { localDepth = Math.max(0, localDepth - 1); continue; }
      if (localDepth === 0 && /\s/.test(c)) {
        let q = k;
        while (q < value.length && /\s/.test(value[q]!)) q += 1;
        if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(value.slice(q))) break;
      }
    }
    attributes.set(key, value.slice(valueStart, k).trim());
    i = Math.max(i, k - 1);
  }
  const primary = splitAt < 0 ? value.trim() : value.slice(0, splitAt).trim();
  return { primary, attributes };
}

function parseNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const number = Number(parseLiteral(value));
  return Number.isFinite(number) ? number : undefined;
}

function parseOptions(value: string | undefined): readonly string[] | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const inner = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text;
  const values: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const ch of inner) {
    if (quote) {
      if (escaped) { current += ch; escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) { quote = null; continue; }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ',') {
      const item = current.trim();
      if (item) values.push(unquote(item));
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) values.push(unquote(tail));
  return values.length ? Object.freeze(values) : undefined;
}

function inferTypeName(explicit: string | undefined, defval: CoreSpiritDeclarationValue): string {
  const type = explicit?.trim().toLowerCase();
  if (type === 'bool') return 'boolean';
  if (type) return type;
  if (typeof defval === 'boolean') return 'boolean';
  if (typeof defval === 'number') return Number.isInteger(defval) ? 'int' : 'float';
  return 'string';
}

function displayTitle(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

function canonicalPropKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === 'initialcapital' || lower === 'initial_capital') return 'initial_capital';
  if (lower === 'commissionpercent' || lower === 'commission_percent') return 'commission';
  if (lower === 'calconorderfills') return 'calc_on_order_fills';
  if (lower === 'processordersonclose') return 'process_orders_on_close';
  return key;
}

function propAllowed(kind: CoreSpiritScriptDeclaration['kind'], key: string): boolean {
  return (kind === 'strategy' ? STRATEGY_PROP_KEYS : INDICATOR_PROP_KEYS).has(key.toLowerCase());
}

function parseField(raw: string, mode: 'input' | 'prop'): CoreSpiritDeclarationField | null {
  if (mode === 'input') {
    const match = raw.trim().match(/^input\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_<>]*))?\s*=\s*(.+)$/i);
    if (!match) return null;
    const key = match[1]!;
    const { primary, attributes } = splitTail(match[3]!);
    if (!primary) return null;
    const defval = parseLiteral(primary);
    return Object.freeze({
      key,
      typeName: inferTypeName(match[2], defval),
      defval,
      min: parseNumber(attributes.get('min')),
      max: parseNumber(attributes.get('max')),
      step: parseNumber(attributes.get('step')),
      title: attributes.get('title') ? unquote(attributes.get('title')!) : displayTitle(key),
      tooltip: attributes.get('tooltip') ? unquote(attributes.get('tooltip')!) : undefined,
      group: attributes.get('group') ? unquote(attributes.get('group')!) : undefined,
      inline: attributes.get('inline') ? unquote(attributes.get('inline')!) : undefined,
      tab: attributes.get('tab') ? unquote(attributes.get('tab')!) : undefined,
      options: parseOptions(attributes.get('options')),
    });
  }

  const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (!match) return null;
  const key = canonicalPropKey(match[1]!);
  const value = parseLiteral(match[2]!);
  return Object.freeze({
    key,
    defval: value,
    typeName: inferTypeName(undefined, value),
    title: displayTitle(key),
  });
}

export function isCoreSpiritDeclarationPropertyLine(line: string, kind: 'indicator' | 'strategy'): boolean {
  const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*.+$/);
  return !!match && propAllowed(kind, match[1]!);
}

export function parseCoreSpiritScriptDeclaration(source: string): CoreSpiritScriptDeclaration | null {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  let active: { kind: 'indicator' | 'strategy'; name: string; indent: number } | null = null;
  let declarationIndent = -1;
  const inputs: CoreSpiritDeclarationField[] = [];
  const props = new Map<string, CoreSpiritDeclarationField>();

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
    if (!trimmed || trimmed.startsWith('//')) continue;

    const header = trimmed.match(/^(indicator|strategy)\s+(?:"([^"]+)"|'([^']+)')\s*:\s*$/i);
    if (header) {
      if (active) break;
      active = { kind: header[1]!.toLowerCase() as 'indicator' | 'strategy', name: header[2] ?? header[3] ?? 'CoreSpirit', indent };
      declarationIndent = indent;
      continue;
    }
    if (!active) continue;
    if (indent <= declarationIndent) break;

    const input = parseField(trimmed, 'input');
    if (input) {
      inputs.push(input);
      continue;
    }
    const propKey = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? '';
    if (propAllowed(active.kind, propKey)) {
      const prop = parseField(trimmed, 'prop');
      if (prop) props.set(prop.key, prop);
    }
  }

  if (!active) {
    const fallback = lines.find((line) => line.trim().match(/^(indicator|strategy)\s+(?:"[^"]+"|'[^']+')/i));
    const match = fallback?.trim().match(/^(indicator|strategy)\s+(?:"([^"]+)"|'([^']+)')/i);
    if (!match) return null;
    active = { kind: match[1]!.toLowerCase() as 'indicator' | 'strategy', name: match[2] ?? match[3] ?? 'CoreSpirit', indent: 0 };
  }

  return Object.freeze({
    kind: active.kind,
    name: active.name,
    inputs: Object.freeze(inputs.slice(0, 128)),
    props: Object.freeze([...props.values()].slice(0, 64)),
  });
}

export function coreSpiritDeclarationLiteral(value: CoreSpiritDeclarationValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (!Number.isFinite(value)) throw new Error('CoreSpirit declaration value must be finite.');
  return String(value);
}

export function bindCoreSpiritInputValues(
  normalizedSource: string,
  declaration: CoreSpiritScriptDeclaration,
  values: Readonly<Record<string, CoreSpiritDeclarationValue>>,
): string {
  const lines = normalizedSource.replace(/\r\n?/g, '\n').split('\n');
  const remaining = new Set(declaration.inputs.map((input) => input.key));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const match = line.match(/^(\s*)let\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*.+?;?\s*$/);
    if (!match) continue;
    const key = match[2]!;
    if (!remaining.has(key)) continue;
    const field = declaration.inputs.find((input) => input.key === key);
    const value = values[key] ?? field?.defval;
    if (value === undefined || !field) continue;
    lines[i] = `${match[1]}let ${key}${field.typeName ? `: ${field.typeName}` : ''} = ${coreSpiritDeclarationLiteral(value)};`;
    remaining.delete(key);
  }
  if (remaining.size) throw new Error(`CoreSpirit input declarations could not be bound: ${[...remaining].join(', ')}`);
  return lines.join('\n');
}
