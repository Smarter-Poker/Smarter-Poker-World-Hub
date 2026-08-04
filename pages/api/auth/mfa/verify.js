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
import { checkSmsCode, normalizePhone, isSendablePhone } from '../../../../src/lib/mfaSmsCode';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/* normalizePhone / isSendablePhone / checkSmsCode now come from
   src/lib/mfaSmsCode.js. They used to be a private copy in this file, which
   meant the MFA namespacing (see that file's header — it is what stops an
   unauthenticated caller burning a victim's MFA challenge through
   /api/sms/verify-otp) applied to challenge.js and disable.js but NOT to
   enrolment. Three copies of an attempt counter is three chances to drift. */

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
    if (!phone || !isSendablePhone(phone) || profile?.phone_verified !== true) {
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
