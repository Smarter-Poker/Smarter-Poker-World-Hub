/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT — Production Configuration
   ═══════════════════════════════════════════════════════════════════════════
   
   This is the authoritative Supabase client for Club Arena.
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

let _supabase: any = null;

function getSupabase() {
   if (!_supabase) {
      // During Vercel SSG build, env vars may be omitted. 
      // Use placeholders to satisfy createClient URL parser, preventing build crash.
      const safeUrl = supabaseUrl || 'https://build-placeholder.supabase.co';
      const safeKey = supabaseAnonKey || 'build-placeholder-key';

      _supabase = createClient(safeUrl, safeKey, {
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
}) as ReturnType<typeof createClient>;

export default supabase;
