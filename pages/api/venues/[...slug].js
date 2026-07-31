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
 *   These handlers use `getServerUserWithFallback(req, supabase)` instead of
 *   direct `getServerUserWithFallback(req, supabase)`. The fallback path does local HMAC
 *   verify before falling back to GoTrue network call, matching the post-4.1d
 *   ESM-clean pattern.
 */

import { Hono } from 'hono';
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

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Shared middleware: rate-limit + auth (all venues routes are POST writes)
app.use('*', async (c, next) => {
  // c.env is populated by the Node adapter at the bottom of this file — hono/vercel
  // does NOT pass the Node req/res through on its own, which used to leave both
  // undefined (rate limiting skipped, auth header unreadable -> permanent 401).
  const req = c.env?.req;
  const res = c.env?.res;

  if (!req) {
    console.warn('[venues] missing Node request in Hono env — cannot authenticate');
    return c.json({ success: false, error: 'Authorization required' }, 401);
  }

  if (res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }

  try {
    const supabase = getSupabase();
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
      // Message matches what is actually enforced: one review per check-in.
      return c.json({ success: false, error: 'You must check in to this venue before reviewing it.' }, 403);
    }

    // venue_reviews has review_text / reviewer_name — there is no title or text
    // column, so the old insert failed with 42703 and the review was never stored.
    // Any client-supplied title is folded into the review body instead.
    const reviewBody = [title, text].filter(v => v && String(v).trim()).join('\n\n').trim();

    let reviewerName = 'Anonymous';
    try {
      const { data: reviewerProfile } = await adminSupabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', userId)
        .maybeSingle();
      reviewerName = reviewerProfile?.full_name || reviewerProfile?.username || 'Anonymous';
    } catch (_profileErr) { /* keep Anonymous */ }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return c.json({ success: false, error: 'rating must be an integer between 1 and 5' }, 400);
    }

    const { error: reviewErr } = await adminSupabase
      .from('venue_reviews')
      .insert({
        user_id: userId,
        venue_id: String(venue_id),
        rating: ratingNum,
        review_text: reviewBody || null,
        reviewer_name: reviewerName,
        created_at: new Date().toISOString(),
      });

    if (reviewErr) {
      console.warn('[Venue Reviews] Insert error:', reviewErr);
      return c.json({ success: false, error: 'Failed to insert review' }, 500);
    }

    await adminSupabase
      .from('user_venue_checkins')
      .update({ review_completed: true })
      .eq('id', checkin.id);

    // Venue names live in poker_venues (there is no `venues` table).
    let venueName = 'Venue';
    const venueIdNum = parseInt(venue_id, 10);
    if (!isNaN(venueIdNum) && venueIdNum > 0) {
      const { data: venueRow } = await adminSupabase
        .from('poker_venues')
        .select('name')
        .eq('id', venueIdNum)
        .maybeSingle();
      if (venueRow?.name) venueName = venueRow.name;
    }

    // Atomic award + ledger entry in one statement (the old read-modify-write on
    // profiles.diamonds lost concurrent updates).
    const { error: awardErr } = await adminSupabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId,
      p_amount: 50,
      p_type: 'venue_review',
      p_description: `Venue Review for ${venueName}`,
      p_reference_id: null,
    });

    if (awardErr) {
      // Non-fatal: the review is already saved. Log so the award can be reconciled.
      console.warn('[Venue Reviews] Diamond award failed (review saved):', awardErr.message || awardErr);
      return c.json({ success: true, message: 'Review saved. Diamond award pending.', diamonds_awarded: 0 });
    }

    return c.json({ success: true, message: 'Review saved, 50 diamonds awarded!' });
  } catch (err) {
    console.warn('[venues/reviews] Error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── Node (Pages Router) adapter ──────────────────────────────────────────
// hono/vercel's handle() expects a Web Request (Edge / App Router). This file is
// a Pages Router Node function, so we translate Node req -> Web Request here and
// pass the Node req/res through as the Hono env (used by the auth/rate-limit
// middleware above). Node 18+ provides Request/Response/Headers globally, so this
// needs no extra dependency.
function nodeHeadersToWeb(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders || {})) {
    if (value === undefined || value === null) continue;
    try {
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    } catch (_headerErr) { /* skip invalid header */ }
  }
  return headers;
}

function toWebRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `${proto}://${host}`);
  const method = (req.method || 'GET').toUpperCase();
  const init = { method, headers: nodeHeadersToWeb(req.headers) };

  if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      init.body = req.body;
    } else {
      init.body = JSON.stringify(req.body);
      init.headers.set('content-type', 'application/json');
    }
    // Length changes after re-serialization — let undici recompute it.
    init.headers.delete('content-length');
  }

  return new Request(url.toString(), init);
}

export default async function vercelHandler(req, res) {
  try {
    const response = await app.fetch(toWebRequest(req), { req, res });

    // applyRateLimit may already have answered with a 429 on the Node response
    if (res.headersSent || res.writableEnded) return;

    const body = await response.text();
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'content-length' || lower === 'content-encoding' || lower === 'transfer-encoding') return;
      res.setHeader(key, value);
    });
    return res.status(response.status).send(body);
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
