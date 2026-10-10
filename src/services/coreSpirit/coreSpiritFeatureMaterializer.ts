/**
 * Deterministic, bounded feature materialization for CoreSpirit model research.
 *
 * This deliberately evaluates an allowlisted expression grammar instead of
 * eval()/Function(), so user-authored research source cannot execute arbitrary
 * server code. It accepts candle snapshots; market-history acquisition remains
 * the responsibility of the authenticated data provider.
 */
export type CoreSpiritResearchBar = Readonly<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>;

export type CoreSpiritFeatureDefinition = Readonly<{ name: string; expression: string }>;
export type CoreSpiritFeatureRow = Readonly<{ timestamp: number; values: readonly number[] }>;
export type CoreSpiritFeatureRange = Readonly<{ from: string; to: string }>;

const MAX_INPUT_BARS = 10_000;
const MAX_OUTPUT_ROWS = 1_024;
const MAX_FEATURES = 16;
const MAX_PERIOD = 512;

function splitArguments(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\\\") { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
    if (depth < 0) throw new Error('Malformed CoreScript feature expression: unmatched closing delimiter.');
  }
  if (quote || depth !== 0) throw new Error('Malformed CoreScript feature expression: unclosed string or delimiter.');
  const tail = source.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function unquote(value: string): string | null {
  const text = value.trim();
  if (text.length < 2 || !((text[0] === '"' && text.at(-1) === '"') ||
      (text[0] === "'" && text.at(-1) === "'"))) return null;
  return text.slice(1, -1).replace(/\\([\\\"'nrt])/g, (_match, code: string) =>
    code === 'n' ? '\n' : code === 'r' ? '\r' : code === 't' ? '\t' : code);
}

/** Extract named feature expressions from the supported dataset/featureSet declarations. */
export function extractCoreSpiritFeatureDefinitions(source: string): CoreSpiritFeatureDefinition[] {
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  const block = text.match(/(?:^|\n)[ \t]*(?:features?|inputs?)[ \t]*[:=][ \t]*(?:dataset|featureSet)[ \t]*\{([\s\S]*?)\n[ \t]*\}/i);
  let definitions: CoreSpiritFeatureDefinition[] = [];
  if (block) {
    for (const rawLine of block[1]!.split('\n')) {
      const line = rawLine.replace(/\/\/.*$/, '').trim().replace(/,$/, '');
      if (!line) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)[ \t]*(?::|=)[ \t]*(.+)$/);
      if (!match) throw new Error('Feature declarations must use name: expression or name = expression syntax.');
      definitions.push({ name: match[1]!, expression: match[2]!.trim() });
    }
  } else {
    const startMatch = /\bdataset[ \t]*\(/i.exec(text);
    if (startMatch) {
      const open = (startMatch.index ?? 0) + startMatch[0].lastIndexOf('(');
      let depth = 0;
      let quote: string | null = null;
      let escaped = false;
      let close = -1;
      for (let index = open; index < text.length; index += 1) {
        const ch = text[index]!;
        if (quote) {
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '(') depth += 1;
        else if (ch === ')' && --depth === 0) { close = index; break; }
      }
      if (close < 0 || quote) throw new Error('Malformed dataset(...) feature declaration.');
      const args = splitArguments(text.slice(open + 1, close));
      if (args.length % 2 !== 0) throw new Error('dataset(...) must alternate quoted feature names and feature expressions.');
      for (let i = 0; i < args.length; i += 2) {
        const name = unquote(args[i]!);
        if (!name) throw new Error('dataset(...) feature names must be quoted strings.');
        definitions.push({ name, expression: args[i + 1]! });
      }
    }
  }
  if (!definitions.length) throw new Error('No materializable feature expressions were found in the CoreScript dataset declaration.');
  if (definitions.length > MAX_FEATURES) throw new Error('CoreSpirit research supports at most 16 features per model.');
  const seen = new Set<string>();
  for (const definition of definitions) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(definition.name)) {
      throw new Error('Invalid CoreSpirit feature name: ' + definition.name);
    }
    if (seen.has(definition.name)) throw new Error('Duplicate CoreSpirit feature name: ' + definition.name);
    seen.add(definition.name);
  }
  return definitions;
}

type FeatureOperation =
  | { kind: 'field'; field: 'open' | 'high' | 'low' | 'close' | 'volume' }
  | { kind: 'pctchange'; period: number }
  | { kind: 'logreturn'; period: number }
  | { kind: 'sma' | 'ema' | 'rsi'; period: number; field: 'open' | 'high' | 'low' | 'close' | 'volume' }
  | { kind: 'atr'; period: number }
  | { kind: 'zscore'; period: number; field: 'open' | 'high' | 'low' | 'close' | 'volume' };

const FIELDS = new Set(['open', 'high', 'low', 'close', 'volume']);

function parsePeriod(value: string, featureName: string): number {
  const period = Number(value);
  if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
    throw new Error('Feature ' + featureName + ' period must be an integer between 1 and ' + MAX_PERIOD + '.');
  }
  return period;
}

function parseOperation(definition: CoreSpiritFeatureDefinition): FeatureOperation {
  const expression = definition.expression.trim().replace(/\s+/g, '').toLowerCase();
  if (FIELDS.has(expression)) return { kind: 'field', field: expression as 'open' | 'high' | 'low' | 'close' | 'volume' };
  const alias = expression.match(/^(ret|returns?)(\d+)$/);
  if (alias) return { kind: 'pctchange', period: parsePeriod(alias[2]!, definition.name) };
  const atrAlias = expression.match(/^atr(\d+)$/);
  if (atrAlias) return { kind: 'atr', period: parsePeriod(atrAlias[1]!, definition.name) };
  if (expression === 'volumez' || expression === 'volumezscore') {
    return { kind: 'zscore', field: 'volume', period: 20 };
  }
  const call = expression.match(/^([a-z]+)\((.*)\)$/);
  if (!call) throw new Error('Unsupported feature expression for ' + definition.name + ': ' + definition.expression +
    '. Supported expressions: OHLCV fields, pctchange(close[, n]), logreturn(close[, n]), sma/ema/rsi(close, n), atr(n), zscore(volume, n), retN, atrN and volumeZ.');
  const name = call[1]!;
  const args = splitArguments(call[2]!);
  if (name === 'pctchange' || name === 'logreturn') {
    if ((args.length < 1 || args.length > 2) || args[0]!.toLowerCase() !== 'close') {
      throw new Error(name + ' currently requires close and an optional lookback period.');
    }
    return { kind: name, period: args[1] ? parsePeriod(args[1], definition.name) : 1 };
  }
  if (name === 'atr') {
    if (args.length !== 1) throw new Error('atr(period) expects exactly one argument.');
    return { kind: 'atr', period: parsePeriod(args[0]!, definition.name) };
  }
  if (name === 'sma' || name === 'ema' || name === 'rsi' || name === 'zscore') {
    if (args.length !== 2 || !FIELDS.has(args[0]!.toLowerCase())) {
      throw new Error(name + '(field, period) expects an OHLCV field and a period.');
    }
    return {
      kind: name,
      field: args[0]!.toLowerCase() as 'open' | 'high' | 'low' | 'close' | 'volume',
      period: parsePeriod(args[1]!, definition.name),
    };
  }
  throw new Error('Unsupported CoreSpirit feature function: ' + name);
}

function valuesForField(bars: readonly CoreSpiritResearchBar[], field: string): number[] {
  return bars.map(bar => bar[field as keyof CoreSpiritResearchBar] as number);
}

function sma(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = seed;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) out[i] = values[i]! * alpha + out[i - 1]! * (1 - alpha);
  return out;
}

function rsi(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  if (values.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    gains += Math.max(0, delta);
    losses += Math.max(0, -delta);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const value = () => avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  out[period] = value();
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(0, delta)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -delta)) / period;
    out[i] = value();
  }
  return out;
}

function atr(bars: readonly CoreSpiritResearchBar[], period: number): number[] {
  const ranges = bars.map((bar, index) => index === 0 ? bar.high - bar.low : Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - bars[index - 1]!.close),
    Math.abs(bar.low - bars[index - 1]!.close),
  ));
  const out = new Array<number>(bars.length).fill(Number.NaN);
  if (ranges.length < period) return out;
  let average = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = average;
  for (let i = period; i < ranges.length; i += 1) {
    average = (average * (period - 1) + ranges[i]!) / period;
    out[i] = average;
  }
  return out;
}

function zscore(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  for (let i = period - 1; i < values.length; i += 1) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j += 1) mean += values[j]!;
    mean /= period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (values[j]! - mean) ** 2;
    variance /= period;
    out[i] = variance <= 0 ? 0 : (values[i]! - mean) / Math.sqrt(variance);
  }
  return out;
}

function calculate(operation: FeatureOperation, bars: readonly CoreSpiritResearchBar[]): number[] {
  if (operation.kind === 'field') return valuesForField(bars, operation.field);
  if (operation.kind === 'atr') return atr(bars, operation.period);
  const field = operation.kind === 'pctchange' || operation.kind === 'logreturn' ? 'close' : operation.field;
  const values = valuesForField(bars, field);
  if (operation.kind === 'sma') return sma(values, operation.period);
  if (operation.kind === 'ema') return ema(values, operation.period);
  if (operation.kind === 'rsi') return rsi(values, operation.period);
  if (operation.kind === 'zscore') return zscore(values, operation.period);
  const out = new Array<number>(values.length).fill(Number.NaN);
  for (let i = operation.period; i < values.length; i += 1) {
    const previous = values[i - operation.period]!;
    const current = values[i]!;
    if (previous === 0 || (operation.kind === 'logreturn' && (previous <= 0 || current <= 0))) continue;
    out[i] = operation.kind === 'pctchange' ? current / previous - 1 : Math.log(current / previous);
  }
  return out;
}

function normalizeBars(value: unknown): CoreSpiritResearchBar[] {
  if (!Array.isArray(value) || value.length < 12 || value.length > MAX_INPUT_BARS) {
    throw new Error('Provide 12–10,000 chronological OHLCV bars for research feature materialization.');
  }
  let previous = Number.NEGATIVE_INFINITY;
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid OHLCV bar at index ' + index + '.');
    const row = item as Record<string, unknown>;
    const keys = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
    if (keys.some(key => typeof row[key] !== 'number' || !Number.isFinite(row[key]))) {
      throw new Error('OHLCV bar ' + index + ' must contain finite epoch-millisecond timestamp and numeric OHLCV values.');
    }
    const bar = row as unknown as CoreSpiritResearchBar;
    if (!Number.isSafeInteger(bar.timestamp) || bar.timestamp <= previous) {
      throw new Error('OHLCV timestamps must be safe integer epoch milliseconds, strictly chronological, and unique.');
    }
    if (bar.low <= 0 || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) ||
        bar.volume < 0 || bar.open <= 0 || bar.close <= 0) {
      throw new Error('OHLCV bar ' + index + ' violates positive-price, high/low, or non-negative-volume invariants.');
    }
    previous = bar.timestamp;
    return { timestamp: bar.timestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
  });
}

/**
 * Build an aligned, point-in-time-safe feature matrix from chronological candles.
 * Warm-up candles before trainingRange.from may feed rolling indicators but are
 * never included as training observations. Future candles are never consulted.
 */
export function materializeCoreSpiritFeatureRows(input: Readonly<{
  source: string;
  bars: unknown;
  trainingRange: CoreSpiritFeatureRange;
  expectedFeatureNames?: readonly string[];
}>): { featureNames: string[]; rows: CoreSpiritFeatureRow[]; droppedWarmupRows: number } {
  const from = Date.parse(input.trainingRange.from);
  const toDate = Date.parse(input.trainingRange.to);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input.trainingRange.to) ? toDate + 86_399_999 : toDate;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Feature materialization requires a valid training date range.');
  const bars = normalizeBars(input.bars);
  const definitions = extractCoreSpiritFeatureDefinitions(input.source);
  const featureNames = definitions.map(definition => definition.name);
  if (input.expectedFeatureNames && (input.expectedFeatureNames.length !== featureNames.length ||
      input.expectedFeatureNames.some((name, index) => name !== featureNames[index]))) {
    throw new Error('Feature names do not match the ordered names declared in the immutable research source.');
  }
  const columns = definitions.map(definition => calculate(parseOperation(definition), bars));
  const rows: CoreSpiritFeatureRow[] = [];
  let droppedWarmupRows = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]!;
    if (bar.timestamp < from || bar.timestamp > to) continue;
    const values = columns.map(column => column[index]!);
    if (values.some(value => !Number.isFinite(value))) {
      droppedWarmupRows += 1;
      continue;
    }
    rows.push(Object.freeze({ timestamp: bar.timestamp, values: Object.freeze(values) }));
    if (rows.length > MAX_OUTPUT_ROWS) {
      throw new Error('Materialized training range exceeds 1,024 observations; split the range into bounded, versioned training windows.');
    }
  }
  if (rows.length < 12) throw new Error('Feature warm-up and date filtering left fewer than 12 usable training rows.');
  return { featureNames, rows, droppedWarmupRows };
}
