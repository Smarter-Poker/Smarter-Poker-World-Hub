/**
 * POST /api/live/token
 * Generates a LiveKit access token for broadcaster or viewer.
 *
 * BUG FIXED (v2): livekit-server-sdk v2 is ESM-only with no CJS dist.
 * Static import 'AccessToken' doesn't work — must use dynamic import().
 * Also: v2's toJwt() is async, must be awaited.
 *
 * Body: { room: string, identity: string, name?: string, broadcaster?: boolean }
 * Returns: { token: string, url: string }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

    if (!apiKey || !apiSecret || !livekitUrl) {
        return res.status(503).json({
            error: 'LiveKit not configured — set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL',
        });
    }

    try {
        const { user } = await getServerUserWithFallback(req, supabase);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { room, identity, name, broadcaster: clientClaimsBroadcaster = false, guestInviteCode = null } = req.body;
        if (!room || !identity) return res.status(400).json({ error: 'room and identity required' });

        // BUG FIX (#15): SECURITY — Never trust the client-supplied broadcaster flag.
        // A malicious viewer could POST { broadcaster: true } and receive a token that
        // lets them publish their own video/audio into someone else's live stream room.
        // Server-side verify: the caller must be the actual broadcaster_id of the stream.
        let isVerifiedBroadcaster = false;
        let isVerifiedGuest = false;

        const { data: streamRow } = await supabase
            .from('live_streams')
            .select('broadcaster_id, guest_invite_code')
            .eq('id', room)
            .maybeSingle();

        if (clientClaimsBroadcaster) {
            // Grant broadcast if the stream row exists and the user IS the broadcaster.
            isVerifiedBroadcaster = streamRow && streamRow.broadcaster_id === user.id;
            if (!isVerifiedBroadcaster) {
                return res.status(403).json({ error: 'Not the broadcaster of this stream' });
            }
        } else if (guestInviteCode) {
            // Verify guest invite code
            isVerifiedGuest = streamRow && streamRow.guest_invite_code === guestInviteCode;
            if (!isVerifiedGuest) {
                return res.status(403).json({ error: 'Invalid guest invite code' });
            }
        }

        // Get display name from profile
        let displayName = name;
        if (!displayName) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, full_name')
                .eq('id', user.id)
                .maybeSingle();
            displayName = profile?.username || profile?.full_name || identity;
        }

        // Dynamic import REQUIRED — livekit-server-sdk v2 is ESM-only, no CJS build
        const { AccessToken } = await import('livekit-server-sdk');

        const at = new AccessToken(apiKey, apiSecret, {
            identity: String(identity),
            name: String(displayName),
            ttl: 28800, // BUG FIX: Increase from 3600 (1 hour) to 28800 (8 hours) to prevent unexpected stream drops
        });

        at.addGrant({
            roomJoin: true,
            room: String(room),
            canPublish: isVerifiedBroadcaster || isVerifiedGuest,
            canSubscribe: true,
            canPublishData: true,
            roomCreate: isVerifiedBroadcaster,
        });

        // v2 SDK: toJwt() returns a Promise — must await
        const token = await at.toJwt();

        return res.json({ token, url: livekitUrl });
    } catch (err) {
        console.error('[live/token] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
