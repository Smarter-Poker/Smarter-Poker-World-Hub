/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT — Singleton for browser-side auth
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

// Fallback credentials for when env vars are not set
const FALLBACK_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

// CRITICAL: .trim() removes trailing newlines/whitespace that can corrupt localStorage keys
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL).trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY).trim();

// Create Supabase client with explicit session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
   auth: {
      autoRefreshToken: true,      // Automatically refresh tokens before they expire
      persistSession: true,         // Persist session in localStorage
      detectSessionInUrl: true,     // Detect OAuth redirects
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
   }
});

export default supabase;
