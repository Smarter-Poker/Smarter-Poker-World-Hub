/**
 * The platform-staff gate for routes that live OUTSIDE /horses.
 *
 *   const gate = await operatorHoldsPermission(db, { userId, profileRole }, PERMISSIONS.CASHIER_WRITE);
 *   const isPlatformAdmin = gate.ok;
 *
 * WHY THIS EXISTS (re-verification M-3, 2026-09-03).
 *
 * Five routes the console drives but which are not built on withOperatorRoute
 * (approve-cashout, execute-sql, admin-promo-codes, anti-cheat,
 * union-application) each decided "is this caller platform staff" with a
 * literal list of the three legacy profile roles. That was the whole of Phase
 * 2 not reaching them: a granted `finance` operator whose profiles.role is
 * `user` could approve a cashout in the Approvals tab and then be told to
 * complete it from the cashout screen, where approve-cashout answered 403; and
 * a legacy admin narrowed to `read_only` under `enforce_named_roles` still
 * approved cashouts, ran SQL and edited promo codes, because none of those
 * routes ever read the resolved permission set.
 *
 * The rule is now the one the console applies: "holds the permission". It goes
 * through resolveOperatorPermissions, which is the same resolver requireOperator
 * uses, so every door reads the same set:
 *
 *   - a legacy profile role (god, superadmin, admin) carries every permission
 *     until enforcement is on, so nothing that works today stops working
 *     (PHASE2-CONTRACTS.md section 0);
 *   - a named grant carries its set, so a granted finance operator holds
 *     cashier.write with profiles.role = user;
 *   - under enforce_named_roles a legacy account holding a grant is described
 *     by the grant alone, so the narrowing the policy panel promises is real
 *     here too, admin.manage floor included;
 *   - when the resolver is DEGRADED (the RPC is unreachable, or the Phase 2
 *     migration is not applied) it answers the legacy set the profile role
 *     carries, which for the three legacy roles is the full set and for every
 *     other role is nothing. That is the fail-open the resolver already has;
 *     this module adds no second one.
 *
 * NEVER THROWS for a database reason: the resolver catches its own failures.
 * An UNKNOWN permission is a programming error and is refused (ok: false) with
 * `reason: 'unknown_permission'`, logged, rather than admitting anyone.
 */
import { resolveOperatorPermissions } from './operatorAuth.js';
import { hasPermission, isKnownPermission, isLegacyRole } from './permissions.js';

/** True for god, superadmin and admin. Sync, for audit rows and labels. */
export function isLegacyOperatorRole(role) {
  return isLegacyRole(role);
}

/**
 * Does this caller hold `permission`?
 *
 * @param {object} db - a service-role client (the resolver's RPC is service_role only)
 * @param {object} who - { userId, profileRole } as read from profiles
 * @param {string} permission - one of PERMISSIONS
 * @returns {Promise<{ ok: boolean, permissions: string[], degraded: boolean, enforced: boolean, source: string|null, reason: string|null }>}
 */
export async function operatorHoldsPermission(db, { userId, profileRole } = {}, permission) {
  if (!isKnownPermission(permission)) {
    console.error(`[operatorGate] a route asked for an unknown permission: ${String(permission)}`);
    return {
      ok: false,
      permissions: [],
      degraded: false,
      enforced: false,
      source: null,
      reason: 'unknown_permission',
    };
  }
  const resolved = await resolveOperatorPermissions(db, userId || null, profileRole || null);
  const permissions = Array.isArray(resolved?.permissions) ? resolved.permissions : [];
  const ok = hasPermission(permissions, permission);
  return {
    ok,
    permissions,
    degraded: resolved?.degraded === true,
    enforced: resolved?.enforced === true,
    source: typeof resolved?.source === 'string' ? resolved.source : null,
    reason: ok ? null : 'permission_missing',
  };
}
