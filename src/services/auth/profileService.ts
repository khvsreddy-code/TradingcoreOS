import { UserProfile } from '../../auth/types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { User as SupabaseUser } from '@supabase/supabase-js';

export const profileService = {
  /**
   * Helper to build a UserProfile object from a Supabase Auth User
   */
  mapSupabaseUserToProfile(supabaseUser: SupabaseUser): UserProfile {
    const meta = supabaseUser.user_metadata || {};
    const now = new Date().toISOString();

    return {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      name: meta.full_name || meta.name || supabaseUser.email?.split('@')[0] || 'Trader',
      avatar: meta.avatar_url || meta.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${supabaseUser.id}`,
      created_at: supabaseUser.created_at || now,
      last_login: now,
      role: meta.role || 'trader',
      plan: meta.plan || 'Starter OS',
      is_onboarded: meta.is_onboarded ?? true,
    };
  },

  /**
   * Fetch user profile from Supabase database or construct from Auth metadata
   */
  async getOrCreateProfile(supabaseUser: SupabaseUser): Promise<UserProfile> {
    const fallbackProfile = this.mapSupabaseUserToProfile(supabaseUser);

    if (!isSupabaseConfigured()) {
      return fallbackProfile;
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .maybeSingle();

      if (data && !error) {
        // Update last_login timestamp in background
        const updatedProfile: UserProfile = {
          id: data.id,
          email: data.email || fallbackProfile.email,
          name: data.name || fallbackProfile.name,
          avatar: data.avatar || fallbackProfile.avatar,
          created_at: data.created_at || fallbackProfile.created_at,
          last_login: new Date().toISOString(),
          role: data.role || 'trader',
          plan: data.plan || 'Starter OS',
          is_onboarded: data.is_onboarded ?? true,
        };

        // Fire and forget last_login update
        supabase
          .from('profiles')
          .update({ last_login: updatedProfile.last_login })
          .eq('id', supabaseUser.id)
          .then();

        return updatedProfile;
      }

      // If no profile row exists, attempt to insert
      const newProfile: UserProfile = {
        ...fallbackProfile,
        last_login: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('profiles')
        .upsert(newProfile, { onConflict: 'id' });

      if (insertError) {
        console.warn('Profile DB upsert note (using Auth metadata fallback):', insertError.message);
      }

      return newProfile;
    } catch (err) {
      console.warn('Unable to query Supabase profiles table, using Auth User metadata:', err);
      return fallbackProfile;
    }
  },

  /**
   * Update profile fields
   */
  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    if (!isSupabaseConfigured()) return null;

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data as UserProfile;
    } catch (err) {
      console.error('Failed to update profile:', err);
      return null;
    }
  }
};
