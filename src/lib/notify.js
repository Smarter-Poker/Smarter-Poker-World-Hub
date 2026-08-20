/**
 * notify.js -- SERVER ONLY. THE master notification gateway.
 *
 * PepNationLab parity clone (2026-08-19 handoff). One call fires BOTH pipelines:
 *   Branch A: INSERT into public.notifications  -> Supabase Realtime -> header
 *             bell rings via useUnreadCount's postgres_changes channel.
 *   Branch B: enqueuePush() -> push_outbox + inline VAPID web push -> phone.
 *
 * DESIGN RULE 1: feature code calls notify() (or a typed helper below), never
 * raw INSERTs into notifications, never enqueuePush() directly. That keeps the
 * audit trail unified and the two pipelines in lockstep.
 *
 * DESIGN RULE 6: never throws. A notification failure must never break the
 * primary operation (a hand finishing, a message sending).
 *
 * smarter.poker ADAPTATIONS vs the PepNationLab original:
 *   - The notifications table already existed here with columns
 *     (title, message, data, action_url, link, read, is_read). We write those,
 *     not the PNL (title, body, url) shape. read_at is kept in sync by the
 *     trg_sync_notification_read_state DB trigger.
 *   - In-memory API caches (feed + unread count) must be invalidated on every
 *     insert or the header badge serves stale data for up to its TTL.
 */

import { enqueuePush } from './push/push-enqueue';

// Lazy so importing notify.js from a non-API context can't explode on the
// pages/api module graph. These modules only hold in-memory Maps + handlers.
function invalidateCaches(userId) {
    try {
        // eslint-disable-next-line global-require
        const { invalidateFeedCache } = require('../../pages/api/notifications/feed');
        if (typeof invalidateFeedCache === 'function') invalidateFeedCache(userId);
    } catch { /* cache module unavailable -- harmless */ }
    try {
        // eslint-disable-next-line global-require
        const { invalidateUnreadCache } = require('../../pages/api/notifications/unread-count');
        if (typeof invalidateUnreadCache === 'function') invalidateUnreadCache(userId);
    } catch { /* harmless */ }
}

const TITLE_MAX = 120;
const BODY_MAX = 500;

/**
 * Fire a notification through both pipelines.
 *
 * @param {object} supabase  service-role Supabase client
 * @param {object} args {
 *   userId    -- recipient auth.users id (required)
 *   type      -- notifications.type value (see src/lib/push/push-prefs.js)
 *   title     -- short heading (<=120 chars)
 *   body      -- longer text (<=500 chars) -> notifications.message
 *   url       -- deep link -> notifications.action_url + push click target
 *   data      -- optional jsonb payload -> notifications.data
 *   actorId   -- optional actor -> notifications.actor_id
 *   withPush  -- default true. false = in-app bell only (design rule 2:
 *                one event = one push; features that already push set false)
 *   tag       -- push replacement/dedup tag
 *   event     -- push gate key override (defaults to `type`)
 *   requireInteraction, actions, relatedEntityId -- push extras
 * }
 * @returns {Promise<{ ok, notificationId, push }>}  never throws
 */
export async function notify(supabase, args = {}) {
    const out = { ok: false, notificationId: null, push: null };
    if (!supabase || !args.userId || !args.type || !args.title) {
        // Silently dropping notifications is how a feature "works on my machine"
        // and never fires in production. Say something.
        console.warn('[notify] dropped -- missing required field:', {
            hasClient: Boolean(supabase),
            userId: args.userId || null,
            type: args.type || null,
            title: args.title || null,
        });
        return out;
    }

    const title = String(args.title).slice(0, TITLE_MAX);
    const body = args.body ? String(args.body).slice(0, BODY_MAX) : null;
    const url = args.url || null;
    const wantsPush = args.withPush !== false;

    // Stamp how push was handled for this row. The DB trigger
    // fn_mirror_notification_to_push_outbox mirrors every UNMARKED notification
    // into push_outbox -- that bridge is what makes the 21 API routes and the
    // friend-request DB triggers push-enabled without touching them. Rows that
    // came through here are already decided, so they must carry a marker:
    //   'inline' -> enqueuePush below is handling it (mirroring = double send)
    //   'none'   -> caller passed withPush:false and means it (bell only)
    const notifData = { ...(args.data || {}), _push: wantsPush ? 'inline' : 'none' };

    // -- Branch A: in-app bell ------------------------------------------------
    try {
        const { data, error } = await supabase
            .from('notifications')
            .insert({
                user_id: args.userId,
                type: args.type,
                title,
                message: body,
                // Both columns: `action_url` is what this gateway has always
                // written, `link` is what older readers in the repo expect.
                // The feed coalesces them, but anything reading `.link`
                // directly would otherwise get null.
                action_url: url,
                link: url,
                data: notifData,
                actor_id: args.actorId || null,
                read: false,
                is_read: false,
            })
            .select('id')
            .maybeSingle();
        if (error) {
            console.warn('[notify] notifications insert failed:', error.message);
        } else {
            out.notificationId = data?.id || null;
            out.ok = true;
            invalidateCaches(args.userId);
        }
    } catch (e) {
        console.warn('[notify] notifications insert threw:', e?.message || e);
    }

    // -- Branch B: web push ---------------------------------------------------
    if (wantsPush) {
        try {
            out.push = await enqueuePush(supabase, {
                userId: args.userId,
                title,
                body: body || '',
                url: url || '/hub',
                event: args.event || args.type,
                tag: args.tag,
                // Identity beats decoration: an avatar as the icon makes a push
                // recognisable on a lock screen in a way the app name never is.
                icon: args.icon,
                image: args.image,
                requireInteraction: args.requireInteraction,
                actions: args.actions,
                relatedEntityId: args.relatedEntityId,
            });
            // NOTE: deliberately does NOT set out.ok. `ok` means the in-app
            // notification row landed. A push that was correctly suppressed by
            // the user's own preferences is not a failure, and a push that
            // succeeded does not make a failed bell insert a success.
        } catch (e) {
            console.warn('[notify] enqueuePush threw:', e?.message || e);
        }
    }

    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPED HELPERS -- call these from API routes. Poker-domain equivalents of the
// PepNationLab order/commission helpers.
// ═══════════════════════════════════════════════════════════════════════════

export function notifyNewMessage(supabase, recipientId, senderName, preview, conversationId, senderAvatarUrl) {
    return notify(supabase, {
        userId: recipientId,
        type: 'new_message',
        title: `Message from ${senderName}`,
        body: preview,
        url: conversationId ? `/hub/messenger?c=${conversationId}` : '/hub/messenger',
        tag: conversationId ? `msg-${conversationId}` : 'msg',
        // The sender's avatar, not the app logo. On a lock screen the face is
        // what tells you whether this is worth opening; "Smarter Poker" on every
        // notification tells you nothing. Falls back to the default icon when
        // the profile has no avatar.
        icon: senderAvatarUrl || undefined,
        data: { conversationId },
    });
}

export function notifyFriendRequest(supabase, recipientId, requesterName, requesterId) {
    return notify(supabase, {
        userId: recipientId,
        type: 'friend_request',
        title: 'New friend request',
        body: `${requesterName} wants to connect`,
        url: '/hub/friends',
        actorId: requesterId,
    });
}

export function notifyFriendAccepted(supabase, recipientId, accepterName, accepterId) {
    return notify(supabase, {
        userId: recipientId,
        type: 'friend_accept',
        title: 'Friend request accepted',
        body: `${accepterName} accepted your request`,
        url: '/hub/friends',
        actorId: accepterId,
    });
}

export function notifyTournamentStarting(supabase, userId, tournamentName, startsInMinutes, url) {
    return notify(supabase, {
        userId,
        type: 'tournament_starting',
        title: 'Tournament starting',
        body: `${tournamentName} begins in ${startsInMinutes} minutes`,
        url: url || '/hub/tournaments',
        // Per-tournament: a constant tag would make a second tournament's
        // alert silently replace the first on the lock screen.
        tag: `tournament-start:${tournamentName || 'any'}`,
        requireInteraction: true,
    });
}

export function notifyLateRegClosing(supabase, userId, tournamentName, url) {
    return notify(supabase, {
        userId,
        type: 'late_reg_closing',
        title: 'Late registration closing',
        body: `Last call to enter ${tournamentName}`,
        url: url || '/hub/tournaments',
        tag: `late-reg:${tournamentName || 'any'}`,
    });
}

export function notifyTableInvite(supabase, userId, inviterName, tableName, url) {
    return notify(supabase, {
        userId,
        type: 'table_invite',
        title: 'Table invite',
        body: `${inviterName} invited you to ${tableName}`,
        url: url || '/hub/club-arena/',
    });
}

export function notifySeatOpen(supabase, userId, tableName, url) {
    return notify(supabase, {
        userId,
        type: 'seat_open',
        title: 'Your seat is ready',
        body: `A seat opened at ${tableName}`,
        url: url || '/hub/club-arena/',
        requireInteraction: true,
        tag: `seat-open:${tableName || 'any'}`,
    });
}

export function notifyClubAnnouncement(supabase, userId, clubName, preview, url) {
    return notify(supabase, {
        userId,
        type: 'club_announcement',
        title: `${clubName} announcement`,
        body: preview,
        url: url || '/hub/club-arena/',
    });
}

export function notifyDiamondsReceived(supabase, userId, amount, fromName) {
    return notify(supabase, {
        userId,
        type: 'diamond_received',
        title: 'Diamonds received',
        body: fromName ? `${fromName} sent you ${Number(amount).toLocaleString()} diamonds` : `${Number(amount).toLocaleString()} diamonds landed in your account`,
        url: '/hub/diamond-store',
    });
}

export function notifyBonus(supabase, userId, title, body, url) {
    return notify(supabase, {
        userId,
        type: 'bonus',
        title: title || 'Bonus unlocked',
        body: body || '',
        url: url || '/hub',
    });
}

export function notifyAchievement(supabase, userId, achievementName, url) {
    return notify(supabase, {
        userId,
        type: 'achievement',
        title: 'Achievement unlocked',
        body: achievementName,
        url: url || '/hub/club-arena/',
    });
}

export function notifyDailyChallenge(supabase, userId, title, body) {
    return notify(supabase, {
        userId,
        type: 'daily_challenge',
        title: title || 'Daily challenges are live',
        body: body || 'A fresh set of challenges just dropped',
        url: '/hub/club-arena/',
        tag: 'daily-challenge', // constant on purpose: one per day, collapsing is correct
    });
}

export function notifyVip(supabase, userId, title, body) {
    return notify(supabase, {
        userId,
        type: 'vip',
        title,
        body: body || '',
        url: '/hub/promotions',
    });
}

export function notifyLiveStarted(supabase, userId, streamerName, url) {
    return notify(supabase, {
        userId,
        type: 'live',
        title: `${streamerName} is live`,
        body: 'Tap to watch the stream',
        url: url || '/hub/lives',
        tag: `live:${streamerName || 'any'}`,
    });
}

export function notifyVenueAlert(supabase, userId, title, body, url) {
    return notify(supabase, {
        userId,
        type: 'venue_alert',
        title,
        body: body || '',
        url: url || '/hub/poker-near-me',
    });
}

export function notifySystem(supabase, userId, title, body, url) {
    return notify(supabase, {
        userId,
        type: 'system',
        title,
        body: body || '',
        url: url || '/hub',
    });
}

/**
 * Fan out to every admin ('admin' or 'god' role). Used by push-health and
 * platform alerts. skipUserIds avoids self-notifying the triggering admin.
 */
export async function notifyAdmins(supabase, { type = 'system', title, body, url, skipUserIds = [] } = {}) {
    try {
        const { data: admins, error } = await supabase
            .from('profiles')
            .select('id')
            .in('role', ['admin', 'god'])
            .limit(50);
        if (error || !admins) return { ok: false, sent: 0 };
        const skip = new Set(skipUserIds);
        let sent = 0;
        for (const a of admins) {
            if (skip.has(a.id)) continue;
            // Sequential on purpose: 50 admins max, and parallel fan-out here can
            // exhaust the Supabase connection pool inside a hot API route.
            // eslint-disable-next-line no-await-in-loop
            await notify(supabase, { userId: a.id, type, title, body, url });
            sent += 1;
        }
        return { ok: true, sent };
    } catch (e) {
        console.warn('[notify] notifyAdmins threw:', e?.message || e);
        return { ok: false, sent: 0 };
    }
}

export default notify;
