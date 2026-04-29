/**
 * /api/notifications/* — Hono catch-all router (Phase 4.4 module #18, 2026-04-28)
 *
 * Consolidates 15 notification handlers under a single Hono app. The largest
 * module so far in terms of auth-tier diversity:
 *
 *   - 8 routes use getServerUserWithFallback (standard JWT)
 *   - 2 cron routes use Bearer ${CRON_SECRET} header
 *   - 1 admin route uses Bearer ${ONESIGNAL_REST_API_KEY:0:20} header
 *   - 1 OneSignal-link route adds an extra user.id === userId guard on
 *     top of the standard JWT auth (link-user)
 *   - 1 IP-rate-limited route with no user auth (prompt-status)
 *   - send.js has a dual-tier auth: x-admin-secret OR Bearer JWT (with
 *     broadcast restrictions on the JWT path)
 *
 * Routes (mounted at /api/notifications):
 *   GET    /feed                  — unified social+poker notif feed (15s cache)
 *   GET    /list                  — service-role social-only list
 *   GET    /unread-count          — count badge (30s cache)
 *   POST   /delete                — batch delete by ids[] or single id
 *   DELETE /delete                — same handler
 *   POST   /follow                — record new_follow notification
 *   POST   /mark-read             — mark single/batch/all as read
 *   POST   /live-notify           — fan-out to followers when going live
 *   POST   /track-tour            — toggle tour subscription
 *   POST   /geofence-alert        — proximity push w/ in-mem 4h dedup
 *   POST   /send                  — generic OneSignal send (admin or JWT-restricted)
 *   POST   /link-user             — link Supabase userId to OneSignal playerId
 *   POST   /import-users          — admin-only batch import to OneSignal
 *   GET|POST /game-threshold-cron — Vercel cron handler
 *   GET|POST /late-reg-cron       — Vercel cron handler
 *   GET    /prompt-status         — IP-based prompt dismiss check
 *   POST   /prompt-status         — IP-based prompt response record
 *
 * Replaces 15 source files totalling 1927 LOC.
 *
 * Cross-handler in-memory state:
 *   - feed cache (15s TTL) — invalidated by mark-read + delete via the
 *     `_feedCache` Map that lives at module scope. Previously feed.js
 *     exported invalidateFeedCache() and mark-read.js imported it. Now
 *     they share the same Map directly.
 *   - unread-count cache (30s TTL).
 *   - geofence rate-limit (4h per user:venue).
 *   - prompt-status IP rate-limit (10/min).
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { createClient as createPlainSupabase } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sendPushNotification } from '../../../src/lib/onesignal-server';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// ─── Cached Supabase service-role client ──────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

// ─── Cross-handler caches ─────────────────────────────────────────────────
const FEED_CACHE_TTL_MS = 15_000;
const _feedCache = new Map(); // userId → { payload, expiresAt }

function invalidateFeedCache(userId) {
  _feedCache.delete(userId);
}
function setCachedFeed(userId, payload) {
  _feedCache.set(userId, { payload, expiresAt: Date.now() + FEED_CACHE_TTL_MS });
  if (_feedCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of _feedCache) {
      if (v.expiresAt < now) _feedCache.delete(k);
      if (_feedCache.size <= 500) break;
    }
  }
}
function getCachedFeed(userId) {
  const entry = _feedCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _feedCache.delete(userId); return null; }
  return entry.payload;
}

// Unread-count cache (30s)
const UNREAD_CACHE_TTL_MS = 30_000;
const _unreadCache = new Map();

// Geofence rate-limit (4h per user:venue, in-process)
const GEOFENCE_RATE_LIMIT_MS = 4 * 60 * 60 * 1000;
const _geofenceRateLimit = new Map();

// Prompt-status per-IP rate-limit (10 / 60s)
const _promptRateLimit = new Map();
const PROMPT_RATE_WINDOW_MS = 60_000;
const PROMPT_RATE_MAX = 10;
function getClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  return fwd ? String(fwd).split(',')[0].trim() : (req.socket?.remoteAddress || 'unknown');
}
function isPromptRateLimited(ip) {
  const now = Date.now();
  const entry = _promptRateLimit.get(ip);
  if (!entry || now - entry.windowStart > PROMPT_RATE_WINDOW_MS) {
    _promptRateLimit.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > PROMPT_RATE_MAX;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/notifications');

// Soft auth middleware — sets user if present, never 401s.
app.use('*', async (c, next) => {
  const req = c.env?.req;
  const supabase = getSupabase();
  c.set('supabase', supabase);
  try {
    const { user } = await getServerUserWithFallback(req, supabase);
    c.set('user', user || null);
  } catch {
    c.set('user', null);
  }
  await next();
});

// ─── Middleware factories ────────────────────────────────────────────────
const requireUser = async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Auth required' }, 401);
  await next();
};

const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

const readLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.read)) {
    return c.body(null, 429);
  }
  await next();
};

const requireCronSecret = async (c, next) => {
  if (process.env.CRON_SECRET) {
    const auth = c.req.header('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }
  await next();
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /unread-count
// ═══════════════════════════════════════════════════════════════════════════
app.get('/unread-count', readLimit, requireUser, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const now = Date.now();

  const cached = _unreadCache.get(user.id);
  if (cached && now - cached.ts < UNREAD_CACHE_TTL_MS) {
    return c.json({ count: cached.count, cached: true });
  }

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .or('read.eq.false,is_read.eq.false');

  if (error) {
    console.warn('[notifications/unread-count] DB error:', error.message);
    return c.json({ error: 'Failed to fetch count' }, 500);
  }

  const unread = count || 0;
  _unreadCache.set(user.id, { count: unread, ts: now });
  return c.json({ count: unread, cached: false });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /list
// ═══════════════════════════════════════════════════════════════════════════
const VALID_NOTIFICATION_TYPES = new Set([
  'like', 'comment', 'mention', 'reply', 'friend_request', 'friend_accept', 'friend_accepted',
  'new_follow', 'home_group_friend_joined', 'home_group_announcement', 'home_game_new',
  'home_game_update', 'home_game_invite', 'venue_claim_approved', 'venue_claim_rejected',
  'system', 'achievement', 'bonus', 'tournament', 'training', 'trivia', 'live',
  'poker_news', 'poker_hand', 'daily_challenge', 'diamond', 'vip',
]);

app.get('/list', requireUser, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  c.header('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

  const limit = parseInt(c.req.query('limit') || '50', 10);
  const blockedParam = c.req.query('blocked');
  const blockedTypes = blockedParam
    ? blockedParam.split(',').map((t) => t.trim()).filter((t) => VALID_NOTIFICATION_TYPES.has(t))
    : [];

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (blockedTypes.length > 0) {
    query = query.not('type', 'in', `(${blockedTypes.join(',')})`);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[notifications/list] error:', error);
    return c.json({ success: true, notifications: [] });
  }

  return c.json({ success: true, notifications: data || [], count: (data || []).length });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /feed — unified social + poker notification feed
// ═══════════════════════════════════════════════════════════════════════════
app.get('/feed', requireUser, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const userId = user.id;
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const bustCache = c.req.query('bust') === '1';

  if (!bustCache) {
    const cached = getCachedFeed(userId);
    if (cached) {
      c.header('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
      c.header('X-Cache', 'HIT');
      return c.json(cached);
    }
  }

  try {
    const [socialResult, followsResult] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, type, title, message, data, read, is_read, created_at, user_id, actor_id, action_url, link')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('page_followers')
        .select('page_type, page_id')
        .eq('user_id', userId)
        .limit(100),
    ]);

    const socialNotifs = (socialResult.data || []).map((n) => ({ ...n, _source: 'social' }));

    let pokerNotifs = [];
    if (followsResult.data && followsResult.data.length > 0) {
      const orConditions = followsResult.data
        .map((f) => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`)
        .join(',');

      const { data: pageNotifRows } = await supabase
        .from('page_notifications')
        .select('*')
        .or(orConditions)
        .order('created_at', { ascending: false })
        .limit(30);

      if (pageNotifRows && pageNotifRows.length > 0) {
        const allIds = pageNotifRows.map((n) => n.id);
        const { data: reads } = await supabase
          .from('notification_reads')
          .select('notification_id')
          .eq('user_id', userId)
          .in('notification_id', allIds)
          .limit(100);
        const readSet = new Set((reads || []).map((r) => r.notification_id));
        pokerNotifs = pageNotifRows.map((pn) => ({
          id: 'poker-' + pn.id,
          user_id: userId,
          title: pn.title || 'Page Update',
          message: pn.message || pn.content || '',
          type: pn.notification_type || 'page_update',
          read: readSet.has(pn.id),
          created_at: pn.created_at,
          data: { page_type: pn.page_type, page_id: pn.page_id },
          _source: 'poker',
          actor_name: pn.title || 'Page Update',
          actor_avatar_url: null,
          actor_username: null,
        }));
      }
    }

    const combined = [...socialNotifs, ...pokerNotifs]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 60);

    // Resolve real group names for home_group_* notifications
    const groupIds = [...new Set(
      combined
        .filter((n) => n.type === 'home_group_friend_joined' || n.type === 'home_group_announcement')
        .map((n) => n.data?.group_id)
        .filter((id) => id && typeof id === 'string' && id.match(/^[0-9a-f-]{36}$/i))
    )];

    const groupNameById = {};
    if (groupIds.length > 0) {
      const { data: groups } = await supabase
        .from('commander_home_groups')
        .select('id, name')
        .in('id', groupIds)
        .limit(100);
      (groups || []).forEach((g) => { groupNameById[g.id] = g.name || null; });
    }

    // Enrich with actor profiles
    const actorIds = [...new Set(
      socialNotifs
        .map((n) => n.actor_id || n.data?.actor_id || n.data?.sender_id || n.data?.friend_id)
        .filter(Boolean)
    )];
    const actorNames = [...new Set(
      socialNotifs
        .filter((n) => !n.data?.actor_id && !n.data?.sender_id && !n.data?.friend_id)
        .map((n) => {
          const twoWord = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
          if (twoWord) return twoWord[1];
          const oneWord = n.title?.match(/^([A-Za-z][A-Za-z0-9_]+)/);
          return oneWord ? oneWord[1] : null;
        })
        .filter(Boolean)
    )];

    const profileById = {};
    const profileByName = {};
    if (actorIds.length > 0 || actorNames.length > 0) {
      const [byIdResult, byNameResult] = await Promise.all([
        actorIds.length > 0
          ? supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', actorIds).limit(50)
          : Promise.resolve({ data: [] }),
        actorNames.length > 0
          ? supabase.from('profiles').select('id, username, full_name, avatar_url').in('full_name', actorNames).limit(50)
          : Promise.resolve({ data: [] }),
      ]);
      (byIdResult.data || []).forEach((p) => { profileById[p.id] = p; });
      (byNameResult.data || []).forEach((p) => {
        if (p.full_name) profileByName[p.full_name.toLowerCase()] = p;
      });
    }

    const enriched = combined.map((n) => {
      if (n._source === 'poker') return n;
      const actorId = n.actor_id || n.data?.actor_id || n.data?.sender_id || n.data?.friend_id;
      const profile = actorId
        ? profileById[actorId]
        : (() => {
            const twoWord = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
            const key = twoWord?.[1] ?? n.title?.match(/^([A-Za-z][A-Za-z0-9_]+)/)?.[1];
            return key ? profileByName[key.toLowerCase()] : null;
          })();
      const displayName = n.data?.actor_name || n.data?.sender_name
        || n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/)?.[1] || n.title;

      let message = n.message;
      if ((n.type === 'home_group_friend_joined' || n.type === 'home_group_announcement') && n.data?.group_id) {
        const realGroupName = groupNameById[n.data.group_id];
        message = realGroupName
          ? `Your friend is now in ${realGroupName} — check it out`
          : 'Your friend joined a Home Game — check it out';
      }

      return {
        ...n,
        message,
        link: n.link || n.action_url || null,
        actor_avatar_url: profile?.avatar_url || null,
        actor_name: displayName,
        actor_username: profile?.username || null,
      };
    });

    const totalUnread = enriched.filter((n) => !n.read).length;
    const payload = { success: true, notifications: enriched, totalUnread };
    setCachedFeed(userId, payload);

    c.header('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
    c.header('X-Cache', 'MISS');
    return c.json(payload);
  } catch (err) {
    console.warn('[notifications/feed] Error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// /delete (POST and DELETE)
// ═══════════════════════════════════════════════════════════════════════════
const deleteHandler = async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Auth required' }, 401);
  const supabase = c.get('supabase');

  let body = {};
  try { body = await c.req.json(); } catch { /* default */ }
  const { id, ids } = body;
  const rawIds = ids || (id ? [id] : []);
  const deleteIds = rawIds.filter((v) => v && typeof v === 'string' && v.trim().length > 0);

  if (!deleteIds.length) {
    return c.json({ success: false, error: 'No notification id(s) provided' }, 400);
  }
  if (deleteIds.length > 100) {
    return c.json({ success: false, error: 'Too many IDs (max 100)' }, 400);
  }

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .in('id', deleteIds);

  if (error) {
    console.warn('[notifications/delete] error:', error);
    return c.json({ success: false, error: 'Failed to delete' }, 500);
  }

  // Invalidate caches so next /feed and /unread-count return fresh data.
  invalidateFeedCache(user.id);
  _unreadCache.delete(user.id);

  return c.json({ success: true, deleted: deleteIds.length });
};

app.post('/delete', deleteHandler);
app.delete('/delete', deleteHandler);

// ═══════════════════════════════════════════════════════════════════════════
// POST /follow
// ═══════════════════════════════════════════════════════════════════════════
app.post('/follow', requireUser, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { followingUserId } = body;

  if (!followingUserId) return c.json({ success: false, error: 'followingUserId required' }, 400);
  if (followingUserId === user.id) return c.json({ success: true, skipped: true });

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = profile?.username || profile?.full_name || user.email?.split('@')[0] || 'Someone';

  const { error } = await supabase.from('notifications').insert({
    user_id: followingUserId,
    type: 'new_follow',
    title: displayName,
    message: 'started following you',
    actor_id: user.id,
    link: `/hub/user/${profile?.username || user.id}`,
    data: { follower_id: user.id },
  });

  if (error) {
    console.warn('[notifications/follow] insert error:', error);
    return c.json({ success: false, error: 'Failed to create notification' }, 500);
  }

  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /mark-read
// ═══════════════════════════════════════════════════════════════════════════
app.post('/mark-read', writeLimit, requireUser, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { notificationId, ids } = body;

  try {
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safeIds = ids.filter((id) => typeof id === 'string' && uuidRe.test(id)).slice(0, 200);
      if (safeIds.length > 0) {
        await supabase
          .from('notifications')
          .update({ read: true, is_read: true })
          .in('id', safeIds)
          .eq('user_id', user.id);
      }
    } else if (notificationId) {
      await supabase
        .from('notifications')
        .update({ read: true, is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('notifications')
        .update({ read: true, is_read: true })
        .eq('user_id', user.id)
        .eq('read', false);
    }

    invalidateFeedCache(user.id);
    _unreadCache.delete(user.id);
    return c.json({ success: true });
  } catch (err) {
    console.warn('[notifications/mark-read]', err);
    return c.json({ error: 'Failed to mark notifications' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /live-notify — fan out to followers when going live
// ═══════════════════════════════════════════════════════════════════════════
app.post('/live-notify', requireUser, async (c) => {
  const user = c.get('user');
  // Live-notify uses a direct service-role client (parity with original)
  const supabaseAdmin = createPlainSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const body = await c.req.json().catch(() => ({}));
  const { streamId, title } = body;
  if (!streamId) return c.json({ error: 'streamId required' }, 400);

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username, full_name')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = profile?.username || profile?.full_name || 'Someone you follow';

  const { data: followers, error } = await supabaseAdmin
    .from('social_follows')
    .select('follower_id')
    .eq('following_id', user.id);

  if (error || !followers?.length) return c.json({ notified: 0 });

  const followerIds = followers.map((f) => f.follower_id);
  const { data: prefs } = await supabaseAdmin
    .from('user_notification_preferences')
    .select('user_id, live_notifications')
    .in('user_id', followerIds);

  const prefMap = {};
  (prefs || []).forEach((p) => { prefMap[p.user_id] = p.live_notifications; });

  const eligible = followers.filter((f) => prefMap[f.follower_id] !== false);
  if (!eligible.length) return c.json({ notified: 0 });

  const notifications = eligible.map((f) => ({
    user_id: f.follower_id,
    type: 'live',
    title: 'Live Now',
    message: `${displayName} is live: ${title || 'Live Stream'}`,
    link: `/hub/lives?id=${streamId}`,
    actor_id: user.id,
    read: false,
  }));

  const CHUNK = 50;
  for (let i = 0; i < notifications.length; i += CHUNK) {
    await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + CHUNK));
  }

  return c.json({ notified: eligible.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /track-tour
// ═══════════════════════════════════════════════════════════════════════════
app.post('/track-tour', writeLimit, requireUser, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { tour } = body;

  if (!tour) return c.json({ success: false, error: 'tour parameter is required' }, 400);

  try {
    const { data: prefs, error: fetchErr } = await supabase
      .from('user_notification_preferences')
      .select('tracked_tours')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;

    let currentTours = prefs?.tracked_tours || [];
    let isNowTracking = false;
    if (currentTours.includes(tour)) {
      currentTours = currentTours.filter((t) => t !== tour);
    } else {
      currentTours.push(tour);
      isNowTracking = true;
    }

    const { error: upsertErr } = await supabase
      .from('user_notification_preferences')
      .upsert(
        { user_id: user.id, tracked_tours: currentTours, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (upsertErr) throw upsertErr;

    return c.json({ success: true, tour, isTracking: isNowTracking, tracked_tours: currentTours });
  } catch (err) {
    console.warn('[notifications/track-tour]', err);
    return c.json({ success: false, error: 'Internal server error processing tour tracking' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /geofence-alert — proximity push, in-mem 4h dedup per (user, venue)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/geofence-alert', requireUser, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { userId, venueId, venueName, venueType } = body;

  if (!userId || !venueId || !venueName) {
    return c.json({ success: false, error: 'Missing required fields: userId, venueId, venueName' }, 400);
  }
  if (user.id !== userId) {
    return c.json({ success: false, error: 'Cannot send geofence alerts for other users' }, 403);
  }
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return c.json({ success: false, error: 'Push notifications not configured' }, 503);
  }

  const rateLimitKey = `${userId}:${venueId}`;
  const lastSent = _geofenceRateLimit.get(rateLimitKey);
  if (lastSent && Date.now() - lastSent < GEOFENCE_RATE_LIMIT_MS) {
    return c.json({ success: false, error: 'Rate limited — already notified for this venue recently' }, 429);
  }

  const venueEmoji = {
    casino: '🎲',
    card_room: '♠️',
    poker_club: '🃏',
    charity: '🎗️',
  }[venueType] || '📍';

  const pushResult = await sendPushNotification({
    externalIds: [userId],
    heading: `${venueEmoji} Poker Venue Nearby`,
    content: `You're near ${venueName}! Tap to log a session.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/hub/bankroll-manager?venue=${venueId}`,
    collapseId: `geofence-${venueId}`,
    data: {
      type: 'geofence_alert',
      venueId,
      venueName,
      venueType,
      timestamp: new Date().toISOString(),
    },
    options: {
      ttl: 3600,
      small_icon: 'ic_stat_notification',
      chrome_web_icon: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/icons/icon-192.png`,
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
      android_channel_id: process.env.ONESIGNAL_GEOFENCE_CHANNEL_ID || undefined,
    },
  });

  if (pushResult.success) {
    _geofenceRateLimit.set(rateLimitKey, Date.now());
    if (_geofenceRateLimit.size > 2000) {
      const now = Date.now();
      for (const [key, ts] of _geofenceRateLimit.entries()) {
        if (now - ts > GEOFENCE_RATE_LIMIT_MS) _geofenceRateLimit.delete(key);
      }
      if (_geofenceRateLimit.size > 5000) _geofenceRateLimit.clear();
    }
    return c.json({ success: true, messageId: pushResult.result.id });
  }

  console.warn('[notifications/geofence-alert] OneSignal error:', pushResult.error);
  return c.json({ success: false, error: pushResult.error || 'OneSignal push failed' }, 500);
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /send — generic OneSignal send (admin secret OR JWT-restricted)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/send', writeLimit, async (c) => {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return c.json({ success: false, error: 'OneSignal not configured' }, 500);
  }

  const adminSecret = c.req.header('x-admin-secret');
  const envSecret = process.env.ADMIN_ROUTE_SECRET;
  const hasAdminAuth = envSecret && adminSecret === envSecret;

  const body = await c.req.json().catch(() => ({}));

  if (!hasAdminAuth) {
    const user = c.get('user');
    if (!user) return c.json({ success: false, error: 'Invalid token' }, 401);

    const { segments, playerIds, externalUserIds, tags } = body;
    if (segments || tags || (playerIds && playerIds.length > 5) || (externalUserIds && externalUserIds.length > 5)) {
      return c.json({ success: false, error: 'Broadcast notifications require admin access' }, 403);
    }
    if (!externalUserIds?.length && !playerIds?.length) {
      return c.json({ success: false, error: 'Must specify target user(s) for notification' }, 400);
    }
  }

  const {
    title, message, url, segments, playerIds, externalUserIds, tags,
    data, buttons, image, isCall, callType, roomName, callerId, category,
  } = body;

  if (!message) return c.json({ success: false, error: 'Message is required' }, 400);

  // Honour user opt-outs by category
  let finalExternalUserIds = externalUserIds;
  if (category && finalExternalUserIds?.length > 0) {
    const supabase = c.get('supabase');
    const { data: prefs } = await supabase
      .from('user_notification_preferences')
      .select(`user_id, ${category}`)
      .in('user_id', finalExternalUserIds);

    if (prefs) {
      const optedOut = new Set(prefs.filter((p) => p[category] === false).map((p) => p.user_id));
      finalExternalUserIds = finalExternalUserIds.filter((id) => !optedOut.has(id));
      if (finalExternalUserIds.length === 0) {
        return c.json({ success: true, message: 'Notification skipped: all target users opted out.', skipped: true });
      }
    }
  }

  const notification = {
    app_id: ONESIGNAL_APP_ID,
    contents: { en: message },
    headings: title ? { en: title } : undefined,
    url: url || undefined,
    web_url: url || undefined,
    chrome_web_link: url || undefined,
    data: data || undefined,
    buttons: buttons || undefined,
    big_picture: image || undefined,
  };

  if (isCall) {
    notification.data = {
      ...notification.data,
      isCall: true,
      callType: callType || 'voice',
      roomName: roomName || '',
      callerId: callerId || '',
    };
    notification.priority = 10;
    notification.android_visibility = 1;
    notification.android_sound = 'ringtone';
    notification.android_channel_id = '80694c07-ed3b-4016-9525-083b5f59d812';
    notification.ttl = 120;
    notification.ios_sound = 'ringtone.wav';
    notification.ios_interruption_level = 'time-sensitive';
    notification.ios_relevance_score = 1.0;
    notification.web_push_topic = `call-${callerId}`;
    notification.chrome_web_badge = '/icons/call-badge.png';
    notification.buttons = [
      { id: 'accept', text: '✓ Accept', icon: 'ic_call_accept' },
      { id: 'decline', text: '✗ Decline', icon: 'ic_call_decline' },
    ];
    notification.web_buttons = [
      { id: 'accept', text: '✓ Accept', url: url || 'https://smarter.poker/hub/messenger' },
      { id: 'decline', text: '✗ Decline', url: 'https://smarter.poker/hub' },
    ];
  } else {
    notification.ios_sound = 'default';
    notification.android_sound = 'default';
    notification.android_channel_id = null;
    notification.priority = 10;
    notification.android_visibility = 1;
    notification.ios_badgeType = 'Increase';
    notification.ios_badgeCount = 1;
  }

  if (playerIds && playerIds.length > 0) {
    notification.include_player_ids = playerIds;
  } else if (finalExternalUserIds && finalExternalUserIds.length > 0) {
    notification.include_aliases = { external_id: finalExternalUserIds };
    notification.target_channel = 'push';
  } else if (tags) {
    notification.filters = tags;
  } else if (segments && segments.length > 0) {
    notification.included_segments = segments;
  } else {
    notification.included_segments = ['Subscribed Users'];
  }

  const response = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(notification),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.warn('[notifications/send] OneSignal error:', result);
    return c.json(
      { error: result?.errors?.[0] || 'Failed to send notification', details: result },
      response.status
    );
  }

  return c.json({ success: true, notificationId: result.id, recipients: result.recipients });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /link-user — link Supabase userId ↔ OneSignal playerId
//   Auth via shared middleware + extra user.id === userId guard so a
//   logged-in user cannot link a OneSignal player to someone else's account.
// ═══════════════════════════════════════════════════════════════════════════
app.post('/link-user', async (c) => {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return c.json({ success: false, error: 'OneSignal not configured' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const { playerId, userId } = body;
  if (!playerId || !userId) {
    return c.json({ success: false, error: 'playerId and userId are required' }, 400);
  }

  const user = c.get('user');
  if (!user) return c.json({ success: false, error: 'Invalid token' }, 401);
  if (user.id !== userId) {
    return c.json({ success: false, error: 'Cannot link notifications for another user' }, 403);
  }

  const response = await fetch(`https://onesignal.com/api/v1/players/${playerId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({ app_id: ONESIGNAL_APP_ID, external_user_id: userId }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn('[notifications/link-user] OneSignal error:', result);
    return c.json(
      { error: result?.errors?.[0] || 'Failed to link user', details: result },
      response.status
    );
  }

  return c.json({ success: true, message: 'User linked to OneSignal' });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /import-users — admin-only batch import of profiles to OneSignal
// ═══════════════════════════════════════════════════════════════════════════
app.post('/import-users', writeLimit, async (c) => {
  const expected = ONESIGNAL_REST_API_KEY?.slice(0, 20);
  const auth = c.req.header('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return c.json({ success: false, error: 'OneSignal not configured' }, 500);
  }

  const supabase = c.get('supabase');
  const { data: users, error: fetchError } = await supabase
    .from('profiles')
    .select('id, username, email, player_number, skill_tier, state, created_at')
    .order('player_number', { ascending: true })
    .limit(100);

  if (fetchError) {
    console.warn('[notifications/import-users] fetch error:', fetchError);
    return c.json({ success: false, error: 'Failed to fetch users' }, 500);
  }

  const batchSize = 100;
  const imported = [];
  const errors = [];

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    for (const user of batch) {
      try {
        const response = await fetch('https://onesignal.com/api/v1/players', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            device_type: 5,
            external_user_id: user.id,
            tags: {
              username: user.username || '',
              email: user.email || '',
              player_number: user.player_number?.toString() || '',
              skill_tier: user.skill_tier || 'Newcomer',
              state: user.state || '',
              registered: 'true',
            },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          imported.push({ userId: user.id, username: user.username, oneSignalId: result.id });
        } else {
          errors.push({ userId: user.id, username: user.username, error: result?.errors?.[0] || 'Unknown error' });
        }
      } catch (err) {
        errors.push({ userId: user.id, username: user.username, error: err.message });
      }
    }

    if (i + batchSize < users.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return c.json({
    success: true,
    totalUsers: users.length,
    imported: imported.length,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /game-threshold-cron (GET + POST) — Vercel cron
// ═══════════════════════════════════════════════════════════════════════════
const gameThresholdHandler = async (c) => {
  const supabase = c.get('supabase');
  try {
    const { data: alerts, error } = await supabase
      .from('user_pwa_alerts')
      .select(`
        id,
        user_id,
        venue_id,
        threshold,
        last_triggered_at,
        users:user_id ( id, onesignal_player_id )
      `)
      .eq('alert_type', 'table_size')
      .eq('is_active', true);

    if (error) throw error;
    if (!alerts || alerts.length === 0) {
      return c.json({ success: true, processed: 0, message: 'No active table_size alerts to process' });
    }

    const venueIds = [...new Set(alerts.map((a) => a.venue_id).filter(Boolean))];
    const { data: venues, error: vErr } = await supabase
      .from('poker_venues')
      .select('id, name, active_tables')
      .in('id', venueIds);
    if (vErr) throw vErr;

    const alertsByVenue = {};
    for (const alert of alerts) {
      const venue = venues?.find((v) => v.id === alert.venue_id);
      const playerId = alert.users?.onesignal_player_id;
      if (!venue || !playerId) continue;
      const liveTablesCount = venue.active_tables || 0;

      let canTrigger = true;
      if (alert.last_triggered_at) {
        const diffMs = new Date() - new Date(alert.last_triggered_at);
        if (diffMs < 240 * 60000) canTrigger = false;
      }

      if (canTrigger && liveTablesCount >= alert.threshold) {
        if (!alertsByVenue[venue.id]) {
          alertsByVenue[venue.id] = { venue, liveTablesCount, targets: [] };
        }
        alertsByVenue[venue.id].targets.push({ playerId, alertId: alert.id });
      }
    }

    let processedCount = 0;
    let errorsCount = 0;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (const { venue, liveTablesCount, targets } of Object.values(alertsByVenue)) {
      const chunkSize = 2000;
      for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize);
        const chunkPlayerIds = chunk.map((t) => t.playerId);
        const chunkAlertIds = chunk.map((t) => t.alertId);

        const pushResult = await sendPushNotification({
          playerIds: chunkPlayerIds,
          heading: 'Game Size Alert! 🎯',
          content: `${venue.name} just hit your threshold with ${liveTablesCount} active tables.`,
          url: `https://smarter.poker/hub/venues/${encodeURIComponent(venue.name)}`,
        });

        if (pushResult.success) {
          await supabase.from('user_pwa_alerts')
            .update({ last_triggered_at: new Date().toISOString() })
            .in('id', chunkAlertIds);
          processedCount += chunkPlayerIds.length;
        } else {
          errorsCount += chunkPlayerIds.length;
        }

        await sleep(250);
      }
    }

    return c.json({ success: true, processed: processedCount, errors: errorsCount });
  } catch (e) {
    console.warn('[notifications/game-threshold-cron] FAILED', e);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
};

app.get('/game-threshold-cron', requireCronSecret, gameThresholdHandler);
app.post('/game-threshold-cron', requireCronSecret, gameThresholdHandler);

// ═══════════════════════════════════════════════════════════════════════════
// /late-reg-cron (GET + POST) — Vercel cron
// ═══════════════════════════════════════════════════════════════════════════
const lateRegHandler = async (c) => {
  const supabase = c.get('supabase');
  try {
    const { data: alerts, error } = await supabase
      .from('user_pwa_alerts')
      .select(`
        id,
        user_id,
        tournament_id,
        users:user_id ( id, onesignal_player_id )
      `)
      .eq('alert_type', 'late_reg')
      .eq('is_active', true);

    if (error) throw error;
    if (!alerts || alerts.length === 0) {
      return c.json({ success: true, processed: 0, message: 'No active late_reg alerts to process' });
    }

    const tournamentIds = [...new Set(alerts.map((a) => a.tournament_id).filter(Boolean))];
    const { data: tournaments, error: tErr } = await supabase
      .from('venue_daily_tournaments')
      .select('id, tournament_name, venue_name, start_time, event_date')
      .in('id', tournamentIds);
    if (tErr) throw tErr;

    const alertsByTournament = {};
    for (const alert of alerts) {
      const tournament = tournaments?.find((t) => t.id === alert.tournament_id);
      const playerId = alert.users?.onesignal_player_id;
      if (!tournament || !playerId) continue;

      const tourneyDate = new Date(`${tournament.event_date}T${tournament.start_time || '00:00:00'}`);
      const nowEtStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hourCycle: 'h23' });
      const nowEt = new Date(nowEtStr);
      const diffMins = Math.floor((tourneyDate - nowEt) / 60000);
      const isLateRegWindow = diffMins > -150 && diffMins <= 60;

      if (isLateRegWindow) {
        if (!alertsByTournament[tournament.id]) {
          alertsByTournament[tournament.id] = { tournament, targets: [] };
        }
        alertsByTournament[tournament.id].targets.push({ playerId, alertId: alert.id });
      }
    }

    let processedCount = 0;
    let errorsCount = 0;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (const { tournament, targets } of Object.values(alertsByTournament)) {
      const chunkSize = 2000;
      for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize);
        const chunkPlayerIds = chunk.map((t) => t.playerId);
        const chunkAlertIds = chunk.map((t) => t.alertId);

        const pushResult = await sendPushNotification({
          playerIds: chunkPlayerIds,
          heading: 'Late Registration Alert! ⏳',
          content: `${tournament.tournament_name} at ${tournament.venue_name} is in or approaching late registration.`,
          url: `https://smarter.poker/hub/venues/${encodeURIComponent(tournament.venue_name)}`,
        });

        if (pushResult.success) {
          await supabase.from('user_pwa_alerts')
            .update({ last_triggered_at: new Date().toISOString(), is_active: false })
            .in('id', chunkAlertIds);
          processedCount += chunkPlayerIds.length;
        } else {
          errorsCount += chunkPlayerIds.length;
        }

        await sleep(250);
      }
    }

    return c.json({ success: true, processed: processedCount, errors: errorsCount });
  } catch (e) {
    console.warn('[notifications/late-reg-cron] FAILED', e);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
};

app.get('/late-reg-cron', requireCronSecret, lateRegHandler);
app.post('/late-reg-cron', requireCronSecret, lateRegHandler);

// ═══════════════════════════════════════════════════════════════════════════
// /prompt-status (GET + POST) — IP-based, no user auth
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_PROMPT_ACTIONS = ['yes', 'no', 'dismissed', 'subscribed', 'denied', 'granted'];
function sanitizeAction(action) {
  if (!action || typeof action !== 'string') return 'dismissed';
  const clean = action.toLowerCase().trim().slice(0, 20);
  return ALLOWED_PROMPT_ACTIONS.includes(clean) ? clean : 'dismissed';
}
function isValidUuid(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

let _promptTableChecked = false;
let _promptTableExists = false;
async function ensurePromptTable(supabase) {
  if (_promptTableChecked) return _promptTableExists;
  try {
    const { error } = await supabase.from('notification_prompt_log').select('id').limit(1);
    _promptTableChecked = true;
    if (!error) {
      _promptTableExists = true;
      return true;
    }
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      _promptTableExists = false;
      return false;
    }
    _promptTableExists = true;
    return true;
  } catch {
    _promptTableChecked = true;
    return false;
  }
}

app.get('/prompt-status', async (c) => {
  const req = c.env?.req;
  const ip = getClientIp(req || {});
  if (isPromptRateLimited(ip)) return c.json({ error: 'Too many requests' }, 429);

  const supabase = c.get('supabase');
  try {
    const { data, error } = await supabase
      .from('notification_prompt_log')
      .select('id')
      .eq('ip_address', ip)
      .limit(1);
    if (error) return c.json({ dismissed: false });
    return c.json({ dismissed: data && data.length > 0 });
  } catch (err) {
    console.warn('[notifications/prompt-status] GET exception:', err);
    return c.json({ dismissed: false });
  }
});

app.post('/prompt-status', writeLimit, async (c) => {
  const req = c.env?.req;
  const ip = getClientIp(req || {});
  if (isPromptRateLimited(ip)) return c.json({ error: 'Too many requests' }, 429);

  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const cleanAction = sanitizeAction(body.action);
  const cleanUserId = isValidUuid(body.user_id) ? body.user_id : null;

  try {
    const exists = await ensurePromptTable(supabase);
    if (!exists) return c.json({ ok: true, note: 'table_pending' });

    const { data: existing } = await supabase
      .from('notification_prompt_log')
      .select('id')
      .eq('ip_address', ip)
      .limit(1);

    if (existing && existing.length > 0) {
      return c.json({ ok: true, already_recorded: true });
    }

    const { error } = await supabase
      .from('notification_prompt_log')
      .insert({
        ip_address: ip,
        user_id: cleanUserId,
        action: cleanAction,
        responded_at: new Date().toISOString(),
      });

    if (error) {
      if (error.code === '23505') return c.json({ ok: true, already_recorded: true });
      console.warn('[notifications/prompt-status] POST insert error:', error.message);
      return c.json({ ok: false });
    }
    return c.json({ ok: true });
  } catch (err) {
    console.warn('[notifications/prompt-status] POST exception:', err);
    return c.json({ ok: false });
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[notifications] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[notifications] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
