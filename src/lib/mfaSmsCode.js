/* ═══════════════════════════════════════════════════════════════════════════
   SHARED SMS SECOND-FACTOR PIPELINE  ·  src/lib/mfaSmsCode.js

   SMS FACTOR (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   Everything the MFA routes need to send and check a text code, in one place:

     • pages/api/auth/mfa/setup.js      — first code, during enrolment
     • pages/api/auth/mfa/send-code.js  — every code after that
     • pages/api/auth/mfa/verify.js     — finishing enrolment
     • pages/api/auth/mfa/challenge.js  — step 2 of sign-in
     • pages/api/auth/mfa/disable.js    — proving you still hold the handset

   It was duplicated up to five ways before this file existed. Five copies of
   an attempt counter is five chances for one to drift into a free guess.

   ═══ WHY MFA CODES ARE NAMESPACED ══════════════════════════════════════
   MFA reuses the existing `sms_otp_codes` table, which is also driven by
   pages/api/sms/send-otp.js and verify-otp.js — and verify-otp is
   UNAUTHENTICATED by design, because signup verifies a phone before there is
   any session. That endpoint selects the NEWEST row for a phone, increments
   `attempts`, and DELETES the row once attempts hit the cap.

   Keyed on `phone` alone, that is a remote lockout of anybody whose number
   you know: post five wrong codes to /api/sms/verify-otp and you burn, then
   delete, whatever the newest row for that number is — including the
   victim's in-flight MFA challenge. Their correct code then answers "too
   many attempts". Repeat on every resend and they are permanently locked out
   of sign-in, cash-out approval and account deletion. Five requests is well
   under any rate limit.

   The table has no column to separate the two purposes and adding one needs
   a migration we cannot run from here. So MFA rows are stored under a
   NAMESPACED key — `mfa:+15551234567` — in the same `phone` column. Same
   table, no schema change, but MFA rows are invisible to every query in
   pages/api/sms/*, which all match on the bare E.164 number. Rate-limit
   counts, attempt counters and newest-row selection are now fully separate.

   Twilio is always given the REAL number; the namespace is a storage key
   only. And because we cannot verify from here that `phone` has no CHECK
   constraint, the namespaced insert FALLS BACK to the bare number if the
   database rejects it — degrading to the old (working, if lockout-prone)
   behaviour rather than breaking enrolment outright. Reads try the
   namespaced key first, then the bare number, so both shapes verify.

   Everything else matches pages/api/sms/verify-otp.js deliberately: newest
   row, 10-minute expiry, 5 attempts max, attempts incremented BEFORE the
   comparison (a crash mid-check must never hand out a free try), row deleted
   on success, 5 codes per hour per number.
   ═══════════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import twilio from 'twilio';

export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const MFA_KEY_PREFIX = 'mfa:';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

export function twilioConfigured() {
    return !!(accountSid && authToken && twilioPhone);
}

/** Normalise any phone input to E.164. Identical to send-otp.js. */
export function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
    return '+' + digits;
}

/** `+15551234567` → `••• ••• 4567`. Never render a full number back. */
export function maskPhone(e164) {
    const s = String(e164 || '');
    return s.length < 4 ? '••••' : '••• ••• ' + s.slice(-4);
}

/** A US mobile we are willing to text. */
export function isSendablePhone(e164) {
    return /^\+1\d{10}$/.test(String(e164 || ''));
}

/** Storage key that hides MFA rows from every pages/api/sms/* query. */
export function mfaPhoneKey(e164) {
    return MFA_KEY_PREFIX + String(e164 || '');
}

/**
 * Send an MFA code through the shared sms_otp_codes pipeline.
 * @returns {ok:true, challengeId, phoneHint} | {ok:false, status, error, ...hints}
 */
export async function sendMfaCode(supabase, phone) {
    if (!twilioConfigured()) {
        console.warn('[mfaSmsCode] Twilio credentials not configured');
        return {
            ok: false,
            status: 503,
            error: 'Text messaging is temporarily unavailable. Use a backup code to continue.',
            useBackupCode: true,
        };
    }

    const key = mfaPhoneKey(phone);

    // Housekeeping — purge expired rows. Safe to leave unscoped: it only ever
    // removes rows that can no longer be verified by anyone.
    const { error: purgeErr } = await supabase
        .from('sms_otp_codes')
        .delete()
        .lt('expires_at', new Date().toISOString());
    if (purgeErr) console.warn('[mfaSmsCode] OTP purge failed:', purgeErr.message);

    // Rate limit, counted on the MFA namespace ONLY — otherwise anyone could
    // exhaust a victim's MFA quota by spamming the public signup OTP endpoint.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
        .from('sms_otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('phone', key)
        .gte('created_at', oneHourAgo);

    if (countError) {
        console.warn('[mfaSmsCode] Rate limit check error:', countError.message);
    } else if (count >= MAX_CODES_PER_HOUR) {
        return {
            ok: false,
            status: 429,
            error: 'Too many codes requested. Try again in an hour, or use a backup code.',
            useBackupCode: true,
        };
    }

    const otpCode = crypto.randomInt(1000, 10000).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    // Namespaced insert, falling back to the bare number if the column
    // refuses the prefix. A CHECK constraint we cannot see from here must
    // degrade MFA to the old behaviour, not disable it.
    let row = null;
    let usedKey = key;
    let { data, error: insertError } = await supabase
        .from('sms_otp_codes')
        .insert({ phone: key, code: otpCode, expires_at: expiresAt, attempts: 0 })
        .select('id')
        .maybeSingle();

    if (insertError) {
        console.warn('[mfaSmsCode] Namespaced OTP insert failed, falling back to bare number:', insertError.message);
        usedKey = phone;
        ({ data, error: insertError } = await supabase
            .from('sms_otp_codes')
            .insert({ phone, code: otpCode, expires_at: expiresAt, attempts: 0 })
            .select('id')
            .maybeSingle());
        if (insertError) {
            console.warn('[mfaSmsCode] OTP insert error:', insertError.message);
            return { ok: false, status: 500, error: 'Failed to store verification code' };
        }
    }
    row = data;

    try {
        await getTwilioClient().messages.create({
            body: `Your Smarter.Poker code is: ${otpCode}. Expires in 10 min.`,
            from: twilioPhone,
            to: phone,                      // always the REAL number
        });
    } catch (err) {
        // Do not leave an unusable code behind if the carrier refused it.
        if (row?.id) {
            const { error: delErr } = await supabase.from('sms_otp_codes').delete().eq('id', row.id);
            if (delErr) console.warn('[mfaSmsCode] Failed to clean up unsent OTP:', delErr.message);
        }
        console.warn('[mfaSmsCode] Twilio send error:', err?.message || err);
        if (err?.code === 21211) return { ok: false, status: 400, error: 'Invalid phone number format', useBackupCode: true };
        if (err?.code === 21614) return { ok: false, status: 400, error: 'That number is not a valid mobile number', useBackupCode: true };
        if (err?.code === 21608) return { ok: false, status: 400, error: 'Cannot send SMS to that phone number', useBackupCode: true };
        return { ok: false, status: 502, error: 'Failed to send your code. Try again, or use a backup code.', useBackupCode: true };
    }

    return {
        ok: true,
        challengeId: row?.id || null,
        phoneHint: maskPhone(phone),
        codeLength: 4,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        storageKey: usedKey,
    };
}

/** One pass of the check against a single storage key. */
async function checkAgainstKey(supabase, key, code, challengeId) {
    let query = supabase.from('sms_otp_codes').select('*').eq('phone', key);
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
        console.warn('[mfaSmsCode] OTP fetch error:', fetchError.message);
        return { ok: false, status: 500, error: 'Failed to verify code' };
    }
    if (!stored) return { ok: false, notFound: true };

    if (new Date() > new Date(stored.expires_at)) {
        const { error: e } = await supabase.from('sms_otp_codes').delete().eq('id', stored.id);
        if (e) console.warn('[mfaSmsCode] Expired-row cleanup failed:', e.message);
        return { ok: false, status: 400, error: 'That code has expired. Please request a new one.', expired: true };
    }
    if (stored.attempts >= MAX_ATTEMPTS) {
        const { error: e } = await supabase.from('sms_otp_codes').delete().eq('id', stored.id);
        if (e) console.warn('[mfaSmsCode] Attempt-cap cleanup failed:', e.message);
        return { ok: false, status: 429, error: 'Too many attempts. Please request a new code.', tooManyAttempts: true };
    }

    // Increment BEFORE comparing so a crash can never hand out a free guess.
    const newAttempts = stored.attempts + 1;
    const { error: bumpErr } = await supabase
        .from('sms_otp_codes')
        .update({ attempts: newAttempts })
        .eq('id', stored.id);
    if (bumpErr) console.warn('[mfaSmsCode] Attempt increment failed:', bumpErr.message);

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
    if (delErr) console.warn('[mfaSmsCode] Consumed-code cleanup failed:', delErr.message);

    return { ok: true };
}

/**
 * Check a 4-digit MFA code. Tries the namespaced key first, then the bare
 * number, so codes written by the insert fallback still verify.
 *
 * @returns {ok:true} | {ok:false, status, error, ...hints}
 */
export async function checkSmsCode(supabase, phone, rawCode, challengeId) {
    const code = String(rawCode || '').trim();
    if (!/^\d{4}$/.test(code)) {
        return { ok: false, status: 400, error: 'Verification code must be 4 digits' };
    }

    const { error: purgeErr } = await supabase
        .from('sms_otp_codes')
        .delete()
        .lt('expires_at', new Date().toISOString());
    if (purgeErr) console.warn('[mfaSmsCode] OTP purge failed:', purgeErr.message);

    const primary = await checkAgainstKey(supabase, mfaPhoneKey(phone), code, challengeId);
    if (!primary.notFound) return primary;

    const fallback = await checkAgainstKey(supabase, phone, code, challengeId);
    if (!fallback.notFound) return fallback;

    return {
        ok: false,
        status: 400,
        error: 'No verification code found. Please request a new code.',
        expired: true,
    };
}

/**
 * Resolve the phone that backs a user's SMS factor.
 * @returns {ok:true, phone} | {ok:false, status, error, ...hints}
 */
export async function resolveFactorPhone(supabase, userId) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('phone, phone_verified')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.warn('[mfaSmsCode] Profile lookup failed:', error.message);
        return { ok: false, status: 503, error: 'Unable to verify right now. Please try again.' };
    }

    const phone = profile?.phone ? normalizePhone(profile.phone) : null;
    if (!phone || !isSendablePhone(phone) || profile?.phone_verified !== true) {
        return {
            ok: false,
            status: 409,
            error: 'The mobile number on this account is no longer verified. Use one of your backup codes instead.',
            code: 'PHONE_NOT_VERIFIED',
            useBackupCode: true,
        };
    }

    return { ok: true, phone };
}

export default {
    MAX_ATTEMPTS,
    MAX_CODES_PER_HOUR,
    OTP_TTL_MS,
    MFA_KEY_PREFIX,
    twilioConfigured,
    normalizePhone,
    maskPhone,
    isSendablePhone,
    mfaPhoneKey,
    sendMfaCode,
    checkSmsCode,
    resolveFactorPhone,
};
