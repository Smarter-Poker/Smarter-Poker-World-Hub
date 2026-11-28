// The one front door for every Bankroll Manager API route (2026-11-27).
//
// Each route used to carry its own copy of "is there a token, is it valid",
// and the copies had drifted:
// - some checked the method AFTER authentication, so a signed-out GET to a
//   POST route said "Auth required" instead of 405, and a 405 never named the
//   methods the route does take;
// - every one turned "the session service is down" (serverAuth status 503)
//   into 401, so a signed-in player was told to sign in again during an
//   outage they could do nothing about;
// - linked-venues marked a PER-PLAYER answer `public, s-maxage=120`, which
//   lets a shared cache hand one player's saved venues to the next caller of
//   the same URL, and the bankroll page put the player's id in that URL;
// - query and body inputs went straight into PostgREST filters, so a bad date
//   became a database error and a 500 instead of a 400 the caller can fix.
//
// Everything here is pure or takes its dependencies as arguments, so the
// tests exercise the same code the routes run.

import { CATEGORY_NAMES } from './ledgerReport.mjs';

/** Shape of every refusal: `{ success: false, error }`, never an internal message. */
function refuse(res, status, error, extra = {}) {
  res.status(status).json({ success: false, error, ...extra });
  return null;
}

/**
 * Method, token and identity, in that order. Returns the verified user, or
 * null after it has already answered the request.
 *
 * `verify(req)` is the route's own `getServerUserWithFallback(req, client)`.
 * The identity always comes from the JWT; nothing a caller puts in the query
 * or body names the player.
 */
export async function guardBankrollRequest(req, res, { methods, verify }) {
  // Per-player answers must never sit in a shared cache.
  res.setHeader('Cache-Control', 'private, no-store');
  const allowed = Array.isArray(methods) && methods.length ? methods : ['GET'];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    return refuse(res, 405, 'Method not allowed');
  }
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || !header.slice(7).trim()) {
    return refuse(res, 401, 'Sign in required');
  }
  let result;
  try {
    result = await verify(req);
  } catch (_error) {
    return refuse(res, 503, 'Account verification is unavailable. Try again.');
  }
  if (result?.status === 503) return refuse(res, 503, 'Account verification is unavailable. Try again.');
  if (result?.error || !result?.user?.id) return refuse(res, 401, 'Sign in required');
  return result.user;
}

/** A real calendar day written as YYYY-MM-DD, or null. */
export function ledgerDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? value : null;
}

/**
 * The player's own calendar day as the client sent it. A server has no
 * player time zone, so the UTC day is only the fallback for an old client.
 */
export function clientDay(value, now = new Date()) {
  return ledgerDay(value) || now.toISOString().slice(0, 10);
}

/** Optional start/end days: both valid when present, and in order. */
function dayRange(start, end) {
  const s = start === undefined || start === null || start === '' ? null : ledgerDay(start);
  const e = end === undefined || end === null || end === '' ? null : ledgerDay(end);
  if ((start && !s) || (end && !e)) return { error: 'Dates must be written YYYY-MM-DD' };
  if (s && e && s > e) return { error: 'The start date is after the end date' };
  return { start: s, end: e };
}

/** POST /api/bankroll/export body. */
export function exportRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const format = b.format === undefined ? 'csv' : b.format;
  if (format !== 'csv' && format !== 'json') return { error: 'Format must be csv or json' };
  const range = dayRange(b.dateRange?.start, b.dateRange?.end);
  if (range.error) return range;
  return { format, start: range.start, end: range.end, today: b.today };
}

/** GET /api/bankroll/export-pdf query. */
export function pdfExportRequest(query) {
  const q = query && typeof query === 'object' ? query : {};
  const range = dayRange(q.startDate, q.endDate);
  if (range.error) return range;
  const category = q.category === undefined || q.category === '' || q.category === 'all' ? null : q.category;
  if (category !== null && !Object.hasOwn(CATEGORY_NAMES, category)) return { error: 'Unknown category' };
  return { start: range.start, end: range.end, category, today: q.today };
}

/** GET /api/bankroll/tax-report query. `year` defaults to the client day's year. */
export function taxReportRequest(query, now = new Date()) {
  const q = query && typeof query === 'object' ? query : {};
  const today = clientDay(q.today, now);
  const rawYear = q.year === undefined || q.year === '' ? today.slice(0, 4) : q.year;
  if (typeof rawYear !== 'string' || !/^\d{4}$/.test(rawYear)) return { error: 'Invalid tax year' };
  const year = Number(rawYear);
  if (year < 2000 || year > 2100) return { error: 'Invalid tax year' };
  const format = q.format === undefined ? 'pdf' : q.format;
  if (format !== 'pdf' && format !== 'json') return { error: 'Format must be pdf or json' };
  return { year, format, today };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/bankroll/geofence-visit body. geofence_visits.venue_id is a uuid column. */
export function geofenceVisitRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const venueId = typeof b.venueId === 'string' ? b.venueId.trim() : '';
  if (!UUID.test(venueId)) return { error: 'venueId must be a venue uuid' };
  const name = typeof b.venueName === 'string' ? b.venueName.trim().slice(0, 120) : '';
  return { venueId, venueName: name || 'Poker Venue' };
}

/**
 * An optional position for the nearby-venue read, rounded to two decimals
 * (about a kilometre): enough to pick venues, not a precise location trail.
 */
export function nearbyPoint(query) {
  const q = query && typeof query === 'object' ? query : {};
  if (q.lat === undefined || q.lng === undefined) return null;
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: 'Invalid position' };
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

/**
 * What a Bankroll Manager screen says for a refused request. Shared by every
 * client caller so a rate limit or an outage is not reported as "failed".
 */
export function requestErrorMessage(status, fallback, { signIn = 'Please Sign In Again' } = {}) {
  if (status === 401) return signIn;
  if (status === 403) return 'Bankroll Pro Or VIP Access Is Required';
  if (status === 429) return 'Too Many Requests. Wait A Minute And Try Again.';
  if (status === 503) return 'Account Verification Is Unavailable. Try Again Shortly.';
  return fallback;
}
