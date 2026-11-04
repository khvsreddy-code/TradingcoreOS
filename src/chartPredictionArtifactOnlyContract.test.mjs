import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller = fs.readFileSync('src/services/core/chart/controllers/ChartPredictionController.ts', 'utf8');
const coordinator = fs.readFileSync('src/services/marketData/chartPredictionCoordinator.ts', 'utf8');
const heuristics = fs.readFileSync('src/services/predictionEngine.ts', 'utf8');

assert.match(controller, /source\.trained !== true/, 'chart prediction overlays require a trained service artifact');
assert.match(controller, /source\.status === 'unavailable'/, 'unavailable artifact responses are not plotted');
assert.match(controller, /PRICE_FORECAST_KINDS/, 'price targets are restricted to model-declared trained forecast types');
assert.match(controller, /createPriceLine/, 'a single predicted endpoint is displayed as a labelled target level');
assert.match(controller, /INTERVAL_FORECAST_KINDS/, 'forecast bounds are handled separately from point estimates');
assert.doesNotMatch(controller, /shape\.map|Math\.sin|runLocal|predictWithModel/, 'chart overlays do not synthesize a multi-point trajectory or local model fallback');
assert.doesNotMatch(coordinator, /runLocal|predictWithModel|LocalPrediction/, 'the shared chart prediction coordinator only returns production ML service outputs');
assert.match(heuristics, /trained: false/, 'local formula predictions are explicitly non-trained');
assert.match(heuristics, /research-heuristic/, 'local formula predictions identify their provenance');
assert.match(heuristics, /Boosted heuristic score/, 'local formulas do not present themselves as XGBoost');
assert.match(heuristics, /execution:'research-heuristic'\|'trained-server'/, 'the model catalogue distinguishes research formulas from trained server artifacts');
assert.match(heuristics, /if \(getPredictionModel\(modelId\)\.execution === 'trained-server'\) return null/, 'server-backed model IDs never fall through to local heuristic inference');
assert.match(heuristics, /Local rule-based research heuristic; not a trained XGBoost artifact/, 'the local breakout proxy is not advertised as trained XGBoost');

console.log('CHART_PREDICTION_ARTIFACT_ONLY_CONTRACT_OK');
