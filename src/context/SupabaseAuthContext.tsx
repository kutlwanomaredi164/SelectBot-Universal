import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { supabaseAuthService, AuthResponse } from '../services/supabaseAuthService';
import { UserProfile } from '../types';

interface SupabaseAuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isConfigured: boolean;
  emailVerificationPending: boolean;
  pendingVerificationEmail: string | null;
  signIn: (email: string, password: string) => Promise<AuthResponse>;
  signUp: (email: string, password: string, displayName: string, businessName: string) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
  getUser: () => Promise<User | null>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearVerificationPending: () => void;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  isConfigured: isSupabaseConfigured,
  emailVerificationPending: false,
  pendingVerificationEmail: null,
  signIn: async () => ({ user: null, session: null }),
  signUp: async () => ({ user: null, session: null }),
  signOut: async () => {},
  getUser: async () => null,
  resetPassword: async () => {},
  resendVerificationEmail: async () => {},
  signInWithGoogle: async () => {},
  refreshProfile: async () => {},
  clearVerificationPending: () => {},
});

export const SupabaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  /**
   * After successful authentication:
   * 1. Fetch profile from public.profiles
   * 2. Create profile if missing (Task 10)
   */
  const syncProfile = useCallback(async (authUser: User) => {
    try {
      const p = await supabaseAuthService.syncProfileWithAuthUser(authUser);
      if (p) setProfile(p);
    } catch (err) {
      console.error('[Supabase Profile Sync Failure]:', err);
    }
  }, []);

  /**
   * Current user retrieval with: supabase.auth.getUser() (Task 3)
   */
  const handleGetUser = useCallback(async (): Promise<User | null> => {
    if (!isSupabaseConfigured) return null;
    return await supabaseAuthService.getUser();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Detect OAuth callback or email confirmation in URL parameters
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';

    // Check for OAuth error in callback (Task 11)
    if (search.includes('error=') || hash.includes('error=')) {
      const params = new URLSearchParams(search.replace(/^\?/, '') || hash.replace(/^#/, ''));
      const errorMsg = params.get('error_description') || params.get('error') || 'OAuth Callback Error';
      console.error('[Supabase OAuth Callback Failure] Returned with error:', errorMsg);
    }

    const isAuthCallbackReturn =
      hash.includes('access_token=') ||
      hash.includes('type=signup') ||
      hash.includes('type=recovery') ||
      search.includes('code=');

    // 1. Initial User Retrieval with supabase.auth.getUser()
    (async () => {
      try {
        const currentUser = await supabaseAuthService.getUser();
        const currentSession = await supabaseAuthService.getSession();

        if (!isMounted) return;

        setUser(currentUser);
        setSession(currentSession);

        if (currentUser) {
          console.log('[Supabase Auth] Verified active user session:', currentUser.email);
          // Task 10: Fetch profile from public.profiles / create if missing
          await syncProfile(currentUser);

          // Task 10: Redirect to /dashboard after successful auth callback
          if (isAuthCallbackReturn && typeof window !== 'undefined') {
            console.log('[Supabase Auth] Auth callback detected. Redirecting to /dashboard...');
            window.history.replaceState(null, document.title, '/dashboard');
          }
        }
      } catch (err) {
        console.error('[Supabase Auth Retrieval Failure]:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    // 2. Auth State Change Listener (Task 3)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      console.log(`[Supabase Auth State Change] Event: ${event}`);
      setSession(newSession);

      if (newSession?.user) {
        // Retrieve cryptographically verified user
        const verifiedUser = await supabaseAuthService.getUser();
        const effectiveUser = verifiedUser || newSession.user;

        setUser(effectiveUser);
        setEmailVerificationPending(false);
        setPendingVerificationEmail(null);

        // Task 10: Fetch profile from public.profiles / create if missing
        await syncProfile(effectiveUser);

        // Task 10: Redirect to /dashboard after successful login / OAuth
        if (event === 'SIGNED_IN' || isAuthCallbackReturn) {
          if (typeof window !== 'undefined' && window.location.pathname !== '/dashboard') {
            console.log('[Supabase Auth] Routing authenticated user to /dashboard');
            window.history.replaceState(null, document.title, '/dashboard');
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setSession(null);
        if (typeof window !== 'undefined' && window.location.pathname === '/dashboard') {
          window.history.replaceState(null, document.title, '/');
        }
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncProfile]);

  /**
   * Email Login with: supabase.auth.signInWithPassword()
   */
  const signIn = async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const res = await supabaseAuthService.signIn(email, password);
      setSession(res.session);

      const verifiedUser = await supabaseAuthService.getUser();
      setUser(verifiedUser || res.user);

      if (verifiedUser || res.user) {
        await syncProfile(verifiedUser || res.user!);
        // Redirect to /dashboard (Task 10)
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, document.title, '/dashboard');
        }
      }

      return res;
    } catch (err) {
      console.error('[Supabase Auth Login Failure]:', err);
      throw err;
    }
  };

  /**
   * Email Signup with: supabase.auth.signUp()
   */
  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    businessName: string
  ): Promise<AuthResponse> => {
    try {
      const res = await supabaseAuthService.signUp(email, password, displayName, businessName);

      if (res.needsEmailVerification) {
        setEmailVerificationPending(true);
        setPendingVerificationEmail(email);
      } else {
        setSession(res.session);
        const verifiedUser = await supabaseAuthService.getUser();
        setUser(verifiedUser || res.user);
        if (verifiedUser || res.user) {
          await syncProfile(verifiedUser || res.user!);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, document.title, '/dashboard');
          }
        }
      }

      return res;
    } catch (err) {
      console.error('[Supabase Auth Signup Failure]:', err);
      throw err;
    }
  };

  /**
   * Logout with: supabase.auth.signOut()
   */
  const signOut = async () => {
    try {
      await supabaseAuthService.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setEmailVerificationPending(false);
      setPendingVerificationEmail(null);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, document.title, '/');
      }
    } catch (err) {
      console.error('[Supabase Auth SignOut Failure]:', err);
    }
  };

  const resetPassword = async (email: string) => {
    await supabaseAuthService.resetPasswordForEmail(email);
  };

  const resendVerificationEmail = async (email: string) => {
    await supabaseAuthService.resendVerificationEmail(email);
  };

  /**
   * Google OAuth login with: supabase.auth.signInWithOAuth({ provider: 'google' })
   */
  const signInWithGoogle = async () => {
    try {
      await supabaseAuthService.signInWithOAuth('google');
    } catch (err) {
      console.error('[Supabase Auth Google OAuth Failure]:', err);
      throw err;
    }
  };

  const refreshProfile = async () => {
    const currentUser = await supabaseAuthService.getUser();
    if (currentUser) {
      await syncProfile(currentUser);
    }
  };

  const clearVerificationPending = () => {
    setEmailVerificationPending(false);
    setPendingVerificationEmail(null);
  };

  return (
    <SupabaseAuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isConfigured: isSupabaseConfigured,
        emailVerificationPending,
        pendingVerificationEmail,
        signIn,
        signUp,
        signOut,
        getUser: handleGetUser,
        resetPassword,
        resendVerificationEmail,
        signInWithGoogle,
        refreshProfile,
        clearVerificationPending,
      }}
    >
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export const useSupabaseAuth = () => useContext(SupabaseAuthContext);
