/**
 * GET /api/cron/live-reminders
 * Sends reminder notifications for scheduled lives starting in the next 15 minutes.
 * Runs every 5 minutes via Open Claw dispatcher.
 *
 * Flow:
 *  1. Query scheduled_lives WHERE scheduled_at is between NOW and NOW + 15 min
 *  2. For each, get broadcaster's followers
 *  3. Insert reminder notifications (respecting live_notifications pref)
 *  4. Mark the scheduled live as "reminded" to prevent duplicates
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (auth !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // BUG-FIX-DEEP-AUDIT-R2 LR-1: at the top of every tick, cull
    // scheduled_lives rows whose scheduled_at is more than 24h in the
    // past. They never made it onto the reminder window (the cron only
    // looks at `[now, now+15min]`) but they accumulate in the table
    // and clutter `/api/live/schedule` GETs for the broadcaster (and
    // any pre-`gte(now())`-filter consumer). One RPC, no per-row work,
    // so it's safe to run on every 5-minute tick.
    try {
      const { error: cleanupErr } = await supabase.rpc('fn_cleanup_stale_scheduled_lives');
      if (cleanupErr) {
        console.warn('[live-reminders] cleanup_stale_scheduled_lives:', cleanupErr.message);
      }
    } catch (cleanupThrow) {
      console.warn(
        '[live-reminders] cleanup_stale_scheduled_lives threw:',
        cleanupThrow?.message || cleanupThrow
      );
    }

    const now = new Date();
    const fifteenMinLater = new Date(now.getTime() + 15 * 60 * 1000);

    // Get scheduled lives starting soon that haven't been reminded
    const { data: upcoming, error } = await supabase
      .from('scheduled_lives')
      .select('id, broadcaster_id, title, scheduled_at')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', fifteenMinLater.toISOString())
      .is('reminded_at', null);

    if (error) throw error;
    if (!upcoming?.length) {
      return res.json({ success: true, reminded: 0 });
    }

    let totalNotified = 0;

    for (const sched of upcoming) {
      // STREAM-POLISH-R3 REMINDER-1: atomic claim BEFORE sending.
      // Previously we sent notifications then updated reminded_at;
      // a concurrent cron tick (or a retry after a partial failure)
      // could both see reminded_at IS NULL and both fire the
      // inserts — duplicate 'starting soon' notifications.
      //
      // Now: claim the row via WHERE reminded_at IS NULL. If
      // .select() returns 0 rows, another tick already grabbed it;
      // skip this schedule. If 1 row, we own the send.
      const { data: claimed, error: claimErr } = await supabase
        .from('scheduled_lives')
        .update({ reminded_at: now.toISOString() })
        .eq('id', sched.id)
        .is('reminded_at', null)
        .select('id');
      if (claimErr) {
        console.warn('[live-reminders] claim failed for', sched.id, claimErr.message);
        continue;
      }
      if (!claimed || claimed.length === 0) {
        // Another tick already claimed this schedule — skip.
        continue;
      }

      // Get broadcaster display name
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', sched.broadcaster_id)
        .maybeSingle();

      const displayName = profile?.username || profile?.full_name || 'Someone you follow';

      // Get followers
      const { data: followers } = await supabase
        .from('social_follows')
        .select('follower_id')
        .eq('following_id', sched.broadcaster_id);

      if (!followers?.length) continue;

      // Check preferences
      const followerIds = followers.map((f) => f.follower_id);
      const { data: prefs } = await supabase
        .from('user_notification_preferences')
        .select('user_id, live_notifications')
        .in('user_id', followerIds);

      const prefMap = {};
      (prefs || []).forEach((p) => {
        prefMap[p.user_id] = p.live_notifications;
      });
      const eligible = followers.filter((f) => prefMap[f.follower_id] !== false);

      if (!eligible.length) continue;

      // Calculate minutes until stream
      const minutesUntil = Math.round((new Date(sched.scheduled_at) - now) / 60000);

      // STREAM-POLISH-R3 REMINDER-2: include scheduled_live_id in
      // data so clients can dedup + deep-link to the specific live.
      const notifications = eligible.map((f) => ({
        user_id: f.follower_id,
        type: 'live_reminder',
        title: 'Starting Soon',
        message: `${displayName} goes live in ${minutesUntil} minutes: ${sched.title || 'Live Stream'}`,
        link: `/hub/lives`,
        actor_id: sched.broadcaster_id,
        read: false,
        data: { scheduled_live_id: sched.id, broadcaster_id: sched.broadcaster_id },
      }));

      const CHUNK = 50;
      for (let i = 0; i < notifications.length; i += CHUNK) {
        await supabase.from('notifications').insert(notifications.slice(i, i + CHUNK));
      }

      totalNotified += eligible.length;
    }

    return res.json({
      success: true,
      schedules_processed: upcoming.length,
      reminded: totalNotified,
    });
  } catch (err) {
    console.warn('[live-reminders] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
