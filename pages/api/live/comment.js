/**
 * POST /api/live/comment
 * Server-side live comment insertion.
 *
 * Eliminates client-side author_name spoofing: the author_name is ALWAYS
 * resolved from profiles.username on the server — never trusted from the
 * client request body.
 *
 * Also enforces:
 * - Authentication (no anonymous comments)
 * - Ban check (user banned from this stream → 403)
 * - Slow mode (user sent a comment within slow_mode_delay seconds → 429)
 * - Text length cap (max 300 chars)
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_COMMENT_LENGTH = 300;
const DEFAULT_SLOW_MODE_DELAY_SECS = 3;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { stream_id, text } = req.body;
    if (!stream_id || typeof text !== 'string') {
        return res.status(400).json({ error: 'stream_id and text are required' });
    }
    const trimmed = text.trim();
    if (!trimmed) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (trimmed.length > MAX_COMMENT_LENGTH) {
        return res.status(400).json({ error: `Comment too long (max ${MAX_COMMENT_LENGTH} chars)` });
    }

    try {
        // 1. Load stream — verify it exists and is live
        const { data: stream, error: streamErr } = await supabase
            .from('live_streams')
            // BUG FIX (CMT-2): slow_mode_delay column does not exist on live_streams.
            // Removed from SELECT — slow mode falls back to DEFAULT_SLOW_MODE_DELAY_SECS (3s).
            //
            // BUG-FIX-DEEP-AUDIT-R2 C-3: add ended_at so we can enforce a
            // real 60s grace window. The previous comment claimed "60s grace"
            // but no timestamp gate was implemented — comments on ended
            // streams were accepted indefinitely.
            .select('id, status, slow_mode, ended_at')
            .eq('id', stream_id)
            .maybeSingle();

        if (streamErr || !stream) return res.status(404).json({ error: 'Stream not found' });

        // BUG FIX (CMT-1) + BUG-FIX-DEEP-AUDIT-R2 C-3: allow comments while
        // live, plus a 60s grace window after ended_at to absorb the race
        // between EndStream API setting status='ended' and viewers who are
        // still watching. Beyond 60s, the stream is closed for comments.
        const POST_END_GRACE_MS = 60_000;
        if (stream.status === 'ended') {
            const endedAtMs = stream.ended_at ? new Date(stream.ended_at).getTime() : 0;
            const sinceEnded = endedAtMs ? Date.now() - endedAtMs : Infinity;
            if (sinceEnded > POST_END_GRACE_MS) {
                return res.status(400).json({ error: 'Stream has ended' });
            }
        } else if (stream.status !== 'live') {
            return res.status(400).json({ error: 'Stream has not started yet' });
        }

        // 2. Ban check — reject if user is banned from this stream
        const { data: ban } = await supabase
            .from('live_bans')
            .select('id')
            .eq('stream_id', stream_id)
            .eq('banned_user_id', user.id)
            .maybeSingle();
        if (ban) return res.status(403).json({ error: 'You are banned from commenting on this stream' });

        // 3. Slow mode check
        if (stream.slow_mode) {
            const delaySecs = DEFAULT_SLOW_MODE_DELAY_SECS; // slow_mode_delay column not on live_streams — use default
            const { data: recent } = await supabase
                .from('live_comments')
                .select('created_at')
                .eq('stream_id', stream_id)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (recent) {
                const lastSent = new Date(recent.created_at).getTime();
                const elapsedMs = Date.now() - lastSent;
                if (elapsedMs < delaySecs * 1000) {
                    const waitSecs = Math.ceil((delaySecs * 1000 - elapsedMs) / 1000);
                    return res.status(429).json({
                        error: `Slow mode: wait ${waitSecs}s before commenting again`,
                    });
                }
            }
        }

        // 4. Resolve author_name from profiles — NEVER trust the client
        const { data: profile } = await supabase
            .from('profiles')
            .select('username, full_name')
            .eq('id', user.id)
            .maybeSingle();

        const authorName = profile?.username || profile?.full_name || user.email?.split('@')[0] || 'Viewer';

        // 5. Insert comment with server-resolved author_name
        const { data: comment, error: insertErr } = await supabase
            .from('live_comments')
            .insert({
                stream_id,
                user_id: user.id,
                author_name: authorName, // Server-resolved — never from client body
                text: trimmed,
            })
            .select()
            .maybeSingle();

        if (insertErr) {
            console.warn('[/api/live/comment] Insert error:', insertErr.message);
            return res.status(500).json({ error: insertErr.message });
        }

        return res.json({ success: true, comment });
    } catch (err) {
        console.warn('[/api/live/comment] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
