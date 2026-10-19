import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read from client environment variables or browser localStorage
function resolveSupabaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = window.localStorage.getItem('selectbot_supabase_url');
    if (custom && custom.trim().startsWith('http') && !custom.includes('placeholder')) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  return envUrl.replace(/\/$/, '');
}

function resolveSupabaseAnonKey(): string {
  if (typeof window !== 'undefined') {
    const custom = window.localStorage.getItem('selectbot_supabase_anon_key');
    if (custom && custom.trim().length > 20 && !custom.includes('your-anon')) {
      return custom.trim();
    }
  }
  return (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
}

const activeUrl = resolveSupabaseUrl();
const activeKey = resolveSupabaseAnonKey();

// Validate whether Supabase is legitimately configured with a real project
const isConfigured = Boolean(
  activeUrl &&
  activeKey &&
  activeUrl.startsWith('http') &&
  !activeUrl.includes('your-project-ref') &&
  !activeUrl.includes('placeholder.supabase.co') &&
  !activeKey.includes('your-anon-publishable-key')
);

export const isSupabaseConfigured = isConfigured;

// Dummy client fallback to avoid app crash on initial load if env vars are missing
const dummyUrl = 'https://placeholder.supabase.co';
const dummyKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

export let supabase: SupabaseClient = createClient(
  isConfigured ? activeUrl : dummyUrl,
  isConfigured ? activeKey : dummyKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);

/**
 * Return configuration status for UI and debugging
 */
export function getSupabaseConfigStatus(): {
  configured: boolean;
  url: string | null;
  anonKeyPreview: string | null;
  missingVars: string[];
  isCustomStored: boolean;
} {
  const missing: string[] = [];
  if (!activeUrl || activeUrl.includes('your-project-ref') || activeUrl.includes('placeholder')) {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!activeKey || activeKey.includes('your-anon-publishable-key') || activeKey.length < 20) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }

  const isCustomStored = Boolean(
    typeof window !== 'undefined' &&
    window.localStorage.getItem('selectbot_supabase_url')
  );

  return {
    configured: isConfigured,
    url: isConfigured ? activeUrl : null,
    anonKeyPreview: isConfigured && activeKey ? `${activeKey.substring(0, 10)}...${activeKey.substring(activeKey.length - 4)}` : null,
    missingVars: missing,
    isCustomStored,
  };
}

/**
 * Allows setting or updating Supabase credentials directly from the UI,
 * enabling immediate connection without requiring a rebuild or redeployment.
 */
export function setSupabaseCustomCredentials(url: string, anonKey: string): void {
  if (typeof window === 'undefined') return;

  const cleanUrl = url.trim().replace(/\/$/, '');
  const cleanKey = anonKey.trim();

  if (!cleanUrl.startsWith('http')) {
    throw new Error('Supabase URL must start with https://');
  }
  if (cleanKey.length < 20) {
    throw new Error('Supabase Anon Key is too short. Please copy the complete anon/public key.');
  }

  window.localStorage.setItem('selectbot_supabase_url', cleanUrl);
  window.localStorage.setItem('selectbot_supabase_anon_key', cleanKey);

  // Reload page to re-initialize clean client instance across all modules
  window.location.reload();
}

/**
 * Clear user-supplied credentials from localStorage
 */
export function clearSupabaseCustomCredentials(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('selectbot_supabase_url');
  window.localStorage.removeItem('selectbot_supabase_anon_key');
  window.location.reload();
}
