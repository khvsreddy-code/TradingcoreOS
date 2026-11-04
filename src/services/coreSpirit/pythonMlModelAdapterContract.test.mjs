import assert from 'node:assert/strict';

const {
  createCoreSpiritPythonMlManifest,
  CoreSpiritPythonMlServiceAdapter,
  registerCoreSpiritPythonMlModel,
} = await import('./pythonMlModelAdapter.ts');
const { CoreSpiritExternalModelRegistry } = await import('./modelOrchestration.ts');

const manifest = createCoreSpiritPythonMlManifest({
  modelId: 'xgb-direction',
  version: 'nifty-5m-v4',
  forecastHorizonBars: 3,
});
const registry = new CoreSpiritExternalModelRegistry();
registerCoreSpiritPythonMlModel(registry, {
  modelId: 'rf-direction',
  version: 'banknifty-5m-v2',
  forecastHorizonBars: 2,
}, {
  baseUrl: 'https://ml.example.test',
  serviceSecret: 'r'.repeat(40),
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ models: {} }),
  }),
});
assert.equal(registry.list().length, 1, 'the concrete Python adapter registers through the strict CoreSpirit model registry');

const rows = 80;
const ohlcvData = [];
const timestamps = [];
const confirmed = [];
for (let index = 0; index < rows; index += 1) {
  const close = 100 + index;
  ohlcvData.push(close - 0.5, close + 1, close - 1, close, 10 + index);
  timestamps.push(Date.UTC(2026, 0, 1) + index * 300_000);
  confirmed.push(1);
}

let captured;
const adapter = new CoreSpiritPythonMlServiceAdapter({
  baseUrl: 'https://ml.example.test/',
  serviceSecret: 's'.repeat(48),
  fetchImpl: async (url, init) => {
    captured = { url: String(url), init, body: JSON.parse(String(init.body)) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        models: {
          'xgb-direction': {
            trained: true,
            status: 'paper',
            model_version: 'nifty-5m-v4',
            artifact_hash: 'a'.repeat(64),
            algorithm: 'xgboost',
            direction: 'BULLISH',
            bullish_probability: 0.62,
            neutral_probability: 0.18,
            bearish_probability: 0.20,
            confidence: 0.62,
            predicted_price: null,
            expected_return: null,
            expected_move: null,
            lower_bound: null,
            upper_bound: null,
            return_estimate_kind: 'unavailable_direction_only',
            release_status: 'candidate',
            probability_calibration: 'not_calibrated',
            production_eligible: false,
            forecast_horizon_bars: 3,
          },
        },
      }),
    };
  },
});

const request = {
  requestId: 'model-call-1',
  modelId: manifest.modelId,
  version: manifest.version,
  context: {
    runId: 'chart-run',
    programChecksum: 'b'.repeat(64),
    modelVersion: manifest.version,
    barIndex: rows - 1,
    timestamp: timestamps.at(-1),
    symbol: 'NSE:NIFTY50-INDEX',
    timeframe: '5m',
    mode: 'historical',
    revision: 1,
    confirmed: true,
    deterministicSeed: 'test-seed',
  },
  features: {
    ohlcv: { dtype: 'f64', shape: [rows, 5], data: ohlcvData },
    timestamps_ms: { dtype: 'f64', shape: [rows], data: timestamps },
    confirmed: { dtype: 'bool', shape: [rows], data: confirmed },
  },
  marketState: {
    timestamp: timestamps.at(-1),
    instrument: { instrumentId: 'NSE:NIFTY50-INDEX', symbol: 'NSE:NIFTY50-INDEX' },
    timeframe: '5m',
  },
};

const result = await adapter.execute(manifest, request);
assert.equal(captured.url, 'https://ml.example.test/predict');
assert.equal(captured.init.headers['X-TradingCore-ML-Secret'], 's'.repeat(48));
assert.equal(captured.body.symbol, 'NSE:NIFTY50-INDEX');
assert.equal(captured.body.timeframe, '5m');
assert.equal(captured.body.horizon, 3);
assert.equal(captured.body.candles.length, 80);
assert.equal(captured.body.candles.at(-1).confirmed, true);
assert.deepEqual(result.prediction, { dtype: 'f64', shape: [3], data: [0.62, 0.18, 0.20] });
assert.equal(result.metadata.direction, 'BULLISH');
assert.equal(result.metadata.release_status, 'candidate');
assert.equal(result.metadata.production_eligible, false);
assert.equal(result.metadata.predicted_price, null);
assert.ok(result.outputChecksum && result.stateChecksum, 'adapter emits deterministic checksums');

await assert.rejects(
  () => adapter.execute(manifest, { ...request, context: { ...request.context, confirmed: false } }),
  /confirmed-bar inputs only/,
  'the Python adapter refuses forming-bar inference',
);

const badVersionAdapter = new CoreSpiritPythonMlServiceAdapter({
  baseUrl: 'https://ml.example.test',
  serviceSecret: 's'.repeat(48),
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      models: {
        'xgb-direction': {
          trained: true,
          model_version: 'different-version',
          bullish_probability: 0.5,
          neutral_probability: 0.25,
          bearish_probability: 0.25,
          confidence: 0.5,
        },
      },
    }),
  }),
});
await assert.rejects(
  () => badVersionAdapter.execute(manifest, request),
  /version does not match/,
  'the adapter rejects a different trained artifact version',
);

assert.throws(
  () => new CoreSpiritPythonMlServiceAdapter({ baseUrl: 'https://ml.example.test', serviceSecret: 'short' }),
  /at least 32 characters/,
);
assert.throws(
  () => new CoreSpiritPythonMlServiceAdapter({ baseUrl: 'http://ml.example.test', serviceSecret: 's'.repeat(40) }),
  /must use HTTPS/,
);
assert.throws(
  () => createCoreSpiritPythonMlManifest({ modelId: 'xgb-direction', version: 'v1', forecastHorizonBars: 0 }),
  /forecast horizon/,
);

console.log('CORESPIRIT_PYTHON_ML_ADAPTER_CONTRACT_OK');
