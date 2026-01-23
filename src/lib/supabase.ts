/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE BROWSER CLIENT — Hybrid Cookie + localStorage Auth
   ═══════════════════════════════════════════════════════════════════════════
   
   This client uses @supabase/ssr for browser operations, which automatically
   syncs sessions to both localStorage AND cookies. This provides:
   
   1. COOKIE PERSISTENCE: Sessions survive localStorage clears
   2. LOCALSTORAGE SPEED: Fast reads without server roundtrip
   3. SERVER ACCESS: Cookies available for SSR/middleware
   
   CRITICAL: This replaces the standard @supabase/supabase-js createClient
   ═══════════════════════════════════════════════════════════════════════════ */

import { createBrowserClient } from '@supabase/ssr';

// Fallback credentials for production stability
const FALLBACK_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

// CRITICAL: .trim() removes trailing newlines/whitespace
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL).trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY).trim();

// Minimal logging
if (typeof window !== 'undefined') {
   console.log('[Supabase-SSR] Init:', supabaseUrl.substring(8, 30) + '...');
}

/**
 * Create Supabase browser client using @supabase/ssr
 * 
 * This client automatically:
 * - Stores sessions in both localStorage AND cookies
 * - Syncs cookie changes to the server on each request
 * - Survives localStorage clears (cookies remain)
 */
export const supabase = createBrowserClient(
   supabaseUrl,
   supabaseAnonKey,
   {
      // Cookie options for persistent "remember me" 
      cookieOptions: {
         name: 'smarter-poker-session',
         maxAge: 60 * 60 * 24 * 365, // 1 year
         path: '/',
         sameSite: 'lax',
         secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
      },
      // Also use localStorage for fast access
      auth: {
         autoRefreshToken: true,
         persistSession: true,
         detectSessionInUrl: true,
         storageKey: 'smarter-poker-auth',
      },
   }
);

export default supabase;
