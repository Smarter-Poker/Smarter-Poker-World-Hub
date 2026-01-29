/* ═══════════════════════════════════════════════════════════════════════════
   2FA VERIFY API - Verify TOTP Code and Enable 2FA
   POST /api/auth/mfa/verify
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../../../../src/lib/supabase';
import speakeasy from 'speakeasy';
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { code } = req.body;

        if (!code || code.length !== 6) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

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

        // Get stored secret
        const { data: mfaData, error: mfaError } = await supabase
            .from('user_mfa_factors')
            .select('secret')
            .eq('user_id', user.id)
            .single();

        if (mfaError || !mfaData) {
            return res.status(404).json({ error: '2FA not set up. Call /api/auth/mfa/setup first.' });
        }

        // Verify the code
        const verified = speakeasy.totp.verify({
            secret: mfaData.secret,
            encoding: 'base32',
            token: code,
            window: 2 // Allow 2 time steps before/after for clock drift
        });

        if (!verified) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Generate backup codes (10 codes)
        const backupCodes = Array.from({ length: 10 }, () =>
            crypto.randomBytes(4).toString('hex').toUpperCase()
        );

        // Hash backup codes before storing (in production, use bcrypt)
        const hashedBackupCodes = backupCodes.map(code =>
            crypto.createHash('sha256').update(code).digest('hex')
        );

        // Enable 2FA
        const { error: updateError } = await supabase
            .from('user_mfa_factors')
            .update({
                enabled: true,
                verified_at: new Date().toISOString(),
                backup_codes: hashedBackupCodes
            })
            .eq('user_id', user.id);

        if (updateError) {
            console.error('Error enabling 2FA:', updateError);
            return res.status(500).json({ error: 'Failed to enable 2FA' });
        }

        // Return backup codes (only time they're shown unhashed)
        return res.status(200).json({
            success: true,
            backupCodes: backupCodes
        });

    } catch (error) {
        console.error('2FA verification error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
