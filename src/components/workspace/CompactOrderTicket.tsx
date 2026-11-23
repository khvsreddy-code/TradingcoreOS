import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import type { OrderRequest } from '../../services/brokers/BrokerAdapter';
import type { Instrument, InstrumentDataStatus } from '../../types/instrument';
import type { OptionChain, OptionQuote } from '../../types/market';
import { classifyMarketDataHealth } from '../../services/marketData/dataHealth';
import {
  createInstrument,
  getInstrumentBySymbol,
  normalizeInstrumentType,
} from '../../services/marketData/instrumentIdentity';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { BrokerAdapterRegistry } from '../../services/brokers/adapters';

type OrderSide = OrderRequest['side'];
type OrderType = OrderRequest['orderType'];
type ProductType = OrderRequest['product'];

type QuoteView = {
  ltp?: number;
  source?: string;
  status: InstrumentDataStatus;
  reason: string;
  receivedAt?: number | string;
};

type OptionChoice = {
  instrument: Instrument;
  quote: OptionQuote;
  side: 'CE' | 'PE';
  strike: number;
  lotSize: number;
  premium?: number;
  caption: string;
};

type Props = {
  symbol: string;
  timeframe: string;
};

const formatMoney = (value?: number | null) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  : '—';
const positiveNumber = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const STATUS_LABEL: Record<InstrumentDataStatus, string> = {
  live: 'LIVE',
  delayed: 'DELAYED',
  stale: 'STALE',
  disconnected: 'DISCONNECTED',
  unknown: 'NO VERIFIED FEED',
};
const STATUS_CLASS: Record<InstrumentDataStatus, string> = {
  live: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  delayed: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  stale: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  disconnected: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
  unknown: 'border-slate-500/25 bg-slate-500/10 text-slate-300',
};

function snapshotQuote(symbol: string): QuoteView {
  const snapshot = tradingCoreRuntime.getMarketSnapshot(symbol) as unknown as (Record<string, unknown> & { ltp?: number }) | undefined;
  const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
  const source = String(snapshot?.source ?? '').toLowerCase();
  const providerConnected = source === 'fyers' || source === 'upstox'
    ? broker?.status === 'Connected'
    : source ? undefined : broker?.status !== 'Connected' ? false : undefined;
  const health = classifyMarketDataHealth({
    source,
    lastUpdateAt: (snapshot?.lastTradeTimestamp ?? snapshot?.timestamp ?? snapshot?.receivedAt) as string | number | undefined,
    providerConnected,
    expectedIntervalMs: 5_000,
  });
  const ltp = Number(snapshot?.ltp ?? snapshot?.lastPrice ?? snapshot?.close);
  return {
    ...(Number.isFinite(ltp) && ltp > 0 ? { ltp } : {}),
    ...(snapshot?.source ? { source: String(snapshot.source) } : {}),
    status: health.state,
    reason: health.reason,
    ...(snapshot?.receivedAt ? { receivedAt: snapshot.receivedAt as string | number } : {}),
  };
}

function buildOptionChoices(chain: OptionChain | null, provider: string, underlying: string): OptionChoice[] {
  if (!chain || !Array.isArray(chain.contracts)) return [];
  const choices: OptionChoice[] = [];
  for (const contract of chain.contracts) {
    for (const side of ['CE', 'PE'] as const) {
      const quote = side === 'CE' ? contract.call : contract.put;
      const brokerInstrumentKey = String(quote?.instrumentKey || '').trim();
      if (!quote || !brokerInstrumentKey) continue;
      const instrument = createInstrument({
        symbol: brokerInstrumentKey,
        provider,
        exchange: contract.exchange || 'NSE',
        instrumentType: 'option',
        underlying,
        expiry: contract.expiry || chain.expiry,
        strike: contract.strike,
        optionType: side,
        lotSize: contract.lotSize,
        tickSize: contract.tickSize,
        brokerInstrumentKey,
        dataStatus: 'unknown',
        name: `${underlying.split(':').pop()} ${contract.strike} ${side}`,
      });
      const premium = Number(quote.ltp);
      const lotSize = Math.max(1, Math.floor(Number(contract.lotSize) || 1));
      choices.push({
        instrument,
        quote,
        side,
        strike: contract.strike,
        lotSize,
        ...(Number.isFinite(premium) && premium > 0 ? { premium } : {}),
        caption: `${contract.strike} ${side} · LTP ₹${formatMoney(premium)} · lot ${lotSize}`,
      });
    }
  }
  const spot = Number(chain.spot);
  return choices.sort((a, b) => {
    const aDistance = Number.isFinite(spot) ? Math.abs(a.strike - spot) : a.strike;
    const bDistance = Number.isFinite(spot) ? Math.abs(b.strike - spot) : b.strike;
    return aDistance - bDistance || (a.side === 'CE' ? -1 : 1);
  }).slice(0, 60);
}

export function CompactOrderTicket({ symbol, timeframe }: Props) {
  const brokerId = tradingCoreRuntime.getPrimaryBrokerId() || 'unknown';
  const baseInstrument = useMemo(() => {
    const registered = getInstrumentBySymbol(symbol);
    if (registered) return registered;
    return createInstrument({
      symbol,
      provider: brokerId,
      instrumentType: normalizeInstrumentType({ symbol }),
      dataStatus: 'unknown',
    });
  }, [symbol, brokerId]);
  const isIndex = baseInstrument.instrumentType === 'index';

  const [side, setSide] = useState<OrderSide>('Buy');
  const [orderType, setOrderType] = useState<OrderType>('Market');
  const [product, setProduct] = useState<ProductType>('MIS');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [freshnessAcknowledged, setFreshnessAcknowledged] = useState(false);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [chainError, setChainError] = useState('');
  const [chainLoading, setChainLoading] = useState(false);
  const [expiry, setExpiry] = useState('current_week');
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [quote, setQuote] = useState<QuoteView>(() => snapshotQuote(symbol));
  const [selectedOptionQuote, setSelectedOptionQuote] = useState<{ symbol: string; quote: QuoteView } | null>(null);
  const [funds, setFunds] = useState<{ availableMargin?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'neutral' | 'success' | 'error'>('neutral');

  useEffect(() => {
    setSide('Buy');
    setOrderType('Market');
    setQuantity('1');
    setLimitPrice('');
    setTriggerPrice('');
    setStopLoss('');
    setTarget('');
    setReviewOpen(false);
    setFreshnessAcknowledged(false);
    setChain(null);
    setChainError('');
    setExpiry('current_week');
    setSelectedOptionId('');
    setQuote(snapshotQuote(symbol));
    setMessage('');
  }, [symbol]);

  useEffect(() => {
    const refresh = () => setQuote(snapshotQuote(symbol));
    refresh();
    const stop = tradingCoreRuntime.subscribeTicks([symbol], refresh);
    const timer = window.setInterval(refresh, 2_000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    void tradingCoreRuntime.getFunds()
      .then(value => {
        const availableMargin = Number(value?.availableMargin);
        if (!cancelled) setFunds(value && Number.isFinite(availableMargin) ? { availableMargin } : null);
      })
      .catch(() => { if (!cancelled) setFunds(null); });
    return () => { cancelled = true; };
  }, [brokerId]);

  useEffect(() => {
    if (!isIndex) {
      setChain(null);
      setChainError('');
      setSelectedOptionId('');
      return;
    }
    let cancelled = false;
    setChainLoading(true);
    setChainError('');
    void tradingCoreRuntime.getOptionChain(symbol, expiry)
      .then(value => {
        if (cancelled) return;
        setChain(value);
        const choices = buildOptionChoices(value, brokerId, symbol);
        setSelectedOptionId(current => choices.some(choice => choice.instrument.id === current)
          ? current
          : '');
      })
      .catch(error => {
        if (!cancelled) {
          setChain(null);
          setSelectedOptionId('');
          setChainError(error instanceof Error ? error.message : 'Option chain unavailable.');
        }
      })
      .finally(() => { if (!cancelled) setChainLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, expiry, brokerId, isIndex]);

  const choices = useMemo(() => buildOptionChoices(chain, brokerId, symbol), [chain, brokerId, symbol]);
  const selectedOption = choices.find(choice => choice.instrument.id === selectedOptionId);
  const instrument = selectedOption?.instrument ?? baseInstrument;

  useEffect(() => {
    const nativeKey = selectedOption?.instrument.brokerInstrumentKey || selectedOption?.instrument.symbol;
    if (!nativeKey) {
      setSelectedOptionQuote(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      const next = snapshotQuote(nativeKey);
      if (!cancelled) setSelectedOptionQuote({ symbol: nativeKey, quote: next });
    };
    refresh();
    const stop = tradingCoreRuntime.subscribeTicks([nativeKey], refresh);
    const timer = window.setInterval(refresh, 2_000);
    return () => {
      cancelled = true;
      stop();
      window.clearInterval(timer);
    };
  }, [selectedOption?.instrument.id, brokerId]);
  const activeQuote = useMemo(() => {
    if (selectedOption) {
      const nativeKey = selectedOption.instrument.brokerInstrumentKey || selectedOption.instrument.symbol;
      if (selectedOptionQuote?.symbol === nativeKey && selectedOptionQuote.quote.ltp !== undefined) return selectedOptionQuote.quote;
      const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
      const rawAt = selectedOption.quote.observedAt ?? chain?.observedAt;
      const health = classifyMarketDataHealth({
        source: selectedOption.quote.source || chain?.source || brokerId,
        lastUpdateAt: rawAt,
        providerConnected: broker?.status === 'Connected',
        expectedIntervalMs: 5_000,
      });
      return {
        ...(selectedOption.premium !== undefined ? { ltp: selectedOption.premium } : {}),
        source: selectedOption.quote.source || chain?.source || brokerId,
        status: health.state,
        reason: health.reason,
        ...(rawAt ? { receivedAt: rawAt } : {}),
      } satisfies QuoteView;
    }
    return quote;
  }, [selectedOption, selectedOptionQuote, chain, brokerId, quote]);
  const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
  const brokerConnected = broker?.status === 'Connected';
  const supportsBracketOrders = BrokerAdapterRegistry.getAdapter(brokerId)?.capabilities.supportsBracketOrders === true;
  const tradable = instrument.instrumentType !== 'index' && instrument.instrumentType !== 'unknown';
  const lotSize = selectedOption?.lotSize ?? instrument.lotSize;
  const quantityValue = Number(quantity);
  const livePrice = activeQuote.ltp;
  const typedPrice = orderType === 'Market' || orderType === 'SL-M' ? livePrice : positiveNumber(limitPrice);
  const trigger = (orderType === 'SL' || orderType === 'SL-M') ? positiveNumber(triggerPrice) : undefined;
  const stop = positiveNumber(stopLoss);
  const takeProfit = positiveNumber(target);
  const estimatedStopRisk = typedPrice !== undefined && stop !== undefined
    ? Math.abs(typedPrice - stop) * quantityValue
    : undefined;
  const maxLoss = instrument.instrumentType === 'option' && side === 'Buy' && typedPrice !== undefined
    ? typedPrice * quantityValue
    : undefined;
  const needsFreshnessAcknowledgement = activeQuote.status !== 'live';
  const status = activeQuote.status;

  useEffect(() => {
    if (selectedOption && quantityValue <= 1) setQuantity(String(selectedOption.lotSize));
  }, [selectedOption?.instrument.id]);

  useEffect(() => {
    if (!isIndex || !chain) return;
    const available = chain.expiryOptions?.some(option => option.value === expiry);
    if (expiry !== 'current_week' && !available) setExpiry('current_week');
  }, [chain, expiry, isIndex]);

  const quantityPresets = lotSize
    ? [1, 2, 3].map(lots => ({ label: `${lots}L`, value: lots * lotSize }))
    : [1, 5, 10, 25].map(units => ({ label: String(units), value: units }));

  const priceOnTick = (value: number | undefined): boolean => {
    if (value === undefined || !instrument.tickSize || instrument.tickSize <= 0) return true;
    const units = value / instrument.tickSize;
    return Math.abs(units - Math.round(units)) < 1e-6;
  };
  const invalidPrice = (value: number | undefined): boolean => value !== undefined && !priceOnTick(value);
  const invalidRiskDirection = (entry: number | undefined): boolean => {
    if (entry === undefined) return false;
    if (stop !== undefined && (side === 'Buy' ? stop >= entry : stop <= entry)) return true;
    if (takeProfit !== undefined && (side === 'Buy' ? takeProfit <= entry : takeProfit >= entry)) return true;
    return false;
  };
  const validationError = !brokerConnected
    ? broker?.status === 'Read Only' ? 'This broker session is read-only.' : 'Connect a broker before submitting an order.'
    : !tradable ? 'Spot indices and unclassified symbols cannot be sent as order instruments. Select a listed option or future contract.'
      : !Number.isInteger(quantityValue) || quantityValue < 1 ? 'Enter a valid whole-number quantity.'
        : lotSize && quantityValue % lotSize !== 0 ? `Quantity must be a multiple of the ${lotSize}-unit lot size.`
          : instrument.instrumentType !== 'equity' && product === 'CNC' ? 'CNC is only available for eligible equity instruments.'
            : orderType === 'Market' && livePrice === undefined ? 'No current price is available. Reconnect market data or use a limit order.'
              : (orderType === 'Limit' || orderType === 'SL') && !positiveNumber(limitPrice) ? 'Enter a valid execution price.'
                : invalidPrice(orderType === 'Limit' || orderType === 'SL' ? positiveNumber(limitPrice) : undefined) ? `Price must follow the ${instrument.tickSize} tick size.`
                  : (orderType === 'SL' || orderType === 'SL-M') && !trigger ? 'Enter a valid trigger price.'
                    : invalidPrice(trigger) ? `Trigger price must follow the ${instrument.tickSize} tick size.`
                      : invalidPrice(stop) || invalidPrice(takeProfit) ? `Stop and target prices must follow the ${instrument.tickSize} tick size.`
                        : invalidRiskDirection(typedPrice) ? 'Stop loss and target must be on the correct side of the entry price.'
                        : needsFreshnessAcknowledgement && !freshnessAcknowledged ? 'Acknowledge that the displayed market data is not confirmed live.'
                          : null;

  const beginReview = () => {
    setMessage('');
    setReviewOpen(true);
    setFreshnessAcknowledged(false);
  };

  const submit = async () => {
    if (validationError || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const request: OrderRequest = {
        symbol: instrument.symbol,
        instrumentId: instrument.id,
        instrument_token: instrument.brokerInstrumentKey || instrument.symbol,
        quantity: quantityValue,
        ...(orderType === 'Market' || orderType === 'SL-M' ? {} : { price: positiveNumber(limitPrice) }),
        ...(trigger ? { triggerPrice: trigger } : {}),
        orderType,
        side,
        product,
        ...(supportsBracketOrders && stop ? { stopLoss: stop } : {}),
        ...(supportsBracketOrders && takeProfit ? { takeProfit } : {}),
        idempotencyKey: globalThis.crypto?.randomUUID?.(),
      };
      const result = await tradingCoreRuntime.placeOrder(request);
      setMessage(`${result.status} · ${result.orderId || 'Order received'}${result.message ? ` · ${result.message}` : ''}`);
      setMessageTone(result.status === 'REJECTED' ? 'error' : 'success');
      setReviewOpen(false);
      setFreshnessAcknowledged(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order submission failed.');
      setMessageTone('error');
    } finally {
      setBusy(false);
    }
  };

  const buttonBase = 'inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45';
  const fieldBase = 'mt-1 h-9 w-full rounded-md border border-[#30394a] bg-[#0d121b] px-2.5 text-[11px] text-[#e5eaf2] outline-none focus:border-[#5e93e6]';
  const labelBase = 'block text-[9px] font-semibold uppercase tracking-[.09em] text-[#8693a7]';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain bg-[#0d1118] p-3 text-[#dce4ef]" data-testid="compact-order-ticket">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] pb-3">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#75849b]">Order ticket</div>
          <div className="mt-1 truncate text-sm font-semibold text-white" title={instrument.symbol}>
            {selectedOption?.instrument.name || instrument.name || instrument.symbol || 'Select an instrument'}
          </div>
          <div className="mt-1 truncate font-mono text-[9px] text-[#7e8ba0]">{instrument.symbol} · {timeframe}</div>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 font-mono text-[8px] font-bold tracking-wide ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {isIndex && (
        <div className="space-y-2 rounded-lg border border-[#34445c] bg-[#142033] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-[#d9e7fc]">Select listed option</span>
            {chain?.expiryLabel && <span className="text-[9px] text-[#8fa8c9]">{chain.expiryLabel}</span>}
          </div>
          <label className={labelBase}>Expiry</label>
          <select className={fieldBase} value={expiry} onChange={event => setExpiry(event.target.value)}>
            <option value="current_week">Nearest expiry</option>
            {(chain?.expiryOptions || []).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <label className={labelBase}>Contract · strike · right</label>
          <select className={fieldBase} value={selectedOptionId} onChange={event => { setSelectedOptionId(event.target.value); setReviewOpen(false); }} disabled={chainLoading || choices.length === 0}>
            <option value="">Choose a listed contract…</option>
            {choices.map(choice => <option key={choice.instrument.id} value={choice.instrument.id}>{choice.caption}</option>)}
          </select>
          {chainLoading && <div className="flex items-center gap-2 text-[9px] text-[#9bb2d1]"><LoaderCircle size={12} className="animate-spin"/> Loading broker option chain…</div>}
          {!chainLoading && chainError && <div className="text-[9px] text-amber-300">{chainError}</div>}
          {!chainLoading && !chainError && !choices.length && <div className="text-[9px] text-[#9aa8bb]">No tradable contracts returned for this expiry.</div>}
          <div className="text-[8px] leading-4 text-[#8da1bc]">The spot index is only a reference. Orders are routed using the selected broker contract key.</div>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setSide('Buy'); setReviewOpen(false); }} className={`${buttonBase} ${side === 'Buy' ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-[#343d4c] bg-[#171d27] text-[#9aa7ba]'}`}>BUY</button>
          <button type="button" onClick={() => { setSide('Sell'); setReviewOpen(false); }} className={`${buttonBase} ${side === 'Sell' ? 'border-rose-400/50 bg-rose-500/15 text-rose-300' : 'border-[#343d4c] bg-[#171d27] text-[#9aa7ba]'}`}>SELL</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelBase}>Order type</label>
            <select value={orderType} onChange={event => { setOrderType(event.target.value as OrderType); setReviewOpen(false); }} className={fieldBase}>
              <option>Market</option><option>Limit</option><option>SL</option><option>SL-M</option>
            </select>
          </div>
          <div>
            <label className={labelBase}>Product</label>
            <select value={product} onChange={event => { setProduct(event.target.value as ProductType); setReviewOpen(false); }} className={fieldBase}>
              <option>MIS</option><option>NRML</option><option>CNC</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className={labelBase}>{lotSize ? 'Quantity · units' : 'Quantity · shares / units'}</label>
            {lotSize && <span className="text-[8px] text-[#78869b]">Lot size {lotSize}</span>}
          </div>
          <input className={fieldBase} type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={event => { setQuantity(event.target.value); setReviewOpen(false); }}/>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quantityPresets.map(preset => (
              <button key={preset.label} type="button" onClick={() => { setQuantity(String(preset.value)); setReviewOpen(false); }} className="rounded border border-[#343d4c] bg-[#171d27] px-2.5 py-1.5 text-[9px] font-semibold text-[#9eacc0] hover:border-[#5d718f] hover:text-white">
                {preset.label}{lotSize ? ` · ${preset.value}` : ''}
              </button>
            ))}
          </div>
        </div>

        {(orderType !== 'Market' || advancedOpen) && (
          <div>
            <label className={labelBase}>{orderType === 'Market' ? 'Price (optional)' : 'Execution price'}</label>
            <input className={fieldBase} type="number" min="0" step="0.05" placeholder="₹" value={limitPrice} onChange={event => { setLimitPrice(event.target.value); setReviewOpen(false); }} />
          </div>
        )}

        {(orderType === 'SL' || orderType === 'SL-M') && (
          <div>
            <label className={labelBase}>Trigger price</label>
            <input className={fieldBase} type="number" min="0" step="0.05" placeholder="₹" value={triggerPrice} onChange={event => { setTriggerPrice(event.target.value); setReviewOpen(false); }} />
          </div>
        )}
      </div>

      <button type="button" onClick={() => setAdvancedOpen(value => !value)} className="flex items-center justify-between rounded-md border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left text-[10px] font-medium text-[#aab6c7] hover:bg-white/[0.05]">
        <span>Risk controls {advancedOpen ? '· expanded' : '· optional'}</span>
        <ChevronDown size={13} className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}/>
      </button>

      {advancedOpen && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.07] bg-[#111722] p-3">
          {supportsBracketOrders ? (
            <>
              <div><label className={labelBase}>Stop loss · price</label><input className={fieldBase} type="number" value={stopLoss} onChange={event => { setStopLoss(event.target.value); setReviewOpen(false); }} placeholder="Optional"/></div>
              <div><label className={labelBase}>Target · price</label><input className={fieldBase} type="number" value={target} onChange={event => { setTarget(event.target.value); setReviewOpen(false); }} placeholder="Optional"/></div>
              <p className="col-span-2 text-[8px] leading-4 text-[#7f8ca0]">Attached stop-loss and target are sent only to broker adapters that declare bracket-order support.</p>
            </>
          ) : (
            <p className="col-span-2 text-[9px] leading-4 text-[#aab6c7]">This broker adapter does not advertise attached bracket orders. Place protective exit orders separately after entry.</p>
          )}
        </div>
      )}

      <div className="mt-auto space-y-2 border-t border-white/[0.07] pt-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
          <span className="text-[#7f8ca0]">Available margin</span><span className="text-right tabular-nums text-[#d7e0ed]">{funds?.availableMargin !== undefined ? `₹${formatMoney(funds.availableMargin)}` : '—'}</span>
          <span className="text-[#7f8ca0]">Margin required</span><span className="text-right text-[#8f9db0]">Broker-calculated on order</span>
          <span className="text-[#7f8ca0]">Risk to stop</span><span className="text-right tabular-nums text-[#d7e0ed]">{!supportsBracketOrders ? 'Broker does not support attached exits' : estimatedStopRisk !== undefined ? `₹${formatMoney(estimatedStopRisk)} · estimate` : 'Set stop to estimate'}</span>
          <span className="text-[#7f8ca0]">Max loss</span><span className="text-right tabular-nums text-[#d7e0ed]">{maxLoss !== undefined ? `₹${formatMoney(maxLoss)} · long premium` : instrument.instrumentType === 'option' && side === 'Sell' ? 'Not capped' : 'Not estimated'}</span>
        </div>

        {needsFreshnessAcknowledgement && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-2.5 text-[9px] leading-4 text-amber-200">
            <ShieldAlert size={14} className="mt-0.5 shrink-0"/>
            <span>{activeQuote.reason} Order review will require you to acknowledge this is not verified live pricing.</span>
          </div>
        )}

        {reviewOpen ? (
          <div className="space-y-2 rounded-lg border border-[#4a6488] bg-[#152237] p-3" data-testid="order-review">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-white">Review order</span>
              <button type="button" onClick={() => setReviewOpen(false)} aria-label="Cancel order review" className="rounded p-1 text-[#93a6bf] hover:bg-white/[0.08]"><X size={13}/></button>
            </div>
            <div className="text-[10px] leading-5 text-[#b8c7da]">
              <div>{side.toUpperCase()} · {instrument.symbol}</div>
              <div>{quantityValue} units · {orderType} · {product}</div>
              <div>Price {orderType === 'Market' ? 'Market' : `₹${formatMoney(positiveNumber(limitPrice))}`} · data {STATUS_LABEL[status]}</div>
              {stop !== undefined && <div>Stop ₹{formatMoney(stop)} · target {takeProfit !== undefined ? `₹${formatMoney(takeProfit)}` : 'none'}</div>}
            </div>
            {needsFreshnessAcknowledgement && (
              <label className="flex items-start gap-2 text-[9px] leading-4 text-amber-100">
                <input type="checkbox" checked={freshnessAcknowledged} onChange={event => setFreshnessAcknowledged(event.target.checked)} className="mt-0.5 accent-amber-400"/>
                I have independently verified the current price with my broker.
              </label>
            )}
            {validationError && <div className="text-[9px] text-rose-300">{validationError}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setReviewOpen(false)} className={`${buttonBase} border-[#39465a] bg-[#1c2635] text-[#c2ccda]`}>Back</button>
              <button type="button" disabled={Boolean(validationError) || busy} onClick={() => void submit()} className={`${buttonBase} border-transparent ${side === 'Buy' ? 'bg-emerald-500 text-[#071510] hover:bg-emerald-400' : 'bg-rose-500 text-[#1a080a] hover:bg-rose-400'}`}>
                {busy ? <LoaderCircle size={13} className="animate-spin"/> : <Check size={13}/>} Confirm {side}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={Boolean(validationError) || !tradable || busy} onClick={beginReview} className={`${buttonBase} w-full border-transparent ${side === 'Buy' ? 'bg-emerald-500 text-[#071510] hover:bg-emerald-400' : 'bg-rose-500 text-[#1a080a] hover:bg-rose-400'}`}>
            Review {side} order
          </button>
        )}
        {validationError && !reviewOpen && <div className="text-[9px] leading-4 text-[#9ba8ba]">{validationError}</div>}
        {message && <div role="status" className={`rounded-md border p-2 text-[9px] leading-4 ${messageTone === 'success' ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200' : messageTone === 'error' ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-200' : 'border-white/[0.07] text-[#aab6c7]'}`}>{message}</div>}
      </div>
    </div>
  );
}
