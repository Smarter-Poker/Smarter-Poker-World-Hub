import { createClient } from '@supabase/supabase-js';

// MLB Analytics Engine Supabase Instance.
// Keys are resolved INSIDE the function so they are never captured at module-scope
// by the Next.js bundler (prevents accidental client-bundle inclusion).
// Only MLB_SUPABASE_SERVICE_KEY is accepted — falling through to the main project's
// SUPABASE_SERVICE_ROLE_KEY would silently authenticate against the wrong DB.

export const getMlbSupabase = () => {
    const supabaseUrl = process.env.MLB_SUPABASE_URL
        || 'https://nscdmxldtyszyvcxxwgr.supabase.co';  // public URL fallback only

    const supabaseServiceKey = process.env.MLB_SUPABASE_SERVICE_KEY;

    if (!supabaseServiceKey) {
        // In production this means every RPC call will 401. Surface it loud.
        console.error(
            '[MLB Supabase] MLB_SUPABASE_SERVICE_KEY is not set. ' +
            'Set this env var on Vercel to enable the MLB Analytics API.'
        );
    }

    return createClient(supabaseUrl, supabaseServiceKey || 'dummy-key-for-builds', {
        auth: {
            persistSession: false,     // server-side only — never hydrate client sessions
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
};
