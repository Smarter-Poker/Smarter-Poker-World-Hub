/**
 * GET /api/live/preview-token?room=<streamId>
 * Returns an anonymous, short-lived LiveKit subscriber-only token for
 * live preview thumbnails in the social feed. No authentication required.
 * Token is read-only (canPublish: false) with a 5-minute TTL.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { room } = req.query;
    if (!room) return res.status(400).json({ error: 'room required' });

    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

    if (!apiKey || !apiSecret || !livekitUrl) {
        return res.status(503).json({ error: 'LiveKit not configured' });
    }

    try {
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

        // Cache for 2 minutes — card re-hover within that window reuses the same token
        res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=120');
        return res.json({ token, url: livekitUrl });
    } catch (err) {
        console.error('[live/preview-token]', err.message);
        return res.status(500).json({ error: err.message });
    }
}
