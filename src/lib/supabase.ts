/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT — Singleton for browser-side auth
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

// Fallback credentials MUST match production - from .env.local
const FALLBACK_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

// CRITICAL: .trim() removes trailing newlines/whitespace
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL).trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY).trim();

// Minimal logging
if (typeof window !== 'undefined') {
   console.log('[Supabase] Init:', supabaseUrl.substring(8, 30) + '...');
}

// Create Supabase client with EXPLICIT storage key for cross-window persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
   auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'smarter-poker-auth', // CRITICAL: Explicit key ensures same session across all windows
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
   }
});

export default supabase;

