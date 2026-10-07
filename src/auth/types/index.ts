export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar: string;
  created_at: string;
  last_login: string;
  role: string;
  plan: string;
  is_onboarded: boolean;
}

export interface Session {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
  };
}

export type AuthStep = 'idle' | 'connecting' | 'authenticating' | 'preparing' | 'error';
export type AuthStatus = 'loading' | 'authenticated' | 'signed_out' | 'degraded';

export interface AuthState {
  user: UserProfile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  authStep: AuthStep;
  authStatus: AuthStatus;
}

export interface AuthContextType {
  user: UserProfile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  authStep: AuthStep;
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  login: () => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}
