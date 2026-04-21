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

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { calleeId, callType, reason } = req.body;

    if (!calleeId) {
        return res.status(400).json({ success: false, error: 'calleeId required' });
    }

    // Prevent self-notification
    if (calleeId === user.id) {
        return res.status(200).json({ success: true, skipped: true });
    }

    // Look up the caller's display name
    const { data: profile } = await getSupabase()
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

    const callerName = profile?.full_name || profile?.username || 'Someone';
    const typeLabel = callType === 'video' ? 'Video' : 'Voice';
    const reasonLabel = reason === 'declined' ? 'Declined' : 'Missed';

    // Insert notification for the callee
    const { error: insertErr } = await getSupabase()
        .from('notifications')
        .insert({
            user_id: calleeId,
            type: 'missed_call',
            title: callerName,
            message: `${reasonLabel} ${typeLabel} Call`,
            actor_id: user.id,
            link: '/hub/messenger',
            data: {
                callType: callType || 'voice',
                reason: reason || 'missed',
                caller_avatar: profile?.avatar_url || null,
            }
        });

    if (insertErr) {
        console.error('[MISSED-CALL-NOTIFICATION] Insert error:', insertErr);
        return res.status(500).json({ success: false, error: insertErr.message });
    }

    return res.json({ success: true });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
