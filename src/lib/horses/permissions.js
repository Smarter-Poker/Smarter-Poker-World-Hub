/**
 * Operator console permissions - the single vocabulary every /horses route
 * and every /horses tab checks against.
 *
 * Phase 1 (2026-09-02): the vocabulary exists and the three legacy roles
 * (god, superadmin, admin) map to EVERY permission, so behaviour is exactly
 * what it was before this file existed: one flat tier. Phase 2 adds named
 * operator roles (operations, finance, compliance, support, read_only) with
 * grants stored in the database; nothing in this file will need to change
 * for a route, because routes ask for a permission, never for a role.
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
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/** The three profile roles that reach the console today. Order is rank. */
export const LEGACY_ADMIN_ROLES = Object.freeze(['god', 'superadmin', 'admin']);

/**
 * Role -> permissions. Phase 1 keeps the legacy tier intact: every legacy
 * role holds every permission. Phase 2 will add the narrower operator roles
 * here (and in operator_role_grants) without touching any route.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  god: ALL_PERMISSIONS,
  superadmin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
});

export function isKnownPermission(permission) {
  return typeof permission === 'string' && ALL_PERMISSIONS.includes(permission);
}

/** Permissions a profile role carries. Unknown or missing role -> none. */
export function permissionsForRole(role) {
  if (typeof role !== 'string') return [];
  const perms = ROLE_PERMISSIONS[role];
  return perms ? [...perms] : [];
}

export function hasPermission(permissions, permission) {
  if (!Array.isArray(permissions) || !isKnownPermission(permission)) return false;
  return permissions.includes(permission);
}

/** True when the role reaches the console at all. */
export function isOperatorRole(role) {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}
