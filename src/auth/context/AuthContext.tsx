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
      if (sessionErr || !sbSession?.user) {
        setSession(null);
        setUser(null);
      } else {
        setSession(sessionService.mapSupabaseSession(sbSession));
        setAuthStep('idle');
        await hydrateUser(sbSession.user);
      }
    } catch (err: any) {
      console.error('Auth initialization error:', err);
      setSession(null);
      setUser(null);
    } finally {
      setLoading(false);
      setAuthStep('idle');
    }
  }, [hydrateUser]);

  useEffect(() => {
    void initAuth();
    const { unsubscribe } = sessionService.onAuthStateChange(async (event, sbSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (sbSession?.user) {
          setSession(sessionService.mapSupabaseSession(sbSession));
          setError(null);
          setAuthStep('idle');
          await hydrateUser(sbSession.user);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setAuthStep('idle');
      }
      setLoading(false);
    });
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
