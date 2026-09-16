/** Rate-limited first-party auth error reporting to client_crash_log. */

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

// Keep a durable record even after the browser tab closes.
let _supabase = null;
function getSupabase() {
    if (_supabase) return _supabase;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return null;
    _supabase = createClient(url, key);
    return _supabase;
}

const ALLOWED_FLOWS = new Set([
    'signup_form_submit',
    'signup_oauth_init',
    'signup_oauth_callback',
    'login_form_submit',
    'login_oauth_init',
    'magic_link_send',
    'password_reset_request',
    'password_reset_apply',
    'email_confirmation',
    'mfa_challenge',
    'profile_provision',
    // 2026-08-25: the external provider itself refusing the handshake -
    // Facebook/Google answering /auth/v1/callback with ?error= or #error=.
    // Added the same day the callback started reporting it: without the tag
    // here every one of those lands in the 'unknown' bucket next to malformed
    // payloads, which is precisely the pile we added the report to escape.
    'oauth_provider_error',
    // The OAuth provider completed but handed back no email address, so the
    // account cannot be provisioned. Distinct from a refusal: the handshake
    // worked, the scope did not.
    'oauth_no_email',
    'unknown',
]);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, { max: 30, windowMs: 60_000, scope: ':log-client-error' })) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { flow, message, stack, code, url, user_agent } = req.body || {};

        // Validate flow tag — anything not in our allowlist gets bucketed
        // as 'unknown' so an attacker can't pollute the stored flow names.
        const safeFlow = ALLOWED_FLOWS.has(flow) ? flow : 'unknown';

        // Truncate everything aggressively — the client could be hostile
        // and we don't want to store giant payloads.
        const safeMessage = String(message || '').slice(0, 500);
        const safeStack = String(stack || '').slice(0, 2000);
        const safeCode = String(code || '').slice(0, 100);
        const safeUrl = String(url || req.headers.referer || '').slice(0, 500);
        const safeUa = String(user_agent || req.headers['user-agent'] || '').slice(0, 300);

        if (!safeMessage && !safeStack && !safeCode) {
            return res.status(400).json({ error: 'message, stack, or code required' });
        }

        // Write the durable first-party record.
        try {
            const supabase = getSupabase();
            if (supabase) {
                const { error: insErr } = await supabase.from('client_crash_log').insert({
                    boundary: 'auth',
                    section: safeFlow,
                    route: safeUrl ? safeUrl.split('?')[0].slice(0, 300) : null,
                    url: safeUrl || null,
                    error_name: safeCode || 'AuthError',
                    message: safeMessage || null,
                    stack: safeStack || null,
                    component_stack: null,
                    user_agent: safeUa || null,
                    embedded: false,
                    build_sha: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 60) || null,
                });
                if (insErr) console.warn('[log-client-error] insert failed:', insErr.message);
            }
        } catch (dbErr) {
            console.warn('[log-client-error] durable write failed:', dbErr?.message);
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        // NEVER let logging itself fail — return 200 so the client doesn't
        // retry into a death spiral.
        console.warn('[log-client-error] handler internal error:', err?.message);
        return res.status(200).json({ ok: false, swallowed: true });
    }
}
