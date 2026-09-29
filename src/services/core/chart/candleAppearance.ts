export type CandleAppearance = {
  upBody: string;
  downBody: string;
  upBorder: string;
  downBorder: string;
  upWick: string;
  downWick: string;
  volumeUp: string;
  volumeDown: string;
  borderVisible: boolean;
  wickVisible: boolean;
};

export const DEFAULT_CANDLE_APPEARANCE: CandleAppearance = {
  upBody: '#3b82f6',
  downBody: '#ef4444',
  upBorder: '#3b82f6',
  downBorder: '#ef4444',
  upWick: '#3b82f6',
  downWick: '#ef4444',
  volumeUp: '#3b82f6',
  volumeDown: '#ef4444',
  borderVisible: true,
  wickVisible: true,
};

const appearanceKey = (brokerId: string, instrumentKey: string) =>
  `tradingcore:chart-appearance:v1:${brokerId}:${encodeURIComponent(instrumentKey)}`;

const normalizeHex = (value: unknown, fallback: string) => {
  const text = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
};

export function loadCandleAppearance(brokerId: string, instrumentKey: string): CandleAppearance {
  try {
    const raw = localStorage.getItem(appearanceKey(brokerId, instrumentKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CANDLE_APPEARANCE;
    return {
      upBody: normalizeHex(parsed.upBody, DEFAULT_CANDLE_APPEARANCE.upBody),
      downBody: normalizeHex(parsed.downBody, DEFAULT_CANDLE_APPEARANCE.downBody),
      upBorder: normalizeHex(parsed.upBorder, DEFAULT_CANDLE_APPEARANCE.upBorder),
      downBorder: normalizeHex(parsed.downBorder, DEFAULT_CANDLE_APPEARANCE.downBorder),
      upWick: normalizeHex(parsed.upWick, DEFAULT_CANDLE_APPEARANCE.upWick),
      downWick: normalizeHex(parsed.downWick, DEFAULT_CANDLE_APPEARANCE.downWick),
      volumeUp: normalizeHex(parsed.volumeUp, DEFAULT_CANDLE_APPEARANCE.volumeUp),
      volumeDown: normalizeHex(parsed.volumeDown, DEFAULT_CANDLE_APPEARANCE.volumeDown),
      borderVisible: parsed.borderVisible !== false,
      wickVisible: parsed.wickVisible !== false,
    };
  } catch {
    return DEFAULT_CANDLE_APPEARANCE;
  }
}

export function saveCandleAppearance(
  brokerId: string,
  instrumentKey: string,
  appearance: CandleAppearance,
) {
  try {
    localStorage.setItem(appearanceKey(brokerId, instrumentKey), JSON.stringify(appearance));
  } catch {
    // Appearance persistence is best-effort and must never affect chart execution.
  }
}

export function candleSeriesOptions(appearance: CandleAppearance) {
  return {
    upColor: appearance.upBody,
    downColor: appearance.downBody,
    borderUpColor: appearance.upBorder,
    borderDownColor: appearance.downBorder,
    wickUpColor: appearance.upWick,
    wickDownColor: appearance.downWick,
    borderVisible: appearance.borderVisible,
    wickVisible: appearance.wickVisible,
  };
}

export function volumeColor(appearance: CandleAppearance, open: number, close: number) {
  const color = close >= open ? appearance.volumeUp : appearance.volumeDown;
  return `${color}55`;
}
