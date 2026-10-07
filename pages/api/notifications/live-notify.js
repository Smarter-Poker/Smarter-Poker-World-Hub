/**
 * POST /api/notifications/live-notify
 * Notifies followers when a user goes live.
 * Uses service-role client so it can insert notifications (RLS bypassed server-side).
 * Respects follower's user_notification_preferences.live_notifications setting.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// Rule 4: API routes use the patched server client, created lazily (never at
// module scope during SSG), exactly as the neighbouring notification routes do.
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// STREAM-POLISH-R2 PUSH-1: dedup window. Followers who already received
// a 'live' notification for this stream_id in the last DEDUP_WINDOW_MS
// won't be re-notified. Catches: flaky network double-fetch, button-tap
// races, broadcaster ending + restarting within seconds, server-side
// retries from the client. 24h is enough to cover a single broadcast
// session even after several disconnect/reconnect cycles.
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // STREAM-POLISH-R2 PUSH-2: rate-limit. Sibling /api/live/* routes
  // all use LIMITS.write; live-notify was the lone outlier with no
  // limiter — a compromised account could spam every follower of
  // every broadcaster they imitate.
  if (!applyRateLimit(req, res, LIMITS.write)) return;

  try {
    const supabaseAdmin = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabaseAdmin);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { streamId, title } = req.body;
    if (!streamId) return res.status(400).json({ error: 'streamId required' });

    // Get broadcaster display name
    // LN-1 FIX: include display_name in the select and at the front of the
    // priority chain — matches the platform-wide convention of
    // display_name > username > fallback. full_name is owner-only and is
    // never written into a notification other people read.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const displayName =
      profile?.display_name || profile?.username || 'Someone you follow';

    // Get all followers
    const { data: followers, error } = await supabaseAdmin
      .from('social_follows')
      .select('follower_id')
      .eq('following_id', user.id);

    if (error || !followers?.length) {
      return res.status(200).json({ notified: 0 });
    }

    // Fetch notification preferences for all followers
    const followerIds = followers.map((f) => f.follower_id);
    const { data: prefs } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('user_id, live_notifications')
      .in('user_id', followerIds);

    // Build preference map; default true if row missing
    const prefMap = {};
    (prefs || []).forEach((p) => {
      prefMap[p.user_id] = p.live_notifications;
    });

    // Filter out followers who opted out
    let eligible = followers.filter((f) => prefMap[f.follower_id] !== false);

    if (!eligible.length) return res.status(200).json({ notified: 0 });

    // STREAM-POLISH-R2 PUSH-1: dedup against the same stream_id in
    // the last DEDUP_WINDOW_MS. Skips followers who already received
    // a 'live' notification for this exact stream.
    const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const eligibleIds = eligible.map((f) => f.follower_id);
    const { data: alreadyNotified } = await supabaseAdmin
      .from('notifications')
      .select('user_id')
      .eq('type', 'live')
      .filter('data->>stream_id', 'eq', String(streamId))
      .gte('created_at', dedupCutoff)
      .in('user_id', eligibleIds);
    const alreadySet = new Set((alreadyNotified || []).map((n) => n.user_id));
    if (alreadySet.size > 0) {
      eligible = eligible.filter((f) => !alreadySet.has(f.follower_id));
    }
    if (!eligible.length) return res.status(200).json({ notified: 0, deduped: alreadySet.size });

    // Batch insert notifications in chunks of 50
    const notifications = eligible.map((f) => ({
      user_id: f.follower_id,
      type: 'live',
      title: 'Live Now',
      message: `${displayName} is live: ${title || 'Live Stream'}`,
      link: `/hub/lives?id=${streamId}`,
      actor_id: user.id,
      read: false,
      data: { stream_id: streamId, actor_avatar: profile?.avatar_url || null },
    }));

    const CHUNK = 50;
    for (let i = 0; i < notifications.length; i += CHUNK) {
      const { error: err_notifications_ca7e3 } = await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + CHUNK));
      if (err_notifications_ca7e3) console.warn('[Supabase] Silent mutation failed in notifications:', err_notifications_ca7e3.message);
    }

    return res.status(200).json({ notified: eligible.length });
  } catch (err) {
    console.warn('[live-notify] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
