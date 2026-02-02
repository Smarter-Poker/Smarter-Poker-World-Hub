/* ═══════════════════════════════════════════════════════════════════════════
   SESSION LIST API - List Active Sessions
   GET /api/auth/sessions/list
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../../../../src/lib/supabase';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
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

        // Get all sessions for this user
        const { data: sessions, error: sessionsError } = await supabase
            .from('user_sessions')
            .select('*')
            .eq('user_id', user.id)
            .order('last_active', { ascending: false });

        if (sessionsError) {
            console.error('Error fetching sessions:', sessionsError);
            return res.status(500).json({ error: 'Failed to fetch sessions' });
        }

        return res.status(200).json({
            sessions: sessions || []
        });

    } catch (error) {
        console.error('Session list error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
