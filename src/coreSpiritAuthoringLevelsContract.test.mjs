import assert from 'node:assert/strict';
import { normalizeCoreSpiritSource } from './services/coreSpirit/syntax.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { buildCoreSpiritResearchPlan } from './services/coreSpirit/researchSurface.ts';

const source=`
data nifty = market("NSE:NIFTY50", "5m")
data bank = market("NSE:BANKNIFTY", "5m")

let trend = ema(nifty.close, 50)
let strength = rsi(nifty.close, 14)
let relative = nifty.close / bank.close
let z = zscore(close, 100)
let beta = beta(returns(close), returns(nifty), 252)
let regime = regime.detect(
    volatility = stdev(returns(close), 20),
    trend = trendStrength(close, 50)
)

when trend > trend[1] and strength > 55 and relative > relative[20]:
    show signal "BUY"

model alpha {
    features:
        z,
        beta,
        regime,
        volume.zscore(100)
    target:
        forward_return(20)
}

backtest alpha from "2018-01-01" to "2026-01-01"
evaluate {
    sharpe
    sortino
    max_drawdown
    turnover
    hit_rate
    profit_factor
    exposure
}
`;

const normalized=normalizeCoreSpiritSource(source);
assert.match(normalized,/let nifty = market\("NSE:NIFTY50"\)\.timeframe\("5m"\)/);
assert.match(normalized,/zscore\(volume,\s*100\)/);
assert.match(normalized,/regimeDetect\(/);
assert.doesNotMatch(normalized,/^\s*data\b/m);
assert.doesNotMatch(normalized,/^\s*backtest\b/m);

const plan=buildCoreSpiritResearchPlan(source);
assert.equal(plan.backtests.length,1);
assert.equal(plan.backtests[0].model,'alpha');
assert.deepEqual(plan.backtests[0].evaluations,['sharpe','sortino','max_drawdown','turnover','hit_rate','profit_factor','exposure']);

const result=compileCoreSpirit(source,'authoring-levels-contract');
assert.ok(!result.diagnostics.some(d=>d.severity==='error'), result.diagnostics.map(d=>d.message).join('; '));
assert.ok(result.ir?.surface?.declarations.some(d=>d.kind==='model' && d.name==='alpha'));

console.log('CORESPIRIT_AUTHORING_LEVELS_CONTRACT_OK');
