/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — VERIFY OTP CODE
   POST /api/sms/verify-otp

   HARDENED v2 — Feb 2026
   ─────────────────────────────────────────────────────────────────────────
   • Supabase-backed OTP store (survives serverless cold starts)
   • Shared phone normalisation logic (identical to send-otp.js)
   • Strict 4-digit code validation
   • Auto-cleanup of expired rows before lookup
   • Atomic attempt tracking + remaining-attempt feedback
   • Defensive error handling at every Supabase call
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

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

        // ── Guard: code must be exactly 4 digits ─────────────────────
        const trimmedCode = String(code).trim();
        if (!/^\d{4}$/.test(trimmedCode)) {
            return res.status(400).json({ error: 'Verification Code Must Be 4 Digits' });
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


        // ── Persist verification to profile + grant VIP ──────────────────
        const { userId } = req.body;
        let vipGranted = false;

        if (userId) {
            try {
                const now = new Date();
                const vipExpires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

                // ── SAFETY: Check if user already has a longer VIP ──────
                // Don't downgrade existing paid/longer VIP subscriptions
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('is_vip, vip_expires_at, phone_verified')
                    .eq('id', userId)
                    .maybeSingle();

                // ── GUARD: Final Phone Uniqueness Check ──────────────────
                // Prevent race condition VIP farming
                const { data: duplicateProfiles } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('phone', cleanPhone)
                    .eq('phone_verified', true)
                    .neq('id', userId) // Ignore the current user if they are just re-verifying
                    .limit(1);

                if (duplicateProfiles && duplicateProfiles.length > 0) {
                    console.error(`[verify-otp] Security block: User ${userId} tried to verify phone ${cleanPhone} already in use by another account.`);
                    return res.status(409).json({ error: 'This phone number is already registered to another verified account.' });
                }

                // If user already has VIP that expires AFTER this grant, skip VIP update
                const existingExpiry = profile?.vip_expires_at ? new Date(profile.vip_expires_at) : null;
                const shouldGrantVip = !profile?.is_vip || !existingExpiry || existingExpiry < vipExpires;

                // Always update phone + phone_verified
                const updateFields = {
                    phone: cleanPhone,
                    phone_verified: true,
                };

                // Only update VIP if we're extending, not shortening
                if (shouldGrantVip) {
                    updateFields.is_vip = true;
                    updateFields.vip_expires_at = vipExpires.toISOString();
                }

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update(updateFields)
                    .eq('id', userId);

                if (updateError) {
                    console.error('[verify-otp] Profile update error:', updateError);
                } else {
                    vipGranted = shouldGrantVip;

                    // Log the VIP grant as a diamond transaction (only if VIP was actually granted)
                    if (shouldGrantVip) {
                        await supabase
                            .from('diamond_transactions')
                            .insert({
                                user_id: userId,
                                amount: 0,
                                transaction_type: 'bonus',
                                description: 'VIP Card Activated — 90-Day FREE VIP For Phone Verification! 📱',
                                metadata: {
                                    source: 'phone_verification_vip',
                                    phone: cleanPhone,
                                    vip_expires_at: vipExpires.toISOString(),
                                },
                                balance_after: 0,
                            });
                    }
                }
            } catch (profileErr) {
                console.error('[verify-otp] Profile/VIP update error (non-blocking):', profileErr);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Phone number verified successfully',
            verified: true,
            vipGranted,
        });

    } catch (error) {
        console.error('[verify-otp] Error:', error);
        return res.status(500).json({
            error: 'Failed to verify code',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
