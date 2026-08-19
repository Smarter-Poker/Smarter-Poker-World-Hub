/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Club Arena — Unified Notification Helper
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sends both:
 *   1. In-app notification (INSERT into notifications table)
 *   2. Push notification (via OneSignal /api/notifications/send)
 *
 * Usage:
 *   import { notifyUser, notifyClubAdmins } from '@/lib/club-arena/notify';
 *   await notifyUser(supabaseAdmin, { userId, type, title, message, data, pushUrl });
 *   await notifyClubAdmins(supabaseAdmin, { clubId, type, title, message, data });
 *
 * All notifications are fire-and-forget — errors are logged but never block
 * the main API response. Push failures don't prevent in-app notifications.
 */

// Operator precedence: the old form parsed as `(A || B) ? https://${VERCEL_URL} : ...`,
// so NEXT_PUBLIC_SITE_URL was never actually used, and if it was set while
// VERCEL_URL was not, BASE_URL became the literal string "https://undefined".
// VERCEL_URL is also the per-deployment host (subject to deployment protection),
// not the public alias, so the site URL must win when present.
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://smarter.poker');

/**
 * Send notification to a single user (in-app + push)
 */
export async function notifyUser(supabaseAdmin, {
  userId,
  type,            // e.g. 'chip_distribution', 'cashout_approved', 'tournament_start'
  title,
  message,
  data = {},       // { clubId, amount, clubName, ... }
  pushUrl = null,  // Deep link URL for push notification tap
  skipPush = false,
}) {
  if (!userId || !type || !title) return;

  // 1. In-app notification (Supabase insert)
  try {
    const { error: err_notifications_vrqj9 } = await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message: message || title,
      // _push marks this row as "push already decided here", so the DB trigger
      // fn_mirror_notification_to_push_outbox does NOT also mirror it. Without
      // the marker this function produced TWO pushes for one event: one from the
      // trigger mirroring the unmarked row, and one from the explicit
      // /api/notifications/send call below.
      data: { ...data, source: 'club_arena', _push: skipPush ? 'none' : 'inline' },
      read: false,
    });
    if (err_notifications_vrqj9) console.warn('[Supabase] Silent mutation failed in notifications:', err_notifications_vrqj9.message);
  } catch (e) {
    console.warn(`[notify] In-app insert failed for ${type}:`, e.message);
  }

  // 2. Push notification (OneSignal via internal API)
  if (!skipPush) {
    try {
      await fetch(`${BASE_URL}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
        },
        body: JSON.stringify({
          title,
          message: message || title,
          externalUserIds: [userId],
          url: pushUrl || `${BASE_URL}/hub/club-arena`,
          data: { ...data, source: 'club_arena', type },
        }),
      });
    } catch (e) {
      console.warn(`[notify] Push failed for ${type}:`, e.message);
    }
  }
}

/**
 * Send notification to all club admins/owners
 */
export async function notifyClubAdmins(supabaseAdmin, {
  clubId,
  type,
  title,
  message,
  data = {},
  pushUrl = null,
  excludeUserId = null,  // Don't notify the person who triggered the action
}) {
  if (!clubId || !type || !title) return;

  try {
    const { data: admins } = await supabaseAdmin
      .from('club_members')
      .select('user_id')
      .eq('club_id', clubId)
      .in('role', ['owner', 'admin']);

    if (!admins?.length) return;

    const targets = admins
      .map(a => a.user_id)
      .filter(id => id !== excludeUserId);

    await Promise.allSettled(
      targets.map(userId => notifyUser(supabaseAdmin, {
        userId, type, title, message,
        data: { ...data, clubId },
        pushUrl: pushUrl || `${BASE_URL}/hub/club-arena/admin?club=${clubId}`,
      }))
    );
  } catch (e) {
    console.warn(`[notify] notifyClubAdmins failed:`, e.message);
  }
}

/**
 * Send notification to a player's assigned agent
 */
export async function notifyAgent(supabaseAdmin, {
  clubId,
  playerId,        // The player whose agent should be notified
  type,
  title,
  message,
  data = {},
  pushUrl = null,
}) {
  if (!clubId || !playerId) return;

  try {
    // Find the player's assigned agent
    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('agent_id')
      .eq('club_id', clubId)
      .eq('user_id', playerId)
      .maybeSingle();

    if (!member?.agent_id) return;

    // agent_id stores user_id of the agent
    await notifyUser(supabaseAdmin, {
      userId: member.agent_id,
      type, title, message,
      data: { ...data, clubId, playerId },
      pushUrl: pushUrl || `${BASE_URL}/hub/club-arena/agent-dashboard?club=${clubId}`,
    });
  } catch (e) {
    console.warn(`[notify] notifyAgent failed:`, e.message);
  }
}

/**
 * Send notification to all members of a club (batch — for tournament starts, announcements)
 */
export async function notifyClubMembers(supabaseAdmin, {
  clubId,
  type,
  title,
  message,
  data = {},
  pushUrl = null,
  excludeUserId = null,
  maxRecipients = 200,  // Safety cap
}) {
  if (!clubId || !type || !title) return;

  try {
    const { data: members } = await supabaseAdmin
      .from('club_members')
      .select('user_id')
      .eq('club_id', clubId)
      .eq('status', 'active')
      .limit(maxRecipients);

    if (!members?.length) return;

    const targets = members
      .map(m => m.user_id)
      .filter(id => id !== excludeUserId);

    // In-app: batch insert
    const inserts = targets.map(userId => ({
      user_id: userId, type, title,
      message: message || title,
      data: { ...data, clubId, source: 'club_arena' },
      read: false,
    }));

    const { error: batchInsertErr } = await supabaseAdmin.from('notifications').insert(inserts);
    if (batchInsertErr) console.warn(`[notify] Batch insert failed:`, batchInsertErr.message);

    // Push: send to all via OneSignal (single call with multiple external IDs)
    try {
      await fetch(`${BASE_URL}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '',
        },
        body: JSON.stringify({
          title, message: message || title,
          externalUserIds: targets.slice(0, 2000), // OneSignal limit
          url: pushUrl || `${BASE_URL}/hub/club-arena?club=${clubId}`,
          data: { ...data, source: 'club_arena', type },
        }),
      });
    } catch (e) {
      console.warn(`[notify] Batch push failed:`, e.message);
    }
  } catch (e) {
    console.warn(`[notify] notifyClubMembers failed:`, e.message);
  }
}
