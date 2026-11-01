export type InvestinyAssetMapping = Readonly<{
  investingId: number;
  matchedBy: 'instrumentId' | 'fyersSymbol';
}>;

/**
 * Resolve an explicitly configured Investing.com asset ID. Never infer an ID
 * from a ticker or fuzzy search: the key must be the canonical instrument ID
 * or exact exchange-qualified FYERS symbol.
 */
export function resolveInvestinyAssetMapping(
  configured: Readonly<Record<string, unknown>>,
  instrument: Readonly<{ instrumentId: string; fyersSymbol: string }>,
): InvestinyAssetMapping | null {
  const byInstrument = configured[instrument.instrumentId];
  const byFyersSymbol = configured[instrument.fyersSymbol];
  const raw = byInstrument !== undefined ? byInstrument : byFyersSymbol;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const declaredInstrument = String(record.instrumentId ?? record.instrument_id ?? '').trim();
  const declaredFyersSymbol = String(record.fyersSymbol ?? record.fyers_symbol ?? '').trim();
  const declaredExchange = String(record.exchange ?? '').trim().toUpperCase();
  if (declaredInstrument && declaredInstrument !== instrument.instrumentId) return null;
  if (declaredFyersSymbol && declaredFyersSymbol.toUpperCase() !== instrument.fyersSymbol.toUpperCase()) return null;
  const expectedExchange = instrument.fyersSymbol.split(':')[0]?.toUpperCase() || '';
  if (declaredExchange && declaredExchange !== expectedExchange) return null;

  const investingId = Number(record.investingId ?? record.investing_id ?? record.id);
  if (!Number.isSafeInteger(investingId) || investingId <= 0) return null;
  return Object.freeze({
    investingId,
    matchedBy: byInstrument !== undefined ? 'instrumentId' : 'fyersSymbol',
  });
}
