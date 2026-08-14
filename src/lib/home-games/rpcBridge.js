/**
 * ══════════════════════════════════════════════════════════════════════════
 *  HOME-GAMES RPC BRIDGE  (phase 41)
 *  Shared thin layer for the seat-reservation API routes.
 * ══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../apiRateLimit';
import { getServerUserWithFallback } from '../serverAuth';

let _serviceClient = null;
function getServiceClient() {
  if (!_serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _serviceClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return _serviceClient;
}

export function getUserScopedClient(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

export function mapRpcError(err) {
  const code = err?.code || '';
  const raw  = (err?.message || err?.details || 'Internal error').toString();
  const errName = raw.trim().split(/\s+/)[0] || raw;

  if (code === '23505') {
    return { status: 409, error: 'SEAT_ALREADY_TAKEN', message: 'That seat was just claimed by someone else.' };
  }
  if (code === '23514') {
    return { status: 400, error: 'VALIDATION_FAILED', message: raw };
  }

  switch (errName) {
    case 'AUTH_REQUIRED': return { status: 401, error: errName, message: 'Sign in to continue.' };

    // ── Seat-race and eligibility errors (audit 2026-08-14) ──────────────
    // The hardened claim/change/start RPCs raise these as P0001 domain
    // errors — including converting 23505 unique_violations into
    // 'SEAT_TAKEN' internally, which made the 23505 branch above dead for
    // claims. None of these were mapped, so every lost seat race surfaced
    // as HTTP 500 "Something went wrong." instead of the truth. These are
    // ordinary user-facing outcomes, not server faults; every one gets a
    // human sentence because toast.error(e.message) renders it verbatim.
    case 'SEAT_TAKEN':
      return { status: 409, error: errName, message: 'That seat was just taken by someone else.' };
    case 'ALREADY_AT_TABLE':
      return { status: 409, error: errName, message: 'You already have a seat at this table.' };
    case 'GUEST_ALREADY_CLAIMED':
      return { status: 409, error: errName, message: 'You have already claimed a guest seat at this table.' };
    case 'GAME_NOT_ACTIVE':
      return { status: 409, error: errName, message: 'This game has been cancelled or has already finished.' };
    case 'WAITLISTED_CANNOT_SELF_SEAT':
      return { status: 403, error: errName, message: 'The host has you on the waitlist — they will seat you when a spot opens.' };
    case 'TABLE_STATE_CHANGED':
      return { status: 409, error: errName, message: 'The table changed state just now — refresh to see the latest.' };

    case 'NOT_A_MEMBER':
      return { status: 403, error: errName, message: 'Join this home game to grab a seat.' };
    case 'NOT_GROUP_STAFF':
      return { status: 403, error: errName, message: 'Only the host or group staff can do that.' };
    case 'NOT_YOUR_RESERVATION':
      return { status: 403, error: errName, message: 'That seat belongs to another player.' };
    case 'MEMBER_WRONG_GROUP': return { status: 403, error: errName, message: raw };
    case 'GAME_NOT_FOUND':
    case 'TABLE_NOT_FOUND':
    case 'MEMBER_NOT_FOUND':
    case 'RESERVATION_NOT_FOUND': return { status: 404, error: errName, message: raw };
    // Table/RSVP state errors, each with a human sentence — the UI toasts
    // e.message verbatim, so a bare domain code here reads as a fault.
    // NOTE: no bare fall-through into a message that only fits one case; an
    // earlier edit briefly routed GAME_CANCELLED into the "not open for seat
    // claims" text via fall-through, which is exactly the wrong-message class
    // of bug this block exists to prevent.
    case 'TABLE_NOT_OPEN':
    case 'TABLE_NOT_OPEN_FOR_RSVP':
    case 'TABLE_NOT_IN_OPEN_STATE':
    case 'TABLE_NOT_CLAIMABLE':
      return { status: 409, error: errName, message: 'This table is not open for seat claims right now.' };
    case 'GAME_CANCELLED':
      return { status: 409, error: errName, message: 'This game has been cancelled.' };
    case 'TABLE_CANCELLED':
      return { status: 409, error: errName, message: 'This table has been cancelled.' };
    case 'TABLE_ENDED':
      return { status: 409, error: errName, message: 'This table has already ended.' };
    case 'TABLE_RUNNING':
      return { status: 409, error: errName, message: 'This table is already running.' };
    case 'RSVPS_CLOSED':
    case 'RSVP_DEADLINE_PASSED':
      return { status: 409, error: errName, message: 'RSVPs are closed for this game.' };
    case 'GAME_START_TIME_PASSED':
      return { status: 409, error: errName, message: 'This game has already started.' };
    case 'RESERVATION_INACTIVE':
    case 'RESERVATION_ALREADY_INACTIVE':
      return { status: 409, error: errName, message: 'That reservation is no longer active — refresh to see the latest.' };
    case 'CANNOT_DELETE_DEFAULT_TABLE_WITH_SIBLINGS': return { status: 409, error: errName, message: raw };
    case 'SEAT_OUT_OF_BOUNDS':
    case 'MAX_SEATS_OUT_OF_BOUNDS':
    case 'DISPLAY_NAME_INVALID': return { status: 400, error: errName, message: raw };
    default:
      if (typeof console !== 'undefined') console.warn('[home-games rpcBridge] unmapped error', code, raw);
      return { status: 500, error: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }
}

export async function bridgeRequest(req, res, { method = 'POST', limit } = {}) {
  const allowed = Array.isArray(method) ? method : [method];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed);
    return { ok: false, status: 405, body: { success: false, error: 'METHOD_NOT_ALLOWED' } };
  }
  if (limit && !applyRateLimit(req, res, limit)) {
    return { ok: false, status: 429, body: null, _alreadyResponded: true };
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, body: { success: false, error: 'AUTH_REQUIRED' } };
  }
  const token = authHeader.slice(7);

  const serviceClient = getServiceClient();
  const { user } = await getServerUserWithFallback(req, serviceClient);
  if (!user || !user.id) {
    return { ok: false, status: 401, body: { success: false, error: 'INVALID_TOKEN' } };
  }

  const supabase = getUserScopedClient(token);
  return { ok: true, user, supabase, token };
}
export { LIMITS };
