import { useAuth } from './useAuth';
import { Session } from '../types';

export function useSession(): {
  session: Session | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
} {
  const { session, loading, refreshSession } = useAuth();
  return { session, loading, refreshSession };
}
