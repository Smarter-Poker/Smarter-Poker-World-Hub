/**
 * LiveKit Token Generation API — Messenger 1:1 Video Calls
 *
 * Generates access tokens for users to join LiveKit video rooms.
 * Used for seamless 1:1 video calling in the Messenger.
 *
 * NOTE: livekit-server-sdk v2 is ESM-only. Static import WILL FAIL in Next.js
 * CJS API routes. AccessToken is dynamically imported inside the handler.
 * Same pattern used in /api/live/token.js for Go Live broadcasting.
 * Both features share the same LiveKit project (LIVEKIT_API_KEY / LIVEKIT_API_SECRET).
 */
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
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
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // BUG #247 FIX: Require JWT auth — token generation must be authenticated
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

      const { roomName, participantName, participantId } = req.body;

      if (!roomName || !participantName) {
          return res.status(400).json({ error: 'Missing roomName or participantName' });
      }

      // ── [2026-07-25] ROOM AUTHORIZATION (closes IDOR) ────────────────────
      // Previously ANY authenticated user could request a publish+subscribe
      // token for ANY room string and join a private 1:1 call or publish into
      // someone else's live session. We now require the room to be one the
      // caller is actually entitled to, and scope publish rights correctly:
      //   • 1:1 call  → a pending_calls row for this room where the caller is
      //                 the caller_id or callee_id (both may publish).
      //   • Live session → a live_sessions row whose livekit_room matches and
      //                 is still live; ONLY the broadcaster (user_id) may
      //                 publish, everyone else is subscribe-only (spectator).
      // Anything else is rejected. Room membership was verified upstream when
      // the pending_calls row / live_sessions row was created.
      let canPublish = false;
      let authorized = false;
      try {
          const sb = getSupabase();
          const { data: call } = await sb
              .from('pending_calls')
              .select('caller_id, callee_id')
              .eq('room_name', roomName)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
          if (call && (call.caller_id === _authUser.id || call.callee_id === _authUser.id)) {
              authorized = true;
              canPublish = true; // both parties of a 1:1 call publish
          } else {
              const { data: sess } = await sb
                  .from('live_sessions')
                  .select('user_id, status, ended_at')
                  .eq('livekit_room', roomName)
                  .limit(1)
                  .maybeSingle();
              const liveStatuses = new Set(['live', 'active', 'streaming', 'started']);
              if (sess && !sess.ended_at && liveStatuses.has(String(sess.status || '').toLowerCase())) {
                  authorized = true;
                  canPublish = sess.user_id === _authUser.id; // only the broadcaster publishes
              }
          }
      } catch (authzErr) {
          console.warn('[livekit/token] room authorization check failed:', authzErr?.message || authzErr);
          return res.status(500).json({ error: 'Could not verify room access' });
      }
      if (!authorized) {
          return res.status(403).json({ error: 'You are not authorized to join this room.' });
      }

      // LiveKit credentials from environment (trim to remove any newlines)
      const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
      const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
      const wsUrl = (process.env.NEXT_PUBLIC_LIVEKIT_URL || '').trim();

      if (!apiKey || !apiSecret || !wsUrl) {
          console.warn('LiveKit API credentials not configured');
          return res.status(500).json({
              error: 'Video calling not configured. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL.'
          });
      }

      try {
          // FIX: livekit-server-sdk v2 is ESM-only — dynamic import required in Next.js CJS routes
          const { AccessToken } = await import('livekit-server-sdk');

          // BUG #263 FIX: Always use authenticated user's ID as the participant identity.
          const token = new AccessToken(apiKey, apiSecret, {
              identity: _authUser.id,
              name: participantName,
              ttl: '1h',
          });

          token.addGrant({
              roomJoin: true,
              room: roomName,
              canPublish,                 // 1:1 parties + broadcaster only
              canSubscribe: true,
              canPublishData: canPublish, // spectators can't inject data either
          });

          // FIX: toJwt() is async in livekit-server-sdk v2
          const jwt = await token.toJwt();

          return res.status(200).json({
              token: jwt,
              wsUrl: wsUrl,
          });
      } catch (error) {
          console.warn('Error generating LiveKit token:', error);
          return res.status(500).json({ error: 'Failed to generate video token' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
