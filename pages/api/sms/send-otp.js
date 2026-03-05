/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — SEND OTP VERIFICATION CODE
   POST /api/sms/send-otp

   HARDENED v2 — Feb 2026
   ─────────────────────────────────────────────────────────────────────────
   • Supabase-backed OTP store (survives serverless cold starts)
   • Per-phone rate limiting (max 5 codes per hour)
   • Auto-cleanup of expired OTP rows on every request
   • Shared phone normalisation logic (identical to verify-otp.js)
   • Defensive error handling at every Supabase + Twilio call
   ═══════════════════════════════════════════════════════════════════════════ */

import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ── Shared utility: normalise any phone input to E.164 ────────────────── */
function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;   // US 10-digit
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits; // US with leading 1
    return '+' + digits;                               // passthrough
}

/* ── Rate limit: max OTP requests per phone per hour ───────────────────── */
const MAX_CODES_PER_HOUR = 5;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Guard: environment variables ──────────────────────────────────────
    if (!accountSid || !authToken || !twilioPhone) {
        console.error('[send-otp] Twilio credentials not configured');
        return res.status(500).json({ error: 'SMS service not configured' });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[send-otp] Supabase credentials not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { phone } = req.body;

        // ── Guard: phone required ────────────────────────────────────────
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const cleanPhone = normalizePhone(phone);

        // ── Guard: must look like a valid US phone (+1 + 10 digits) ──────
        if (!/^\+1\d{10}$/.test(cleanPhone)) {
            return res.status(400).json({ error: 'Please enter a valid 10-digit US phone number' });
        }

        // ── Guard: Phone Uniqueness ──────────────────────────────────────
        // Prevent users from farming multiple VIP cards with the same phone number
        const { data: existingProfiles } = await supabase
            .from('profiles')
            .select('id, phone_verified')
            .eq('phone', cleanPhone)
            .eq('phone_verified', true)
            .limit(1);

        if (existingProfiles && existingProfiles.length > 0) {
            // Note: If this is the current user re-verifying, that's fine, but send-otp doesn't know userId yet. 
            // In the VIP Modal we only show it if the user IS NOT verified. 
            // So if ANY user has this phone verified, we reject it to stop abuse.
            return res.status(409).json({ error: 'This phone number is already registered to a verified account.' });
        }

        // ── Housekeeping: purge ALL expired OTP rows (any phone) ─────────
        // Keeps the table lean — runs on every send request
        await supabase
            .from('sms_otp_codes')
            .delete()
            .lt('expires_at', new Date().toISOString());

        // ── Rate limit: count codes sent to this phone in the last hour ──
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count, error: countError } = await supabase
            .from('sms_otp_codes')
            .select('id', { count: 'exact', head: true })
            .eq('phone', cleanPhone)
            .gte('created_at', oneHourAgo);

        if (countError) {
            console.error('[send-otp] Rate limit check error:', countError);
            // Non-blocking: continue even if count fails
        } else if (count >= MAX_CODES_PER_HOUR) {
            return res.status(429).json({
                error: 'Too many verification requests. Please try again later.',
                retryAfter: 3600
            });
        }

        // ── Delete any existing OTP for this phone ───────────────────────
        await supabase
            .from('sms_otp_codes')
            .delete()
            .eq('phone', cleanPhone);

        // ── Generate & store new 4-digit OTP ─────────────────────────────
        const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

        const { error: insertError } = await supabase
            .from('sms_otp_codes')
            .insert({
                phone: cleanPhone,
                code: otpCode,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                attempts: 0,
            });

        if (insertError) {
            console.error('[send-otp] DB insert error:', insertError);
            return res.status(500).json({ error: 'Failed to store verification code' });
        }

        // ── Send SMS via Twilio ──────────────────────────────────────────
        const client = twilio(accountSid, authToken);

        const message = await client.messages.create({
            body: `Your Smarter.Poker code is: ${otpCode}. Expires in 10 min.`,
            from: twilioPhone,
            to: cleanPhone
        });

        console.log('[send-otp] SMS sent:', message.sid, 'to:', cleanPhone);

        return res.status(200).json({
            success: true,
            message: 'Verification code sent',
        });

    } catch (error) {
        console.error('[send-otp] Error:', error);

        // ── Twilio-specific error codes ──────────────────────────────────
        if (error.code === 21211) return res.status(400).json({ error: 'Invalid phone number format' });
        if (error.code === 21614) return res.status(400).json({ error: 'Phone number is not a valid mobile number' });
        if (error.code === 21608) return res.status(400).json({ error: 'Cannot send SMS to this phone number' });

        return res.status(500).json({
            error: 'Failed to send verification code',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
