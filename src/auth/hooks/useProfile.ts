import { useAuth } from './useAuth';
import { UserProfile } from '../types';
import { profileService } from '../../services/auth/profileService';
import { useState, useCallback } from 'react';

export function useProfile(): {
  profile: UserProfile | null;
  loading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
} {
  const { user, loading, refreshSession } = useAuth();
  const [updating, setUpdating] = useState(false);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<boolean> => {
      if (!user) return false;
      setUpdating(true);
      try {
        const updated = await profileService.updateProfile(user.id, updates);
        if (updated) {
          await refreshSession();
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to update profile:', err);
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [user, refreshSession]
  );

  return {
    profile: user,
    loading: loading || updating,
    updateProfile,
    refreshProfile: refreshSession,
  };
}
