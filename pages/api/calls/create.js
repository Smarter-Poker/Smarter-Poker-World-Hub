import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
// API to create a pending call and ring the callee's devices.
// POST /api/calls/create
//
// 2026-10-31: a call now names the 1:1 conversation it belongs to. The
// conversation is authorised here (participants, not a group, not a pending
// request, no block either way) by the same helper the LiveKit token route
// uses, and the push that makes the callee's phone ring is sent from here,
// after authorisation, instead of the browser asking /api/notifications/send
// to ring an arbitrary user id. The response status is now honest: the caller
// stops when this refuses, instead of sitting alone in an empty room.

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { enqueuePush } from '../../../src/lib/push/push-enqueue';
import { isPushConfigured } from '../../../src/lib/push/web-push';
import { authorizeCallConversation } from '../../../src/lib/calls/callAuthorization.mjs';
import { parseCallRoomConversation, normalizeCallType, CALL_RING_TIMEOUT_MS } from '../../../src/lib/calls/callRoom.mjs';

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

async function legacySharedConversation(sb, callerId, calleeId) {
    // Clients cached before 2026-10-31 do not send conversationId. Find the
    // conversation the two share so they get exactly the same checks.
    const { data: callerConvs } = await sb
        .from('social_conversation_participants')
        .select('conversation_id')
        .eq('user_id', callerId)
        .limit(500);
    const ids = (callerConvs || []).map(c => c.conversation_id);
    if (!ids.length) return null;
    const { data: shared } = await sb
        .from('social_conversation_participants')
        .select('conversation_id')
        .eq('user_id', calleeId)
        .in('conversation_id', ids)
        .limit(20);
    if (!shared?.length) return null;
    const { data: direct } = await sb
        .from('social_conversations')
        .select('id')
        .in('id', shared.map(row => row.conversation_id))
        .eq('is_group', false)
        .limit(1);
    return direct?.[0]?.id || shared[0].conversation_id;
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
      const sb = getSupabase();
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, sb);
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { calleeId, callerName, callerAvatar, roomName } = req.body || {};
      const callType = normalizeCallType(req.body?.callType);
      const callerId = authUser.id;

      if (!calleeId || !roomName || typeof roomName !== 'string' || roomName.length > 120) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
      }
      if (calleeId === callerId) {
          return res.status(400).json({ success: false, error: 'Cannot Call Yourself' });
      }

      let conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.toLowerCase() : null;
      if (conversationId) {
          if (parseCallRoomConversation(roomName) !== conversationId) {
              return res.status(400).json({ success: false, error: 'This call room does not belong to the conversation.' });
          }
      } else {
          // Old clients only ever named rooms smarter-poker-<8 hex>-<ms>. Any
          // other name here could be someone's live-stream room.
          if (!/^smarter-poker-[0-9a-f]{8}-\d{10,16}$/i.test(roomName)) {
              return res.status(400).json({ success: false, error: 'Invalid call room.' });
          }
          conversationId = await legacySharedConversation(sb, callerId, calleeId);
          if (!conversationId) return res.status(403).json({ success: false, error: 'No shared conversation with this user' });
      }

      const authorization = await authorizeCallConversation(sb, { conversationId, userId: callerId });
      if (!authorization.ok) {
          return res.status(authorization.status).json({ success: false, error: authorization.error });
      }
      if (authorization.otherUserId !== calleeId) {
          return res.status(403).json({ success: false, error: 'That person is not in this conversation.' });
      }

      // Public handle only, never a stored full name.
      const { data: profile } = await sb
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', callerId)
          .maybeSingle();
      const displayName = String(profile?.username || callerName || 'Someone').slice(0, 80);
      const avatar = profile?.avatar_url || (typeof callerAvatar === 'string' ? callerAvatar.slice(0, 500) : null);

      // One ringing call per pair at a time.
      const { error: clearError } = await sb
          .from('pending_calls')
          .delete()
          .eq('caller_id', callerId)
          .eq('callee_id', calleeId);
      if (clearError) console.warn('[calls/create] previous pending call was not cleared:', clearError.message);

      const { data, error } = await sb
          .from('pending_calls')
          .insert({
              caller_id: callerId,
              callee_id: calleeId,
              caller_name: displayName,
              caller_avatar: avatar,
              // The table only accepts 'voice' | 'video'. Writing 'audio' failed
              // every voice call's insert, and the caller's token was then refused.
              call_type: callType === 'video' ? 'video' : 'voice',
              room_name: roomName,
              expires_at: new Date(Date.now() + CALL_RING_TIMEOUT_MS + 15000).toISOString(),
          })
          .select()
          .maybeSingle();

      if (error || !data) {
          console.warn('[calls/create] insert failed:', error?.message || 'no row');
          return res.status(500).json({ success: false, error: 'Could Not Start The Call. Please Try Again.' });
      }

      // Ring the callee's phone. A push failure never fails the call: an
      // open Smarter.Poker tab rings from the realtime signal regardless.
      let push = { attempted: false };
      if (isPushConfigured()) {
          try {
              const result = await enqueuePush(sb, {
                  userId: calleeId,
                  title: `Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`,
                  body: `${displayName} is calling you`,
                  url: `/hub/messenger?incomingCall=${encodeURIComponent(roomName)}`,
                  event: 'incoming_call',
                  data: { type: 'incoming_call', roomName, callType, callerId, conversationId },
                  icon: avatar || undefined,
                  relatedEntityId: null,
                  requireInteraction: true,
                  tag: `call-${callerId}`,
                  actions: [
                      { action: 'accept', title: 'Accept' },
                      { action: 'decline', title: 'Decline' },
                  ],
              });
              push = { attempted: true, sent: !!result?.sent, skipped: !!result?.skipped, reason: typeof result?.reason === 'string' ? result.reason.split(':')[0] : null };
          } catch (pushError) {
              console.warn('[calls/create] push failed (call continues):', pushError?.message || pushError);
              push = { attempted: true, sent: false };
          }
      }

      return res.json({ success: true, call: { id: data.id, roomName, conversationId, callType }, push });

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
