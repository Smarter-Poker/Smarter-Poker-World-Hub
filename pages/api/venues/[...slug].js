/**
 * /api/venues/* — Hono catch-all router (Phase 4.4 module #2, 2026-04-27)
 *
 * Consolidates 3 previously-separate handlers (checkin/record-geofence/reviews)
 * under a single Hono app. Same pattern as /api/calls/[...slug].js (Phase 4.4
 * pilot) — auth + rate-limit middleware moved out of per-route boilerplate.
 *
 * Routes (mounted at /api/venues):
 *   POST /checkin           — record a venue checkin (12h dedup window)
 *   POST /record-geofence   — geofence ping → push notification (12h cooldown)
 *   POST /reviews           — submit review (requires checkin), awards 50 diamonds
 *
 * Replaces:
 *   pages/api/venues/checkin.js          (64 LOC)
 *   pages/api/venues/record-geofence.js  (68 LOC)
 *   pages/api/venues/reviews.js          (110 LOC)
 *   = 242 LOC of boilerplate, now ~190 LOC with shared middleware.
 *
 * Auth pattern note (vs calls/* pilot):
 *   These handlers use `getServerUserWithFallback(req, supabase)` from
 *   `src/lib/serverAuth.js` — local HMAC verify first (Web Crypto, post-4.1d
 *   ESM-clean) with GoTrue network fallback if JWT secret missing. This is
 *   distinct from a direct `supabase.auth.getUser(token)` call and matches
 *   the post-4.1d ESM-clean pattern.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sendPushNotification } from '../../../src/lib/pushAlerts';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// ─── Helpers ──────────────────────────────────────────────────────────────
const safeBody = (v) => {
  if (Array.isArray(v)) return typeof v[0] === 'object' ? null : v[0];
  if (typeof v === 'string' || typeof v === 'number') return v;
  return v !== undefined ? String(v) : null;
};

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/venues');

// Shared middleware: rate-limit + auth (all venues routes are POST writes)
app.use('*', async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;

  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }

  try {
    const supabase = createClient();
    const { user: localUser } = await getServerUserWithFallback(req, supabase);
    if (!localUser) {
      return c.json({ success: false, error: 'Authorization required' }, 401);
    }
    c.set('user', localUser);
    c.set('supabase', supabase);
    await next();
  } catch (err) {
    console.warn('[venues] auth error:', err);
    return c.json({ success: false, error: 'Authorization required' }, 401);
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────

// POST /api/venues/checkin
app.post('/checkin', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const userId = user.id;

  const body = await c.req.json().catch(() => ({}));
  const venue_id = safeBody(body.venue_id);
  if (!venue_id) {
    return c.json({ success: false, error: 'venue_id required' }, 400);
  }

  try {
    const { data: recentCheckin } = await supabase
      .from('user_venue_checkins')
      .select('id, checkin_time')
      .eq('user_id', userId)
      .eq('venue_id', venue_id)
      .gte('checkin_time', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
      .order('checkin_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentCheckin) {
      return c.json({ success: true, message: 'Already checked in recently', checkin_id: recentCheckin.id });
    }

    const { data: newCheckin, error } = await supabase
      .from('user_venue_checkins')
      .insert({
        user_id: userId,
        venue_id: venue_id,
        checkin_time: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[Checkin API] Insert error:', error);
      return c.json({ success: false, error: 'Failed to record checkin' }, 500);
    }

    return c.json({ success: true, checkin_id: newCheckin.id });
  } catch (err) {
    console.warn('[venues/checkin] Error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/venues/record-geofence
const GEOFENCE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

app.post('/record-geofence', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const userId = user.id;

  const body = await c.req.json().catch(() => ({}));
  const venue_id = safeBody(body.venue_id);
  const venue_name = safeBody(body.venue_name);
  if (!venue_id) {
    return c.json({ success: false, error: 'venue_id required' }, 400);
  }

  try {
    const { data: recentCheckin } = await supabase
      .from('user_venue_checkins')
      .select('checkin_time')
      .eq('user_id', userId)
      .eq('venue_id', venue_id)
      .gte('checkin_time', new Date(Date.now() - GEOFENCE_COOLDOWN_MS).toISOString())
      .order('checkin_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentCheckin) {
      return c.json({ success: true, status: 'cooldown', msg: 'Cooldown period active' });
    }

    try {
      await sendPushNotification(userId, 'venue_alert', {
        title: 'At the poker table?',
        body: `Are you currently at ${venue_name || 'a saved venue'}? Tap to check in!`,
        url: `/hub/venues/${venue_id}`,
        data: { action: 'checkin', venueId: venue_id },
      });
    } catch (pushErr) {
      console.warn('[Record Geofence] Failed to send push:', pushErr);
    }

    return c.json({ success: true, message: 'Geofence ping recorded, push sent if opted in' });
  } catch (err) {
    console.warn('[venues/record-geofence] Error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/venues/reviews
app.post('/reviews', async (c) => {
  const user = c.get('user');
  const userId = user.id;

  const body = await c.req.json().catch(() => ({}));
  const venue_id = safeBody(body.venueId);
  const rating = safeBody(body.rating);
  const title = safeBody(body.title);
  const text = safeBody(body.body);
  if (!venue_id || !rating) {
    return c.json({ success: false, error: 'venueId and rating required' }, 400);
  }

  try {
    // Use service-role client for diamond updating (RLS bypass)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseKey) throw new Error('No service role key');
    const { createClient: createSupClient } = require('@supabase/supabase-js');
    const adminSupabase = createSupClient(supabaseUrl, supabaseKey);

    const { data: checkin, error: checkinErr } = await adminSupabase
      .from('user_venue_checkins')
      .select('id, review_completed')
      .eq('user_id', userId)
      .eq('venue_id', venue_id)
      .eq('review_completed', false)
      .order('checkin_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkinErr || !checkin) {
      return c.json({ success: false, error: 'You must check-in to this venue and wait 6 hours before reviewing.' }, 403);
    }

    const { error: reviewErr } = await adminSupabase
      .from('venue_reviews')
      .insert({
        user_id: userId,
        venue_id: venue_id,
        rating: rating,
        title: title || '',
        text: text || '',
      });

    if (reviewErr) {
      console.warn('[Venue Reviews] Insert error:', reviewErr);
      return c.json({ success: false, error: 'Failed to insert review' }, 500);
    }

    await adminSupabase
      .from('user_venue_checkins')
      .update({ review_completed: true })
      .eq('id', checkin.id);

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('diamonds')
      .eq('id', userId)
      .maybeSingle();

    const currentDiamonds = profile?.diamonds || 0;
    await adminSupabase
      .from('profiles')
      .update({ diamonds: currentDiamonds + 50 })
      .eq('id', userId);

    const venueReq = await adminSupabase.from('venues').select('name').eq('id', venue_id).maybeSingle();
    const venueName = venueReq.data?.name || 'Venue';
    await adminSupabase
      .from('diamond_transactions')
      .insert({
        user_id: userId,
        type: 'earn',
        amount: 50,
        description: `Venue Review for ${venueName}`,
      });

    return c.json({ success: true, message: 'Review saved, 50 diamonds awarded!' });
  } catch (err) {
    console.warn('[venues/reviews] Error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
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
      console.warn('[venues] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[venues] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
