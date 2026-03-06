/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT — Production Configuration
   ═══════════════════════════════════════════════════════════════════════════
   
   This is the authoritative Supabase client for Smarter.Poker.
   Uses localStorage for session persistence with standard @supabase/supabase-js.
   
   Storage Key: 'smarter-poker-auth'
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

// CRITICAL: .trim() removes trailing newlines/whitespace that cause connection issues
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
   const msg = '[Supabase] FATAL: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY';
   console.error(msg);
   // In browser, show error instead of silently failing
   if (typeof window !== 'undefined') {
      console.error(msg + ' — check your .env.local file');
   }
   // Don't throw — allow build-time imports to succeed
   // Runtime calls will fail with a clear error
}

// Minimal logging
if (typeof window !== 'undefined' && supabaseUrl) {
   console.log('[Supabase] Init:', supabaseUrl.substring(8, 30) + '...');
}

/**
 * Create Supabase client with stable session persistence.
 * Safe fallbacks prevent crashes during dev HMR hot reloads when env vars are momentarily unavailable.
 */
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key', {
   auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'smarter-poker-auth',
   },
});

export default supabase;
