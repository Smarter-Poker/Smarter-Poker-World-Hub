/**
 * /api/auth/quick-signup — Backup signup endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Server-side endpoint backing /auth/quick. Uses the SAME Supabase REST
 * call the JS client makes, but server-side so this works even if the
 * client supabase package fails to load.
 *
 * What this catches that the main flow doesn't:
 *   - Bundle errors that break supabase-js on the client
 *   - CSP/CORS issues blocking the browser→Supabase XHR
 *   - Session-restoration races on the client
 *
 * Stays narrow on purpose:
 *   - Only required fields (email, password, first_name, last_name)
 *   - No HIBP / entropy check (defer to Supabase's built-in min length)
 *   - No promo / referral / phone — emergency path, not feature-rich
 *   - Returns 200 + { ok: true } on success, never leaks whether email
 *     existed (account-enumeration defense)
 *
 * Rate-limited tightly (5 per IP per minute) — this is meant for
 * occasional emergency use, not bulk signups.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// [2026-07-25] .trim() is load-bearing: the prod Vercel value of
// NEXT_PUBLIC_SUPABASE_ANON_KEY ends with a literal "\n". Untrimmed, the
// apikey/Authorization headers below make fetch() throw TypeError on every
// request — i.e. the designated EMERGENCY signup endpoint 500'd for
// everyone, exactly when the main flow was broken enough for someone to
// need it.
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co').trim();
const SUPABASE_ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, { max: 5, windowMs: 60_000, scope: ':quick-signup' })) return;

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        if (!SUPABASE_ANON) {
            return res.status(500).json({ error: 'Server misconfigured (no anon key)' });
        }

        const { email, password, first_name, last_name } = req.body || {};

        // Minimal validation — Supabase enforces the rest.
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }
        if (!password || typeof password !== 'string' || password.length < 10) {
            return res.status(400).json({ error: 'Password must be at least 10 characters' });
        }
        if (password.length > 72) {
            // bcrypt silently truncates at 72 bytes — reject instead of
            // storing a password that differs from what the user typed.
            return res.status(400).json({ error: 'Password must be 72 characters or fewer' });
        }
        if (!first_name || !last_name) {
            return res.status(400).json({ error: 'First and last name required' });
        }

        const safeEmail = email.trim().toLowerCase();
        const fullName = `${first_name.trim()} ${last_name.trim()}`.trim();

        // Direct REST call to Supabase /auth/v1/signup. This is what
        // supabase-js does under the hood. Note the `data` field is at
        // TOP LEVEL (not nested in `options`) — that's the GoTrue REST
        // contract, even though the JS client uses `options.data`.
        const supabaseResp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_ANON,
                Authorization: `Bearer ${SUPABASE_ANON}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: safeEmail,
                password,
                data: {
                    full_name: fullName,
                    first_name: first_name.trim(),
                    last_name: last_name.trim(),
                    _signup_source: 'quick',
                },
            }),
        });

        const body = await supabaseResp.json().catch(() => ({}));

        if (!supabaseResp.ok) {
            // Account-enumeration defense — return generic message regardless
            // of whether email already existed. Real owner gets a fresh
            // confirmation email anyway.
            const msg = (body?.msg || body?.error_description || '').toLowerCase();
            if (msg.includes('already registered') || msg.includes('user already')) {
                return res.status(200).json({
                    ok: true,
                    message: 'Check your email for a confirmation link.',
                });
            }
            // Other errors — surface generically
            console.warn('[quick-signup] Supabase rejected:', supabaseResp.status, body);
            return res.status(supabaseResp.status >= 500 ? 502 : 400).json({
                error: body?.msg || body?.error_description || 'Signup failed',
            });
        }

        // Success
        return res.status(200).json({
            ok: true,
            message: 'Account created. Check your email for confirmation.',
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_) { /* never let logging break the handler */ }
        console.warn('[quick-signup] handler error:', err);
        return res.status(500).json({ error: 'Server error — please try again' });
    }
}
