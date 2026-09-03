/**
 * Operator console permissions - the single vocabulary every /horses route
 * and every /horses tab checks against.
 *
 * Phase 1 (2026-09-02): the vocabulary existed and the three legacy roles
 * (god, superadmin, admin) mapped to EVERY permission, so behaviour was exactly
 * what it was before this file existed: one flat tier.
 *
 * Phase 2 (2026-09-03): the named operator roles arrive - owner, operations,
 * finance, compliance, support, read_only - plus `admin.manage`, the permission
 * that gates granting roles and editing the operator policy.
 *
 * PHASE2-CONTRACTS.md SECTION 0 IS THE RULE THAT SHAPES THIS FILE. Production
 * has one `god` and two `admin` accounts. A named role may only ever WIDEN what
 * an operator can do until Dan turns the enforcement flag on, so:
 *
 *   - the three legacy keys still map to ALL_PERMISSIONS, unchanged;
 *   - `owner` is the named equivalent of that superset, so an owner grant on a
 *     legacy account changes nothing;
 *   - the four narrower roles are ADDITIVE grants, unioned with whatever the
 *     profile role already carries (see operatorAuth.resolveOperatorPermissions);
 *   - nothing here can subtract. Narrowing happens in exactly one place, when
 *     ca_operator_policy.enforce_named_roles is true, and that flag defaults to
 *     false.
 *
 * Routes ask for a PERMISSION, never for a role. That is why adding six roles
 * needs no route change.
 *
 * Pure module: no imports, safe to unit test under node --test.
 */

export const PERMISSIONS = Object.freeze({
  CONSOLE_READ: 'console.read',
  AUDIT_READ: 'audit.read',
  FLEET_READ: 'fleet.read',
  FLEET_WRITE: 'fleet.write',
  PLAYERS_READ: 'players.read',
  PLAYERS_WRITE: 'players.write',
  SUPPORT_WRITE: 'support.write',
  MODERATION_WRITE: 'moderation.write',
  CLUBS_READ: 'clubs.read',
  CLUBS_WRITE: 'clubs.write',
  MONEY_READ: 'money.read',
  MONEY_WRITE: 'money.write',
  CASHIER_WRITE: 'cashier.write',
  PROMO_WRITE: 'promo.write',
  CATALOG_WRITE: 'catalog.write',
  CONTENT_WRITE: 'content.write',
  SETTINGS_WRITE: 'settings.write',
  AVATARS_GENERATE: 'avatars.generate',
  GDPR_ERASE: 'gdpr.erase',
  SQL_EXECUTE: 'sql.execute',
  // Phase 2. Granting and revoking operator roles, and editing the operator
  // policy (approvals on/off, thresholds, the alone-rule). Held by `owner` and
  // the three legacy roles and by nothing else.
  ADMIN_MANAGE: 'admin.manage',
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/** The three profile roles that reach the console today. Order is rank. */
export const LEGACY_ADMIN_ROLES = Object.freeze(['god', 'superadmin', 'admin']);

/** The Phase 2 named roles, widest first. Stored in ca_operator_roles. */
export const NAMED_OPERATOR_ROLES = Object.freeze([
  'owner',
  'operations',
  'finance',
  'compliance',
  'support',
  'read_only',
]);

const P = PERMISSIONS;

/**
 * Everything an operator of any stripe can do without being able to change
 * anything: the console floor. Every named role holds it.
 */
const READ_FLOOR = [P.CONSOLE_READ, P.AUDIT_READ, P.FLEET_READ, P.PLAYERS_READ, P.CLUBS_READ];

/**
 * Role -> permissions.
 *
 * The legacy three are the full superset and MUST stay that way (section 0).
 * `owner` matches them so the named vocabulary can describe the accounts that
 * already exist. The rest are the job-shaped sets the console's tabs need.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  god: ALL_PERMISSIONS,
  superadmin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,

  owner: ALL_PERMISSIONS,

  // Runs the platform day to day: the fleet, the clubs, the content, the
  // settings. Deliberately holds no money write and no sql.execute.
  operations: Object.freeze([
    ...READ_FLOOR,
    P.FLEET_WRITE,
    P.PLAYERS_WRITE,
    P.CLUBS_WRITE,
    P.SUPPORT_WRITE,
    P.MODERATION_WRITE,
    P.CONTENT_WRITE,
    P.SETTINGS_WRITE,
    P.CATALOG_WRITE,
    P.PROMO_WRITE,
    P.AVATARS_GENERATE,
    P.MONEY_READ,
  ]),

  // The Mint, the cashier and the club treasuries. No moderation, no content,
  // no fleet write: this role moves money and nothing else.
  finance: Object.freeze([
    ...READ_FLOOR,
    P.MONEY_READ,
    P.MONEY_WRITE,
    P.CASHIER_WRITE,
    P.CLUBS_WRITE,
    P.PROMO_WRITE,
  ]),

  // Reads everything, sanctions players, erases on request. Cannot move money
  // and cannot change engine settings.
  compliance: Object.freeze([
    ...READ_FLOOR,
    P.MONEY_READ,
    P.MODERATION_WRITE,
    P.PLAYERS_WRITE,
    P.GDPR_ERASE,
  ]),

  // The help desk. Answers tickets, edits a player, sees the club they are in.
  support: Object.freeze([...READ_FLOOR, P.SUPPORT_WRITE, P.PLAYERS_WRITE]),

  // Sees the console, changes nothing.
  read_only: Object.freeze([...READ_FLOOR, P.MONEY_READ]),
});

/**
 * Presentation metadata for the Staff And Roles tab, mirroring the
 * ca_operator_roles seed so the console can render the matrix even before the
 * Phase 2 migration is applied.
 */
export const ROLE_META = Object.freeze({
  god: {
    label: 'God',
    description: 'Legacy Platform Owner. Every Permission.',
    rank: 100,
    isLegacy: true,
  },
  superadmin: {
    label: 'Super Admin',
    description: 'Legacy Platform Admin. Every Permission.',
    rank: 90,
    isLegacy: true,
  },
  admin: {
    label: 'Admin',
    description: 'Legacy Console Admin. Every Permission.',
    rank: 80,
    isLegacy: true,
  },
  owner: {
    label: 'Owner',
    description: 'Named Equivalent Of The Legacy Roles. Manages Operators And Policy.',
    rank: 70,
    isLegacy: false,
  },
  operations: {
    label: 'Operations',
    description: 'Fleet, Clubs, Content And Settings. No Money Writes.',
    rank: 60,
    isLegacy: false,
  },
  finance: {
    label: 'Finance',
    description: 'The Mint, The Cashier And Club Treasuries.',
    rank: 50,
    isLegacy: false,
  },
  compliance: {
    label: 'Compliance',
    description: 'Reads Everything, Sanctions Players, Handles Erasure Requests.',
    rank: 40,
    isLegacy: false,
  },
  support: {
    label: 'Support',
    description: 'Tickets And Player Records.',
    rank: 30,
    isLegacy: false,
  },
  read_only: {
    label: 'Read Only',
    description: 'Sees The Console, Changes Nothing.',
    rank: 10,
    isLegacy: false,
  },
});

/** Every role key the console knows, named first then legacy. */
export const OPERATOR_ROLE_KEYS = Object.freeze([...NAMED_OPERATOR_ROLES, ...LEGACY_ADMIN_ROLES]);

export function isKnownPermission(permission) {
  return typeof permission === 'string' && ALL_PERMISSIONS.includes(permission);
}

/** True when the key names a role this console can grant or recognise. */
export function isKnownRole(role) {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

/** True when the key is one of the three roles that predate Phase 2. */
export function isLegacyRole(role) {
  return LEGACY_ADMIN_ROLES.includes(role);
}

/** Permissions a profile role carries. Unknown or missing role -> none. */
export function permissionsForRole(role) {
  if (typeof role !== 'string') return [];
  const perms = ROLE_PERMISSIONS[role];
  return perms ? [...perms] : [];
}

/**
 * De-duplicate a permission list into the canonical ALL_PERMISSIONS order, so
 * two operators holding the same set always compare equal and the Staff tab
 * renders the matrix in one order. Anything the database knows and this file
 * does not is KEPT, appended in encounter order: a permission dropped here
 * would be a silent narrowing, which section 0 forbids.
 */
export function orderPermissions(list) {
  const seen = new Set();
  for (const value of Array.isArray(list) ? list : []) {
    if (typeof value === 'string' && value) seen.add(value);
  }
  const known = ALL_PERMISSIONS.filter((p) => seen.has(p));
  const extra = [...seen].filter((p) => !ALL_PERMISSIONS.includes(p));
  return [...known, ...extra];
}

/** The union of every role's set, in canonical order. Roles are ADDITIVE. */
export function permissionsForRoles(roles) {
  const out = [];
  for (const role of Array.isArray(roles) ? roles : []) out.push(...permissionsForRole(role));
  return orderPermissions(out);
}

/** The union of any number of permission lists, in canonical order. */
export function mergePermissions(...lists) {
  const out = [];
  for (const list of lists) if (Array.isArray(list)) out.push(...list);
  return orderPermissions(out);
}

export function hasPermission(permissions, permission) {
  if (!Array.isArray(permissions) || !isKnownPermission(permission)) return false;
  return permissions.includes(permission);
}

/**
 * True when the role reaches the console at all.
 *
 * Phase 2 widens this to the named roles as well. That is additive by
 * construction: a profiles.role of 'support' reached nothing before, so nobody
 * loses access, and anyone who gains it gains only the support set.
 */
export function isOperatorRole(role) {
  return isKnownRole(role);
}

/** role x permission, for the Staff And Roles matrix. */
export function permissionMatrix(roles = OPERATOR_ROLE_KEYS) {
  const out = {};
  for (const role of roles) out[role] = permissionsForRole(role);
  return out;
}
