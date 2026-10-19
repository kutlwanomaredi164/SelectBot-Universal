import React, { useState } from 'react';
import {
  ShieldCheck,
  Zap,
  AlertCircle,
  Mail,
  Lock,
  User,
  Building,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Send,
  Database,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Key,
} from 'lucide-react';
import {
  isSupabaseConfigured,
  getSupabaseConfigStatus,
  setSupabaseCustomCredentials,
  clearSupabaseCustomCredentials,
} from '../services/supabaseClient';
import { useSupabaseAuth } from '../context/SupabaseAuthContext';

interface LoginViewProps {
  onSignInWithGoogle?: () => Promise<void>;
  onContinueAsGuest: () => void;
  onSupabaseAuthSuccess?: () => void;
}

export function LoginView({
  onSignInWithGoogle,
  onContinueAsGuest,
  onSupabaseAuthSuccess,
}: LoginViewProps) {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    resetPassword,
    resendVerificationEmail,
  } = useSupabaseAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');

  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [needsVerificationNotice, setNeedsVerificationNotice] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Manual Credentials Configuration Drawer
  const [showConfigDrawer, setShowConfigDrawer] = useState(!isSupabaseConfigured);
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const supabaseStatus = getSupabaseConfigStatus();

  // Email/Password Submit Handler (100% Supabase Auth)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    setSuccessMsg(null);
    setNeedsVerificationNotice(false);
    setResendSuccess(false);

    try {
      if (!isSupabaseConfigured) {
        setShowConfigDrawer(true);
        throw new Error(
          'Supabase credentials are required. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel settings, or enter them in the configuration box below.'
        );
      }

      if (mode === 'signup') {
        if (!displayName.trim() || !businessName.trim()) {
          throw new Error('Please provide your name and business name.');
        }

        // Supabase signUp with email verification
        const res = await signUp(
          email.trim(),
          password,
          displayName.trim(),
          businessName.trim()
        );

        if (res.needsEmailVerification) {
          setNeedsVerificationNotice(true);
          setSuccessMsg(
            `Verification email sent to ${email.trim()}! Please check your inbox and click the verification link to activate your account.`
          );
        } else {
          setSuccessMsg('Account created successfully! Redirecting to dashboard...');
          if (onSupabaseAuthSuccess) onSupabaseAuthSuccess();
        }
      } else if (mode === 'signin') {
        // Supabase signInWithPassword
        await signIn(email.trim(), password);
        setSuccessMsg('Signed in successfully! Redirecting to dashboard...');
        if (onSupabaseAuthSuccess) onSupabaseAuthSuccess();
      } else if (mode === 'forgot') {
        await resetPassword(email.trim());
        setSuccessMsg(`Password reset instructions have been sent to ${email.trim()}.`);
      }
    } catch (err: any) {
      const msg: string = err?.message || 'Authentication failed. Please check your credentials.';
      if (msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('not confirmed')) {
        setNeedsVerificationNotice(true);
        setAuthError('Your email address has not been confirmed yet. Please verify your email before logging in.');
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setAuthError(
          `Connection error: Unable to reach your Supabase instance. Please ensure your project is active in the Supabase Dashboard and check your Supabase credentials below.`
        );
        setShowConfigDrawer(true);
      } else {
        setAuthError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth Login via Supabase (Zero Firebase)
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      if (!isSupabaseConfigured) {
        setShowConfigDrawer(true);
        throw new Error('Please configure Supabase credentials before using Google Sign-In.');
      }

      if (onSignInWithGoogle) {
        await onSignInWithGoogle();
      } else {
        await signInWithGoogle();
      }
      if (onSupabaseAuthSuccess) onSupabaseAuthSuccess();
    } catch (err: any) {
      const msg = err?.message || 'Failed to complete Google Sign-In.';
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Resend Verification Email Handler
  const handleResendVerification = async () => {
    if (!email.trim()) {
      setAuthError('Please enter your email address to resend verification.');
      return;
    }
    setResendingEmail(true);
    try {
      await resendVerificationEmail(email.trim());
      setResendSuccess(true);
      setSuccessMsg(`A fresh verification link has been sent to ${email.trim()}. Please check your inbox.`);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to resend verification email.');
    } finally {
      setResendingEmail(false);
    }
  };

  // Save Custom Supabase Credentials
  const handleSaveCustomCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError(null);

    try {
      if (!customUrl.trim() || !customKey.trim()) {
        throw new Error('Both Supabase Project URL and Anon Key are required.');
      }
      setSupabaseCustomCredentials(customUrl.trim(), customKey.trim());
    } catch (err: any) {
      setConfigError(err?.message || 'Failed to save Supabase credentials.');
      setConfigSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon & Wordmark */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black text-xl shadow-md mb-3">
          S
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">SelectBot SaaS</h2>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Universal No-Code Chatbot Platform & 100% Supabase Auth Engine
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-3xl sm:px-8 space-y-5">
          {/* Supabase Status / Configuration Drawer */}
          <div className="border border-indigo-100 bg-indigo-50/60 rounded-2xl overflow-hidden transition-all text-xs">
            <div
              onClick={() => setShowConfigDrawer(!showConfigDrawer)}
              className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-indigo-50 transition-colors"
            >
              <div className="flex items-center gap-2 font-bold text-indigo-950">
                <Database className="w-4 h-4 text-indigo-600" />
                <span>Supabase Auth Engine</span>
                {supabaseStatus.configured ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                    Connected
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                    Setup Required
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold">
                <span>{showConfigDrawer ? 'Hide settings' : 'Configure'}</span>
                {showConfigDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </div>

            {showConfigDrawer && (
              <div className="px-3.5 pb-3.5 border-t border-indigo-100 pt-2.5 space-y-3">
                <p className="text-[11px] text-indigo-800 leading-relaxed">
                  Authentication is powered exclusively by <strong>Supabase Auth</strong>. On Vercel, set these in <em>Settings &gt; Environment Variables</em>, or enter them below to connect immediately in your browser:
                </p>

                {supabaseStatus.configured && (
                  <div className="p-2 bg-white rounded-xl border border-indigo-100 text-[11px] space-y-1">
                    <div className="text-slate-500 font-medium">Active Project URL:</div>
                    <code className="text-indigo-700 font-mono text-[10px] break-all block">{supabaseStatus.url}</code>
                    {supabaseStatus.isCustomStored && (
                      <button
                        type="button"
                        onClick={clearSupabaseCustomCredentials}
                        className="mt-1 text-[10px] text-rose-600 hover:text-rose-800 underline font-semibold cursor-pointer"
                      >
                        Reset stored credentials
                      </button>
                    )}
                  </div>
                )}

                <form onSubmit={handleSaveCustomCredentials} className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      VITE_SUPABASE_URL
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://xyzcompany.supabase.co"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white text-xs rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      VITE_SUPABASE_ANON_KEY
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                      value={customKey}
                      onChange={(e) => setCustomKey(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white text-xs rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  {configError && (
                    <div className="text-[11px] text-rose-600 font-semibold">{configError}</div>
                  )}

                  <button
                    type="submit"
                    disabled={configSaving}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    {configSaving ? 'Saving...' : 'Save & Connect Supabase'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Form Tabs: Sign In / Create Account */}
          <div className="flex border-b border-slate-200 text-xs font-bold text-center">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setAuthError(null);
                setSuccessMsg(null);
                setNeedsVerificationNotice(false);
              }}
              className={`flex-1 pb-3 cursor-pointer transition-colors ${
                mode === 'signin'
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setAuthError(null);
                setSuccessMsg(null);
                setNeedsVerificationNotice(false);
              }}
              className={`flex-1 pb-3 cursor-pointer transition-colors ${
                mode === 'signup'
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Messages & Verification Notice */}
          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{authError}</span>
                {needsVerificationNotice && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendingEmail}
                    className="mt-2 text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 cursor-pointer"
                  >
                    {resendingEmail ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Sending link...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>Resend verification email</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{successMsg}</p>
                {needsVerificationNotice && !resendSuccess && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendingEmail}
                    className="mt-2 text-emerald-800 hover:text-emerald-950 font-bold underline flex items-center gap-1 cursor-pointer"
                  >
                    {resendingEmail ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Resending link...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>Didn't receive it? Click to resend</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Primary Email / Password Form (Supabase Auth) */}
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Your Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Business Name</label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="Acme Studio"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Password</label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 mt-2"
            >
              {loading
                ? 'Connecting to Supabase...'
                : mode === 'signup'
                ? 'Create Customer Account (Supabase Auth)'
                : mode === 'forgot'
                ? 'Send Reset Instructions'
                : 'Sign In to Dashboard (Supabase Auth)'}
            </button>
          </form>

          {/* Social / Google Sign In via Supabase OAuth (Zero Firebase) */}
          <div className="relative pt-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-medium">or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-300 rounded-xl shadow-xs bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            title="Sign in using Google OAuth via Supabase (Zero Firebase)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google (Supabase OAuth)</span>
          </button>

          {/* Secondary Action: Demo / Guest Access */}
          <button
            onClick={onContinueAsGuest}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            <span>Explore as Guest (Instant Preview)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Feature Highlights */}
          <div className="pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Multi-tenant Supabase RLS & Profiles synchronization active</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Standalone public chat URLs & embeddable widgets</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
