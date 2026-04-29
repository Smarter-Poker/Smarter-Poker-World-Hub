/**
 * POST /api/live/token
 * Generates a LiveKit access token for broadcaster or viewer.
 * 
 * Body: { room: string, identity: string, name: string, broadcaster: boolean }
 * Returns: { token: string, url: string }
 */
import { AccessToken } from 'livekit-server-sdk';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

    if (!apiKey || !apiSecret || !livekitUrl) {
        return res.status(503).json({ error: 'LiveKit not configured' });
    }

    try {
        const { user } = await getServerUserWithFallback(req, supabase);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { room, identity, name, broadcaster = false } = req.body;
        if (!room || !identity) return res.status(400).json({ error: 'room and identity required' });

        // Get display name from profile if not provided
        let displayName = name;
        if (!displayName) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, full_name')
                .eq('id', user.id)
                .maybeSingle();
            displayName = profile?.username || profile?.full_name || identity;
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity,
            name: displayName,
            ttl: 3600, // 1 hour
        });

        at.addGrant({
            roomJoin: true,
            room,
            canPublish: broadcaster,         // Only broadcaster can publish video/audio
            canSubscribe: true,               // Everyone can receive
            canPublishData: true,             // Everyone can send data (reactions)
            roomCreate: broadcaster,          // Broadcaster creates the room
        });

        return res.json({
            token: at.toJwt(),
            url: livekitUrl,
        });
    } catch (err) {
        console.warn('[live/token] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
