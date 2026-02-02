/* ═══════════════════════════════════════════════════════════════════════════
   2FA DISABLE API - Disable Two-Factor Authentication
   POST /api/auth/mfa/disable
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../../../../src/lib/supabase';

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

        // Disable 2FA by setting enabled to false
        const { error: updateError } = await supabase
            .from('user_mfa_factors')
            .update({
                enabled: false
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
