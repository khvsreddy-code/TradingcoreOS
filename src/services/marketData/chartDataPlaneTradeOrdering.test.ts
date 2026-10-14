import assert from 'node:assert/strict';
import { ChartDataPlane } from './chartDataPlane';
import type { NormalizedMarketTick } from '../../types/market';

type Candle = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };
type InternalPlane = {
  state: {
    candles: Candle[];
    columns?: { time: ArrayLike<number>; timeUnit?: 'milliseconds' | 'seconds' };
    compatibilityCandles: Candle[];
    compatibilityRevision: number;
    latestTick?: NormalizedMarketTick;
    lastAcceptedTradeTimestampMs?: number;
    revision: number;
  };
  canonicalPlane: {
    revision: number;
    read(): { time: Float64Array; close: Float64Array };
  };
  syncCanonical(): void;
  columnarSnapshot(): { time: ArrayLike<number>; timeUnit?: 'milliseconds' | 'seconds' };
  onTick(tick: NormalizedMarketTick): void;
};

const history: Candle = {
  timestamp: '2026-10-14T10:00:00.000Z',
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 100,
};

function makeTick(time: string, ltp: number): NormalizedMarketTick {
  return {
    instrumentKey: 'NSE:ORDERING-TEST',
    source: 'fyers',
    ltp,
    lastTradeTimestamp: time,
    receivedAt: new Date(time).toISOString(),
  };
}

function prepare(mode: 'columnar' | 'compatibility'): InternalPlane {
  const plane = new ChartDataPlane(`ordering-contract-${mode}`, 'NSE:ORDERING-TEST', '5m');
  const internal = plane as unknown as InternalPlane;
  internal.state.candles = [{ ...history }];
  internal.state.compatibilityCandles = [{ ...history }];
  internal.state.compatibilityRevision = 1;
  internal.state.revision = 1;
  internal.syncCanonical();

  if (mode === 'columnar') {
    internal.state.columns = internal.columnarSnapshot();
    internal.state.candles = [];
    internal.state.compatibilityCandles = [];
  } else {
    internal.state.columns = undefined;
  }
  return internal;
}

for (const mode of ['columnar', 'compatibility'] as const) {
  const plane = prepare(mode);
  plane.onTick(makeTick('2026-10-14T10:04:30.000Z', 101.5));

  const dataRevisionAfterPriceMove = plane.canonicalPlane.revision;
  const chartRevisionAfterPriceMove = plane.state.revision;
  const closeAfterPriceMove = plane.canonicalPlane.read().close.at(-1);
  assert.equal(closeAfterPriceMove, 101.5, `${mode}: latest valid trade should update the forming bar`);

  // A later packet with the same price must advance the freshness watermark,
  // not write an identical OHLC row or create another canonical revision.
  plane.onTick(makeTick('2026-10-14T10:04:45.000Z', 101.5));
  assert.equal(plane.canonicalPlane.revision, dataRevisionAfterPriceMove, `${mode}: identical LTP must not commit a no-op canonical mutation`);
  assert.equal(plane.state.revision, chartRevisionAfterPriceMove, `${mode}: identical LTP must not create a chart-data revision`);
  assert.equal(plane.state.lastAcceptedTradeTimestampMs, Date.parse('2026-10-14T10:04:45.000Z'));

  // An older exchange trade arriving later must not overwrite either the close
  // or the latest accepted LTP, even though it belongs to the same 5-minute bar.
  plane.onTick(makeTick('2026-10-14T10:04:40.000Z', 98));
  assert.equal(plane.canonicalPlane.read().close.at(-1), 101.5, `${mode}: out-of-order trade must not regress the forming candle`);
  assert.equal(plane.state.latestTick?.ltp, 101.5, `${mode}: stale packet must not regress chart quote state`);
  assert.equal(plane.canonicalPlane.revision, dataRevisionAfterPriceMove, `${mode}: stale packet must not advance canonical revision`);
}

console.log('CHART_DATA_PLANE_TRADE_ORDERING_CONTRACT_OK');
