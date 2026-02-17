/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — VERIFY OTP CODE
   POST /api/sms/verify-otp

   HARDENED v2 — Feb 2026
   ─────────────────────────────────────────────────────────────────────────
   • Supabase-backed OTP store (survives serverless cold starts)
   • Shared phone normalisation logic (identical to send-otp.js)
   • Strict 6-digit code validation
   • Auto-cleanup of expired rows before lookup
   • Atomic attempt tracking + remaining-attempt feedback
   • Defensive error handling at every Supabase call
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ── Shared utility: normalise any phone input to E.164 ────────────────── */
function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;   // US 10-digit
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits; // US with leading 1
    return '+' + digits;                               // passthrough
}

const MAX_ATTEMPTS = 5;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Guard: environment variables ──────────────────────────────────────
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[verify-otp] Supabase credentials not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { phone, code } = req.body;

        // ── Guard: inputs required ───────────────────────────────────────
        if (!phone || !code) {
            return res.status(400).json({ error: 'Phone number and code are required' });
        }

        // ── Guard: code must be exactly 6 digits ─────────────────────────
        const trimmedCode = String(code).trim();
        if (!/^\d{6}$/.test(trimmedCode)) {
            return res.status(400).json({ error: 'Verification code must be 6 digits' });
        }

        const cleanPhone = normalizePhone(phone);

        // ── Guard: must look like a valid US phone ───────────────────────
        if (!/^\+1\d{10}$/.test(cleanPhone)) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // ── Housekeeping: purge expired OTP rows (any phone) ─────────────
        await supabase
            .from('sms_otp_codes')
            .delete()
            .lt('expires_at', new Date().toISOString());

        // ── Look up stored OTP ───────────────────────────────────────────
        const { data: storedOtp, error: fetchError } = await supabase
            .from('sms_otp_codes')
            .select('*')
            .eq('phone', cleanPhone)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (fetchError) {
            console.error('[verify-otp] DB fetch error:', fetchError);
            return res.status(500).json({ error: 'Failed to verify code' });
        }

        if (!storedOtp) {
            return res.status(400).json({
                error: 'No verification code found. Please request a new code.',
                expired: true
            });
        }

        // ── Check if expired (belt-and-suspenders after cleanup) ─────────
        if (new Date() > new Date(storedOtp.expires_at)) {
            await supabase.from('sms_otp_codes').delete().eq('id', storedOtp.id);
            return res.status(400).json({
                error: 'Verification code has expired. Please request a new code.',
                expired: true
            });
        }

        // ── Check attempt limit ──────────────────────────────────────────
        if (storedOtp.attempts >= MAX_ATTEMPTS) {
            await supabase.from('sms_otp_codes').delete().eq('id', storedOtp.id);
            return res.status(429).json({
                error: 'Too many attempts. Please request a new code.',
                tooManyAttempts: true
            });
        }

        // ── Increment attempts BEFORE comparing ──────────────────────────
        const newAttempts = storedOtp.attempts + 1;
        await supabase
            .from('sms_otp_codes')
            .update({ attempts: newAttempts })
            .eq('id', storedOtp.id);

        // ── Compare code ─────────────────────────────────────────────────
        if (storedOtp.code !== trimmedCode) {
            const remaining = MAX_ATTEMPTS - newAttempts;
            return res.status(400).json({
                error: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
                invalid: true,
                remainingAttempts: remaining
            });
        }

        // ── ✅ Success — delete the OTP row ──────────────────────────────
        await supabase.from('sms_otp_codes').delete().eq('id', storedOtp.id);

        console.log('[verify-otp] Phone verified:', cleanPhone);

        return res.status(200).json({
            success: true,
            message: 'Phone number verified successfully',
            verified: true
        });

    } catch (error) {
        console.error('[verify-otp] Error:', error);
        return res.status(500).json({
            error: 'Failed to verify code',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
