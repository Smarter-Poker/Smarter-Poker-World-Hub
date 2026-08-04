/* ═══════════════════════════════════════════════════════════════════════════
   MFA ENROLMENT — START  ·  POST /api/auth/mfa/setup

   SMS FACTOR (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   WHAT CHANGED AND WHY
   This route used to mint a TOTP secret with `speakeasy`, render an
   `otpauth://` QR with `qrcode`, and ask the user to install an
   authenticator app. That is gone. The second factor is now a TEXT MESSAGE
   code sent to the phone number the account has ALREADY verified.

   Sending goes through sendMfaCode() in src/lib/mfaSmsCode.js — the same
   function /api/auth/mfa/send-code calls. It reuses the existing Twilio
   pipeline and the existing `sms_otp_codes` table (4-digit crypto-strong
   code, 10-minute expiry, 5 codes per hour), but writes MFA rows under a
   namespaced key so the unauthenticated signup OTP endpoint cannot burn or
   delete an MFA challenge. See the header of mfaSmsCode.js for the attack
   that motivates it.

   IDENTITY comes from the `Authorization: Bearer <jwt>` header only. The
   request body is never trusted for a user id.

   NO VERIFIED PHONE?  That is a 400 with an actionable message and a
   machine-readable `code: 'PHONE_NOT_VERIFIED'`, never a 500. The user is
   told exactly what to do: verify a mobile number in account settings first.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { sendMfaCode, normalizePhone, maskPhone, isSendablePhone } from '../../../../src/lib/mfaSmsCode';

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

    // ── Already enrolled? Disabling first requires a current code. ──────
    const { data: factor } = await supabase
        .from('user_mfa_factors')
        .select('enabled')
        .eq('user_id', user.id)
        .maybeSingle();

    if (factor?.enabled === true) {
        return res.status(409).json({
            error: 'Two-factor authentication is already enabled. Disable it first (requires a current code) before re-enrolling.',
        });
    }

    // ── The factor is the account's VERIFIED phone. No phone, no MFA. ───
    // Read directly rather than through resolveFactorPhone(): that helper
    // answers 409 "use a backup code", which is right for an enrolled user
    // whose number lapsed and wrong here — this user has no backup codes
    // yet. Enrolment needs the actionable "go verify a phone" answer.
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('phone, phone_verified')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.warn('[mfa/setup] Profile lookup failed:', profileError.message);
        return res.status(503).json({ error: 'Unable to start two-factor setup right now. Please try again.' });
    }

    const phone = profile?.phone ? normalizePhone(profile.phone) : null;

    if (!phone || !isSendablePhone(phone) || profile?.phone_verified !== true) {
        return res.status(400).json({
            error: 'Add and verify a mobile phone number on your account first — your text-message codes are sent there. Go to Settings → Account → Phone Number, then come back and turn on two-factor.',
            code: 'PHONE_NOT_VERIFIED',
            requiresPhoneVerification: true,
        });
    }

    // ── Stage the (not yet enabled) factor row. ─────────────────────────
    // `secret` is NOT NULL in the schema and is a legacy TOTP column; the SMS
    // factor has no shared secret, so it carries the literal method marker.
    const { error: upsertError } = await supabase
        .from('user_mfa_factors')
        .upsert(
            { user_id: user.id, secret: 'sms', enabled: false, created_at: new Date().toISOString() },
            { onConflict: 'user_id' },
        );

    if (upsertError) {
        console.warn('[mfa/setup] Error staging MFA factor:', upsertError.message);
        return res.status(500).json({ error: 'Failed to start two-factor setup' });
    }

    // ── Send the code. ──────────────────────────────────────────────────
    const sent = await sendMfaCode(supabase, phone);
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
        message: `We texted a 4-digit code to ${maskPhone(phone)}. Enter it to finish turning on two-factor.`,
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/setup] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
