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
   * Ensure profiles table is synchronized with auth.users (Requirement 10)
   */
  const syncProfile = useCallback(async (authUser: User) => {
    try {
      const p = await supabaseAuthService.syncProfileWithAuthUser(authUser);
      if (p) setProfile(p);
    } catch (err) {
      console.warn('Profile sync notice:', err);
    }
  }, []);

  /**
   * Requirement 7: Replace current-user retrieval with: supabase.auth.getUser()
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

    // Detect if user landed on the page via an email confirmation link
    // Supabase appends #access_token=...&type=signup or ?code=...
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const isEmailVerificationReturn =
      hash.includes('type=signup') ||
      hash.includes('type=email_change') ||
      hash.includes('type=recovery') ||
      search.includes('code=');

    // 1. Initial User Retrieval with supabase.auth.getUser() (Requirement 7)
    (async () => {
      try {
        // First retrieve verified user from Supabase Auth server
        const currentUser = await supabaseAuthService.getUser();
        const currentSession = await supabaseAuthService.getSession();

        if (!isMounted) return;

        setUser(currentUser);
        setSession(currentSession);

        if (currentUser) {
          // Requirement 10: Synchronize profiles table with auth.users
          await syncProfile(currentUser);

          // Requirement 9: After email verification and login, redirect users to the dashboard
          if (isEmailVerificationReturn && typeof window !== 'undefined') {
            console.log('[Supabase Auth] Email verification detected. Redirecting to dashboard...');
            // Clean hash tokens from the URL bar to leave clean dashboard URL
            window.history.replaceState(null, document.title, window.location.pathname);
          }
        }
      } catch (err) {
        console.warn('Initial auth retrieval notice:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    // 2. Auth State Change Listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      setSession(newSession);

      if (newSession?.user) {
        // Use supabase.auth.getUser() to verify latest user state (Requirement 7)
        const verifiedUser = await supabaseAuthService.getUser();
        const effectiveUser = verifiedUser || newSession.user;

        setUser(effectiveUser);
        setEmailVerificationPending(false);
        setPendingVerificationEmail(null);

        // Requirement 10: Synchronize profiles table with auth.users
        await syncProfile(effectiveUser);

        // Requirement 9: After email verification / login redirect to dashboard
        if (event === 'SIGNED_IN' || isEmailVerificationReturn) {
          if (typeof window !== 'undefined' && (window.location.hash || window.location.search.includes('code='))) {
            window.history.replaceState(null, document.title, window.location.pathname);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setSession(null);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncProfile]);

  /**
   * Requirement 5: Replace login with: supabase.auth.signInWithPassword()
   */
  const signIn = async (email: string, password: string): Promise<AuthResponse> => {
    const res = await supabaseAuthService.signIn(email, password);
    setSession(res.session);

    // Retrieve verified user via supabase.auth.getUser() (Requirement 7)
    const verifiedUser = await supabaseAuthService.getUser();
    setUser(verifiedUser || res.user);

    if (verifiedUser || res.user) {
      await syncProfile(verifiedUser || res.user!);
    }

    return res;
  };

  /**
   * Requirement 4: Replace signup with: supabase.auth.signUp()
   * Requirement 8: Keep email verification enabled
   */
  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    businessName: string
  ): Promise<AuthResponse> => {
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
      }
    }

    return res;
  };

  /**
   * Requirement 6: Replace logout with: supabase.auth.signOut()
   */
  const signOut = async () => {
    await supabaseAuthService.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setEmailVerificationPending(false);
    setPendingVerificationEmail(null);
  };

  const resetPassword = async (email: string) => {
    await supabaseAuthService.resetPasswordForEmail(email);
  };

  const resendVerificationEmail = async (email: string) => {
    await supabaseAuthService.resendVerificationEmail(email);
  };

  /**
   * Google OAuth via Supabase (Requirement 11: eliminates Firebase unauthorized domain dependency)
   */
  const signInWithGoogle = async () => {
    await supabaseAuthService.signInWithOAuth('google');
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
