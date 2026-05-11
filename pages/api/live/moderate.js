/**
 * POST /api/live/moderate
 * Server-side broadcaster moderation actions for live streams.
 *
 * Actions:
 *   - delete_comment: broadcaster deletes any comment in their stream
 *   - pin_comment:    broadcaster pins a comment (one at a time)
 *   - unpin_comment:  broadcaster unpins the current comment
 *   - ban_user:       broadcaster bans a viewer from commenting
 *   - unban_user:     broadcaster unbans a viewer
 *
 * All actions verify that the caller owns the stream before mutating.
 * Uses service-role to bypass RLS (so broadcasters can delete any commenter's row).
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

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { action, stream_id, comment_id, target_user_id } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });

    // For all moderation actions, verify the caller is the broadcaster
    if (!stream_id) return res.status(400).json({ error: 'stream_id is required' });

    const { data: stream } = await supabase
        .from('live_streams')
        .select('id, broadcaster_id')
        .eq('id', stream_id)
        .maybeSingle();

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.broadcaster_id !== user.id) {
        return res.status(403).json({ error: 'Only the broadcaster can moderate this stream' });
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
                // belongs to this stream. Previously the broadcaster could
                // pin any comment_id from any stream — the upsert went
                // through and showed in their stream's pin slot. With the
                // check, pinning is scoped to comments authored against
                // this stream only. Mirrors the delete_comment guard.
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
                await supabase.from('live_bans').upsert({
                    stream_id,
                    banned_user_id: target_user_id,
                    banned_by: user.id,
                }, { onConflict: 'stream_id,banned_user_id' });
                return res.json({ success: true, action: 'ban_user' });
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
