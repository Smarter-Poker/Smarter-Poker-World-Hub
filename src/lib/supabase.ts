/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT — Singleton for browser-side auth
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

// Fallback credentials MUST match production - from .env.local
const FALLBACK_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4MDY2OTksImV4cCI6MjA1MjM4MjY5OX0.6MWsejkJtYDJEwRG_ht0LHEjsJRfyiZl7K1gIvhRRfc';

// CRITICAL: .trim() removes trailing newlines/whitespace
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL).trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY).trim();

// Minimal logging
if (typeof window !== 'undefined') {
   console.log('[Supabase] Init:', supabaseUrl.substring(8, 30) + '...');
}

// Create Supabase client - let Supabase handle storage key automatically
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
   auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
   }
});

export default supabase;

