// API to create a pending call (for offline users)
// POST /api/calls/create

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { callerId, calleeId, callerName, callerAvatar, callType, roomName } = req.body;

    if (!callerId || !calleeId || !callerName || !callType || !roomName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Delete any existing pending calls from this caller to this callee
        await supabase
            .from('pending_calls')
            .delete()
            .eq('caller_id', callerId)
            .eq('callee_id', calleeId);

        // Create new pending call
        const { data, error } = await supabase
            .from('pending_calls')
            .insert({
                caller_id: callerId,
                callee_id: calleeId,
                caller_name: callerName,
                caller_avatar: callerAvatar || null,
                call_type: callType,
                room_name: roomName,
            })
            .select()
            .single();

        if (error) {
            console.error('[calls/create] Error:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true, call: data });
    } catch (e) {
        console.error('[calls/create] Exception:', e);
        return res.status(500).json({ error: e.message });
    }
}
