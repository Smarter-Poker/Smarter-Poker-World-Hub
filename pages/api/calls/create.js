// API to create a pending call (for offline users)
// POST /api/calls/create

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Require JWT auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { calleeId, callerName, callerAvatar, callType, roomName } = req.body;
    const callerId = authUser.id;

    if (!callerId || !calleeId || !callerName || !callType || !roomName) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
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
            .maybeSingle();

        if (error) {
            console.error('[calls/create] Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.json({ success: true, call: data });
    } catch (e) {
        console.error('[calls/create] Exception:', e);
        return res.status(500).json({ success: false, error: e.message });
    }
}
