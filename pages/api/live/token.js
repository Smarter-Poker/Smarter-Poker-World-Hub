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

        const { room, name, broadcaster: clientClaimsBroadcaster = false, guestInviteCode = null } = req.body;
        if (!room) return res.status(400).json({ error: 'room required' });

        // BUG-FIX-LIVE-API-AUDIT (C1): SECURITY — identity is forced to the
        // server-known user.id. Previously the client sent `identity` and we
        // used it verbatim in the LiveKit token. A malicious user could pass
        // another user's id, kicking that user out of the room (LiveKit kicks
        // duplicate identity) and impersonating them in the participant list.
        // Anonymous preview tokens still go through /api/live/preview-token,
        // which has its own random-suffix identity flow.
        const identity = String(user.id);

        // BUG FIX (#15): SECURITY — Never trust the client-supplied broadcaster flag.
        // A malicious viewer could POST { broadcaster: true } and receive a token that
        // lets them publish their own video/audio into someone else's live stream room.
        // Server-side verify: the caller must be the actual broadcaster_id of the stream.
        let isVerifiedBroadcaster = false;
        let isVerifiedGuest = false;

        const { data: streamRow } = await supabase
            .from('live_streams')
            .select('broadcaster_id, guest_invite_code, status')
            .eq('id', room)
            .maybeSingle();

        // BUG-FIX-LIVE-API-AUDIT (C4): Reject token issuance for non-existent
        // or non-live streams. Without this, LiveKit tokens were minted for
        // any room id including ended/cancelled streams.
        if (!streamRow) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        if (streamRow.status !== 'live' && !clientClaimsBroadcaster) {
            // Broadcaster must be able to mint their own token at the moment
            // they go live (status flip happens after token issuance in some
            // flows). Viewers/guests get tokens only for live streams.
            return res.status(400).json({ error: 'Stream is not live' });
        }

        if (clientClaimsBroadcaster) {
            // Grant broadcast if the user IS the broadcaster of this stream.
            isVerifiedBroadcaster = streamRow.broadcaster_id === user.id;
            if (!isVerifiedBroadcaster) {
                return res.status(403).json({ error: 'Not the broadcaster of this stream' });
            }
        } else if (guestInviteCode) {
            isVerifiedGuest = streamRow.guest_invite_code === guestInviteCode;
            if (!isVerifiedGuest) {
                return res.status(403).json({ error: 'Invalid guest invite code' });
            }
        } else {
            // BUG-FIX-LIVE-API-AUDIT (C3): viewer tokens now ban-checked.
            // Banned users cannot join the LiveKit room (and therefore can't
            // see/hear the broadcaster's stream nor send data messages on
            // the room channel). Existing RLS already blocks comments and
            // reactions; this closes the LiveKit-side gap.
            const { data: ban } = await supabase
                .from('live_bans')
                .select('id')
                .eq('stream_id', room)
                .eq('banned_user_id', user.id)
                .maybeSingle();
            if (ban) {
                return res.status(403).json({ error: 'You are banned from this stream' });
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
            identity,
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
