import {
  CORE_SPIRIT_STRATEGY_VERSION,
  strategyEventToOrderIntent,
  type CoreSpiritStrategyEvent,
} from "./strategyContract";

const source = `strategy("EMA + RSI Cross")

input fast = 20
input slow = 50
input rsiLength = 14

emaFast = ema(close, fast)
emaSlow = ema(close, slow)
r = rsi(close, rsiLength)

plot(emaFast)
plot(emaSlow)

longSignal = crossover(emaFast, emaSlow) and r > 50
shortSignal = crossunder(emaFast, emaSlow) and r < 50

signal(longSignal, "LONG")
signal(shortSignal, "SHORT")`;

const required = [
  "strategy(",
  "input fast = 20",
  "input slow = 50",
  "input rsiLength = 14",
  "ema(close, fast)",
  "ema(close, slow)",
  "rsi(close, rsiLength)",
  "crossover(emaFast, emaSlow)",
  "crossunder(emaFast, emaSlow)",
  'signal(longSignal, "LONG")',
  'signal(shortSignal, "SHORT")',
];

for (const fragment of required) {
  if (!source.includes(fragment)) throw new Error(`killer example missing: ${fragment}`);
}

const event: CoreSpiritStrategyEvent = {
  id: "event:100",
  strategyId: "ema-rsi-cross",
  kind: "entry",
  direction: "long",
  positionId: "ema-rsi-cross:long",
  barIndex: 100,
  timestamp: 1758800000000,
  symbol: "NSE:NIFTY50",
  timeframe: "5m",
  reason: "EMA crossover with RSI > 50",
};

const intent = strategyEventToOrderIntent(event, 1758800001000, 1);

if (CORE_SPIRIT_STRATEGY_VERSION !== 1) throw new Error("strategy version changed");
if (intent.side !== "buy") throw new Error("long entry must become buy intent");
if (intent.positionId !== event.positionId) throw new Error("position identity lost");
if (intent.strategyEventId !== event.id) throw new Error("event identity lost");

const exit: CoreSpiritStrategyEvent = { ...event, id: "event:101", kind: "exit" };
const exitIntent = strategyEventToOrderIntent(exit, 1758800002000, 1);
if (exitIntent.side !== "sell") throw new Error("long exit must become sell intent");

console.log("STAGE38_STRATEGY_KILLER_OK");
