/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — SEND OTP VERIFICATION CODE
   POST /api/sms/send-otp
   ═══════════════════════════════════════════════════════════════════════════ */

import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// In-memory OTP store (in production, use Redis or database)
// Format: { phoneNumber: { code: '123456', expires: timestamp } }
const otpStore = global.otpStore || (global.otpStore = new Map());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate environment variables
    if (!accountSid || !authToken || !twilioPhone) {
        console.error('Twilio credentials not configured');
        return res.status(500).json({ error: 'SMS service not configured' });
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

        // Store OTP with 10-minute expiration
        otpStore.set(cleanPhone, {
            code: otpCode,
            expires: Date.now() + 10 * 60 * 1000, // 10 minutes
            attempts: 0
        });

        // Initialize Twilio client
        const client = twilio(accountSid, authToken);

        // Send SMS
        const message = await client.messages.create({
            body: `Your Smarter.Poker verification code is: ${otpCode}. This code expires in 10 minutes.`,
            from: twilioPhone,
            to: cleanPhone
        });

        console.log('SMS sent:', message.sid);

        return res.status(200).json({
            success: true,
            message: 'Verification code sent',
            // In development, you might want to return the code for testing
            // code: process.env.NODE_ENV === 'development' ? otpCode : undefined
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
