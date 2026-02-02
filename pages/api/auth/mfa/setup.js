/* ═══════════════════════════════════════════════════════════════════════════
   2FA SETUP API - Generate TOTP Secret and QR Code
   POST /api/auth/mfa/setup
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../../../../src/lib/supabase';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get authenticated user from session
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Generate TOTP secret
        const secret = speakeasy.generateSecret({
            name: `Smarter.Poker (${user.email})`,
            issuer: 'Smarter.Poker',
            length: 32
        });

        // Generate QR code as data URL
        const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

        // Store unverified secret in database
        const { error: dbError } = await supabase
            .from('user_mfa_factors')
            .upsert({
                user_id: user.id,
                secret: secret.base32,
                enabled: false,
                created_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (dbError) {
            console.error('Error storing MFA secret:', dbError);
            return res.status(500).json({ error: 'Failed to setup 2FA' });
        }

        // Return QR code and manual entry key
        return res.status(200).json({
            qrCode: qrCodeDataURL,
            secret: secret.base32,
            manualEntryKey: secret.base32.match(/.{1,4}/g).join('-') // Format as XXXX-XXXX-XXXX-XXXX
        });

    } catch (error) {
        console.error('2FA setup error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
