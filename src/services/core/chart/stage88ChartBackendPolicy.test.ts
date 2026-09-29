import { isNativeChartBackendEnabled, PRODUCTION_CHART_BACKEND } from './chartBackendPolicy';

if (PRODUCTION_CHART_BACKEND !== 'vela-native') {
  throw new Error(`Expected vela-native production backend, got ${PRODUCTION_CHART_BACKEND}`);
}
if (!isNativeChartBackendEnabled('vela-native')) {
  throw new Error('Vela native backend must be enabled in production.');
}

console.log('TCO_V108_VELA_CHART_BACKEND_POLICY_OK');
