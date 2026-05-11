/**
 * POST /api/live/moderate
 * Server-side broadcaster moderation actions for live streams.
 *
 * Actions:
 *   - delete_comment: broadcaster OR co-host deletes any comment in their stream
 *   - pin_comment:    broadcaster OR co-host pins a comment (one at a time)
 *   - unpin_comment:  broadcaster OR co-host unpins the current comment
 *   - ban_user:       broadcaster-only — bans a viewer + kicks from LiveKit room
 *   - unban_user:     broadcaster-only — removes the ban
 *
 * BUG-FIX-DEEP-AUDIT-R3 M-9: comment moderation (delete/pin/unpin) is now
 * also allowed for verified co-hosts. Co-hosts are guests who joined with
 * the stream's guest_invite_code and currently hold publish privileges in
 * the LiveKit room (per PR #280). They have skin in the show and need
 * comment moderation tools too. Ban remains broadcaster-only because it's
 * a permanent action on a specific user that should be tied to a single
 * accountable identity.
 *
 * Co-host authorization model:
 *   The client sends `guest_invite_code` in the body. The server checks
 *   it against live_streams.guest_invite_code (the column itself is locked
 *   down per round 2 GUEST-1, but service_role read bypasses GRANT/REVOKE).
 *   If valid, the caller is a verified co-host.
 *
 * All actions verify ownership/co-host status before mutating. Uses
 * service-role to bypass RLS (broadcasters delete any commenter's row).
 *
 * BUG-FIX-DEEP-AUDIT-R3 M-3: ban_user now also calls LiveKit
 * RoomServiceClient.removeParticipant to immediately disconnect the banned
 * viewer from the room. Without this, RLS blocked their comments/reactions
 * but they kept watching for up to 8 hours (token TTL). The kick attempt
 * is logged to live_ban_audit for incident-response visibility.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COMMENT_MOD_ACTIONS = new Set(['delete_comment', 'pin_comment', 'unpin_comment']);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { action, stream_id, comment_id, target_user_id, guest_invite_code } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });
    if (!stream_id) return res.status(400).json({ error: 'stream_id is required' });

    // Load the stream once. service_role bypasses the round-2 column GRANT
    // lockdown, so guest_invite_code is readable here.
    const { data: stream } = await supabase
        .from('live_streams')
        .select('id, broadcaster_id, guest_invite_code, livekit_room, status')
        .eq('id', stream_id)
        .maybeSingle();

    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const isBroadcaster = stream.broadcaster_id === user.id;

    // BUG-FIX-DEEP-AUDIT-R3 M-9: co-host detection via guest invite code.
    // Only valid if (a) the code matches the stream's, and (b) the action
    // is in the comment-mod set. Ban/unban require broadcaster.
    const isCoHost = !isBroadcaster
        && COMMENT_MOD_ACTIONS.has(action)
        && guest_invite_code
        && stream.guest_invite_code === guest_invite_code;

    if (!isBroadcaster && !isCoHost) {
        return res.status(403).json({
            error: COMMENT_MOD_ACTIONS.has(action)
                ? 'Only the broadcaster or a verified co-host can moderate this stream'
                : 'Only the broadcaster can perform this action',
        });
    }

    try {
        switch (action) {
            case 'delete_comment': {
                if (!comment_id) return res.status(400).json({ error: 'comment_id required' });
                // Verify the comment belongs to this stream (prevent deleting from other streams)
                const { data: comment } = await supabase
                    .from('live_comments')
                    .select('id, stream_id')
                    .eq('id', comment_id)
                    .maybeSingle();
                if (!comment || comment.stream_id !== stream_id) {
                    return res.status(404).json({ error: 'Comment not found in this stream' });
                }
                await supabase.from('live_comments').delete().eq('id', comment_id);
                return res.json({ success: true, action: 'delete_comment' });
            }

            case 'pin_comment': {
                if (!comment_id) return res.status(400).json({ error: 'comment_id required' });
                // BUG-FIX-DEEP-AUDIT-R2 M-1: verify the comment actually
                // belongs to this stream. Mirrors the delete_comment guard.
                const { data: comment } = await supabase
                    .from('live_comments')
                    .select('id, stream_id')
                    .eq('id', comment_id)
                    .maybeSingle();
                if (!comment || comment.stream_id !== stream_id) {
                    return res.status(404).json({ error: 'Comment not found in this stream' });
                }
                await supabase.from('live_pins').upsert({
                    stream_id,
                    comment_id,
                    pinned_by: user.id,
                }, { onConflict: 'stream_id' });
                return res.json({ success: true, action: 'pin_comment' });
            }

            case 'unpin_comment': {
                await supabase.from('live_pins').delete().eq('stream_id', stream_id);
                return res.json({ success: true, action: 'unpin_comment' });
            }

            case 'ban_user': {
                if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
                if (target_user_id === user.id) return res.status(400).json({ error: 'Cannot ban yourself' });

                // 1. Insert the ban row (existing behavior — blocks future
                //    comments/reactions via RLS + ban-check in /api/live/*).
                await supabase.from('live_bans').upsert({
                    stream_id,
                    banned_user_id: target_user_id,
                    banned_by: user.id,
                }, { onConflict: 'stream_id,banned_user_id' });

                // 2. BUG-FIX-DEEP-AUDIT-R3 M-3: kick the banned viewer from
                //    the LiveKit room immediately. The viewer's token
                //    identity is String(user_id) (per /api/live/token C1).
                //    Best-effort: if the user isn't actually in the room
                //    (preview-only, never joined, already left), the SDK
                //    raises a 404 which we swallow and log as 'skipped'.
                let kickStatus = 'attempted';
                let kickError = null;
                const room = stream.livekit_room || stream.id;

                try {
                    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
                    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
                    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

                    if (!apiKey || !apiSecret || !livekitUrl) {
                        kickStatus = 'skipped';
                        kickError = 'LiveKit not configured';
                    } else {
                        // RoomServiceClient takes the SERVER url (https), not the
                        // wss:// client URL. Substitute scheme.
                        const httpUrl = livekitUrl
                            .replace(/^wss:\/\//, 'https://')
                            .replace(/^ws:\/\//, 'http://');

                        const { RoomServiceClient } = await import('livekit-server-sdk');
                        const rs = new RoomServiceClient(httpUrl, apiKey, apiSecret);

                        try {
                            await rs.removeParticipant(String(room), String(target_user_id));
                            kickStatus = 'succeeded';
                        } catch (rmErr) {
                            // 404 = participant not in the room (already left
                            // or never joined). Other errors (network, auth)
                            // bubble up as 'failed' so we can investigate.
                            const msg = rmErr?.message || String(rmErr);
                            if (msg.includes('not_found') || msg.includes('404')) {
                                kickStatus = 'skipped';
                                kickError = 'not_in_room';
                            } else {
                                kickStatus = 'failed';
                                kickError = msg.slice(0, 500);
                            }
                        }
                    }
                } catch (sdkErr) {
                    kickStatus = 'failed';
                    kickError = (sdkErr?.message || String(sdkErr)).slice(0, 500);
                }

                // 3. Audit log — non-fatal if it fails.
                try {
                    await supabase.from('live_ban_audit').insert({
                        stream_id,
                        banned_user_id: target_user_id,
                        banned_by: user.id,
                        livekit_kick_status: kickStatus,
                        livekit_kick_error: kickError,
                    });
                } catch (auditErr) {
                    console.warn('[live/moderate] ban_audit insert failed:', auditErr?.message || auditErr);
                }

                return res.json({
                    success: true,
                    action: 'ban_user',
                    livekit_kick_status: kickStatus,
                });
            }

            case 'unban_user': {
                if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
                await supabase.from('live_bans')
                    .delete()
                    .eq('stream_id', stream_id)
                    .eq('banned_user_id', target_user_id);
                return res.json({ success: true, action: 'unban_user' });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}. Use: delete_comment, pin_comment, unpin_comment, ban_user, unban_user` });
        }
    } catch (err) {
        console.warn('[/api/live/moderate] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
