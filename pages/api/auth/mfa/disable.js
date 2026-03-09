/* ═══════════════════════════════════════════════════════════════════════════
   2FA DISABLE API - Disable Two-Factor Authentication
   POST /api/auth/mfa/disable
   Body: { code } — Must provide a valid current TOTP code to disable 2FA
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import speakeasy from 'speakeasy';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

        // SECURITY: Require current TOTP code OR a valid backup code to disable 2FA.
        // Without this, a stolen session token can silently disable 2FA.
        const { code } = req.body;
        if (!code || (code.length !== 6 && code.length !== 8)) {
            return res.status(400).json({ error: 'Current 2FA code or backup code required to disable 2FA' });
        }

        // Get stored MFA secret
        const { data: mfaData, error: mfaError } = await supabase
            .from('user_mfa_factors')
            .select('secret, enabled, backup_codes')
            .eq('user_id', user.id)
            .maybeSingle();

        if (mfaError || !mfaData || !mfaData.enabled) {
            return res.status(404).json({ error: '2FA is not enabled on this account' });
        }

        let verified = false;

        // Try TOTP code first (6 digits)
        if (code.length === 6) {
            verified = speakeasy.totp.verify({
                secret: mfaData.secret,
                encoding: 'base32',
                token: code,
                window: 2
            });
        }

        // Try backup code (8 hex chars)
        if (!verified && code.length === 8 && mfaData.backup_codes?.length > 0) {
            const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
            const backupIndex = mfaData.backup_codes.indexOf(codeHash);
            if (backupIndex !== -1) {
                verified = true;
                // Consume the backup code
                const updatedCodes = [...mfaData.backup_codes];
                updatedCodes.splice(backupIndex, 1);
                await supabase
                    .from('user_mfa_factors')
                    .update({ backup_codes: updatedCodes })
                    .eq('user_id', user.id);
            }
        }

        if (!verified) {
            return res.status(400).json({ error: 'Invalid 2FA code. Please enter your current authenticator code or a backup code.' });
        }

        // Code verified — disable 2FA
        const { error: updateError } = await supabase
            .from('user_mfa_factors')
            .update({
                enabled: false,
                disabled_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);

        if (updateError) {
            console.error('Error disabling 2FA:', updateError);
            return res.status(500).json({ error: 'Failed to disable 2FA' });
        }

        return res.status(200).json({
            success: true,
            message: '2FA has been disabled'
        });

    } catch (error) {
        console.error('2FA disable error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
