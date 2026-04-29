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
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // BUG #247 FIX: Require JWT auth — token generation must be authenticated
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ error: 'Auth required' });
      const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

      const { roomName, participantName, participantId } = req.body;

      if (!roomName || !participantName) {
          return res.status(400).json({ error: 'Missing roomName or participantName' });
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
              canPublish: true,
              canSubscribe: true,
              canPublishData: true,
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
