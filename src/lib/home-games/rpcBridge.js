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
    case 'NOT_A_MEMBER':
    case 'NOT_GROUP_STAFF':
    case 'NOT_YOUR_RESERVATION':
    case 'MEMBER_WRONG_GROUP': return { status: 403, error: errName, message: raw };
    case 'GAME_NOT_FOUND':
    case 'TABLE_NOT_FOUND':
    case 'MEMBER_NOT_FOUND':
    case 'RESERVATION_NOT_FOUND': return { status: 404, error: errName, message: raw };
    case 'GAME_CANCELLED':
    case 'TABLE_CANCELLED':
    case 'TABLE_ENDED':
    case 'TABLE_RUNNING':
    case 'TABLE_NOT_OPEN':
    case 'TABLE_NOT_OPEN_FOR_RSVP':
    case 'TABLE_NOT_IN_OPEN_STATE':
    case 'TABLE_NOT_CLAIMABLE':
    case 'RSVPS_CLOSED':
    case 'RSVP_DEADLINE_PASSED':
    case 'GAME_START_TIME_PASSED':
    case 'RESERVATION_INACTIVE':
    case 'RESERVATION_ALREADY_INACTIVE':
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
