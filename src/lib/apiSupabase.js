/**
 * THE ONE SERVICE-ROLE CLIENT AN API ROUTE SHOULD HOLD
 *
 * Every API route used to build its own: `let _supabase = null; function
 * getSupabase() {...}` copied a few hundred times, each copy free to drift.
 * One drifted to a raw `@supabase/supabase-js` import (ai-hand-reader), which
 * bypasses the JWT-decode fallback in supabaseServerClient (CLAUDE.md rule 4).
 *
 * This is that function, once. Memoised per lambda, service role first, anon
 * key only as a last resort so a misconfigured environment fails loudly on
 * RLS rather than silently on undefined.
 */
import { createClient } from './supabaseServerClient';

let _client = null;

export function getServiceSupabase() {
    if (!_client) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _client = createClient(url, key);
    }
    return _client;
}
