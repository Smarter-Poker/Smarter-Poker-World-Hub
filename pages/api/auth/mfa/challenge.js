/* ═══════════════════════════════════════════════════════════════════════════
   MFA LOGIN CHALLENGE — Phase 6.1.21
   POST /api/auth/mfa/challenge
   ═══════════════════════════════════════════════════════════════════════════

   Step-2 of sign-in for users who have MFA enrolled.

   The existing setup.js/verify.js endpoints handle enrolment. After a user
   signs in with password (which issues a Supabase session), if their
   `user_mfa_factors.enabled = true`, the client must call this endpoint
   with a fresh TOTP code before any sensitive API route will accept the
   session. We return a short-lived HMAC-signed MFA token cookie that
   server-side handlers can verify via src/lib/mfaGate.js.

   We do NOT rely on Supabase AAL here because the MFA implementation is
   custom (speakeasy-based TOTP in user_mfa_factors). If/when we migrate
   to Supabase native MFA, this endpoint becomes a thin proxy over
   supabase.auth.mfa.challenge() + verify().
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// MFA token TTL — 12 hours. Long enough that a user doesn't have to
// re-enter TOTP every few minutes, short enough that a stolen cookie
// doesn't grant perpetual elevated access.
const MFA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function signMfaToken(userId, issuedAt, secret) {
    const payload = `${userId}.${issuedAt}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
}

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.auth)) return;
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const { code, isBackupCode } = req.body || {};
        if (!code) {
            return res.status(400).json({ error: 'Verification code is required' });
        }

        // Must have a valid Supabase session to challenge MFA — step-1
        // (password) must already have succeeded.
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Load the user's MFA factor. Must be enabled.
        const { data: factor } = await getSupabase()
            .from('user_mfa_factors')
            .select('secret, enabled, backup_codes')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!factor || !factor.enabled) {
            return res.status(400).json({ error: 'MFA is not enabled for this account' });
        }

        let verified = false;

        if (isBackupCode) {
            // Hash the supplied code and atomically consume it via RPC.
            // The RPC holds a SELECT ... FOR UPDATE lock so two concurrent
            // requests with the same code can't both succeed (Phase 6.1.22).
            const hashed = crypto.createHash('sha256').update(String(code).toUpperCase()).digest('hex');
            const { data: rpcResult, error: rpcError } = await getSupabase()
                .rpc('fn_consume_mfa_backup_code', {
                    p_user_id: user.id,
                    p_hashed_code: hashed
                });
            if (rpcError) {
                console.warn('[mfa/challenge] consume RPC error:', rpcError);
                return res.status(500).json({ error: 'Failed to verify backup code' });
            }
            const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
            verified = !!row?.consumed;
        } else {
            verified = speakeasy.totp.verify({
                secret: factor.secret,
                encoding: 'base32',
                token: String(code).replace(/\s+/g, ''),
                window: 2
            });
        }

        if (!verified) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Issue a short-lived HMAC-signed MFA token. The signing secret is
        // shared with mfaGate.js — MFA_SESSION_SECRET must be set in the
        // production env (covered by envGuard.js recommended list, upgraded
        // to required in Phase 6.1.22).
        const secret =
            process.env.MFA_SESSION_SECRET ||
            process.env.SUPABASE_JWT_SECRET ||
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!secret) {
            console.warn('[mfa/challenge] MFA_SESSION_SECRET not configured');
            return res.status(500).json({ error: 'MFA service not configured' });
        }

        const issuedAt = Date.now();
        const mfaToken = signMfaToken(user.id, issuedAt, secret);

        // Set an HTTP-only cookie. The client's sensitive requests will
        // automatically include it; admin endpoints read it via mfaGate.
        res.setHeader(
            'Set-Cookie',
            `mfa_session=${mfaToken}; Path=/; Max-Age=${MFA_TOKEN_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`
        );

        return res.status(200).json({
            success: true,
            mfaVerifiedUntil: new Date(issuedAt + MFA_TOKEN_TTL_MS).toISOString(),
            method: isBackupCode ? 'backup_code' : 'totp'
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[mfa/challenge] Error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
}
