/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — VERIFY OTP CODE
   POST /api/sms/verify-otp
   ═══════════════════════════════════════════════════════════════════════════ */

// Access the same OTP store
const otpStore = global.otpStore || (global.otpStore = new Map());

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
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

        // Get stored OTP
        const storedOtp = otpStore.get(cleanPhone);

        if (!storedOtp) {
            return res.status(400).json({
                error: 'No verification code found. Please request a new code.',
                expired: true
            });
        }

        // Check if expired
        if (Date.now() > storedOtp.expires) {
            otpStore.delete(cleanPhone);
            return res.status(400).json({
                error: 'Verification code has expired. Please request a new code.',
                expired: true
            });
        }

        // Check attempts (max 5)
        if (storedOtp.attempts >= 5) {
            otpStore.delete(cleanPhone);
            return res.status(429).json({
                error: 'Too many attempts. Please request a new code.',
                tooManyAttempts: true
            });
        }

        // Increment attempts
        storedOtp.attempts++;

        // Verify code
        if (storedOtp.code !== code.trim()) {
            const remainingAttempts = 5 - storedOtp.attempts;
            return res.status(400).json({
                error: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
                invalid: true,
                remainingAttempts
            });
        }

        // Success - delete the OTP
        otpStore.delete(cleanPhone);

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
