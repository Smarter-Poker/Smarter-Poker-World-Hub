// API to create a pending call (for offline users)
// POST /api/calls/create

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
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

      // Require JWT auth
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const authUser = authData?.user;
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { calleeId, callerName, callerAvatar, callType, roomName } = req.body;
      const callerId = authUser.id;

      if (!callerId || !calleeId || !callerName || !callType || !roomName) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      try {
          // Defense-in-depth: Verify caller has a shared non-request conversation with callee
          const { data: callerConvs } = await getSupabase()
              .from('social_conversation_participants')
              .select('conversation_id')
              .eq('user_id', callerId)
              .limit(200);
          const callerConvIds = (callerConvs || []).map(c => c.conversation_id);

          if (callerConvIds.length > 0) {
              const { data: sharedConv } = await getSupabase()
                  .from('social_conversation_participants')
                  .select('conversation_id')
                  .eq('user_id', calleeId)
                  .in('conversation_id', callerConvIds)
                  .limit(1);

              if (sharedConv && sharedConv.length > 0) {
                  // Check if the shared conversation is a pending request
                  const { data: convRow } = await getSupabase()
                      .from('social_conversations')
                      .select('is_request')
                      .eq('id', sharedConv[0].conversation_id)
                      .maybeSingle();
                  if (convRow?.is_request) {
                      return res.status(403).json({ success: false, error: 'Cannot call — message request not accepted yet' });
                  }
              } else {
                  return res.status(403).json({ success: false, error: 'No shared conversation with this user' });
              }
          } else {
              return res.status(403).json({ success: false, error: 'No conversations found' });
          }
          // Delete any existing pending calls from this caller to this callee
          const { error: err_pending_calls_rxb79 } = await getSupabase()
            .from('pending_calls')
            .delete()
              .eq('caller_id', callerId)
              .eq('callee_id', calleeId);
          if (err_pending_calls_rxb79) console.warn('[Supabase] Silent mutation failed in pending_calls:', err_pending_calls_rxb79.message);

          // Create new pending call
          const { data, error } = await getSupabase()
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
              console.warn('[calls/create] Error:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          if (!data) return res.status(500).json({ success: false, error: 'Failed to create call' });
          return res.json({ success: true, call: data });
      } catch (e) {
          console.warn('[calls/create] Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
