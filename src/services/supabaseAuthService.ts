import { supabase, isSupabaseConfigured } from './supabaseClient';
import { User, Session } from '@supabase/supabase-js';
import { UserProfile } from '../types';

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  needsEmailVerification?: boolean;
  error?: string;
}

export const supabaseAuthService = {
  isConfigured: isSupabaseConfigured,

  /**
   * Get current session from Supabase
   */
  async getSession(): Promise<Session | null> {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('Supabase getSession error:', error.message);
      return null;
    }
    return data.session;
  },

  /**
   * Replace current-user retrieval with: supabase.auth.getUser()
   * Verifies the user against Supabase Auth server using access token.
   */
  async getUser(): Promise<User | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        // Return null quietly if not authenticated
        return null;
      }
      return data.user;
    } catch (err) {
      console.warn('Supabase getUser notice:', err);
      return null;
    }
  },

  /**
   * Replace signup with: supabase.auth.signUp()
   * Keeps email verification enabled and sends confirmation email.
   * Also provisions and synchronizes initial profile row in profiles table.
   */
  async signUp(
    email: string,
    password: string,
    displayName: string,
    businessName: string
  ): Promise<AuthResponse> {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured yet. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const cleanDisplayName = displayName.trim() || trimmedEmail.split('@')[0];
    const cleanBusinessName = businessName.trim() || 'My Business';

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectUrl = origin ? `${origin}/` : undefined;

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          display_name: cleanDisplayName,
          business_name: cleanBusinessName,
          full_name: cleanDisplayName,
        },
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    // Determine if email confirmation is required (session is null when verification is pending)
    const needsEmailVerification = Boolean(!data.session || (data.user && !data.user.confirmed_at));

    // Synchronize initial profile row with auth.users
    if (data.user) {
      await this.syncProfileWithAuthUser(data.user, cleanDisplayName, cleanBusinessName).catch((err) => {
        console.warn('Notice syncing profile during signup:', err);
      });
    }

    return {
      user: data.user,
      session: data.session,
      needsEmailVerification,
    };
  },

  /**
   * Replace login with: supabase.auth.signInWithPassword()
   * Automatically synchronizes the profiles table with auth.users upon successful login.
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured yet. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    // Synchronize profiles table with auth.users
    if (data.user) {
      await this.syncProfileWithAuthUser(data.user).catch((err) => {
        console.warn('Notice syncing profile during sign in:', err);
      });
    }

    return {
      user: data.user,
      session: data.session,
      needsEmailVerification: false,
    };
  },

  /**
   * Replace logout with: supabase.auth.signOut()
   */
  async signOut(): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('Supabase signOut error:', error.message);
      }
    } catch (e) {
      console.warn('Supabase signOut error:', e);
    }
  },

  /**
   * Resend signup email confirmation verification link
   */
  async resendVerificationEmail(email: string): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: origin ? `${origin}/` : undefined,
      },
    });

    if (error) throw new Error(error.message);
  },

  /**
   * Sign in with OAuth (Google / GitHub) via Supabase
   * Completely independent of Firebase and avoids unauthorized-domain popup blocks.
   */
  async signInWithOAuth(provider: 'google' | 'github' = 'google') {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: origin ? `${origin}/` : undefined,
      },
    });

    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Password Reset Email
   */
  async resetPasswordForEmail(email: string): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: origin ? `${origin}/` : undefined,
    });

    if (error) throw new Error(error.message);
  },

  /**
   * Fetch profile from public.profiles table
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    if (!isSupabaseConfigured || !userId) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id,
        displayName: data.display_name,
        businessName: data.business_name,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch {
      return null;
    }
  },

  /**
   * Ensure profiles table is synchronized with auth.users (Requirement 10)
   * Upserts the user's profile record from auth.users metadata and returns the synchronized profile.
   */
  async syncProfileWithAuthUser(
    user: User,
    overrideDisplayName?: string,
    overrideBusinessName?: string
  ): Promise<UserProfile | null> {
    if (!isSupabaseConfigured || !user) return null;

    const meta = user.user_metadata || {};
    const displayName =
      overrideDisplayName ||
      meta.display_name ||
      meta.full_name ||
      meta.name ||
      (user.email ? user.email.split('@')[0] : 'SelectBot Customer');

    const businessName =
      overrideBusinessName ||
      meta.business_name ||
      'My Business';

    const now = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            display_name: displayName,
            business_name: businessName,
            updated_at: now,
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (error) {
        console.warn('Notice upserting profile in Supabase:', error.message);
        // Return constructed profile if table insert hit RLS before user confirmed
        return {
          id: user.id,
          displayName,
          businessName,
          createdAt: now,
          updatedAt: now,
        };
      }

      return {
        id: data.id,
        displayName: data.display_name,
        businessName: data.business_name,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (e) {
      console.warn('Failed to sync profile with auth.users:', e);
      return {
        id: user.id,
        displayName,
        businessName,
        createdAt: now,
        updatedAt: now,
      };
    }
  },

  /**
   * Explicit upsert profile helper
   */
  async ensureProfile(userId: string, displayName: string, businessName: string): Promise<void> {
    if (!isSupabaseConfigured || !userId) return;
    try {
      await supabase.from('profiles').upsert(
        {
          id: userId,
          display_name: displayName,
          business_name: businessName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch (e) {
      console.warn('Failed to ensure profile in Supabase:', e);
    }
  },
};
