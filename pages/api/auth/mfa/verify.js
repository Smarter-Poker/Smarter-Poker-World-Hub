/* ═══════════════════════════════════════════════════════════════════════════
   MFA ENROLMENT — FINISH  ·  POST /api/auth/mfa/verify

   SMS FACTOR (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   Confirms the 4-digit TEXT code that /api/auth/mfa/setup sent, then flips
   `user_mfa_factors.enabled` to true. The old `speakeasy.totp.verify` path
   is gone entirely — there is no authenticator-app enrolment left to be
   half-finished.

   The code is checked against the EXISTING `sms_otp_codes` table using the
   same rules as pages/api/sms/verify-otp.js: newest row for the phone,
   10-minute expiry, 5 attempts max, attempts incremented BEFORE the
   comparison, row deleted on success.

   Identity is taken from the bearer JWT. The body supplies only the code
   (and optionally the challengeId issued by setup).

   Backup codes: still issued here, ten of them, sha256-hashed at rest and
   consumed through fn_consume_mfa_backup_code (see challenge.js /
   disable.js). They are the recovery path for a lost handset — the only
   way the SMS factor stays usable when the phone does not.
   ═══════════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
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

function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
    return '+' + digits;
}

const MAX_ATTEMPTS = 5;   // same as pages/api/sms/verify-otp.js
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Check a 4-digit SMS code against the shared sms_otp_codes store.
 * Returns { ok:true } or { ok:false, status, error, ...hints }.
 */
async function checkSmsCode(supabase, phone, rawCode, challengeId) {
    const code = String(rawCode || '').trim();
    if (!/^\d{4}$/.test(code)) {
        return { ok: false, status: 400, error: 'Verification code must be 4 digits' };
    }

    const { error: purgeErr } = await supabase
        .from('sms_otp_codes')
        .delete()
        .lt('expires_at', new Date().toISOString());
    if (purgeErr) console.warn('[mfa/verify] OTP purge failed:', purgeErr.message);

    let query = supabase.from('sms_otp_codes').select('*').eq('phone', phone);
    // Only trust a well-formed uuid — a malformed one would make Postgres
    // throw 22P02 instead of simply not matching.
    if (challengeId && UUID_RE.test(String(challengeId))) {
        query = query.eq('id', String(challengeId));
    }

    const { data: stored, error: fetchError } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (fetchError) {
        console.warn('[mfa/verify] OTP fetch error:', fetchError.message);
        return { ok: false, status: 500, error: 'Failed to verify code' };
    }
    if (!stored) {
        return { ok: false, status: 400, error: 'No verification code found. Please request a new code.', expired: true };
    }
    if (new Date() > new Date(stored.expires_at)) {
        const { error: e } = await supabase.from('sms_otp_codes').delete().eq('id', stored.id);
        if (e) console.warn('[mfa/verify] Expired-row cleanup failed:', e.message);
        return { ok: false, status: 400, error: 'Verification code has expired. Please request a new code.', expired: true };
    }
    if (stored.attempts >= MAX_ATTEMPTS) {
        const { error: e } = await supabase.from('sms_otp_codes').delete().eq('id', stored.id);
        if (e) console.warn('[mfa/verify] Attempt-cap cleanup failed:', e.message);
        return { ok: false, status: 429, error: 'Too many attempts. Please request a new code.', tooManyAttempts: true };
    }

    // Increment BEFORE comparing so a crash can never hand out a free guess.
    const newAttempts = stored.attempts + 1;
    const { error: bumpErr } = await supabase
        .from('sms_otp_codes')
        .update({ attempts: newAttempts })
        .eq('id', stored.id);
    if (bumpErr) console.warn('[mfa/verify] Attempt increment failed:', bumpErr.message);

    if (stored.code !== code) {
        const remaining = MAX_ATTEMPTS - newAttempts;
        return {
            ok: false,
            status: 400,
            error: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
            remainingAttempts: remaining,
        };
    }

    const { error: delErr } = await supabase.from('sms_otp_codes').delete().eq('id', stored.id);
    if (delErr) console.warn('[mfa/verify] Consumed-code cleanup failed:', delErr.message);

    return { ok: true };
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
    const { user, error: authError } = await getServerUserWithFallback(req, supabase);
    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    const { code, challengeId } = req.body || {};
    if (!code) {
        return res.status(400).json({ error: 'Verification code is required' });
    }

    // ── Must have started enrolment. ────────────────────────────────────
    const { data: factor, error: factorError } = await supabase
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    if (factorError || !factor) {
        return res.status(404).json({ error: 'Two-factor setup has not been started. Call /api/auth/mfa/setup first.' });
    }
    if (factor.enabled === true) {
        return res.status(409).json({ error: 'Two-factor authentication is already enabled.' });
    }

    // ── The code was texted to the account's verified phone. ────────────
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('phone, phone_verified')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.warn('[mfa/verify] Profile lookup failed:', profileError.message);
        return res.status(503).json({ error: 'Unable to verify right now. Please try again.' });
    }

    const phone = profile?.phone ? normalizePhone(profile.phone) : null;
    if (!phone || !/^\+1\d{10}$/.test(phone) || profile?.phone_verified !== true) {
        return res.status(400).json({
            error: 'Add and verify a mobile phone number on your account first — your text-message codes are sent there.',
            code: 'PHONE_NOT_VERIFIED',
            requiresPhoneVerification: true,
        });
    }

    const check = await checkSmsCode(supabase, phone, code, challengeId);
    if (!check.ok) {
        const { ok, status, ...rest } = check;
        return res.status(status).json(rest);
    }

    // ── Enable the factor + issue single-use backup codes. ──────────────
    const backupCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(4).toString('hex').toUpperCase(),
    );
    const hashedBackupCodes = backupCodes.map((c) =>
        crypto.createHash('sha256').update(c).digest('hex'),
    );

    const { error: enableError } = await supabase
        .from('user_mfa_factors')
        .update({
            enabled: true,
            verified_at: new Date().toISOString(),
            backup_codes: hashedBackupCodes,
        })
        .eq('user_id', user.id);

    if (enableError) {
        console.warn('[mfa/verify] Error enabling MFA:', enableError.message);
        return res.status(500).json({ error: 'Failed to enable two-factor authentication' });
    }

    return res.status(200).json({
        success: true,
        method: 'sms',
        backupCodes,
        message: 'Two-factor authentication is on. We will text you a code when you need to confirm a sensitive action.',
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/verify] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
