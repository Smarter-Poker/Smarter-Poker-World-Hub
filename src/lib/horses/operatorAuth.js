/**
 * Operator authentication and authorisation for /horses routes.
 *
 *   const op = await requireOperator(req, res, { permission: PERMISSIONS.MONEY_WRITE });
 *   if (!op) return;              // the response has already been written
 *   op.db                          // service-role client (never the anon key)
 *   op.user / op.role / op.permissions
 *
 * Why this exists (Phase 1, 2026-09-02): the same 20 lines were pasted into
 * twelve routes, nine of which silently fell back to the ANON key whenever
 * SUPABASE_SERVICE_ROLE_KEY was absent - reproducing the exact RLS blindness
 * the console's server-side move was built to fix, while reporting success.
 * Four routes also did a GoTrue network call per request although the shared
 * verifier checks the JWT locally. This module is the one place all of that
 * lives now.
 *
 * Dependency injection: `deps` lets unit tests supply a fake verifier and a
 * fake database. Production callers never pass it.
 */
import { permissionsForRole, hasPermission, isKnownPermission, isOperatorRole } from './permissions.js';
import { requestIdOf, sendFail } from './apiEnvelope.js';

let _db = null;

/**
 * The console's service-role client. THROWS when the service key is missing
 * so a misconfigured deployment fails loudly at the first request instead of
 * answering every query with zero rows.
 */
export async function getOperatorDb() {
  if (_db) return _db;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the operator console');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
  const { createClient } = await import('../supabaseServerClient.js');
  _db = createClient(url, key);
  return _db;
}

/** Test seam only. */
export function _resetOperatorDbForTests(db = null) {
  _db = db;
}

function bearerToken(req) {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length >= 20 ? token : null;
}

async function defaultDeps() {
  const { getServerUserWithFallback } = await import('../serverAuth.js');
  return { getServerUserWithFallback, getDb: getOperatorDb };
}

/**
 * Resolve the calling operator or write a 401/403/503 and return null.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} opts
 * @param {string} opts.permission  - required, one of PERMISSIONS
 * @param {object} [opts.deps]      - { getServerUserWithFallback, getDb } for tests
 */
export async function requireOperator(req, res, { permission, deps } = {}) {
  const requestId = requestIdOf(req);
  if (!isKnownPermission(permission)) {
    // A route asking for a permission that does not exist is a programming
    // error; refuse rather than silently allow.
    sendFail(res, 500, 'Route misconfigured: unknown permission', 'route_misconfigured', requestId);
    return null;
  }

  const d = deps || (await defaultDeps());

  let db;
  try {
    db = await d.getDb();
  } catch (err) {
    console.error('[operatorAuth] service-role client unavailable:', err?.message);
    sendFail(res, 503, 'Operator console is not configured on this server', 'service_role_missing', requestId);
    return null;
  }

  if (!bearerToken(req)) {
    sendFail(res, 401, 'Authorization Required', 'unauthorized', requestId);
    return null;
  }

  const { user, error } = await d.getServerUserWithFallback(req, db);
  if (error || !user?.id) {
    sendFail(res, 401, 'Invalid Token', 'unauthorized', requestId);
    return null;
  }

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, role, username, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    console.error('[operatorAuth] profile read failed:', profileErr.message);
    sendFail(res, 503, 'Could not verify operator role', 'role_lookup_failed', requestId);
    return null;
  }

  const role = profile?.role || null;
  if (!isOperatorRole(role)) {
    sendFail(res, 403, 'Operator Access Required', 'forbidden', requestId);
    return null;
  }

  const permissions = permissionsForRole(role);
  if (!hasPermission(permissions, permission)) {
    sendFail(res, 403, 'Permission Required: ' + permission, 'permission_denied', requestId, { permission });
    return null;
  }

  return {
    db,
    user: { id: user.id, email: user.email || null },
    profile: profile || { id: user.id, role },
    role,
    permissions,
    requestId,
  };
}
