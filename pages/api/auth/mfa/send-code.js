/* ═══════════════════════════════════════════════════════════════════════════
   MFA — SEND A TEXT CODE  ·  POST /api/auth/mfa/send-code

   SMS FACTOR (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   The one place that texts a second-factor code to an ALREADY-ENROLLED
   account. Used by:
     • pages/auth/mfa.js        — step 2 of sign-in
     • the disable flow         — proving you still hold the handset
     • any future step-up       — re-confirming a sensitive action

   Enrolment (the very first code) goes through /api/auth/mfa/setup instead,
   because that route also has to stage the factor row. Both call the same
   sendMfaCode() in src/lib/mfaSmsCode.js, so the namespacing, rate limit,
   expiry and Twilio error handling can never drift apart.

   IDENTITY comes from the `Authorization: Bearer <jwt>` header only. Step 1
   (password) must already have issued a Supabase session — this endpoint
   cannot be used to text a stranger.

   NOT ENROLLED is a 400 with `code: 'MFA_NOT_ENABLED'`, never a 500, so the
   client can send the user straight on rather than stranding them on a code
   screen that will never receive a code.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { sendMfaCode, resolveFactorPhone } from '../../../../src/lib/mfaSmsCode';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.auth)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = getSupabase();

    // ── Identity: JWT ONLY. Never req.body. ─────────────────────────────
    if (!req.headers.authorization) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const { user, error: authError } = await getServerUserWithFallback(req, supabase);
    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    // ── Must already be enrolled. ───────────────────────────────────────
    const { data: factor, error: factorError } = await supabase
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    if (factorError) {
        console.warn('[mfa/send-code] Factor lookup failed:', factorError.message);
        return res.status(503).json({ error: 'Unable to send a code right now. Please try again.' });
    }
    if (!factor || factor.enabled !== true) {
        return res.status(400).json({
            error: 'Two-factor authentication is not enabled on this account.',
            code: 'MFA_NOT_ENABLED',
        });
    }

    // ── The factor is the account's VERIFIED phone. ─────────────────────
    // A number that has fallen out of verification is not a 500 — backup
    // codes are the documented recovery path, so say so.
    const resolved = await resolveFactorPhone(supabase, user.id);
    if (!resolved.ok) {
        const { ok, status, ...rest } = resolved;
        return res.status(status).json(rest);
    }

    const sent = await sendMfaCode(supabase, resolved.phone);
    if (!sent.ok) {
        const { ok, status, ...rest } = sent;
        return res.status(status).json(rest);
    }

    return res.status(200).json({
        success: true,
        method: 'sms',
        challengeId: sent.challengeId,
        phoneHint: sent.phoneHint,
        codeLength: sent.codeLength,
        expiresInSec: sent.expiresInSec,
        message: `We texted a 4-digit code to ${sent.phoneHint}.`,
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/send-code] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
