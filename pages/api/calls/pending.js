// API to get pending calls for a user
// GET /api/calls/pending?userId=xxx

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    try {
        // Clean up expired calls first
        await supabase
            .from('pending_calls')
            .delete()
            .lt('expires_at', new Date().toISOString());

        // Get pending calls for this user
        const { data: calls, error } = await supabase
            .from('pending_calls')
            .select('*')
            .eq('callee_id', userId)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('[calls/pending] Error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Return the most recent pending call
        const pendingCall = calls?.[0] || null;

        return res.json({
            success: true,
            pendingCall: pendingCall ? {
                id: pendingCall.id,
                callerId: pendingCall.caller_id,
                callerName: pendingCall.caller_name,
                callerAvatar: pendingCall.caller_avatar,
                callType: pendingCall.call_type,
                roomName: pendingCall.room_name,
                createdAt: pendingCall.created_at,
            } : null
        });
    } catch (e) {
        console.error('[calls/pending] Exception:', e);
        return res.status(500).json({ error: e.message });
    }
}
