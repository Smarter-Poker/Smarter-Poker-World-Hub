"use strict";
/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT — Production Configuration
   ═══════════════════════════════════════════════════════════════════════════
   
   This is the authoritative Supabase client for Smarter.Poker.
   Uses localStorage for session persistence with standard @supabase/supabase-js.
   
   Storage Key: 'smarter-poker-auth'
   ═══════════════════════════════════════════════════════════════════════════ */
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
var supabase_js_1 = require("@supabase/supabase-js");
// CRITICAL: .trim() removes trailing newlines/whitespace that cause connection issues
var supabaseUrl = (_a = process.env.NEXT_PUBLIC_SUPABASE_URL) === null || _a === void 0 ? void 0 : _a.trim();
var supabaseAnonKey = (_b = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) === null || _b === void 0 ? void 0 : _b.trim();
if (!supabaseUrl || !supabaseAnonKey) {
    var msg = '[Supabase] FATAL: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY';
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
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key', {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'smarter-poker-auth',
    },
});
exports.default = exports.supabase;
