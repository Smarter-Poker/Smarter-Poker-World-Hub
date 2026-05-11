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
        // BUG-FIX-LIVE2-3a: anonymous viewers can watch public streams.
        // Previously this 401'd any unauthenticated user — even though
        // streams are public content. We now allow anon callers to get a
        // VIEWER-only token (no publish, no data, no roomCreate). Auth is
        // still required for broadcaster/guest claims and for any state-
        // changing action (gifts, comments, follows have their own
        // authenticated endpoints).
        const { user } = await getServerUserWithFallback(req, supabase);
        const isAnonymous = !user;

        const { room, name, broadcaster: clientClaimsBroadcaster = false, guestInviteCode = null } = req.body;
        if (!room) return res.status(400).json({ error: 'room required' });

        // Block anonymous from claiming privileged roles outright
        if (isAnonymous && (clientClaimsBroadcaster || guestInviteCode)) {
            return res.status(401).json({ error: 'Sign in to broadcast or join as guest' });
        }

        // BUG-FIX-LIVE-API-AUDIT (C1): SECURITY — identity is forced to the
        // server-known user.id. Previously the client sent `identity` and we
        // used it verbatim in the LiveKit token. A malicious user could pass
        // another user's id, kicking that user out of the room (LiveKit kicks
        // duplicate identity) and impersonating them in the participant list.
        // Anonymous preview tokens still go through /api/live/preview-token,
        // which has its own random-suffix identity flow.
        // BUG-FIX-LIVE2-3a: anon viewers get a random anon-N identity. This
        // never collides with a real user because real ids are uuids and
        // anons are prefixed.
        const identity = isAnonymous
            ? `anon-${Math.random().toString(36).slice(2, 12)}`
            : String(user.id);

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
        } else if (!isAnonymous) {
            // BUG-FIX-LIVE-API-AUDIT (C3): authenticated viewer tokens are
            // ban-checked. Banned users can't join the LiveKit room. Anonymous
            // viewers skip this check (no user.id to ban against — moderators
            // can't ban anon-N* anyway. They can ban a real account if the
            // user signs in.)
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
        let displayName;
        if (isAnonymous) {
            // BUG-HUNT-9: ignore client-passed `name` for anon. Otherwise an
            // anon caller could impersonate any display name in the viewer
            // list. Always 'Guest viewer'.
            displayName = 'Guest viewer';
        } else {
            // BUG-FIX-DEEP-AUDIT-R2 T-1: authenticated users must also have
            // their display name resolved from their profile, NOT the request
            // body. Previously the server only fetched profile when `name`
            // was falsy — so any direct API call with `name: "Verified Mod"`
            // would impersonate any identity in the LiveKit viewer list.
            // BH-9 only fixed the anon path. This fixes the authenticated
            // path too. The client doesn't send `name` (see
            // LiveStreamService._getToken), so this is server-side defense
            // in depth against a malicious direct API call.
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
            // BUG-FIX-LIVE2-3a: anon viewers can't send room data messages.
            // Authenticated viewers retain canPublishData so emoji reactions
            // / typing indicators / cursors keep working for them.
            canPublishData: !isAnonymous,
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
