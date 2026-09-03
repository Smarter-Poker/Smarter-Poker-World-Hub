/**
 * Operator authentication and authorisation for /horses routes.
 *
 *   const op = await requireOperator(req, res, { permission: PERMISSIONS.MONEY_WRITE });
 *   if (!op) return;              // the response has already been written
 *   op.db                          // service-role client (never the anon key)
 *   op.user / op.role / op.permissions
 *   op.roles / op.grantedRoles     // Phase 2: profile role plus ca_operator_grants
 *   op.policy                      // Phase 2: the ca_operator_policy row, cached 30s
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
import {
  PERMISSIONS,
  legacyPermissionsForProfileRole,
  hasPermission,
  isKnownPermission,
  isLegacyRole,
  isOperatorRole,
  mergePermissions,
  orderPermissions,
} from './permissions.js';
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

// -- PHASE 2: POLICY AND GRANTED ROLES ---------------------------------------
//
// PHASE2-CONTRACTS.md SECTION 0. Everything below fails OPEN. The Phase 2
// migration is applied separately from this deploy, and for the window between
// the two the tables and RPCs named here do not exist. If a missing migration
// could empty an operator's permission set, the first deploy of this file would
// lock all three production operators out of their own console. So:
//
//   - a missing or broken `ca_operator_policy` becomes the DEFAULT policy:
//     approvals off, enforcement off, the alone-rule on;
//   - a missing or broken `fn_ca_operator_permissions` becomes the LEGACY set
//     the profile role already carried, logged once per cache window;
//   - narrowing happens in exactly one place - enforce_named_roles = true, read
//     from a policy row that actually loaded.
//
// Both caches are 30 seconds, at module scope, which on Vercel means per warm
// lambda. A grant therefore takes at most 30 seconds to be felt, which is the
// contract, and a revoke the same.
//
// A DEGRADED answer is cached for five seconds, not thirty (re-verification
// L-10). The fail-open path serves the legacy set the profile role carries;
// under enforcement that is un-narrowed access, and one failed RPC used to
// buy a full 30 seconds of it per lambda even after the RPC was back. Five
// seconds still stops a broken RPC from being asked on every request.

const PERMISSION_CACHE_TTL_MS = 30_000;
const DEGRADED_PERMISSION_CACHE_TTL_MS = 5_000;
const POLICY_CACHE_TTL_MS = 30_000;

/** What the console assumes when ca_operator_policy cannot be read. */
export const DEFAULT_OPERATOR_POLICY = Object.freeze({
  approvalsEnabled: false,
  allowSelfApproveWhenAlone: true,
  enforceNamedRoles: false,
  mintThreshold: 0,
  fundThreshold: 0,
  cashoutThreshold: 0,
  approvalTtlMinutes: 1440,
  updatedBy: null,
  updatedAt: null,
  source: 'default',
  loaded: false,
});

function numberOr(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** ca_operator_policy row -> the camelCase shape every caller reads. */
export function normalizeOperatorPolicy(row) {
  if (!row || typeof row !== 'object') return { ...DEFAULT_OPERATOR_POLICY };
  return {
    approvalsEnabled: row.approvals_enabled === true,
    allowSelfApproveWhenAlone: row.allow_self_approve_when_alone !== false,
    enforceNamedRoles: row.enforce_named_roles === true,
    mintThreshold: numberOr(row.mint_threshold, 0),
    fundThreshold: numberOr(row.fund_threshold, 0),
    cashoutThreshold: numberOr(row.cashout_threshold, 0),
    approvalTtlMinutes: numberOr(row.approval_ttl_minutes, 1440),
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
    source: 'row',
    loaded: true,
  };
}

let _policyCache = { at: 0, value: null };
const _permissionCache = new Map();
/** Bounded, so a long-lived lambda cannot grow one entry per account it ever
 *  saw (review L-3). Entries are dropped oldest-first, which for a Map is
 *  insertion order, and a dropped entry costs one extra RPC. */
const PERMISSION_CACHE_MAX = 200;

/** Test seam, and what set_policy calls so the panel shows what it just saved. */
export function _resetOperatorCachesForTests() {
  _policyCache = { at: 0, value: null };
  _permissionCache.clear();
}

export function invalidateOperatorPolicyCache() {
  _policyCache = { at: 0, value: null };
  _permissionCache.clear();
}

/**
 * The one ca_operator_policy row, cached 30s. Never throws: a missing table is
 * the normal state of the world until the Phase 2 migration lands.
 */
export async function loadOperatorPolicy(db, { now = Date.now(), force = false } = {}) {
  if (!force && _policyCache.value && now - _policyCache.at < POLICY_CACHE_TTL_MS) {
    return _policyCache.value;
  }
  let value = { ...DEFAULT_OPERATOR_POLICY };
  try {
    const { data, error } = await db
      .from('ca_operator_policy')
      .select('*')
      .eq('id', true)
      .maybeSingle();
    if (error) {
      console.warn(
        '[operatorAuth] ca_operator_policy unavailable, using the default policy:',
        error.message
      );
      value = { ...DEFAULT_OPERATOR_POLICY, degraded: true };
    } else if (data) {
      value = normalizeOperatorPolicy(data);
    }
  } catch (err) {
    console.warn(
      '[operatorAuth] ca_operator_policy read threw, using the default policy:',
      err?.message || err
    );
    value = { ...DEFAULT_OPERATOR_POLICY, degraded: true };
  }
  _policyCache = { at: now, value };
  return value;
}

/**
 * THE FLOOR UNDER THE ONE NARROWING (review H-4).
 *
 * Under enforcement an account holding any grant is described by that grant
 * alone. Grant a god `read_only`, flip `enforce_named_roles`, and the god drops
 * from 21 permissions to 6 - losing `admin.manage`, which is the only
 * permission that can flip the flag back. Recovery from that is direct SQL.
 *
 * So whatever the database says, an account whose PROFILE ROLE is one of the
 * legacy three keeps `admin.manage`. It is belt and braces, not the whole
 * belt: the SQL should not hand back a narrowed legacy set in the first place,
 * and the console still shows the narrowed set everywhere else. This is the one
 * permission that has to survive, because it is the one that undoes the mistake.
 */
function withAdminManageFloor(profileRole, permissions) {
  if (!isLegacyRole(profileRole)) return permissions;
  if (permissions.includes(PERMISSIONS.ADMIN_MANAGE)) return permissions;
  console.warn(
    `[operatorAuth] the resolved set for a ${profileRole} account carried no ${PERMISSIONS.ADMIN_MANAGE}; ` +
      'restoring it so the policy panel cannot lock the platform out of itself'
  );
  return mergePermissions(permissions, [PERMISSIONS.ADMIN_MANAGE]);
}

/**
 * Merge the legacy profile role with whatever ca_operator_grants gives this
 * user, via fn_ca_operator_permissions. Cached 30s per (user, profile role),
 * 5s when the answer is degraded.
 *
 * Returns { role, roles, grantedRoles, permissions, source, enforced, degraded }.
 *
 * `degraded: true` means the RPC did not answer and the LEGACY set is what came
 * back. That is the fail-open path and it is deliberate: an operator who could
 * mint yesterday can still mint while the migration is being applied.
 *
 * THE LEGACY SEED IS THE LEGACY THREE AND NOTHING ELSE (re-verification H-1).
 * `profiles.role` is free text this feature does not own. A named role key
 * sitting in it contributes nothing here, exactly as it contributes nothing
 * in fn_ca_operator_permissions: the named roles arrive through an active
 * grant, and the RPC's answer already carries every grant. Seeding from the
 * full matrix meant profiles.role = 'owner' plus a read_only grant resolved
 * to all 21 permissions in JS and to six in SQL, with every route check
 * reading the JS set.
 */
export async function resolveOperatorPermissions(
  db,
  userId,
  profileRole,
  { now = Date.now(), policy } = {}
) {
  const legacy = legacyPermissionsForProfileRole(profileRole);
  const cacheKey = `${userId || 'anonymous'}|${profileRole || ''}`;
  const cached = _permissionCache.get(cacheKey);
  if (cached) {
    const ttl = cached.value?.degraded === true ? DEGRADED_PERMISSION_CACHE_TTL_MS : PERMISSION_CACHE_TTL_MS;
    if (now - cached.at < ttl) return cached.value;
  }

  const pol = policy || (await loadOperatorPolicy(db, { now }));
  const legacyOnly = {
    role: profileRole || null,
    roles: profileRole ? [profileRole] : [],
    grantedRoles: [],
    permissions: withAdminManageFloor(profileRole, legacy),
    source: 'legacy',
    enforced: false,
    degraded: true,
  };

  let value;
  try {
    const res = await db.rpc('fn_ca_operator_permissions', { p_user_id: userId });
    const data = res?.data;
    if (res?.error) throw res.error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('fn_ca_operator_permissions returned no payload');
    }
    const rpcRoles = (Array.isArray(data.roles) ? data.roles : []).filter(
      (r) => typeof r === 'string' && r
    );
    const grantedRoles = rpcRoles.filter((r) => r !== profileRole);
    const granted = orderPermissions(Array.isArray(data.permissions) ? data.permissions : []);
    // THE ONLY NARROWING IN THE FILE, and it needs a policy row that actually
    // loaded plus an explicit true.
    const enforced = pol.loaded === true && pol.enforceNamedRoles === true;
    const permissions = withAdminManageFloor(
      profileRole,
      enforced ? granted : mergePermissions(legacy, granted)
    );
    const roles = [];
    for (const r of [profileRole, ...rpcRoles]) if (r && !roles.includes(r)) roles.push(r);
    value = {
      role: profileRole || null,
      roles,
      grantedRoles,
      permissions,
      source: typeof data.source === 'string' ? data.source : grantedRoles.length ? 'both' : 'legacy',
      enforced,
      degraded: false,
    };
  } catch (err) {
    console.warn(
      '[operatorAuth] fn_ca_operator_permissions unavailable, falling back to the legacy role set:',
      err?.message || err
    );
    value = legacyOnly;
  }

  if (_permissionCache.size >= PERMISSION_CACHE_MAX && !_permissionCache.has(cacheKey)) {
    const oldest = _permissionCache.keys().next();
    if (!oldest.done) _permissionCache.delete(oldest.value);
  }
  _permissionCache.set(cacheKey, { at: now, value });
  return value;
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

  // Phase 2. Both of these fail open to the legacy behaviour, so a console that
  // worked a minute before this deploy still works a minute after it.
  const policy = await loadOperatorPolicy(db);
  const resolved = await resolveOperatorPermissions(db, user.id, role, { policy });
  const permissions = resolved.permissions;

  // WHO REACHES THE CONSOLE AT ALL (review M-6). One of the three legacy
  // profile roles, or an account somebody deliberately GRANTED an operator
  // role to. `profiles.role` is free text this feature does not own, so a
  // string in it that happens to match a Phase 2 role key is not an operator;
  // a row in ca_operator_grants is, because it has a granter and a reason.
  const grantedEntry = Array.isArray(resolved.grantedRoles) && resolved.grantedRoles.length > 0;
  if (!isOperatorRole(role) && !grantedEntry) {
    sendFail(res, 403, 'Operator Access Required', 'forbidden', requestId);
    return null;
  }

  if (!hasPermission(permissions, permission)) {
    sendFail(res, 403, 'Permission Required: ' + permission, 'permission_denied', requestId, { permission });
    return null;
  }

  return {
    db,
    user: { id: user.id, email: user.email || null },
    profile: profile || { id: user.id, role },
    role,
    roles: resolved.roles,
    grantedRoles: resolved.grantedRoles,
    permissions,
    permissionSource: resolved.source,
    permissionsDegraded: resolved.degraded === true,
    enforceNamedRoles: resolved.enforced === true,
    policy,
    requestId,
  };
}
