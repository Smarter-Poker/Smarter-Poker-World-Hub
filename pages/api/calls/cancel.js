// API to cancel/delete a pending call
// DELETE /api/calls/cancel

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'DELETE' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { callId, callerId, calleeId } = req.body;

    try {
        let query = supabase.from('pending_calls').delete();

        if (callId) {
            query = query.eq('id', callId);
        } else if (callerId && calleeId) {
            query = query.eq('caller_id', callerId).eq('callee_id', calleeId);
        } else {
            return res.status(400).json({ error: 'Missing callId or callerId+calleeId' });
        }

        const { error } = await query;

        if (error) {
            console.error('[calls/cancel] Error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true });
    } catch (e) {
        console.error('[calls/cancel] Exception:', e);
        return res.status(500).json({ error: e.message });
    }
}
