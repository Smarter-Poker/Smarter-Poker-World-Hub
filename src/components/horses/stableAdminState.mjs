/**
 * Pure state transitions for the Stable Admin operator context.
 *
 * `null` is deliberate here. It means that the console has not been given an
 * answer for that field; it must not be widened to an empty list/object. In
 * particular, the existing permissions contract treats null as "not told" and
 * an empty array as "told that this operator holds no grants".
 */
export const UNKNOWN_OPERATOR_CONTEXT = Object.freeze({
  contextStatus: 'unknown',
  currentUser: null,
  operatorId: null,
  operatorRole: null,
  permissions: null,
  policy: null,
  aloneRule: null,
  permissionsDegraded: false,
  sessionGeneration: 0,
  navigationBadges: null,
  socialSettings: null,
});

const FIELDS = [
  'operatorId',
  'currentUser',
  'operatorRole',
  'permissions',
  'policy',
  'aloneRule',
  'permissionsDegraded',
  'navigationBadges',
  'socialSettings',
];

const has = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

/** A new object for each store/reset; callers cannot mutate the frozen seed. */
export function unknownOperatorContext(fallbackOperatorId = null, sessionGeneration = 0) {
  return {
    ...UNKNOWN_OPERATOR_CONTEXT,
    operatorId: fallbackOperatorId || null,
    sessionGeneration: Math.max(0, Number(sessionGeneration) || 0),
  };
}

/** Replace the complete context after the policy route has answered. */
export function readyOperatorContext(payload = {}, fallbackOperatorId = null, sessionGeneration = 0) {
  return {
    contextStatus: 'ready',
    currentUser: has(payload, 'currentUser') ? payload.currentUser : null,
    operatorId: has(payload, 'operatorId') ? payload.operatorId : (fallbackOperatorId || null),
    operatorRole: has(payload, 'operatorRole') ? payload.operatorRole : null,
    permissions: has(payload, 'permissions') ? payload.permissions : null,
    policy: has(payload, 'policy') ? payload.policy : null,
    aloneRule: has(payload, 'aloneRule') ? payload.aloneRule : null,
    permissionsDegraded: payload.permissionsDegraded === true,
    sessionGeneration: Math.max(0, Number(sessionGeneration) || 0),
    navigationBadges: has(payload, 'navigationBadges') ? payload.navigationBadges : null,
    socialSettings: has(payload, 'socialSettings') ? payload.socialSettings : null,
  };
}

/**
 * Apply only fields the caller actually supplied. Explicit null clears a
 * field; omission preserves it. This is required for policy saves, whose
 * response may update policy/aloneRule without returning the grant list.
 */
export function patchOperatorContext(current, patch = {}) {
  const next = { ...current, contextStatus: 'ready' };
  for (const field of FIELDS) {
    if (has(patch, field)) next[field] = patch[field];
  }
  if (has(patch, 'permissionsDegraded')) {
    next.permissionsDegraded = patch.permissionsDegraded === true;
  }
  return next;
}
