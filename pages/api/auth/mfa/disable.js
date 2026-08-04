/* ═══════════════════════════════════════════════════════════════════════════
   MFA DISABLE  ·  POST /api/auth/mfa/disable
   Body: { code, challengeId? }

   SMS FACTOR (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   WHAT WAS BROKEN
   This route demanded `code.length === 6 || code.length === 8` and verified
   6-digit input with `speakeasy.totp.verify`. Once enrolment moved to text
   messages the codes became 4 digits, so every SMS-enrolled user was locked
   OUT of turning their own 2FA off — the length guard rejected a valid code
   before anything was even checked. Backup codes still worked, which meant
   the only way to disable 2FA was to burn a recovery code.

   NOW: a 4-digit text code (request one from /api/auth/mfa/send-code) or an
   8-character backup code. Both verified through the same shared helpers as
   challenge.js, so the attempt counter and expiry rules cannot drift.

   Turning 2FA off also CLEARS both cookies. Leaving a live 30-day
   `mfa_trusted_device` behind after the factor is gone would let that
   browser keep satisfying every step-up gate on an account that no longer
   has a second factor at all.
   ═══════════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { checkSmsCode, resolveFactorPhone } from '../../../../src/lib/mfaSmsCode';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function looksLikeBackupCode(code) {
    return /^[0-9a-fA-F]{8}$/.test(String(code || '').trim());
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.auth)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = getSupabase();

    // ── Identity: JWT ONLY. ─────────────────────────────────────────────
    if (!req.headers.authorization) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const { user, error: authErr } = await getServerUserWithFallback(req, supabase);
    if (authErr || !user) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    // SECURITY: a current code is required. Without it a stolen session
    // token could silently strip the second factor off the account.
    const { code, challengeId } = req.body || {};
    if (!code) {
        return res.status(400).json({
            error: 'Enter the code we texted you, or a backup code, to turn off two-factor.',
        });
    }

    const { data: factor, error: factorError } = await supabase
        .from('user_mfa_factors')
        .select('enabled, backup_codes')
        .eq('user_id', user.id)
        .maybeSingle();

    if (factorError) {
        console.warn('[mfa/disable] Factor lookup failed:', factorError.message);
        return res.status(503).json({ error: 'Unable to update two-factor right now. Please try again.' });
    }
    if (!factor || factor.enabled !== true) {
        return res.status(404).json({ error: 'Two-factor authentication is not enabled on this account' });
    }

    // ── Verify: backup code, or the texted 4-digit code. ────────────────
    const useBackup = looksLikeBackupCode(code);

    if (useBackup) {
        // Consume atomically — the RPC holds SELECT ... FOR UPDATE, closing
        // the TOCTOU race where two concurrent disables reuse one code.
        const hashed = crypto.createHash('sha256')
            .update(String(code).trim().toUpperCase())
            .digest('hex');
        const { data: rpcResult, error: rpcError } = await supabase
            .rpc('fn_consume_mfa_backup_code', {
                p_user_id: user.id,
                p_hashed_code: hashed,
            });
        if (rpcError) {
            console.warn('[mfa/disable] consume RPC error:', rpcError.message);
            return res.status(500).json({ error: 'Failed to verify backup code' });
        }
        const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
        if (!row?.consumed) {
            return res.status(400).json({ error: 'Invalid or already-used backup code' });
        }
    } else {
        const resolved = await resolveFactorPhone(supabase, user.id);
        if (!resolved.ok) {
            const { ok, status, ...rest } = resolved;
            return res.status(status).json(rest);
        }
        const check = await checkSmsCode(supabase, resolved.phone, code, challengeId);
        if (!check.ok) {
            const { ok, status, ...rest } = check;
            return res.status(status).json(rest);
        }
    }

    // ── Verified — turn the factor off and burn the backup codes. ───────
    // Stale hashes left on the row would still be accepted by
    // fn_consume_mfa_backup_code if 2FA were ever re-enabled without
    // re-issuing, so they go with the factor.
    const { error: updateError } = await supabase
        .from('user_mfa_factors')
        .update({
            enabled: false,
            disabled_at: new Date().toISOString(),
            backup_codes: [],
        })
        .eq('user_id', user.id);

    if (updateError) {
        console.warn('[mfa/disable] Error disabling 2FA:', updateError.message);
        return res.status(500).json({ error: 'Failed to turn off two-factor authentication' });
    }

    // Clear BOTH cookies. A surviving 30-day trusted device would keep
    // satisfying every step-up gate on an account with no second factor.
    const cookieFlags = 'Path=/; HttpOnly; Secure; SameSite=Lax';
    res.setHeader('Set-Cookie', [
        `mfa_session=; ${cookieFlags}; Max-Age=0`,
        `mfa_trusted_device=; ${cookieFlags}; Max-Age=0`,
    ]);

    return res.status(200).json({
        success: true,
        message: 'Two-factor authentication has been turned off.',
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/disable] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
