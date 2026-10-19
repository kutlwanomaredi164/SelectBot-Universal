import { supabase, isSupabaseConfigured, getSupabaseConfigStatus } from './supabaseClient';
import { User, Session } from '@supabase/supabase-js';
import { UserProfile } from '../types';

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  needsEmailVerification?: boolean;
  error?: string;
}

/**
 * Returns the exact absolute URL to redirect back to after email confirmation or OAuth.
 * Strictly configured for /dashboard and compatible with https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app
 */
export function getSupabaseRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    return `${origin}/dashboard`;
  }
  return 'https://select-bot-universal-8bxn-5ic3awrub-wan0.vercel.app/dashboard';
}

export const supabaseAuthService = {
  isConfigured: isSupabaseConfigured,

  /**
   * Get current session from Supabase
   */
  async getSession(): Promise<Session | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[Supabase Auth] getSession notice:', error.message);
        return null;
      }
      return data.session;
    } catch (err) {
      console.warn('[Supabase Auth] getSession network notice:', err);
      return null;
    }
  },

  /**
   * Current user retrieval with: supabase.auth.getUser()
   * Verifies the user against Supabase Auth server using access token.
   */
  async getUser(): Promise<User | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        return null;
      }
      return data.user;
    } catch (err) {
      console.warn('[Supabase Auth] getUser network notice:', err);
      return null;
    }
  },

  /**
   * Email/Password Signup with: supabase.auth.signUp()
   * Keeps email verification enabled and sends confirmation email.
   * Provisions profile in public.profiles table.
   */
  async signUp(
    email: string,
    password: string,
    displayName: string,
    businessName: string
  ): Promise<AuthResponse> {
    const status = getSupabaseConfigStatus();
    if (!status.configured) {
      console.error('[Supabase Auth Signup Failure] Missing configuration:', status.missingVars);
      if (status.isSecretKeyForbidden) {
        throw new Error(
          'Forbidden use of secret API key in browser: VITE_SUPABASE_ANON_KEY is set to a service_role key. Replace it with your anon/public key in Vercel settings.'
        );
      }
      throw new Error(
        `Supabase is not configured yet. Missing: ${status.missingVars.join(', ')}. Please configure your Supabase credentials.`
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const cleanDisplayName = displayName.trim() || trimmedEmail.split('@')[0];
    const cleanBusinessName = businessName.trim() || 'My Business';
    const redirectUrl = getSupabaseRedirectUrl();

    console.log('[Supabase Auth Signup] Attempting signup for:', trimmedEmail, '| Redirect URL:', redirectUrl);

    let data, error;
    try {
      const res = await supabase.auth.signUp({
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
      data = res.data;
      error = res.error;
    } catch (err: any) {
      console.error('[Supabase Auth Signup Failure] Network / Fetch error:', err);
      const msg = err?.message || String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error(
          `Unable to connect to Supabase at ${status.url || 'configured URL'}. Please verify that your Supabase project is active (not paused) and reachable.`
        );
      }
      throw err;
    }

    if (error) {
      console.error('[Supabase Auth Signup Failure] Provider error:', error.message);
      throw new Error(error.message);
    }

    console.log('[Supabase Auth Signup Success] Account created. User ID:', data.user?.id);

    // Determine if email confirmation is required (session is null when verification is pending)
    const needsEmailVerification = Boolean(!data.session || (data.user && !data.user.confirmed_at));

    // Synchronize initial profile row with auth.users
    if (data.user) {
      await this.syncProfileWithAuthUser(data.user, cleanDisplayName, cleanBusinessName).catch((err) => {
        console.warn('[Supabase Auth Signup] Profile sync notice:', err);
      });
    }

    return {
      user: data.user,
      session: data.session,
      needsEmailVerification,
    };
  },

  /**
   * Email/Password Login with: supabase.auth.signInWithPassword()
   * Automatically synchronizes the profiles table with auth.users upon successful login.
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    const status = getSupabaseConfigStatus();
    if (!status.configured) {
      console.error('[Supabase Auth Login Failure] Missing configuration:', status.missingVars);
      if (status.isSecretKeyForbidden) {
        throw new Error(
          'Forbidden use of secret API key in browser: VITE_SUPABASE_ANON_KEY is set to a service_role key. Replace it with your anon/public key in Vercel settings.'
        );
      }
      throw new Error(
        `Supabase is not configured yet. Missing: ${status.missingVars.join(', ')}. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    console.log('[Supabase Auth Login] Attempting login for:', trimmedEmail);

    let data, error;
    try {
      const res = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      data = res.data;
      error = res.error;
    } catch (err: any) {
      console.error('[Supabase Auth Login Failure] Network / Fetch error:', err);
      const msg = err?.message || String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error(
          `Unable to connect to Supabase at ${status.url || 'configured URL'}. Please verify that your Supabase project is active (not paused in Supabase Dashboard) and reachable.`
        );
      }
      throw err;
    }

    if (error) {
      console.error('[Supabase Auth Login Failure] Credentials error:', error.message);
      throw new Error(error.message);
    }

    console.log('[Supabase Auth Login Success] User logged in. User ID:', data.user?.id);

    // Synchronize profiles table with auth.users
    if (data.user) {
      await this.syncProfileWithAuthUser(data.user).catch((err) => {
        console.warn('[Supabase Auth Login] Profile sync notice:', err);
      });
    }

    return {
      user: data.user,
      session: data.session,
      needsEmailVerification: false,
    };
  },

  /**
   * Logout with: supabase.auth.signOut()
   */
  async signOut(): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      console.log('[Supabase Auth] Signing out user...');
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('[Supabase Auth SignOut Notice]:', error.message);
      } else {
        console.log('[Supabase Auth] Successfully signed out.');
      }
    } catch (e) {
      console.warn('[Supabase Auth SignOut Error]:', e);
    }
  },

  /**
   * Resend signup email confirmation verification link
   */
  async resendVerificationEmail(email: string): Promise<void> {
    const status = getSupabaseConfigStatus();
    if (!status.configured) {
      throw new Error('Supabase is not configured.');
    }
    const redirectUrl = getSupabaseRedirectUrl();
    console.log('[Supabase Auth] Resending confirmation link to:', email, '| Redirect URL:', redirectUrl);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('[Supabase Auth] Resend verification failure:', error.message);
      throw new Error(error.message);
    }
    console.log('[Supabase Auth] Verification email sent successfully.');
  },

  /**
   * Google OAuth login with: supabase.auth.signInWithOAuth({ provider: 'google' })
   * Strictly avoids Firebase popup dependencies and unauthorized-domain errors.
   */
  async signInWithOAuth(provider: 'google' | 'github' = 'google') {
    const status = getSupabaseConfigStatus();
    if (!status.configured) {
      console.error('[Supabase Auth OAuth Failure] Missing configuration:', status.missingVars);
      if (status.isSecretKeyForbidden) {
        throw new Error(
          'Forbidden use of secret API key in browser: Replace service_role key with anon/public key in Vercel.'
        );
      }
      throw new Error(
        `Supabase is not configured yet. Missing: ${status.missingVars.join(', ')}.`
      );
    }

    const redirectUrl = getSupabaseRedirectUrl();
    console.log('[Supabase Auth OAuth] Starting Google OAuth flow. Redirect URL:', redirectUrl);

    let data, error;
    try {
      const res = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      data = res.data;
      error = res.error;
    } catch (err: any) {
      console.error('[Supabase Auth OAuth Failure] Invocation error:', err);
      const msg = err?.message || String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error(
          `Unable to reach Supabase OAuth endpoint at ${status.url}. Verify project is active and Google provider is enabled in Supabase.`
        );
      }
      throw err;
    }

    if (error) {
      console.error('[Supabase Auth OAuth Failure] Provider error:', error.message);
      throw new Error(error.message);
    }

    // Direct browser to Google OAuth consent page
    if (typeof window !== 'undefined' && data?.url) {
      console.log('[Supabase Auth OAuth] Redirecting browser to:', data.url);
      window.location.assign(data.url);
    }

    return data;
  },

  /**
   * Password Reset Email
   */
  async resetPasswordForEmail(email: string): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const redirectUrl = getSupabaseRedirectUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirectUrl,
    });

    if (error) {
      console.error('[Supabase Auth] Password reset error:', error.message);
      throw new Error(error.message);
    }
  },

  /**
   * Fetch profile from public.profiles table (Task 10)
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
   * After successful authentication:
   * 1. Fetch profile from public.profiles
   * 2. Create profile if missing (Task 10)
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

    console.log('[Supabase Profile Sync] Checking profile for user ID:', user.id);

    try {
      // Step 1: Fetch profile from public.profiles
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile) {
        console.log('[Supabase Profile Sync] Profile found for user:', existingProfile.display_name);
        return {
          id: existingProfile.id,
          displayName: existingProfile.display_name,
          businessName: existingProfile.business_name,
          createdAt: existingProfile.created_at,
          updatedAt: existingProfile.updated_at,
        };
      }

      // Step 2: Create profile if missing
      console.log('[Supabase Profile Sync] Profile not found. Creating row in public.profiles...');
      const { data: createdProfile, error: insertError } = await supabase
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

      if (insertError) {
        console.warn('[Supabase Profile Sync Warning] Table insert notice:', insertError.message);
        return {
          id: user.id,
          displayName,
          businessName,
          createdAt: now,
          updatedAt: now,
        };
      }

      console.log('[Supabase Profile Sync Success] Profile created:', createdProfile.display_name);
      return {
        id: createdProfile.id,
        displayName: createdProfile.display_name,
        businessName: createdProfile.business_name,
        createdAt: createdProfile.created_at,
        updatedAt: createdProfile.updated_at,
      };
    } catch (e) {
      console.error('[Supabase Profile Sync Error]', e);
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
      console.warn('[Supabase ensureProfile notice]:', e);
    }
  },
};
