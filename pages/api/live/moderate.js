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
  const isCoHost =
    !isBroadcaster &&
    COMMENT_MOD_ACTIONS.has(action) &&
    guest_invite_code &&
    stream.guest_invite_code === guest_invite_code;

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
        await supabase.from('live_pins').upsert(
          {
            stream_id,
            comment_id,
            pinned_by: user.id,
          },
          { onConflict: 'stream_id' }
        );
        return res.json({ success: true, action: 'pin_comment' });
      }

      case 'unpin_comment': {
        await supabase.from('live_pins').delete().eq('stream_id', stream_id);
        return res.json({ success: true, action: 'unpin_comment' });
      }

      case 'ban_user': {
        if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
        if (target_user_id === user.id)
          return res.status(400).json({ error: 'Cannot ban yourself' });

        // 1. Insert the ban row (existing behavior — blocks future
        //    comments/reactions via RLS + ban-check in /api/live/*).
        // MOD-1 FIX: check upsert error and return 500 BEFORE attempting the
        // LiveKit kick — kicking without a persisted ban row would evict the
        // user from the current session but allow immediate re-entry via a
        // fresh token request (no ban row to block them).
        const { error: banUpsertErr } = await supabase.from('live_bans').upsert(
          {
            stream_id,
            banned_user_id: target_user_id,
            banned_by: user.id,
          },
          { onConflict: 'stream_id,banned_user_id' }
        );
        if (banUpsertErr) {
          console.warn('[live/moderate] live_bans upsert error:', banUpsertErr.message);
          return res.status(500).json({ error: `Failed to persist ban: ${banUpsertErr.message}` });
        }

        // 2. BUG-FIX-DEEP-AUDIT-R3 M-3 + STREAM-POLISH-R2 BAN-1:
        //    kick the banned user from the LiveKit room immediately.
        //
        //    STREAM-POLISH-R2 BAN-1 — the original M-3 fix assumed
        //    one identity per user (bare String(user_id)), but the
        //    Bug-5 fix (PR #395) changed authenticated viewer
        //    identities to `<user_id>:vw-<8-char-random>` so the
        //    same user can watch from multiple devices. A bare
        //    removeParticipant(user_id) call now 404s on the viewer
        //    path — the ban row is written but the user keeps
        //    streaming for up to 8h (token TTL).
        //
        //    Fix: listParticipants and remove ALL identities for
        //    this user — the bare `user_id` (broadcaster/guest
        //    flow, unlikely for a ban but legal) AND every
        //    `<user_id>:vw-*` (each device the viewer is watching
        //    from). Banning is per-user, so all their devices
        //    must be evicted.
        let kickStatus = 'attempted';
        let kickError = null;
        let kickedCount = 0;
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
            const roomStr = String(room);
            const userIdStr = String(target_user_id);
            const viewerPrefix = `${userIdStr}:vw-`;

            // Enumerate participants and find every identity
            // that maps to target_user_id (bare + any vw-* suffix).
            let participants = [];
            try {
              participants = await rs.listParticipants(roomStr);
            } catch (listErr) {
              const lmsg = listErr?.message || String(listErr);
              // If the room itself doesn't exist (stream not
              // joined yet), treat as skipped.
              if (lmsg.includes('not_found') || lmsg.includes('404')) {
                kickStatus = 'skipped';
                kickError = 'room_not_found';
              } else {
                kickStatus = 'failed';
                kickError = `list_failed: ${lmsg.slice(0, 400)}`;
              }
            }

            if (kickStatus === 'attempted') {
              const matches = (participants || []).filter((p) => {
                const id = p?.identity || '';
                return id === userIdStr || id.startsWith(viewerPrefix);
              });

              if (matches.length === 0) {
                kickStatus = 'skipped';
                kickError = 'not_in_room';
              } else {
                const failures = [];
                for (const p of matches) {
                  try {
                    await rs.removeParticipant(roomStr, p.identity);
                    kickedCount += 1;
                  } catch (rmErr) {
                    const msg = rmErr?.message || String(rmErr);
                    // 404 here = race (already left between
                    // list + remove). Don't count as failure.
                    if (!msg.includes('not_found') && !msg.includes('404')) {
                      failures.push(`${p.identity}: ${msg.slice(0, 120)}`);
                    }
                  }
                }
                if (failures.length > 0) {
                  kickStatus = 'failed';
                  kickError = failures.join(' | ').slice(0, 500);
                } else {
                  kickStatus = 'succeeded';
                }
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
          livekit_kicked_count: kickedCount,
        });
      }

      case 'unban_user': {
        if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
        await supabase
          .from('live_bans')
          .delete()
          .eq('stream_id', stream_id)
          .eq('banned_user_id', target_user_id);
        return res.json({ success: true, action: 'unban_user' });
      }

      default:
        return res
          .status(400)
          .json({
            error: `Unknown action: ${action}. Use: delete_comment, pin_comment, unpin_comment, ban_user, unban_user`,
          });
    }
  } catch (err) {
    console.warn('[/api/live/moderate] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
