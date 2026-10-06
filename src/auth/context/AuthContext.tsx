import React, { createContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { AuthContextType, UserProfile, Session, AuthStep, AuthStatus } from '../types';
import { authService } from '../../services/auth/authService';
import { sessionService } from '../../services/auth/sessionService';
import { profileService } from '../../services/auth/profileService';
import { userSettingsService } from '../../services/userSettingsService';
import { formatAuthError } from '../utils/authErrors';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps { children: ReactNode; }

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('idle');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [settingsReadyUserId, setSettingsReadyUserId] = useState<string | null>(null);
  const hydrationGeneration = useRef(0);

  const clearError = useCallback(() => {
    setError(null);
    if (authStep === 'error') setAuthStep('idle');
  }, [authStep]);

  const scheduleHydration = useCallback((sbUser: any) => {
    const generation = ++hydrationGeneration.current;
    const userId = String(sbUser?.id || '');

    if (!userId) return;

    setSettingsReadyUserId(null);
    setUser(profileService.mapSupabaseUserToProfile(sbUser));

    // Do not perform additional Supabase calls inside onAuthStateChange.
    // Supabase documents that asynchronous work triggered directly from that
    // callback can deadlock auth initialization. Run hydration after the
    // callback returns instead.
    window.setTimeout(() => {
      if (generation !== hydrationGeneration.current) return;

      void profileService.getOrCreateProfile(sbUser)
        .then(nextProfile => {
          if (generation === hydrationGeneration.current) setUser(nextProfile);
        })
        .catch(profileError => {
          console.warn('Background profile hydration failed:', profileError);
        });

      void userSettingsService.load(userId)
        .then(() => {
          if (generation === hydrationGeneration.current) setSettingsReadyUserId(userId);
        })
        .catch(settingsError => {
          console.warn('User settings hydration failed:', settingsError);
        });
    }, 0);
  }, []);

  const markSignedOut = useCallback(() => {
    ++hydrationGeneration.current;
    setSettingsReadyUserId(null);
    userSettingsService.clearLocal();
    setSession(null);
    setUser(null);
    setAuthStatus('signed_out');
    setError(null);
    setAuthStep('idle');
  }, []);

  const initAuth = useCallback(async () => {
    setLoading(true);
    setAuthStatus('loading');

    try {
      const { session: sbSession, error: sessionErr } = await sessionService.getSession();

      if (sessionErr) {
        // A timeout/network outage is not proof that the user logged out.
        // Keep any existing session state and put the app into a recoverable
        // degraded mode instead of redirecting to /login.
        setError(formatAuthError(sessionErr));
        setAuthStatus(current => current === 'authenticated' ? current : 'degraded');
        return;
      }

      if (!sbSession?.user) {
        markSignedOut();
        return;
      }

      setSession(sessionService.mapSupabaseSession(sbSession));
      setAuthStatus('authenticated');
      setError(null);
      scheduleHydration(sbSession.user);
    } catch (err: any) {
      setError(formatAuthError(err));
      setAuthStatus('degraded');
    } finally {
      setLoading(false);
      setAuthStep(current => current === 'error' ? current : 'idle');
    }
  }, [markSignedOut, scheduleHydration]);

  useEffect(() => {
    // Subscribe before initializing so an OAuth redirect or INITIAL_SESSION
    // event cannot race the manual bootstrap.
    const { unsubscribe } = sessionService.onAuthStateChange((event, sbSession) => {
      if (event === 'SIGNED_OUT') {
        markSignedOut();
        setLoading(false);
        return;
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (!sbSession?.user) {
          markSignedOut();
          setLoading(false);
          return;
        }

        setSession(sessionService.mapSupabaseSession(sbSession));
        setAuthStatus('authenticated');
        setError(null);
        setAuthStep('idle');
        scheduleHydration(sbSession.user);
        setLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        if (sbSession?.user) {
          setSession(sessionService.mapSupabaseSession(sbSession));
          setAuthStatus('authenticated');
          setError(null);
        } else {
          setAuthStatus(current => current === 'authenticated' ? 'degraded' : current);
        }
        setLoading(false);
      }
    });

    void initAuth();
    return () => unsubscribe();
  }, [initAuth, markSignedOut, scheduleHydration]);

  useEffect(() => {
    if (!user?.id || !session || settingsReadyUserId !== user.id) return;
    return userSettingsService.startSync(user.id, 5000);
  }, [user?.id, session, settingsReadyUserId]);

  const login = useCallback(async () => {
    setError(null);
    setAuthStep('connecting');
    setAuthStatus('loading');
    setAuthStep('authenticating');

    const result = await authService.signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setAuthStatus('degraded');
      setAuthStep('error');
      return { error: result.error };
    }
    return {};
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    const result = await authService.signOut();
    if (result.error) {
      setError(result.error);
      setAuthStep('error');
      setLoading(false);
      return;
    }
    markSignedOut();
    setLoading(false);
  }, [markSignedOut]);

  const refreshSession = useCallback(async () => {
    const { session: sbSession, error: refreshErr } = await sessionService.refreshSession();

    if (refreshErr) {
      setError(formatAuthError(refreshErr));
      setAuthStatus(current => current === 'authenticated' ? 'degraded' : current);
      return;
    }

    if (!sbSession?.user) {
      markSignedOut();
      return;
    }

    setSession(sessionService.mapSupabaseSession(sbSession));
    setAuthStatus('authenticated');
    setError(null);
    scheduleHydration(sbSession.user);
  }, [markSignedOut, scheduleHydration]);

  const value: AuthContextType = {
    user,
    session,
    loading,
    error,
    authStep,
    authStatus,
    isAuthenticated: Boolean(user && session && authStatus !== 'signed_out'),
    login,
    logout,
    refreshSession,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
