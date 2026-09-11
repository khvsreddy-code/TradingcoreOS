import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { AuthContextType, UserProfile, Session, AuthStep } from '../types';
import { authService } from '../../services/auth/authService';
import { sessionService } from '../../services/auth/sessionService';
import { profileService } from '../../services/auth/profileService';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('idle');

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
    if (authStep === 'error') {
      setAuthStep('idle');
    }
  }, [authStep]);

  // Load session & user profile
  const initAuth = useCallback(async () => {
    setLoading(true);
    try {
      const { session: sbSession, error: sessionErr } = await sessionService.getSession();
      if (sessionErr) {
        setSession(null);
        setUser(null);
      } else if (sbSession?.user) {
        const mappedSession = sessionService.mapSupabaseSession(sbSession);
        setSession(mappedSession);

        // Auth metadata is already in the Supabase session. Make the workspace
        // usable immediately, then hydrate the richer profile in the background.
        const fallbackProfile = profileService.mapSupabaseUserToProfile(sbSession.user);
        setUser(fallbackProfile);
        setAuthStep('idle');
        void profileService.getOrCreateProfile(sbSession.user).then((profile) => {
          setUser(profile);
        }).catch((error) => {
          console.warn('Background profile hydration failed:', error);
        });
      } else {
        setSession(null);
        setUser(null);
      }
    } catch (err: any) {
      console.error('Auth initialization error:', err);
      setSession(null);
      setUser(null);
    } finally {
      setLoading(false);
      setAuthStep('idle');
    }
  }, []);

  useEffect(() => {
    initAuth();

    // Subscribe to Supabase auth changes (e.g. after OAuth redirect)
    const { unsubscribe } = sessionService.onAuthStateChange(async (event, sbSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (sbSession?.user) {
          const mappedSession = sessionService.mapSupabaseSession(sbSession);
          setSession(mappedSession);
          const fallbackProfile = profileService.mapSupabaseUserToProfile(sbSession.user);
          setUser(fallbackProfile);
          setError(null);
          setAuthStep('idle');
          void profileService.getOrCreateProfile(sbSession.user).then((profile) => {
            setUser(profile);
          }).catch((error) => {
            console.warn('Background profile hydration failed:', error);
          });
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setAuthStep('idle');
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [initAuth]);

  // Google OAuth Login
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

  // Logout
  const logout = useCallback(async () => {
    setLoading(true);
    await authService.signOut();
    setUser(null);
    setSession(null);
    setAuthStep('idle');
    setLoading(false);
  }, []);

  // Refresh Session
  const refreshSession = useCallback(async () => {
    const { session: sbSession, error: refreshErr } = await sessionService.refreshSession();
    if (refreshErr) {
      setError(refreshErr.message);
      return;
    }
    if (sbSession?.user) {
      const mappedSession = sessionService.mapSupabaseSession(sbSession);
      setSession(mappedSession);
      const profile = await profileService.getOrCreateProfile(sbSession.user);
      setUser(profile);
    }
  }, []);

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
