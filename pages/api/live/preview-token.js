/**
 * GET /api/live/preview-token?room=<streamId>
 * Returns an anonymous, short-lived LiveKit subscriber-only token for
 * live preview thumbnails in the social feed. No authentication required,
 * but validates the room exists and is currently live.
 * Token is read-only (canPublish: false) with a 5-minute TTL.
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const { room } = req.query;
    if (!room) return res.status(400).json({ error: 'room required' });

    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

    if (!apiKey || !apiSecret || !livekitUrl) {
        return res.status(503).json({ error: 'LiveKit not configured' });
    }

    try {
        // SECURITY (Adversarial Pass 3): Validate the room exists and is actually live
        // Without this, attackers could spam the endpoint with arbitrary room IDs
        // and drain our LiveKit token quotas or join unlisted private rooms.
        const { data: stream, error: dbErr } = await supabase
            .from('live_streams')
            .select('status')
            .eq('id', room)
            .maybeSingle();
            
        if (dbErr || !stream) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        if (stream.status !== 'live') {
            return res.status(400).json({ error: 'Stream is not live' });
        }

        const { AccessToken } = await import('livekit-server-sdk');

        // Anonymous preview identity — random suffix prevents collisions
        const identity = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const at = new AccessToken(apiKey, apiSecret, {
            identity,
            name: 'Preview',
            ttl: 300, // 5 minutes — enough for a card hover preview
        });

        at.addGrant({
            roomJoin: true,
            room: String(room),
            canPublish: false,       // strictly read-only
            canSubscribe: true,
            canPublishData: false,
            roomCreate: false,
        });

        const token = await at.toJwt();

        // BUG-FIX-DEEP-AUDIT-R2 PT-1: the previous version set a 120s
        // public+s-maxage Cache-Control on this response. The response body
        // contains a randomly-generated LiveKit identity. If two viewers
        // hover-preview the same room within the cache window, the CDN
        // serves both of them the SAME identity. LiveKit's policy on
        // duplicate identities is to disconnect the prior session, so the
        // first viewer's preview gets kicked when the second one starts.
        //
        // Tokens are cheap to mint (signed JWT, one SELECT for stream
        // existence) and TTL is 5 minutes, so we just disable HTTP caching
        // entirely. Per-client preview reuse can be done client-side if it
        // becomes a hot path; for now, fresh token per hover.
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        return res.json({ token, url: livekitUrl });
    } catch (err) {
        console.error('[live/preview-token]', err.message);
        return res.status(500).json({ error: err.message });
    }
}
