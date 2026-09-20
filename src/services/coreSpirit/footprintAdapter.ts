import type { CoreSpiritFootprint, CoreSpiritFootprintRow, CoreSpiritTick } from './types';

/**
 * Builds a provider-neutral footprint from tick/depth events.
 * It is intentionally explicit that this is an adapter, not an exchange-native
 * footprint feed: trade side is inferred from side/bid/ask when available.
 */
export function buildCoreSpiritFootprint(ticks: CoreSpiritTick[], tickSize: number): CoreSpiritFootprint | null {
  const size = Number(tickSize);
  if (!ticks.length || !Number.isFinite(size) || size <= 0) return null;
  const rows = new Map<number, { buy: number; sell: number }>();
  let buyVolume = 0;
  let sellVolume = 0;
  let lastPrice = Number.NaN;
  for (const tick of ticks) {
    const price = Number(tick.price);
    const volume = Math.max(0, Number(tick.volume || 0));
    if (!Number.isFinite(price) || !Number.isFinite(volume)) continue;
    const rowPrice = Math.round(price / size) * size;
    const row = rows.get(rowPrice) || { buy: 0, sell: 0 };
    const side = tick.side || (Number.isFinite(Number(tick.ask)) && price >= Number(tick.ask) ? 'buy' : Number.isFinite(Number(tick.bid)) && price <= Number(tick.bid) ? 'sell' : 'unknown');
    if (side === 'buy') { row.buy += volume; buyVolume += volume; }
    else if (side === 'sell') { row.sell += volume; sellVolume += volume; }
    else {
      // Midpoint/last-side ambiguity is retained rather than pretending it is exact.
      const inferredBuy = Number.isFinite(lastPrice) ? price >= lastPrice : true;
      if (inferredBuy) { row.buy += volume; buyVolume += volume; }
      else { row.sell += volume; sellVolume += volume; }
    }
    rows.set(rowPrice, row);
    lastPrice = price;
  }
  if (!rows.size) return null;
  const normalizedRows: CoreSpiritFootprintRow[] = [...rows.entries()].sort((a,b) => a[0]-b[0]).map(([price, row]) => ({
    price, buyVolume: row.buy, sellVolume: row.sell, totalVolume: row.buy + row.sell, delta: row.buy - row.sell,
    imbalance: row.sell > 0 ? row.buy / row.sell : row.buy > 0 ? Infinity : 0,
  }));
  const poc = normalizedRows.reduce((best, row) => row.totalVolume! > best.totalVolume! ? row : best, normalizedRows[0]).price;
  return { timestamp: Number(ticks.at(-1)!.timestamp), buyVolume, sellVolume, delta: buyVolume - sellVolume, poc, rows: normalizedRows };
}
