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
 * Pure, and its one import is the permission vocabulary itself - which is also
 * pure and import free - so this module is still unit tested with a plain
 * `node --test` and no node_modules.
 */
import { ALL_PERMISSIONS } from '../../lib/horses/permissions.js';

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
 * Is this a permission the vocabulary actually defines?
 *
 * The client half of `src/lib/horses/permissions.js#isKnownPermission`, and
 * the same list, imported rather than copied - a second copy of a vocabulary
 * is a second chance to disagree with it.
 */
export function isKnownPermission(permission) {
  return typeof permission === 'string' && ALL_PERMISSIONS.includes(permission);
}

/**
 * Does this operator hold `permission`?
 *
 * @param {string[]|null|undefined} permissions  The route's list, or null when
 *        the route has not told us. Null and [] both mean "show everything".
 * @param {string} permission  The permission a tab or a control requires.
 *
 * THE FOURTH "SHOW IT ANYWAY" CASE is a permission this vocabulary does not
 * define. It is the one that was missing, and it is what let thirteen tabs
 * disappear from a `god` account: a name no role has ever held cannot be
 * "left out" of a permission list in any meaningful sense, so reading its
 * absence as a refusal turns one typo in a registry into an operator lockout.
 * The vocabulary is the enforcement surface; a string outside it is a bug in
 * this repo, and a bug in this repo must not cost an operator their console.
 * The test that every tab.permission is a member of ALL_PERMISSIONS is the
 * other half: this keeps the console usable, that keeps the typo visible.
 */
export function hasPermission(permissions, permission) {
  if (!permission) return true;
  if (!Array.isArray(permissions)) return true;
  if (permissions.length === 0) return true;
  if (permissions.includes(WILDCARD)) return true;
  if (permissions.includes(permission)) return true;
  return !isKnownPermission(permission);
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
 * WHERE, IF ANYWHERE, AN OPERATOR SHOULD BE MOVED TO. Null means "leave them
 * exactly where they are", and null is the answer in every doubtful case.
 *
 * The Phase 1 blocker this replaces: the guard moved the operator whenever the
 * active tab was missing from `navTabs`, trusted `navTabs` unconditionally,
 * and the URL write effect then rewrote `?tab=` behind it. With the registry
 * asking for permissions nobody held, that fired on thirteen of eighteen tabs,
 * on every load, and took the deep link with it.
 *
 * So relocation now needs ALL FOUR of these to be true, and a legacy operator
 * can satisfy none of them:
 *
 *   1. The route has actually told us what this operator holds. A null or
 *      empty list is "nobody has told us yet" (see hasPermission), and you do
 *      not move somebody on the strength of a fetch that has not answered.
 *   2. There is somewhere to move them TO.
 *   3. The tab they are on is one this console knows and whose declared
 *      permission is in the vocabulary. A tab asking for a name that does not
 *      exist is this repo's bug, not the operator's, and hasPermission already
 *      refuses to hide it.
 *   4. They genuinely do not hold it.
 */
export function relocationTarget({ activeTab = null, tabs = [], permissions = null } = {}) {
  if (!Array.isArray(permissions) || permissions.length === 0) return null;
  const list = Array.isArray(tabs) ? tabs : [];
  const allowed = permittedTabs(list, permissions);
  if (allowed.length === 0) return null;
  if (allowed.some((tab) => tab.id === activeTab)) return null;

  const current = list.find((tab) => tab && tab.id === activeTab) || null;
  // Not registered at all: resolveTabFromQuery should have mapped it to the
  // default long before here, so this is a blank panel, and moving is right.
  if (!current) return allowed[0].id;
  if (current.placeholder) return allowed[0].id;
  if (!isKnownPermission(current.permission)) return null;
  return allowed[0].id;
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

/**
 * Did the route say "you are not an operator"?
 *
 * The console used to decide that for itself with a list of three profile
 * roles, which is exactly the list Phase 2 made incomplete: an account whose
 * only claim is an active ca_operator_grants row passes `requireOperator`
 * and was refused at the door by the client. So the route's answer is the
 * answer. A 401 (no usable session) or a 403 (`forbidden`,
 * `permission_denied`) is a refusal; anything else - a 503 while the role
 * lookup is down, a network failure - is "could not verify", which the caller
 * reports as such rather than as a denial.
 */
export function isOperatorDenial(err) {
  if (!err || typeof err !== 'object') return false;
  const status = Number(err.status);
  if (status === 401 || status === 403) return true;
  const code = String(err.code || '').toLowerCase();
  return code === 'unauthorized' || code === 'forbidden' || code === 'permission_denied';
}

/**
 * The role to show in the header, from the section=policy envelope.
 *
 * `operator.role` is the profile role, which for a Phase 2 grantee is
 * whatever profiles.role happens to say (usually nothing useful). The first
 * granted role is the honest label for that account; a legacy operator still
 * reads as their profile role, which is what the header has always shown.
 */
export function operatorRoleFromPayload(payload) {
  const op = payload && typeof payload === 'object' ? payload.operator : null;
  if (!op || typeof op !== 'object') return null;
  const granted = Array.isArray(op.grantedRoles) ? op.grantedRoles.filter(Boolean) : [];
  if (granted.length) return String(granted[0]);
  if (op.role) return String(op.role);
  const roles = Array.isArray(op.roles) ? op.roles.filter(Boolean) : [];
  return roles.length ? String(roles[0]) : null;
}

/**
 * What a Staff tab save hands back up, in ONE shape.
 *
 * `onPolicyChange` receives `{ policy, aloneRule, permissions }` - the whole
 * of what section=policy answers after a save - because the alone rule is
 * computed BY the policy (approvals on, self-approval allowed, nobody else
 * eligible) and a Mint that keeps the pre-toggle rule after the toggle tells
 * the operator their money move will wait when it will not. A bare policy
 * object (it has `approvals_enabled`) is still accepted, and for it only the
 * policy is reported; the other two fields come back `undefined`, which the
 * caller reads as "leave that alone".
 *
 *   policy       - the policy row, or null when the payload carried none
 *   aloneRule    - the route's aloneRule object, null when the payload was
 *                  the full shape but carried none, undefined for a bare
 *                  policy
 *   permissions  - a non-empty string list, or undefined when there is
 *                  nothing new to say (a null or empty list is never applied,
 *                  because that is the "show everything" fallback and a save
 *                  must not widen the nav by accident)
 */
export function operatorContextChange(payload) {
  if (!payload || typeof payload !== 'object') {
    return { policy: null, aloneRule: undefined, permissions: undefined };
  }
  const isBarePolicy = 'approvals_enabled' in payload || 'approvalsEnabled' in payload;
  if (isBarePolicy) return { policy: payload, aloneRule: undefined, permissions: undefined };
  const permissions = Array.isArray(payload.permissions) && payload.permissions.length
    ? payload.permissions.map((p) => String(p))
    : undefined;
  return {
    policy: payload.policy && typeof payload.policy === 'object' ? payload.policy : null,
    aloneRule: payload.aloneRule && typeof payload.aloneRule === 'object' ? payload.aloneRule : null,
    permissions,
  };
}
