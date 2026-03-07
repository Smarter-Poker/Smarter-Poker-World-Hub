// API to cancel/delete a pending call
// DELETE /api/calls/cancel

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

    if (req.method !== 'DELETE' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Require JWT auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const authenticatedUserId = authUser.id;
    const { callId, callerId, calleeId } = req.body;

    try {
        let query = supabase.from('pending_calls').delete();

        if (callId) {
            // SECURITY: Only allow canceling a call if the authenticated user is the caller OR callee
            query = query.eq('id', callId).or(`caller_id.eq.${authenticatedUserId},callee_id.eq.${authenticatedUserId}`);
        } else if (callerId && calleeId) {
            // SECURITY: Verify the authenticated user is one of the parties
            if (callerId !== authenticatedUserId && calleeId !== authenticatedUserId) {
                return res.status(403).json({ success: false, error: 'Not authorized to cancel this call' });
            }
            query = query.eq('caller_id', callerId).eq('callee_id', calleeId);
        } else {
            return res.status(400).json({ success: false, error: 'Missing callId or callerId+calleeId' });
        }

        const { error } = await query;

        if (error) {
            console.error('[calls/cancel] Error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.json({ success: true });
    } catch (e) {
        console.error('[calls/cancel] Exception:', e);
        return res.status(500).json({ success: false, error: e.message });
    }
}
