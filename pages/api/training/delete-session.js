/**
 * POST /api/training/delete-session
 * Deletes a specific training session record by ID.
 * Used by nodelocking profile management.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId required' });
    }

    try {
        // Only allow deletion of records owned by the authenticated user
        const { error: delErr } = await supabase
            .from('training_sessions')
            .delete()
            .eq('id', sessionId)
            .eq('user_id', user.id);

        if (delErr) {
            console.warn('[DeleteSession] Delete failed:', delErr.message);
            return res.status(400).json({ success: false, error: delErr.message });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[DeleteSession] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
