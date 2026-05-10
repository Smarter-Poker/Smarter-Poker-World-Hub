/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT — Production Configuration
   ═══════════════════════════════════════════════════════════════════════════
   
   This is the authoritative Supabase client for Smarter.Poker.
   Uses localStorage for session persistence with standard @supabase/supabase-js.
   
   Storage Key: 'smarter-poker-auth'
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// CRITICAL: .trim() removes trailing newlines/whitespace that cause connection issues
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
   const msg = '[Supabase] FATAL: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY';
   console.warn(msg);
   // In browser, show error instead of silently failing
   if (typeof window !== 'undefined') {
      console.warn(msg + ' — check your .env.local file');
   }
   // Don't throw — allow build-time imports to succeed
   // Runtime calls will fail with a clear error
}

// Minimal logging
if (typeof window !== 'undefined' && supabaseUrl) {
   console.log('[Supabase] Init:', supabaseUrl.substring(8, 30) + '...');
}

let _supabase: any = null;

function getSupabase() {
   if (!_supabase) {
      // During Vercel SSG build, env vars may be omitted.
      // Use production fallback to satisfy createClient URL parser, preventing build crash.
      const safeUrl = supabaseUrl || 'https://auth.smarter.poker'; // Supabase Custom Domain (paid add-on, $10/mo)

      if (!supabaseAnonKey) {
         console.warn('[Supabase] FATAL: Missing NEXT_PUBLIC_SUPABASE_ANON_KEY — cannot create authenticated client');
      }

      _supabase = createClient(safeUrl, supabaseAnonKey || '', {
         auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            storageKey: 'smarter-poker-auth',
         },
      });
   }
   return _supabase;
}

/**
 * Create Supabase client with stable session persistence.
 * Wrapped in a Proxy to implement lazy-initialization without breaking module imports.
 */
export const supabase = new Proxy({}, {
   get(target, prop) {
      return getSupabase()[prop as keyof typeof _supabase];
   }
}) as SupabaseClient<Database>;

export default supabase;
