/**
 * POST /api/live/heartbeat
 *
 * HARDENING: Broadcaster keepalive — independent of StreamPreviewCapture.
 * Called by LiveStreamService._startBroadcasterHeartbeat() every 60s while
 * a broadcast is active. Updates preview_updated_at so the stale-cleanup
 * cron (300s threshold) never mistakenly kills a stream whose tab is in the
 * background (preview capture may pause on backgrounded tabs in some browsers).
 *
 * Why this matters:
 *   - StreamPreviewCapture uses MediaRecorder + canvas which can be throttled
 *     or paused by the browser when the tab is backgrounded.
 *   - A backgrounded broadcaster is still streaming via LiveKit; only the
 *     local recording + preview capture pauses. Without this keepalive the
 *     stale-cleanup would kill an active stream because preview_updated_at
 *     stopped updating, even though the streamer's LiveKit connection is fine.
 *   - This route runs a simple UPDATE using the service role key so it
 *     succeeds regardless of RLS column-level restrictions.
 *
 * Security:
 *   - Requires valid auth session (broadcaster must be logged in).
 *   - Only updates streams where broadcaster_id matches auth.uid() — the
 *     service role write still enforces business logic equality in the WHERE.
 *   - Rate-limited to prevent abuse.
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

  // Rate limit — read class (cheap single SQL write, idempotent)
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  // Auth required — only the actual broadcaster can ping their own stream
  const { user } = await getServerUserWithFallback(req, supabase);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { stream_id } = req.body || {};
  if (!stream_id || typeof stream_id !== 'string') {
    return res.status(400).json({ error: 'stream_id required' });
  }

  try {
    // Update preview_updated_at ONLY for streams this user owns AND that are
    // still live. The WHERE broadcaster_id check prevents one user from
    // keeping another user's stale stream alive.
    const { error } = await supabase
      .from('live_streams')
      .update({ preview_updated_at: new Date().toISOString() })
      .eq('id', stream_id)
      .eq('broadcaster_id', user.id)
      .eq('status', 'live');

    if (error) {
      console.warn('[live/heartbeat] update error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ success: true, stream_id, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[live/heartbeat] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
