/**
 * Operator permissions - the client half of Phase 2 access control.
 *
 * THE SAFETY RULE COMES FIRST (PHASE2-CONTRACTS section 0). Production has
 * three operator accounts: one `god` and two `admin`. Nothing in Phase 2 may
 * lock one of them out or hide a tab that works today, so the ONLY thing that
 * removes a tab from the nav is a route that has explicitly told us which
 * permissions this operator holds AND left one out.
 *
 * That is why `hasPermission` answers TRUE for a missing list and TRUE for an
 * empty one. Both mean "nobody has told us yet":
 *
 *   - missing: /api/horses/operator-admin is not deployed yet, or the read
 *     failed, or this console build is newer than the route it is talking to;
 *   - empty:   a route answered with a list it could not populate.
 *
 * In either case the console shows what it shows today. A permission list is
 * only allowed to be a FILTER once it has content, never a gate that defaults
 * closed - a console that hides the Mint because a fetch timed out is a worse
 * failure than one that shows a tab the server will refuse anyway. The server
 * is the enforcement point; this module is the affordance.
 *
 * Pure and dependency free so it is unit tested with a plain `node --test`.
 */

/** Granting, revoking and the policy panel. Held by owner and the three
 *  legacy roles (PHASE2-CONTRACTS section 2). */
export const ADMIN_MANAGE = 'admin.manage';

/** The permission that makes an operator able to open the console at all, and
 *  the one the two Phase 2 tabs declare. */
export const CONSOLE_READ = 'console.read';

/** A wildcard some permission sets use for "everything". Honoured so a role
 *  that is defined that way is not accidentally narrowed by this file. */
export const WILDCARD = '*';

/**
 * Does this operator hold `permission`?
 *
 * @param {string[]|null|undefined} permissions  The route's list, or null when
 *        the route has not told us. Null and [] both mean "show everything".
 * @param {string} permission  The permission a tab or a control requires.
 */
export function hasPermission(permissions, permission) {
  if (!permission) return true;
  if (!Array.isArray(permissions)) return true;
  if (permissions.length === 0) return true;
  return permissions.includes(permission) || permissions.includes(WILDCARD);
}

/** `admin.manage` by name, because three call sites ask for it. */
export function canManageOperators(permissions) {
  return hasPermission(permissions, ADMIN_MANAGE);
}

/**
 * The tabs this operator may see.
 *
 * Placeholders are dropped here as well as in the registry's own `visibleTabs`
 * so a caller that forgets one still cannot render an entry nobody can click.
 */
export function permittedTabs(tabs = [], permissions = null) {
  return (Array.isArray(tabs) ? tabs : [])
    .filter((tab) => tab && !tab.placeholder && hasPermission(permissions, tab.permission));
}

/**
 * Pull the permission list out of whatever the route answered with.
 *
 * Returns null - NOT [] - when the payload carries no list, because null is
 * what `hasPermission` reads as "show everything". Collapsing the two would
 * turn a route that has not shipped yet into an operator with no tabs.
 */
export function permissionsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const list = Array.isArray(payload.permissions)
    ? payload.permissions
    : (payload.operator && Array.isArray(payload.operator.permissions)
      ? payload.operator.permissions
      : null);
  if (!list) return null;
  return list.map((p) => String(p));
}

/**
 * The operator's own user id, wherever the route put it.
 *
 * The Approvals queue needs it to know which rows this operator raised, and
 * an id it is not sure about is worse than none: a wrong id would enable
 * Approve on a request the operator made themselves. So this returns null
 * unless the payload actually names one.
 */
export function operatorIdFromPayload(payload, fallback = null) {
  if (payload && typeof payload === 'object') {
    if (payload.operatorId) return String(payload.operatorId);
    if (payload.userId) return String(payload.userId);
    if (payload.operator && payload.operator.id) return String(payload.operator.id);
  }
  return fallback ? String(fallback) : null;
}
