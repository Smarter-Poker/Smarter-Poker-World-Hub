/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — VERIFY OTP CODE
   POST /api/sms/verify-otp
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase credentials not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const { phone, code } = req.body;

        // Validate inputs
        if (!phone || !code) {
            return res.status(400).json({ error: 'Phone number and code are required' });
        }

        // Clean and format phone number
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) {
            cleanPhone = '+1' + cleanPhone;
        } else if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+' + cleanPhone;
        }

        // Look up stored OTP from Supabase
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: storedOtp, error: fetchError } = await supabase
            .from('sms_otp_codes')
            .select('*')
            .eq('phone', cleanPhone)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (fetchError) {
            console.error('OTP fetch error:', fetchError);
            return res.status(500).json({ error: 'Failed to verify code' });
        }

        if (!storedOtp) {
            return res.status(400).json({
                error: 'No verification code found. Please request a new code.',
                expired: true
            });
        }

        // Check if expired
        if (new Date() > new Date(storedOtp.expires_at)) {
            await supabase
                .from('sms_otp_codes')
                .delete()
                .eq('id', storedOtp.id);

            return res.status(400).json({
                error: 'Verification code has expired. Please request a new code.',
                expired: true
            });
        }

        // Check attempts (max 5)
        if (storedOtp.attempts >= 5) {
            await supabase
                .from('sms_otp_codes')
                .delete()
                .eq('id', storedOtp.id);

            return res.status(429).json({
                error: 'Too many attempts. Please request a new code.',
                tooManyAttempts: true
            });
        }

        // Increment attempts
        await supabase
            .from('sms_otp_codes')
            .update({ attempts: storedOtp.attempts + 1 })
            .eq('id', storedOtp.id);

        // Verify code
        if (storedOtp.code !== code.trim()) {
            const remainingAttempts = 5 - (storedOtp.attempts + 1);
            return res.status(400).json({
                error: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
                invalid: true,
                remainingAttempts
            });
        }

        // Success — delete the OTP
        await supabase
            .from('sms_otp_codes')
            .delete()
            .eq('id', storedOtp.id);

        return res.status(200).json({
            success: true,
            message: 'Phone number verified successfully',
            verified: true
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        return res.status(500).json({
            error: 'Failed to verify code',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
