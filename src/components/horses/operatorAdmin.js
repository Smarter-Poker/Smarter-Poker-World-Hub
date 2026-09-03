/**
 * /api/horses/operator-admin - every request this console makes to it, as
 * pure builders.
 *
 * The route is written in parallel to PHASE2-CONTRACTS section 2:
 *
 *   GET  ?section=staff | roles | policy | approvals | audit_trail
 *   POST { action: grant_role | revoke_role | set_policy | decide_approval }
 *
 * Building the query strings and the bodies here rather than at six call
 * sites buys two things. A wrong parameter name fails a unit test instead of
 * failing silently in production as a filter nobody applied - which is
 * exactly how the Phase 1 audit tab shipped with three filters wired into
 * state, threaded into the query and rendered by no input at all. And an
 * empty value is dropped in ONE place, so `?targetType=&targetId=` can never
 * reach a route that reads an empty string as a filter for the empty string.
 *
 * Pure, dependency free, unit tested with a plain `node --test`.
 */

export const OPERATOR_ADMIN = '/api/horses/operator-admin';

/** Grants and revokes both carry an operator-written reason. Ten characters
 *  is not a formality: it is the difference between a trail that answers
 *  "why does this person hold this role" and one that says "granted". */
export const MIN_REASON_LENGTH = 10;

export function reasonIsValid(reason) {
  return String(reason || '').trim().length >= MIN_REASON_LENGTH;
}

/** Drop null, undefined and '' - never send a filter nobody set. */
function query(params = {}) {
  const search = new URLSearchParams();
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  return search;
}

export function operatorAdminUrl(section, params = {}) {
  // section first, so a URL reads as what it asks for.
  const search = new URLSearchParams();
  search.set('section', String(section));
  for (const [key, value] of query(params).entries()) {
    if (key === 'section') continue;
    search.set(key, value);
  }
  return `${OPERATOR_ADMIN}?${search.toString()}`;
}

export const staffUrl = () => operatorAdminUrl('staff');
export const rolesUrl = () => operatorAdminUrl('roles');
export const policyUrl = () => operatorAdminUrl('policy');

/** One page of the queue or of the history. */
export function approvalsUrl({
  status = '', kind = '', from = '', to = '', limit = 50, offset = 0,
} = {}) {
  return operatorAdminUrl('approvals', {
    status, kind, from, to, limit, offset: Math.max(0, Number(offset) || 0),
  });
}

/**
 * One record's full history, newest first (fn_ca_operator_audit_trail).
 *
 * Returns null unless BOTH a target type and a target id are present, which
 * is what the route requires - it answers 400 "A Target Type And Target Id
 * Are Both Required" for either one on its own. Two reasons, and they agree:
 * an id with no type matches the same uuid in every other table, and a trail
 * with no id at all is a request for every audit row ever written, which is
 * not what a per-row button means. Refusing here is what lets the caller
 * disable the button instead of discovering the rule as a failed request.
 */
export function auditTrailUrl({ targetType = '', targetId = '', limit = 50, offset = 0 } = {}) {
  const id = String(targetId || '').trim();
  const type = String(targetType || '').trim();
  if (!id || !type) return null;
  return operatorAdminUrl('audit_trail', {
    targetType: type,
    targetId: id,
    limit,
    offset: Math.max(0, Number(offset) || 0),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST BODIES
// ═══════════════════════════════════════════════════════════════════════════

/** null when the input is not good enough to send. The caller shows the
 *  reason; nothing half-formed reaches a route that writes a grant. */
export function grantRoleBody({ userId, roleKey, reason } = {}) {
  if (!userId || !roleKey || !reasonIsValid(reason)) return null;
  return {
    action: 'grant_role',
    userId: String(userId),
    roleKey: String(roleKey),
    reason: String(reason).trim(),
  };
}

export function revokeRoleBody({ grantId, reason } = {}) {
  if (!grantId || !reasonIsValid(reason)) return null;
  return { action: 'revoke_role', grantId: String(grantId), reason: String(reason).trim() };
}

/** The TTL bounds the route enforces (`int(value, { min: 5, max: 43200 })`).
 *  Stated here so the input, the hint and the guard all read one number and
 *  the console cannot accept a value it then fails to save. */
export const TTL_MIN_MINUTES = 5;
export const TTL_MAX_MINUTES = 43_200;
export const TTL_DEFAULT_MINUTES = 1440;

/**
 * The policy row, normalised - and a PATCH when there is something to diff
 * against.
 *
 * Numbers are sent as numbers: a threshold typed into a text input arrives as
 * a string, and a string threshold compared against an amount is the kind of
 * bug that only shows up above 9.
 *
 * WHY THE SECOND ARGUMENT EXISTS. `set_policy` on the route is a genuine
 * patch: it skips every field the body omits and refuses an empty one. This
 * used to send all six fields on every save regardless, which made two
 * things possible that should not be. Two operators editing the policy in the
 * same window silently overwrote each other's thresholds; and a save composed
 * over a FAILED policy read wrote the shipped defaults onto the live row -
 * approvals off, every threshold zero - which is the exact control Phase 2
 * exists to add, turned off by a fetch that timed out. Passing the loaded
 * policy makes the body carry only what this operator actually changed.
 *
 * Returns NULL when nothing changed, so the caller says "Nothing Changed"
 * rather than sending a body the route answers 400 to.
 */
export function setPolicyBody(policy = {}, saved = null) {
  const int = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const draft = {
    approvalsEnabled: policy.approvals_enabled === true,
    allowSelfApproveWhenAlone: policy.allow_self_approve_when_alone === true,
    mintThreshold: int(policy.mint_threshold, 0),
    fundThreshold: int(policy.fund_threshold, 0),
    cashoutThreshold: int(policy.cashout_threshold, 0),
    approvalTtlMinutes: int(policy.approval_ttl_minutes, TTL_DEFAULT_MINUTES),
  };
  if (!saved || typeof saved !== 'object') return { action: 'set_policy', ...draft };

  const current = {
    approvalsEnabled: saved.approvals_enabled === true,
    allowSelfApproveWhenAlone: saved.allow_self_approve_when_alone === true,
    mintThreshold: int(saved.mint_threshold, 0),
    fundThreshold: int(saved.fund_threshold, 0),
    cashoutThreshold: int(saved.cashout_threshold, 0),
    approvalTtlMinutes: int(saved.approval_ttl_minutes, TTL_DEFAULT_MINUTES),
  };
  const patch = {};
  for (const key of Object.keys(draft)) {
    if (draft[key] !== current[key]) patch[key] = draft[key];
  }
  if (Object.keys(patch).length === 0) return null;
  return { action: 'set_policy', ...patch };
}

export function decideApprovalBody({ approvalId, decision, note } = {}) {
  const d = String(decision || '').toLowerCase();
  if (!approvalId || (d !== 'approve' && d !== 'reject')) return null;
  return {
    action: 'decide_approval',
    approvalId: String(approvalId),
    decision: d,
    note: String(note || '').trim(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPES COMING BACK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The role-by-permission matrix, from whichever shape the route sends.
 *
 * ca_operator_role_permissions is a join table, so the honest answer is rows
 * of (role_key, permission); a route may equally hand over a map, or fold the
 * permissions into each role. All three are read here rather than guessed at
 * the call site, and an unreadable payload produces an EMPTY matrix, never a
 * partial one - a matrix missing half its ticks tells an operator that a role
 * cannot do something it can.
 *
 * @returns {{ roles: Array, permissions: string[], grid: Object }}
 *   `grid[roleKey][permission]` is true where the role holds it.
 */
export function permissionMatrix(payload) {
  const roles = [];
  const grid = {};
  const permissionSet = new Set();

  // A role may be met twice - once as a key in the `matrix` map and once as a
  // full object in `rows` - and in either order. So the metadata is UPGRADED
  // on a later sighting rather than only recorded on the first: whichever way
  // round the payload happens to be read, the label and the legacy flag
  // survive instead of the column heading falling back to a bare role key.
  const addRole = (key, label, isLegacy, description) => {
    const k = String(key);
    if (!grid[k]) {
      grid[k] = {};
      roles.push({
        key: k,
        label: label || k,
        isLegacy: isLegacy === true,
        description: description || '',
      });
      return grid[k];
    }
    const existing = roles.find((role) => role.key === k);
    if (existing) {
      if (label) existing.label = label;
      if (isLegacy === true) existing.isLegacy = true;
      if (description) existing.description = description;
    }
    return grid[k];
  };

  const addPermission = (roleKey, permission) => {
    const p = String(permission);
    if (!p) return;
    permissionSet.add(p);
    addRole(roleKey)[p] = true;
  };

  if (payload && typeof payload === 'object') {
    // Declared roles first, so a role with no permissions still gets a column
    // and reads as "holds nothing" rather than vanishing from the table.
    const declared = Array.isArray(payload.roles) ? payload.roles : [];
    for (const role of declared) {
      if (!role) continue;
      const key = role.key || role.role_key;
      if (!key) continue;
      addRole(key, role.label, role.is_legacy === true || role.isLegacy === true, role.description);
      const own = Array.isArray(role.permissions) ? role.permissions : [];
      for (const permission of own) addPermission(key, permission);
    }

    if (Array.isArray(payload.permissions)) {
      for (const permission of payload.permissions) {
        if (permission) permissionSet.add(String(permission));
      }
    }

    const map = payload.matrix;
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const key of Object.keys(map)) {
        const own = Array.isArray(map[key]) ? map[key] : [];
        addRole(key);
        for (const permission of own) addPermission(key, permission);
      }
    }

    // `rows` is the paged field name, and the route puts the ROLE objects
    // there (key, label, is_legacy, permissions[]) - while a join table read
    // straight out of ca_operator_role_permissions is PAIRS. Both arrive
    // under the same field name, so each entry is read for what it is rather
    // than for where it sits: an entry with a `permission` is a pair, an
    // entry with a key and no `permission` is a role.
    const entries = [
      ...(Array.isArray(payload.rows) ? payload.rows : []),
      ...(Array.isArray(payload.matrix) ? payload.matrix : []),
    ];
    for (const entry of entries) {
      if (!entry) continue;
      const key = entry.role_key || entry.roleKey || entry.key;
      if (!key) continue;
      if (entry.permission) {
        addPermission(key, entry.permission);
        continue;
      }
      addRole(
        key,
        entry.label,
        entry.is_legacy === true || entry.isLegacy === true,
        entry.description,
      );
      const own = Array.isArray(entry.permissions) ? entry.permissions : [];
      for (const permission of own) addPermission(key, permission);
    }
  }

  return {
    roles,
    permissions: Array.from(permissionSet).sort(),
    grid,
  };
}

/**
 * WHO DID THIS, from a trail row.
 *
 * `fn_ca_operator_audit_trail` selects `a.admin_user_id, a.actor_role` and the
 * route passes the rows through untouched. The dialog read `admin_name` and
 * `admin_role`, which only the `stable-admin` audit_log route synthesises from
 * a profile join - so every entry in a per-record trail was attributed to
 * "System / Cron" with no role, on the one dialog whose entire purpose is
 * "who did what to this record".
 *
 * Both shapes are read, the enriched one first, and the id is shown when
 * there is no name: a uuid is not friendly but it IS the answer, and
 * "System / Cron" over a row that names an admin perfectly well is the
 * console withholding what it has. "System / Cron" survives for the rows that
 * genuinely have no actor - a cron writes those, and `admin_user_id` is null.
 */
export function trailActor(row) {
  if (!row || typeof row !== 'object') {
    return { label: 'Not Recorded', role: '', isId: false };
  }
  const name = row.admin_name || row.admin_label || row.admin_display_name || '';
  const id = row.admin_user_id || row.adminUserId || row.admin_id || '';
  const role = row.admin_role || row.actor_role || row.actorRole || '';
  if (name) return { label: String(name), role: String(role || ''), isId: false };
  if (id) return { label: String(id), role: String(role || ''), isId: true };
  return { label: 'System / Cron', role: String(role || ''), isId: false };
}

/**
 * MAKER-CHECKER IS ON, OFF, OR NOT KNOWN - and the third one is a real state.
 *
 * A failed policy read leaves `policy` null, and both surfaces printed that
 * as the flat sentence "Maker-Checker Is Currently Off". If approvals are in
 * fact ON, the console has told three operators the opposite about a money
 * control, from an absence. An unknown is not an off.
 */
export function approvalsStateLabel(policy) {
  if (!policy || typeof policy !== 'object') return 'Not Known';
  return policy.approvals_enabled === true ? 'On' : 'Off';
}

/** True only when a policy row has actually been read. */
export function policyIsKnown(policy) {
  return !!policy && typeof policy === 'object';
}

/**
 * The rest of the paged envelope: what the route said about the WHOLE set.
 *
 * PHASE1-CONTRACTS addendum item 10: every list response carries `total` and
 * `truncated`, and the client renders "Showing N Of Total" wherever
 * `truncated` is true. The Staff table read `rows` and nothing else, so a
 * roster over the 200 cap would have rendered as if it were the whole roster.
 * A fabricated total is worse than none, so an absent one stays null.
 */
export function listMeta(payload, rowCount = 0) {
  const meta = { total: null, truncated: false, hasMore: undefined, shown: rowCount };
  if (!payload || typeof payload !== 'object') return meta;
  if (typeof payload.total === 'number') meta.total = payload.total;
  if (typeof payload.hasMore === 'boolean') meta.hasMore = payload.hasMore;
  if (payload.truncated === true) meta.truncated = true;
  else if (meta.total !== null && meta.total > rowCount) meta.truncated = true;
  return meta;
}

/** The paged envelope, read whichever field name the route used. */
export function rowsOf(payload, ...aliases) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  for (const alias of aliases) {
    if (Array.isArray(payload[alias])) return payload[alias];
  }
  return [];
}
