import type { CoreSpiritExecutionTarget } from './executionTarget';

export type CoreSpiritEnvironmentName = 'research' | 'backtest' | 'paper' | 'live';
export type CoreSpiritEnvironmentCapability =
  | 'market-data'
  | 'models'
  | 'visuals'
  | 'simulated-orders'
  | 'real-orders'
  | 'risk'
  | 'policy'
  | 'webhooks';

export type CoreSpiritExecutionEnvironment = Readonly<{
  name: CoreSpiritEnvironmentName;
  target: CoreSpiritExecutionTarget;
  capabilities: readonly CoreSpiritEnvironmentCapability[];
  live: boolean;
}>;

export const CORE_SPIRIT_EXECUTION_ENVIRONMENTS: Readonly<Record<CoreSpiritEnvironmentName, CoreSpiritExecutionEnvironment>> = {
  research: { name: 'research', target: 'research', capabilities: ['market-data', 'models', 'visuals'], live: false },
  backtest: { name: 'backtest', target: 'backtest', capabilities: ['market-data', 'models', 'simulated-orders', 'risk', 'policy'], live: false },
  paper: { name: 'paper', target: 'automation', capabilities: ['market-data', 'models', 'simulated-orders', 'risk', 'policy', 'webhooks'], live: false },
  live: { name: 'live', target: 'automation', capabilities: ['market-data', 'models', 'real-orders', 'risk', 'policy', 'webhooks'], live: true },
};

export function validateCoreSpiritEnvironment(name: CoreSpiritEnvironmentName, requested: readonly CoreSpiritEnvironmentCapability[] = []): string[] {
  const env = CORE_SPIRIT_EXECUTION_ENVIRONMENTS[name];
  return requested.filter((item) => !env.capabilities.includes(item)).map((item) => `environment '${name}' does not allow capability '${item}'`);
}
