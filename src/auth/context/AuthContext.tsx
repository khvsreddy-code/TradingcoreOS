import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { AuthContextType, UserProfile, Session, AuthStep } from '../types';
import { authService } from '../../services/auth/authService';
import { sessionService } from '../../services/auth/sessionService';
import { profileService } from '../../services/auth/profileService';
import { userSettingsService } from '../../services/userSettingsService';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps { children: ReactNode; }

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('idle');

  const clearError = useCallback(() => {
    setError(null);
    if (authStep === 'error') setAuthStep('idle');
  }, [authStep]);

  const hydrateUser = useCallback(async (sbUser: any) => {
    const fallbackProfile = profileService.mapSupabaseUserToProfile(sbUser);
    setUser(fallbackProfile);
    void profileService.getOrCreateProfile(sbUser).then(setUser).catch((error) => {
      console.warn('Background profile hydration failed:', error);
    });
    await userSettingsService.load(sbUser.id);
  }, []);

  const initAuth = useCallback(async () => {
    setLoading(true);
    try {
      const { session: sbSession, error: sessionErr } = await sessionService.getSession();
      if (sessionErr) {
        // A network/storage timeout is not proof that the user is signed out.
        // Keep the current auth state intact and let Supabase's auto-refresh /
        // auth event stream recover the session rather than forcing a logout.
        console.warn('Auth session check temporarily unavailable:', sessionErr);
        setLoading(false);
        setAuthStep('idle');
        return;
      }

      if (!sbSession?.user) {
        setSession(null);
        setUser(null);
      } else {
        setSession(sessionService.mapSupabaseSession(sbSession));
        setAuthStep('idle');
        // Profile/settings hydration is intentionally outside the auth lock.
        void hydrateUser(sbSession.user);
      }
    } catch (err: any) {
      console.error('Auth initialization error:', err);
      // Initialization failures are transient until proven otherwise. Do not
      // convert an unknown failure into a destructive signed-out state.
      setLoading(false);
      setAuthStep('idle');
      return;
    } finally {
      setLoading(false);
      setAuthStep('idle');
    }
  }, [hydrateUser]);

  useEffect(() => {
    // Subscribe before the explicit session read so INITIAL_SESSION / OAuth
    // events cannot race past the React provider during client initialization.
    const { unsubscribe } = sessionService.onAuthStateChange((event, sbSession) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (sbSession?.user) {
          setSession(sessionService.mapSupabaseSession(sbSession));
          setError(null);
          setAuthStep('idle');
          // Never await Supabase calls from inside onAuthStateChange; Supabase
          // currently documents an async-call deadlock risk in this callback.
          void hydrateUser(sbSession.user);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setAuthStep('idle');
      }
      setLoading(false);
    });

    void initAuth();
    return () => unsubscribe();
  }, [initAuth, hydrateUser]);

  useEffect(() => {
    if (!user?.id || !session) return;
    return userSettingsService.startSync(user.id, 5000);
  }, [user?.id, session]);

  const login = useCallback(async () => {
    setError(null);
    setAuthStep('connecting');
    setAuthStep('authenticating');
    const result = await authService.signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setAuthStep('error');
      return { error: result.error };
    }
    return {};
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    await authService.signOut();
    setUser(null);
    setSession(null);
    setAuthStep('idle');
    setLoading(false);
  }, []);

  const refreshSession = useCallback(async () => {
    const { session: sbSession, error: refreshErr } = await sessionService.refreshSession();
    if (refreshErr) { setError(refreshErr.message); return; }
    if (sbSession?.user) {
      setSession(sessionService.mapSupabaseSession(sbSession));
      await hydrateUser(sbSession.user);
    }
  }, [hydrateUser]);

  const value: AuthContextType = {
    user,
    session,
    loading,
    error,
    authStep,
    isAuthenticated: Boolean(user && session),
    login,
    logout,
    refreshSession,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
