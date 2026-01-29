/* ═══════════════════════════════════════════════════════════════════════════
   SESSION REVOKE API - Revoke a Specific Session
   POST /api/auth/sessions/revoke
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../../../../src/lib/supabase';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required' });
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

        // Delete the session (RLS ensures user can only delete their own)
        const { error: deleteError } = await supabase
            .from('user_sessions')
            .delete()
            .eq('id', sessionId)
            .eq('user_id', user.id); // Double-check ownership

        if (deleteError) {
            console.error('Error revoking session:', deleteError);
            return res.status(500).json({ error: 'Failed to revoke session' });
        }

        return res.status(200).json({
            success: true,
            message: 'Session revoked successfully'
        });

    } catch (error) {
        console.error('Session revoke error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
