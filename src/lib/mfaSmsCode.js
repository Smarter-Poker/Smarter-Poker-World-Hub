/* ═══════════════════════════════════════════════════════════════════════════
   SHARED SMS SECOND-FACTOR CODE CHECK  ·  src/lib/mfaSmsCode.js

   SMS FACTOR (Phase 6.1.27) — Aug 2026
   ─────────────────────────────────────────────────────────────────────────
   One implementation of "is this 4-digit text code valid for this phone",
   imported by every route that has to ask:

     • pages/api/auth/mfa/verify.js     — finishing enrolment
     • pages/api/auth/mfa/challenge.js  — step 2 of sign-in
     • pages/api/auth/mfa/disable.js    — proving you still hold the handset

   It was duplicated three ways before this file existed. Three copies of an
   attempt counter is three chances for one of them to drift into a free
   guess, so it lives here once.

   Rules are identical to pages/api/sms/verify-otp.js, deliberately: newest
   row for the phone, 10-minute expiry, 5 attempts max, attempts incremented
   BEFORE the comparison (a crash mid-check must never hand out a free try),
   row deleted on success.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_ATTEMPTS = 5;

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

/**
 * Check a 4-digit SMS code against the shared `sms_otp_codes` store.
 *
 * @param  supabase     service-role client
 * @param  phone        E.164, already normalised
 * @param  rawCode      whatever the user typed
 * @param  challengeId  optional uuid of the specific row issued to this flow
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
        console.warn('[mfaSmsCode] OTP fetch error:', fetchError.message);
        return { ok: false, status: 500, error: 'Failed to verify code' };
    }
    if (!stored) {
        return { ok: false, status: 400, error: 'No verification code found. Please request a new code.', expired: true };
    }
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

export default { MAX_ATTEMPTS, normalizePhone, maskPhone, isSendablePhone, checkSmsCode, resolveFactorPhone };
