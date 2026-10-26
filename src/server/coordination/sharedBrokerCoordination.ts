import { sharedRedisConfigured, sharedRedisHealthy } from './UpstashRedisRest.js';
import { supabaseBrokerCoordinationConfigured, supabaseBrokerCoordinationHealthy } from './SupabaseBrokerCoordination.js';

export type SharedBrokerCoordinationBackend = 'redis' | 'supabase-postgres' | 'missing';

export function sharedBrokerCoordinationBackend(): SharedBrokerCoordinationBackend {
  if (process.env.TRADINGCORE_DISTRIBUTED_COORDINATION !== 'false' && sharedRedisConfigured()) return 'redis';
  if (supabaseBrokerCoordinationConfigured()) return 'supabase-postgres';
  return 'missing';
}
export function sharedBrokerCoordinationConfigured(): boolean {
  return sharedBrokerCoordinationBackend() !== 'missing';
}
export async function sharedBrokerCoordinationHealthy(): Promise<boolean> {
  const backend = sharedBrokerCoordinationBackend();
  if (backend === 'redis') return sharedRedisHealthy();
  if (backend === 'supabase-postgres') return supabaseBrokerCoordinationHealthy();
  return false;
}
