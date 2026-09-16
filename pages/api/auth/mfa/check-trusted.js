/* ═══════════════════════════════════════════════════════════════════════════
   MFA STATUS + TRUSTED-DEVICE EXCHANGE  ·  POST /api/auth/mfa/check-trusted

   SMS FACTOR + 30-DAY TRUSTED DEVICE (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   Called by pages/auth/login.js immediately after a successful password
   sign-in. It answers, in ONE round trip, the only two questions the client
   has at that moment:

     mfaEnabled  — is there a second factor on this account at all?
     trusted     — does this browser hold a live 30-day trusted device?

   If both are true it mints a fresh 12-hour `mfa_session` so every
   server-side gate is satisfied immediately, and login proceeds straight to
   the hub. That exchange is what makes "one code every 30 days" true in
   practice: the trusted cookie by itself already satisfies mfaGate, but
   handing back a session cookie too keeps the 12-hour token in circulation
   for anything that inspects it directly.

   If `mfaEnabled` is false, login proceeds — MFA is opt-in per account.
   If `mfaEnabled` is true and `trusted` is false, the client sends the user
   to /auth/mfa for a text code.

   Verification is delegated to src/lib/mfaGate.js — this route used to
   re-implement the HMAC check inline with a plain `!==` comparison rather
   than a constant-time one, and with no user-id binding on the session
   cookie it issued.
   ═══════════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { verifyTrustedDevice } from '../../../../src/lib/mfaGate';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const MFA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function signMfaToken(userId, issuedAt, secret) {
    const payload = `${userId}.${issuedAt}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.auth)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = getSupabase();

    if (!req.headers.authorization) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const { user, error: authErr } = await getServerUserWithFallback(req, supabase);
    if (authErr || !user) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    // ── Is there a factor at all? ───────────────────────────────────────
    const { data: factor, error: factorError } = await supabase
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    if (factorError) {
        // Fail OPEN on a lookup hiccup: this route only decides whether to
        // *prompt*. Every server-side gate still enforces independently via
        // mfaGate, so a false "not enrolled" here cannot grant access to
        // anything — it would just skip a prompt the API would then demand.
        console.warn('[mfa/check-trusted] Factor lookup failed:', factorError.message);
        return res.status(200).json({ mfaEnabled: false, trusted: false, degraded: true });
    }

    const mfaEnabled = factor?.enabled === true;
    if (!mfaEnabled) {
        return res.status(200).json({ mfaEnabled: false, trusted: false });
    }

    // ── Does this browser hold a live 30-day trusted device? ────────────
    const trusted = verifyTrustedDevice(req, user.id);
    if (!trusted.ok) {
        return res.status(200).json({ mfaEnabled: true, trusted: false, reason: trusted.reason });
    }

    // ── Trusted. Mint a fresh 12h session cookie. ───────────────────────
    const secret =
        process.env.MFA_SESSION_SECRET ||
        process.env.SUPABASE_JWT_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret) {
        console.warn('[mfa/check-trusted] MFA_SESSION_SECRET not configured');
        return res.status(500).json({ error: 'MFA service not configured' });
    }

    const issuedAt = Date.now();
    res.setHeader(
        'Set-Cookie',
        `mfa_session=${signMfaToken(user.id, issuedAt, secret)}; Path=/; Max-Age=${MFA_TOKEN_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`,
    );

    return res.status(200).json({
        mfaEnabled: true,
        trusted: true,
        mfaVerifiedUntil: new Date(issuedAt + MFA_TOKEN_TTL_MS).toISOString(),
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/check-trusted] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
