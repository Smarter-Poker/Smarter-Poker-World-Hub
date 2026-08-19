import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 📞 INSERT MISSED CALL NOTIFICATION API
 * POST /api/messenger/insert-missed-call-notification
 * 
 * Creates a notification in the notifications table for missed/declined calls.
 * Uses service role to insert a notification for the callee (not the caller).
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { notify } from '../../../src/lib/notify';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { calleeId, callType, reason } = req.body;

    if (!calleeId) {
        return res.status(400).json({ success: false, error: 'calleeId required' });
    }

    // Prevent self-notification
    if (calleeId === user.id) {
        return res.status(200).json({ success: true, skipped: true });
    }

    // Verify the caller and callee actually share a conversation
    // This prevents any authenticated user from spamming missed-call notifications to arbitrary users.
    const { data: callerConvs } = await getSupabase()
        .from('social_conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)
        .limit(500);

    const callerConvIds = (callerConvs || []).map(p => p.conversation_id);

    let sharedConv = false;
    if (callerConvIds.length > 0) {
        const { data: shared } = await getSupabase()
            .from('social_conversation_participants')
            .select('conversation_id')
            .eq('user_id', calleeId)
            .in('conversation_id', callerConvIds)
            .limit(1);
        sharedConv = !!(shared && shared.length > 0);
    }

    if (!sharedConv) {
        // They have no shared conversation — likely spam or stale state. Silently ignore.
        return res.status(200).json({ success: true, skipped: true });
    }

    // Look up the caller's display name
    const { data: profile } = await getSupabase()
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

    const callerName = profile?.username || profile?.full_name || 'Someone';
    const typeLabel = callType === 'video' ? 'Video' : 'Voice';
    const reasonLabel = reason === 'declined' ? 'Declined' : 'Missed';

    // Routed through notify() rather than a bare insert. A bare insert only
    // reached the phone via the mirror trigger and the 5-minute outbox cron --
    // a "you missed a call" that lands four minutes later is close to useless.
    // notify() delivers inline while still honouring the full preference gate.
    const result = await notify(getSupabase(), {
        userId: calleeId,
        type: 'missed_call',
        title: callerName,
        body: `${reasonLabel} ${typeLabel} Call`,
        url: '/hub/messenger',
        actorId: user.id,
        // One tag per caller so a run of missed calls collapses on the lock
        // screen instead of stacking one banner per attempt.
        tag: `missed-call:${user.id}`,
        data: {
            callType: callType || 'voice',
            reason: reason || 'missed',
            caller_avatar: profile?.avatar_url || null,
        },
    });

    if (!result.ok) {
        console.warn('[MISSED-CALL-NOTIFICATION] notify failed for callee', calleeId);
        return res.status(500).json({ success: false, error: 'Could not record the missed call' });
    }

    return res.json({ success: true });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
