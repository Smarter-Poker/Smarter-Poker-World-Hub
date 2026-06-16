import { createClient } from '@supabase/supabase-js';

// MLB Analytics Engine Supabase Instance
// DO NOT use NEXT_PUBLIC variables here. We want to ensure this is ONLY used Server-Side
// to protect the MLB database keys from being shipped to the client bundle.

const supabaseUrl = process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseServiceKey = process.env.MLB_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY; // Requires env setup on Vercel

export const getMlbSupabase = () => {
    if (!supabaseUrl || !supabaseServiceKey) {
        console.warn('[MLB Supabase] Missing MLB_SUPABASE_URL or MLB_SUPABASE_SERVICE_KEY environment variables.');
        // We do not throw because we want builds to succeed even if the key is missing locally.
    }
    
    // We use the Service Role key for read-only analytics fetching server-side
    // This allows us to bypass RLS for fetching raw predictions/stats to render the static/SSR pages
    return createClient(supabaseUrl, supabaseServiceKey || 'dummy-key-for-builds', {
        auth: {
            persistSession: false, // Server-side only
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
};
