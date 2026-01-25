/* ═══════════════════════════════════════════════════════════════════════════
   🛡️ SAFE SUPABASE CLIENT — Use this instead of direct supabase import!
   ═══════════════════════════════════════════════════════════════════════════
   
   This wrapper BLOCKS dangerous auth methods that cause the 0/0/LV1 bug.
   
   ❌ BLOCKED METHODS (throw helpful error):
   - supabase.auth.getUser()
   - supabase.auth.getSession()
   - supabase.auth.refreshSession()
   
   ✅ ALLOWED METHODS:
   - supabase.from(), .rpc(), .storage, .realtime
   - supabase.auth.signInWithPassword(), .signUp(), .signOut()
   - supabase.auth.onAuthStateChange() (event-based, safe)
   
   For user data, use: import { getAuthUser } from '@/lib/authUtils';
   
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase as rawSupabase } from './supabase';

// Error message shown when dangerous methods are called
const DANGEROUS_METHOD_ERROR = (method: string) => `
🚫 FORBIDDEN: ${method}() is blocked!

This method can throw AbortError and cause the 0/0/LV1 bug.

✅ INSTEAD USE:
   import { getAuthUser, getAuthUserId } from '@/lib/authUtils';
   const user = getAuthUser();

Or use onAuthStateChange() for reactive auth:
   supabase.auth.onAuthStateChange((event, session) => {
     // Handle auth changes here
   });
`;

// Create a proxy that blocks dangerous auth methods
const createSafeAuth = (originalAuth: typeof rawSupabase.auth) => {
    return new Proxy(originalAuth, {
        get(target, prop) {
            // Block dangerous methods
            if (prop === 'getUser') {
                return () => {
                    throw new Error(DANGEROUS_METHOD_ERROR('supabase.auth.getUser'));
                };
            }
            if (prop === 'getSession') {
                return () => {
                    throw new Error(DANGEROUS_METHOD_ERROR('supabase.auth.getSession'));
                };
            }
            if (prop === 'refreshSession') {
                return () => {
                    throw new Error(DANGEROUS_METHOD_ERROR('supabase.auth.refreshSession'));
                };
            }

            // Allow all other methods (signIn, signUp, signOut, onAuthStateChange, etc.)
            return target[prop as keyof typeof target];
        },
    });
};

// Create the safe Supabase client
const safeAuth = createSafeAuth(rawSupabase.auth);

// Export safe client with blocked auth methods
export const safeSupabase = {
    // All database methods are safe
    from: rawSupabase.from.bind(rawSupabase),
    rpc: rawSupabase.rpc.bind(rawSupabase),
    storage: rawSupabase.storage,
    realtime: rawSupabase.realtime,
    channel: rawSupabase.channel.bind(rawSupabase),
    removeChannel: rawSupabase.removeChannel.bind(rawSupabase),

    // Auth with dangerous methods blocked
    auth: safeAuth,
};

// Also export for compatibility with existing import patterns
export default safeSupabase;

/* ═══════════════════════════════════════════════════════════════════════════
   MIGRATION GUIDE
   ═══════════════════════════════════════════════════════════════════════════
   
   BEFORE (dangerous):
   import { supabase } from '@/lib/supabase';
   const { data: { user } } = await supabase.auth.getUser();
   
   AFTER (safe):
   import { getAuthUser } from '@/lib/authUtils';
   const user = getAuthUser();
   
   ═══════════════════════════════════════════════════════════════════════════ */
