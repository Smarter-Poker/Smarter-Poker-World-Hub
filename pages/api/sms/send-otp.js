/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — SEND OTP VERIFICATION CODE
   POST /api/sms/send-otp
   ═══════════════════════════════════════════════════════════════════════════ */

import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate environment variables
    if (!accountSid || !authToken || !twilioPhone) {
        console.error('Twilio credentials not configured');
        return res.status(500).json({ error: 'SMS service not configured' });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase credentials not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const { phone } = req.body;

        // Validate phone number
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Clean and format phone number (ensure +1 prefix for US numbers)
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) {
            cleanPhone = '+1' + cleanPhone;
        } else if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+' + cleanPhone;
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP in Supabase (persistent across serverless invocations)
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Delete any existing OTP for this phone number first
        await supabase
            .from('sms_otp_codes')
            .delete()
            .eq('phone', cleanPhone);

        // Insert new OTP with 10-minute expiration
        const { error: insertError } = await supabase
            .from('sms_otp_codes')
            .insert({
                phone: cleanPhone,
                code: otpCode,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                attempts: 0,
            });

        if (insertError) {
            console.error('OTP store error:', insertError);
            return res.status(500).json({ error: 'Failed to store verification code' });
        }

        // Initialize Twilio client and send SMS
        const client = twilio(accountSid, authToken);

        const message = await client.messages.create({
            body: `Your Smarter.Poker verification code is: ${otpCode}. This code expires in 10 minutes.`,
            from: twilioPhone,
            to: cleanPhone
        });

        console.log('SMS sent:', message.sid);

        return res.status(200).json({
            success: true,
            message: 'Verification code sent',
        });

    } catch (error) {
        console.error('Twilio SMS error:', error);

        // Handle specific Twilio errors
        if (error.code === 21211) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }
        if (error.code === 21614) {
            return res.status(400).json({ error: 'Phone number is not a valid mobile number' });
        }
        if (error.code === 21608) {
            return res.status(400).json({ error: 'Cannot send SMS to this phone number' });
        }

        return res.status(500).json({
            error: 'Failed to send verification code',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
