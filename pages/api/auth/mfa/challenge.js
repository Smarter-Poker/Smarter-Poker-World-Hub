/* ═══════════════════════════════════════════════════════════════════════════
   MFA LOGIN CHALLENGE  ·  POST /api/auth/mfa/challenge

   SMS FACTOR + 30-DAY TRUSTED DEVICE (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   Step 2 of sign-in. Step 1 (password) has already issued a Supabase
   session; this route accepts the TEXT code that /api/auth/mfa/send-code
   just delivered, and hands back the cookies the rest of the app checks.

   WHAT CHANGED
   The `speakeasy.totp.verify` path is gone. There is no authenticator app,
   no shared secret, no QR. The code is a 4-digit text message checked
   through src/lib/mfaSmsCode.js against the same `sms_otp_codes` table the
   rest of the site already uses.

   TWO COOKIES, AND THE SECOND ONE IS THE POINT
     • `mfa_session`        — 12h. Minted on every successful check.
     • `mfa_trusted_device` — 30d. Minted unless the user opts OUT.

   `rememberDevice` DEFAULTS TO TRUE. That is deliberate and it is the whole
   product requirement: one code every 30 days, good for EVERYTHING — cash
   outs, admin writes, account deletion, every step-up gate. src/lib/
   mfaGate.js accepts this cookie in requireMfaIfEnrolled, requireMfaEnrolled
   AND requireRecentMfa, so a valid trusted device satisfies even the
   5-minute step-up window. Nothing re-prompts inside the 30 days.

   The two cookies carry DISTINCT issued-at stamps. They used to be byte-for
   -byte identical, which meant either could be replayed as the other and the
   12-hour ceiling on `mfa_session` was decorative — a stolen session cookie
   was silently good for a month.

   BACKUP CODES still work here (8 hex chars, consumed atomically through
   fn_consume_mfa_backup_code). They are the recovery path when the handset
   is lost, and the only reason SMS-only enrolment is safe.
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

// Keep these in lockstep with src/lib/mfaGate.js and middleware.ts.
const MFA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;              // 12 hours
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;    // 30 days

function signMfaToken(userId, issuedAt, secret) {
    const payload = `${userId}.${issuedAt}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
}

/** A backup code is 8 hex chars. Anything else is treated as a text code. */
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

    const { code, isBackupCode, rememberDevice, challengeId } = req.body || {};
    if (!code) {
        return res.status(400).json({ error: 'Verification code is required' });
    }

    // ── Identity: JWT ONLY. Step 1 must already have succeeded. ─────────
    if (!req.headers.authorization) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const { user, error: authErr } = await getServerUserWithFallback(req, supabase);
    if (authErr || !user) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    // ── Must be enrolled. ───────────────────────────────────────────────
    const { data: factor, error: factorError } = await supabase
        .from('user_mfa_factors')
        .select('enabled, backup_codes')
        .eq('user_id', user.id)
        .maybeSingle();

    if (factorError) {
        console.warn('[mfa/challenge] Factor lookup failed:', factorError.message);
        return res.status(503).json({ error: 'Unable to verify right now. Please try again.' });
    }
    if (!factor || factor.enabled !== true) {
        return res.status(400).json({
            error: 'Two-factor authentication is not enabled for this account',
            code: 'MFA_NOT_ENABLED',
        });
    }

    // ── Verify: backup code, or the texted 4-digit code. ────────────────
    // `isBackupCode` is a hint from the UI, not the authority — the shape of
    // the code decides, so a mislabelled request still lands in the right
    // branch instead of failing with a confusing "must be 4 digits".
    const useBackup = isBackupCode === true || looksLikeBackupCode(code);

    if (useBackup) {
        if (!looksLikeBackupCode(code)) {
            return res.status(400).json({ error: 'Backup codes are 8 characters.' });
        }
        // Hash and atomically consume. The RPC holds SELECT ... FOR UPDATE so
        // two concurrent requests with the same code can't both succeed.
        const hashed = crypto.createHash('sha256')
            .update(String(code).trim().toUpperCase())
            .digest('hex');
        const { data: rpcResult, error: rpcError } = await supabase
            .rpc('fn_consume_mfa_backup_code', {
                p_user_id: user.id,
                p_hashed_code: hashed,
            });
        if (rpcError) {
            console.warn('[mfa/challenge] consume RPC error:', rpcError.message);
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

    // ── Mint the cookies. ───────────────────────────────────────────────
    const secret =
        process.env.MFA_SESSION_SECRET ||
        process.env.SUPABASE_JWT_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret) {
        console.warn('[mfa/challenge] MFA_SESSION_SECRET not configured');
        return res.status(500).json({ error: 'MFA service not configured' });
    }

    const issuedAt = Date.now();
    const cookieFlags = 'Path=/; HttpOnly; Secure; SameSite=Lax';

    const cookies = [
        `mfa_session=${signMfaToken(user.id, issuedAt, secret)}; ${cookieFlags}; Max-Age=${MFA_TOKEN_TTL_MS / 1000}`,
    ];

    // Opt-OUT, not opt-in. Only an explicit `false` declines the 30 days.
    const trustThisDevice = rememberDevice !== false;
    let trustedUntil = null;

    if (trustThisDevice) {
        // Distinct issued-at so the trusted token can never be replayed as a
        // 12-hour session token, or vice versa.
        const trustedIssuedAt = issuedAt + 1;
        cookies.push(
            `mfa_trusted_device=${signMfaToken(user.id, trustedIssuedAt, secret)}; ${cookieFlags}; Max-Age=${TRUSTED_DEVICE_TTL_MS / 1000}`,
        );
        trustedUntil = new Date(trustedIssuedAt + TRUSTED_DEVICE_TTL_MS).toISOString();
    } else {
        // Explicitly declining must also clear any trusted cookie already on
        // this browser, or "don't remember me" would be a no-op.
        cookies.push(`mfa_trusted_device=; ${cookieFlags}; Max-Age=0`);
    }

    res.setHeader('Set-Cookie', cookies);

    return res.status(200).json({
        success: true,
        method: useBackup ? 'backup_code' : 'sms',
        mfaVerifiedUntil: new Date(issuedAt + MFA_TOKEN_TTL_MS).toISOString(),
        deviceTrusted: trustThisDevice,
        deviceTrustedUntil: trustedUntil,
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/challenge] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
