/* ═══════════════════════════════════════════════════════════════════════════
   MFA ENROLMENT — START  ·  POST /api/auth/mfa/setup

   SMS FACTOR (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   WHAT CHANGED AND WHY
   This route used to mint a TOTP secret with `speakeasy`, render an
   `otpauth://` QR with `qrcode`, and ask the user to install an
   authenticator app. That is gone. The second factor is now a TEXT MESSAGE
   code sent to the phone number the account has ALREADY verified.

   It reuses the existing Twilio OTP system verbatim — same `sms_otp_codes`
   table, same 4-digit crypto-strong code, same 10-minute expiry, same
   5-codes-per-hour-per-phone cap as pages/api/sms/send-otp.js. There is no
   second OTP store and no new table.

   IDENTITY comes from the `Authorization: Bearer <jwt>` header only. The
   request body is never trusted for a user id.

   NO VERIFIED PHONE?  That is a 400 with an actionable message and a
   machine-readable `code: 'PHONE_NOT_VERIFIED'`, never a 500. The user is
   told exactly what to do: verify a mobile number in account settings first.
   ═══════════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import twilio from 'twilio';
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

/* ── Twilio creds. The .trim() is load-bearing: the prod Vercel values end
      with a literal trailing newline. See pages/api/sms/send-otp.js. ────── */
const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const twilioPhone = (process.env.TWILIO_PHONE_NUMBER || '').trim();

let _twilioClient = null;
function getTwilioClient() {
    if (!_twilioClient) _twilioClient = twilio(accountSid, authToken);
    return _twilioClient;
}

/* ── Identical normalisation to send-otp.js / verify-otp.js ───────────── */
function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
    return '+' + digits;
}

function maskPhone(e164) {
    const s = String(e164 || '');
    return s.length < 4 ? '••••' : '••• ••• ' + s.slice(-4);
}

const MAX_CODES_PER_HOUR = 5;   // same cap as send-otp.js
const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Send an MFA code through the EXISTING sms_otp_codes pipeline.
 * Returns { ok, challengeId } or { ok:false, status, error }.
 */
async function sendMfaCode(supabase, phone) {
    if (!accountSid || !authToken || !twilioPhone) {
        console.warn('[mfa/setup] Twilio credentials not configured');
        return { ok: false, status: 503, error: 'SMS service is temporarily unavailable. Please try again later.' };
    }

    // Housekeeping — purge expired rows (same as send-otp.js).
    const { error: purgeErr } = await supabase
        .from('sms_otp_codes')
        .delete()
        .lt('expires_at', new Date().toISOString());
    if (purgeErr) console.warn('[mfa/setup] OTP purge failed:', purgeErr.message);

    // Rate limit — max codes per phone per hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
        .from('sms_otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .gte('created_at', oneHourAgo);

    if (countError) {
        console.warn('[mfa/setup] Rate limit check error:', countError.message);
    } else if (count >= MAX_CODES_PER_HOUR) {
        return { ok: false, status: 429, error: 'Too many verification requests. Please try again later.' };
    }

    const otpCode = crypto.randomInt(1000, 10000).toString();

    const { data: row, error: insertError } = await supabase
        .from('sms_otp_codes')
        .insert({
            phone,
            code: otpCode,
            expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
            attempts: 0,
        })
        .select('id')
        .maybeSingle();

    if (insertError) {
        console.warn('[mfa/setup] OTP insert error:', insertError.message);
        return { ok: false, status: 500, error: 'Failed to store verification code' };
    }

    try {
        await getTwilioClient().messages.create({
            body: `Your Smarter.Poker code is: ${otpCode}. Expires in 10 min.`,
            from: twilioPhone,
            to: phone,
        });
    } catch (err) {
        // Do not leave an unusable code behind if the carrier refused it.
        if (row?.id) {
            const { error: delErr } = await supabase.from('sms_otp_codes').delete().eq('id', row.id);
            if (delErr) console.warn('[mfa/setup] Failed to clean up unsent OTP:', delErr.message);
        }
        console.warn('[mfa/setup] Twilio send error:', err?.message || err);
        if (err?.code === 21211) return { ok: false, status: 400, error: 'Invalid phone number format' };
        if (err?.code === 21614) return { ok: false, status: 400, error: 'That number is not a valid mobile number' };
        if (err?.code === 21608) return { ok: false, status: 400, error: 'Cannot send SMS to that phone number' };
        return { ok: false, status: 502, error: 'Failed to send verification code. Please try again.' };
    }

    return { ok: true, challengeId: row?.id || null };
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

    if (!phone || !/^\+1\d{10}$/.test(phone) || profile?.phone_verified !== true) {
        // Actionable, not a 500. The client routes the user to phone verification.
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
        return res.status(sent.status).json({ error: sent.error });
    }

    return res.status(200).json({
        success: true,
        method: 'sms',
        challengeId: sent.challengeId,
        phoneHint: maskPhone(phone),
        codeLength: 4,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        message: `We texted a 4-digit code to ${maskPhone(phone)}. Enter it to finish turning on two-factor.`,
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/setup] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
