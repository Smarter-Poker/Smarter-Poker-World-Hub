/**
 * LiveKit Token Generation API
 *
 * Generates access tokens for users to join LiveKit video rooms.
 * Used for seamless 1:1 video calling in the Messenger.
 */
import { AccessToken } from 'livekit-server-sdk';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // BUG #247 FIX: Require JWT auth — token generation must be authenticated
    const _supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await _supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

    const { roomName, participantName, participantId } = req.body;

    if (!roomName || !participantName) {
        return res.status(400).json({ error: 'Missing roomName or participantName' });
    }

    // LiveKit credentials from environment (trim to remove any newlines)
    const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
    const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
    const wsUrl = (process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://smarter-poker-lovt9xq0.livekit.cloud').trim();

    if (!apiKey || !apiSecret) {
        console.error('LiveKit API credentials not configured');
        return res.status(500).json({
            error: 'Video calling not configured. Please set LIVEKIT_API_KEY and LIVEKIT_API_SECRET.'
        });
    }

    try {
        // BUG #263 FIX: Always use authenticated user's ID as the participant identity.
        // Previously accepted client-supplied participantId, allowing impersonation.
        const token = new AccessToken(apiKey, apiSecret, {
            identity: _authUser.id,
            name: participantName,
            // Token expires in 1 hour
            ttl: '1h',
        });

        // Grant permissions for the room
        token.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const jwt = await token.toJwt();

        return res.status(200).json({
            token: jwt,
            wsUrl: wsUrl,
        });
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        return res.status(500).json({ error: 'Failed to generate video token' });
    }
}
