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
   because that route also has to stage the factor row. Both share the same
   Twilio pipeline, the same `sms_otp_codes` table, the same 4-digit
   crypto-strong code, the same 10-minute expiry and the same
   5-codes-per-hour-per-phone cap as pages/api/sms/send-otp.js. There is no
   second OTP store.

   IDENTITY comes from the `Authorization: Bearer <jwt>` header only. Step 1
   (password) must already have issued a Supabase session — this endpoint
   cannot be used to text a stranger.

   NOT ENROLLED is a 400 with `code: 'MFA_NOT_ENABLED'`, never a 500, so the
   client can send the user straight on rather than stranding them on a code
   screen that will never receive a code.
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

/* ── Identical normalisation to send-otp.js / verify-otp.js / setup.js ─── */
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
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('phone, phone_verified')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.warn('[mfa/send-code] Profile lookup failed:', profileError.message);
        return res.status(503).json({ error: 'Unable to send a code right now. Please try again.' });
    }

    const phone = profile?.phone ? normalizePhone(profile.phone) : null;
    if (!phone || !/^\+1\d{10}$/.test(phone) || profile?.phone_verified !== true) {
        // The handset that backs the factor is gone. Backup codes are the
        // documented recovery path — say so instead of silently failing.
        return res.status(409).json({
            error: 'The mobile number on this account is no longer verified. Use one of your backup codes to sign in, then re-verify your phone.',
            code: 'PHONE_NOT_VERIFIED',
            useBackupCode: true,
        });
    }

    if (!accountSid || !authToken || !twilioPhone) {
        console.warn('[mfa/send-code] Twilio credentials not configured');
        return res.status(503).json({
            error: 'Text messaging is temporarily unavailable. Use a backup code to continue.',
            useBackupCode: true,
        });
    }

    // ── Housekeeping — purge expired rows (same as send-otp.js). ────────
    const { error: purgeErr } = await supabase
        .from('sms_otp_codes')
        .delete()
        .lt('expires_at', new Date().toISOString());
    if (purgeErr) console.warn('[mfa/send-code] OTP purge failed:', purgeErr.message);

    // ── Rate limit — max codes per phone per hour. ──────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
        .from('sms_otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .gte('created_at', oneHourAgo);

    if (countError) {
        console.warn('[mfa/send-code] Rate limit check error:', countError.message);
    } else if (count >= MAX_CODES_PER_HOUR) {
        return res.status(429).json({
            error: 'Too many codes requested. Try again in an hour, or use a backup code.',
            useBackupCode: true,
        });
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
        console.warn('[mfa/send-code] OTP insert error:', insertError.message);
        return res.status(500).json({ error: 'Failed to store verification code' });
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
            if (delErr) console.warn('[mfa/send-code] Failed to clean up unsent OTP:', delErr.message);
        }
        console.warn('[mfa/send-code] Twilio send error:', err?.message || err);
        if (err?.code === 21211) return res.status(400).json({ error: 'Invalid phone number format', useBackupCode: true });
        if (err?.code === 21614) return res.status(400).json({ error: 'That number is not a valid mobile number', useBackupCode: true });
        if (err?.code === 21608) return res.status(400).json({ error: 'Cannot send SMS to that phone number', useBackupCode: true });
        return res.status(502).json({ error: 'Failed to send your code. Try again, or use a backup code.', useBackupCode: true });
    }

    return res.status(200).json({
        success: true,
        method: 'sms',
        challengeId: row?.id || null,
        phoneHint: maskPhone(phone),
        codeLength: 4,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        message: `We texted a 4-digit code to ${maskPhone(phone)}.`,
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    console.warn('[mfa/send-code] Error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
