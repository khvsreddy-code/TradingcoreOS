import type { IndicatorConfig, IndicatorKind } from '../marketData/indicatorEngine';

export type IndicatorSourceTemplate = {
  kind: IndicatorKind;
  source: string;
  editable: boolean;
  executable: boolean;
  note: string;
};

const templates: Partial<Record<IndicatorKind, (cfg: IndicatorConfig) => IndicatorSourceTemplate>> = {
  EMA: (cfg) => ({ kind: 'EMA', editable: true, executable: true, note: 'Native starter implementation using the canonical CoreSpirit ema primitive.', source: `indicator("${cfg.kind}") {\n    overlay: true\n    input length = int(${cfg.period ?? 20}, min: 1)\n}\n\nvalue = ema(close, length)\nplot value` }),
  SMA: (cfg) => ({ kind: 'SMA', editable: true, executable: true, note: 'Native starter implementation using the canonical CoreSpirit sma primitive.', source: `indicator("${cfg.kind}") {\n    overlay: true\n    input length = int(${cfg.period ?? 20}, min: 1)\n}\n\nvalue = sma(close, length)\nplot value` }),
  HMA: (cfg) => ({ kind: 'HMA', editable: true, executable: true, note: 'Native starter implementation using the canonical CoreSpirit hma primitive.', source: `indicator("${cfg.kind}") {\n    overlay: true\n    input length = int(${cfg.period ?? 20}, min: 1)\n}\n\nvalue = hma(close, length)\nplot value` }),
  RSI: (cfg) => ({ kind: 'RSI', editable: true, executable: true, note: 'Native starter implementation using the canonical CoreSpirit rsi primitive.', source: `indicator("${cfg.kind}") {\n    overlay: false\n    input length = int(${cfg.period ?? 14}, min: 2)\n}\n\nr = rsi(close, length)\nplot r` }),
  ATR: (cfg) => ({ kind: 'ATR', editable: true, executable: true, note: 'Native starter implementation using the canonical ATR primitive.', source: `indicator("${cfg.kind}") {\n    overlay: false\n    input length = int(${cfg.period ?? 14}, min: 1)\n}\n\nvalue = atr(length)\nplot value` }),
  'Bollinger Bands': (cfg) => ({ kind: 'Bollinger Bands', editable: true, executable: false, note: 'Starter recipe. Multi-output channel math remains a native host contract until the public multi-series source ABI is finalized.', source: `indicator("${cfg.kind}") {\n    overlay: true\n    input length = int(${cfg.period ?? 20}, min: 1)\n    input multiplier = float(${cfg.multiplier ?? 2})\n}\n\n// Starter recipe for a user-editable volatility envelope.\n// The native TradingCore implementation can still be used from the chart.\nmeanValue = sma(close, length)\nplot meanValue\n\n// TODO: add upper/lower series when multi-output indicator ABI is enabled.` }),
  MACD: (cfg) => ({ kind: 'MACD', editable: true, executable: true, note: 'Starter implementation of MACD line using existing EMA primitives; signal/histogram can be extended by the author.', source: `indicator("${cfg.kind}") {\n    overlay: false\n    input fast = int(${cfg.fast ?? 12}, min: 2)\n    input slow = int(${cfg.slow ?? 26}, min: 3)\n    input signal = int(${cfg.signal ?? 9}, min: 2)\n}\n\nfastLine = ema(close, fast)\nslowLine = ema(close, slow)\nmacd = fastLine - slowLine\nplot macd` }),
  VWAP: () => ({ kind: 'VWAP', editable: true, executable: true, note: 'Session VWAP starter using the canonical CoreSpirit vwap primitive.', source: `indicator("VWAP") {\n    overlay: true\n}\n\nvalue = vwap()\nplot value` }),
  'Donchian Channels': (cfg) => ({ kind: 'Donchian Channels', editable: true, executable: true, note: 'Editable range-channel starter based on highest/lowest.', source: `indicator("${cfg.kind}") {\n    overlay: true\n    input length = int(${cfg.period ?? 20}, min: 1)\n}\n\nhighBand = highest(high, length)\nlowBand = lowest(low, length)\nplot highBand\nplot lowBand` }),
  'Market Structure': (cfg) => ({ kind: 'Market Structure', editable: true, executable: true, note: 'Starter structure visualization. The production native structure engine remains available separately.', source: `indicator("${cfg.kind}") {\n    overlay: true\n    input length = int(${cfg.period ?? 3}, min: 2)\n}\n\nrecentHigh = highest(high, length)\nrecentLow = lowest(low, length)\nplot recentHigh\nplot recentLow` }),
  'Previous Day Levels': () => ({ kind: 'Previous Day Levels', editable: true, executable: false, note: 'Template for session-level logic; the production level engine remains host-owned.', source: `indicator("Previous Day Levels") {\n    overlay: true\n}\n\n// This is an editable starter template.\n// Session aggregation/calendar access will be exposed through the canonical\n// market/session ABI before this template is marked executable.` }),
};

export function getIndicatorSourceTemplate(kind: IndicatorKind, cfg: IndicatorConfig): IndicatorSourceTemplate {
  const factory = templates[kind];
  if (factory) return factory(cfg);
  return {
    kind,
    editable: true,
    executable: false,
    note: 'Generated CoreSpirit starter template. The native indicator implementation remains available while the source-level ABI is extended.',
    source: `indicator("${kind}") {\n    overlay: true\n}\n\n// TradingCoreOS starter source for ${kind}.\n// Edit the implementation and save it as your own CoreSpirit indicator.\n// Native host implementation: ${kind}.`,
  };
}
