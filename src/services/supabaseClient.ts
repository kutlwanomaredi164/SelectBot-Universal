import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==============================================================================
// 1. ENVIRONMENT VARIABLES AUDIT & CLIENT-SIDE SECURITY INSPECTION
// ==============================================================================

/**
 * Checks if an API key is a secret service_role key that must NEVER be in the frontend.
 */
export function isSecretKey(key: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.startsWith('sb_secret_') || trimmed.startsWith('service_role')) {
    return true;
  }
  // If it's a JWT token, inspect the unencrypted payload header/claim
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const decodedPayload = JSON.parse(atob(parts[1]));
      if (decodedPayload.role === 'service_role') {
        return true;
      }
    } catch {
      // ignore parsing errors
    }
  }
  return false;
}

// Read strictly from frontend environment variables (with browser localStorage fallback)
const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function getStoredCustomUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = window.localStorage.getItem('selectbot_supabase_url');
    if (custom && custom.trim().startsWith('http') && !custom.includes('placeholder')) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  return '';
}

function getStoredCustomKey(): string {
  if (typeof window !== 'undefined') {
    const custom = window.localStorage.getItem('selectbot_supabase_anon_key');
    if (custom && custom.trim().length > 20 && !custom.includes('your-anon')) {
      return custom.trim();
    }
  }
  return '';
}

export const activeSupabaseUrl = getStoredCustomUrl() || envUrl;
export const activeSupabaseAnonKey = getStoredCustomKey() || envKey;

// Critical security check: Never allow service_role secret keys in browser
export const isServiceRoleDetectedInBrowser = isSecretKey(activeSupabaseAnonKey);

if (isServiceRoleDetectedInBrowser) {
  console.error(
    `[Supabase Client Error] CRITICAL SECURITY ALERT: A service_role secret key was supplied to the browser client!\n` +
    `Symptoms: "Forbidden use of secret API key in browser".\n` +
    `Resolution: In Vercel Project Settings (or in the connection drawer), set VITE_SUPABASE_ANON_KEY to your anon / public key (role: 'anon' or sb_publishable_*), NEVER the secret key.`
  );
}

// Validate configuration
export const isSupabaseConfigured = Boolean(
  activeSupabaseUrl &&
  activeSupabaseAnonKey &&
  activeSupabaseUrl.startsWith('http') &&
  !activeSupabaseUrl.includes('your-project-ref') &&
  !activeSupabaseUrl.includes('placeholder.supabase.co') &&
  !activeSupabaseAnonKey.includes('your-anon-publishable-key') &&
  !isServiceRoleDetectedInBrowser
);

// Fallback dummy credentials to prevent fatal syntax crashes before configuration
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

// Log initialization status (Task 11)
if (isSupabaseConfigured) {
  console.log(`[Supabase Client Initialization] Initialized with URL: ${activeSupabaseUrl}`);
} else {
  const missing: string[] = [];
  if (!activeSupabaseUrl || activeSupabaseUrl.includes('your-project-ref')) {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!activeSupabaseAnonKey || activeSupabaseAnonKey.includes('your-anon-publishable-key')) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }
  if (isServiceRoleDetectedInBrowser) {
    missing.push('VITE_SUPABASE_ANON_KEY (Reason: Secret key forbidden in browser)');
  }
  console.warn(`[Supabase Client Initialization] Missing or invalid configuration:`, missing);
}

// Initialize official Supabase client (Task 4)
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? activeSupabaseUrl : fallbackUrl,
  isSupabaseConfigured ? activeSupabaseAnonKey : fallbackKey,
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
 * Return configuration status for UI and diagnostic logging
 */
export function getSupabaseConfigStatus(): {
  configured: boolean;
  url: string | null;
  anonKeyPreview: string | null;
  missingVars: string[];
  isCustomStored: boolean;
  isSecretKeyForbidden: boolean;
} {
  const missing: string[] = [];
  if (!activeSupabaseUrl || activeSupabaseUrl.includes('your-project-ref') || activeSupabaseUrl.includes('placeholder')) {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!activeSupabaseAnonKey || activeSupabaseAnonKey.includes('your-anon-publishable-key') || activeSupabaseAnonKey.length < 20) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }
  if (isServiceRoleDetectedInBrowser) {
    missing.push('VITE_SUPABASE_ANON_KEY (Must use anon key, not service_role)');
  }

  const isCustomStored = Boolean(
    typeof window !== 'undefined' &&
    window.localStorage.getItem('selectbot_supabase_url')
  );

  return {
    configured: isSupabaseConfigured,
    url: isSupabaseConfigured ? activeSupabaseUrl : null,
    anonKeyPreview: activeSupabaseAnonKey
      ? `${activeSupabaseAnonKey.substring(0, 10)}...${activeSupabaseAnonKey.substring(activeSupabaseAnonKey.length - 4)}`
      : null,
    missingVars: missing,
    isCustomStored,
    isSecretKeyForbidden: isServiceRoleDetectedInBrowser,
  };
}

/**
 * Set custom Supabase credentials from UI with client-side secret-key rejection
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
  if (isSecretKey(cleanKey)) {
    throw new Error(
      'Forbidden: You entered a secret / service_role key! The browser MUST use the anon / public key (role: "anon"). Please copy the "anon" key from Supabase Dashboard > Project Settings > API.'
    );
  }

  window.localStorage.setItem('selectbot_supabase_url', cleanUrl);
  window.localStorage.setItem('selectbot_supabase_anon_key', cleanKey);

  console.log('[Supabase Client] Custom credentials saved to localStorage. Reloading...');
  window.location.reload();
}

/**
 * Clear user-supplied credentials from localStorage
 */
export function clearSupabaseCustomCredentials(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('selectbot_supabase_url');
  window.localStorage.removeItem('selectbot_supabase_anon_key');
  console.log('[Supabase Client] Custom credentials cleared. Reloading...');
  window.location.reload();
}
