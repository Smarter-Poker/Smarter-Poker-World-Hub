/**
 * Supabase Admin Client — shared service-role client for cron handlers & server routes.
 *
 * Purpose
 * -------
 * Prior to this helper, 16 Horse/Content cron handlers inlined their own
 * `createClient` + env-fallback logic. Three problems with that pattern:
 *   1. Each cron crashes with its own "missing env" style error message.
 *   2. A new Supabase client socket is spun up per invocation.
 *   3. The GoTrue getUser patch (src/lib/supabaseServerClient) has to be
 *      wired in per-file.
 *
 * This helper returns a single, memoized, patched service-role client and
 * fails loudly at import time if no key is present. Prefer importing from
 * here over calling createClient directly inside cron handlers.
 *
 * Usage
 * -----
 *   import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
 *   const supabase = getSupabaseAdmin();
 *
 * The helper is intentionally tiny — it wraps src/lib/supabaseServerClient
 * which already provides JWT fallback. Do NOT bypass this helper to
 * "go direct" with @supabase/supabase-js — you lose the GoTrue patch.
 */
// @ts-ignore — supabaseServerClient is CommonJS
import { createClient } from '../src/lib/supabaseServerClient';

let _client: any = null;

export function getSupabaseAdmin() {
    if (_client) return _client;

    const url =
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        'https://kuklfnapbkmacvwxktbh.supabase.co';

    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!key) {
        throw new Error(
            '[supabaseAdmin] No Supabase key found. Set SUPABASE_SERVICE_ROLE_KEY or ' +
                'NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel environment.'
        );
    }

    _client = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });

    return _client;
}

/** True when the helper will return a service-role (RLS-bypassing) client. */
export function isServiceRole(): boolean {
    return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export default getSupabaseAdmin;
