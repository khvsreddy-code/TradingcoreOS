import { EXPERIMENTAL_NATIVE_BACKENDS_ENABLED, PRODUCTION_CHART_BACKEND, isNativeChartBackendEnabled } from './chartBackendPolicy';

if (PRODUCTION_CHART_BACKEND !== 'lightweight-charts') {
  throw new Error('production chart backend must remain Lightweight Charts during migration');
}
if (isNativeChartBackendEnabled('webgl2') || isNativeChartBackendEnabled('canvas2d')) {
  throw new Error('experimental native chart backends must remain disabled in production');
}
if (isNativeChartBackendEnabled('lightweight-charts')) {
  throw new Error('Lightweight Charts must not be treated as a native experimental backend');
}
console.log(`STAGE88_CHART_BACKEND_POLICY_OK native=${EXPERIMENTAL_NATIVE_BACKENDS_ENABLED}`);
