/**
 * /api/auth/log-client-error — Server-side capture of client auth errors
 * ═══════════════════════════════════════════════════════════════════════════
 * The user-facing auth pages (pages/auth/signup.js, login.js, callback.js)
 * currently console.warn on errors. With Sentry auto-instrumentation
 * disabled (OOM workaround in next.config.js), those errors NEVER reach
 * Sentry. Result: we have no visibility into client-side signup failures.
 *
 * This endpoint is the migration target. New code SHOULD POST errors
 * here from the catch blocks instead of console.warn:
 *
 *   try { ... } catch (err) {
 *     fetch('/api/auth/log-client-error', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         flow: 'signup_form_submit',
 *         message: err?.message,
 *         stack: err?.stack,
 *         code: err?.code,
 *       }),
 *     });
 *   }
 *
 * The endpoint then captures via server-side Sentry (which IS reliably
 * initialized via sentry.server.config.js) with consistent auth.* tags.
 *
 * Why this endpoint exists alongside client-side Sentry:
 *   - Client Sentry can be blocked by ad-blockers (~30% of users)
 *   - Server-side capture works regardless
 *   - Centralized tagging keeps Sentry alerts simple
 *
 * Rate-limited to prevent abuse — 30 reports per IP per minute.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

// 2026-08-19: this endpoint forwarded to Sentry and nowhere else, and Sentry's
// browser SDK never initialises in production (no DSN is baked into the
// bundle) — so every signup and login failure captured here went straight into
// a black hole, which is the exact thing the header comment above says this
// endpoint exists to prevent. It now ALSO writes public.client_crash_log,
// boundary 'auth', section = the flow tag. Same table the error boundaries
// use, so there is one place to look.
let _supabase = null;
function getSupabase() {
    if (_supabase) return _supabase;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return null;
    _supabase = createClient(url, key);
    return _supabase;
}

let Sentry;
try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    Sentry = require('@sentry/nextjs');
} catch (_) {
    Sentry = {
        captureException: () => null,
        captureMessage: () => null,
        withScope: (cb) => cb({ setTag: () => null, setContext: () => null, setLevel: () => null, setFingerprint: () => null }),
    };
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
        // as 'unknown' so an attacker can't pollute our Sentry tag space.
        const safeFlow = ALLOWED_FLOWS.has(flow) ? flow : 'unknown';

        // Truncate everything aggressively — the client could be hostile
        // and we don't want to forward giant payloads to Sentry.
        const safeMessage = String(message || '').slice(0, 500);
        const safeStack = String(stack || '').slice(0, 2000);
        const safeCode = String(code || '').slice(0, 100);
        const safeUrl = String(url || req.headers.referer || '').slice(0, 500);
        const safeUa = String(user_agent || req.headers['user-agent'] || '').slice(0, 300);

        if (!safeMessage && !safeStack && !safeCode) {
            return res.status(400).json({ error: 'message, stack, or code required' });
        }

        // Durable first: Sentry is best-effort, this is the record.
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

        Sentry.withScope((scope) => {
            scope.setTag('auth.flow', safeFlow);
            scope.setTag('auth.source', 'client_log_endpoint');
            if (safeCode) scope.setTag('auth.error_code', safeCode);
            scope.setLevel('warning');
            // Group like errors together in Sentry by flow + first 50 chars
            scope.setFingerprint(['client-auth-error', safeFlow, safeMessage.slice(0, 50)]);
            scope.setContext('client_error', {
                flow: safeFlow,
                code: safeCode,
                url: safeUrl,
                user_agent: safeUa,
                stack_preview: safeStack.slice(0, 500),
            });
            // Reconstruct as a synthetic Error so Sentry shows a proper
            // stack instead of just a message
            const syntheticErr = new Error(`[client ${safeFlow}] ${safeMessage}`);
            if (safeStack) syntheticErr.stack = safeStack;
            Sentry.captureException(syntheticErr);
        });

        return res.status(200).json({ ok: true });
    } catch (err) {
        // NEVER let logging itself fail — return 200 so the client doesn't
        // retry into a death spiral.
        console.warn('[log-client-error] handler internal error:', err?.message);
        return res.status(200).json({ ok: false, swallowed: true });
    }
}
