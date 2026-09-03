/**
 * /api/horses/operator-admin - every request this console makes to it, as
 * pure builders.
 *
 * The route is written in parallel to PHASE2-CONTRACTS section 2:
 *
 *   GET  ?section=staff | roles | policy | approvals | audit_trail
 *   POST { action: grant_role | revoke_role | set_policy | decide_approval
 *                | execute_approval }
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

/**
 * Re-drive an approved or failed row (POST `execute_approval`).
 *
 * `decide_approval` executes the money RPC in the same request, and when that
 * RPC cannot be reached the route marks the row `failed`, answers 503
 * `execution_unavailable` and tells the operator to run it again from the
 * Approvals tab. This is the body that request needs. It carries the id and
 * nothing else: the row already holds the op_id, the payload and the kind,
 * and an execution keyed on anything the client re-supplies is an execution
 * that can be talked into running something other than what was approved.
 */
export function executeApprovalBody(approvalId) {
  if (!approvalId) return null;
  return { action: 'execute_approval', approvalId: String(approvalId) };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE POLICY FORM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Is this threshold something the route will accept?
 *
 * The route reads each threshold through `money2dp(..., { allowZero: true })`
 * and answers 400 to a negative, to more than two decimals, and to anything
 * that is not a number. `type="number" min="0"` stops none of a typed `-5`,
 * a typed `10.005` or an emptied box - and the emptied box used to be sent as
 * 0, which with approvals on means "everything goes for approval". So an
 * empty string is INVALID here, never zero: a threshold the operator has not
 * typed is not a threshold of nothing.
 */
export function thresholdIsValid(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  if (!s) return false;
  return /^\d+(\.\d{1,2})?$/.test(s);
}

/** A whole number of minutes inside the route's bounds. */
export function ttlIsValid(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return n >= TTL_MIN_MINUTES && n <= TTL_MAX_MINUTES;
}

export const POLICY_FIELD_LABELS = {
  approvalsEnabled: 'Require Approvals',
  allowSelfApproveWhenAlone: 'Alone Rule',
  mintThreshold: 'Mint Threshold',
  fundThreshold: 'Club Funding Threshold',
  cashoutThreshold: 'Cashout Threshold',
  approvalTtlMinutes: 'Approval Window',
};

/**
 * Everything wrong with a policy draft, as the sentences the form shows.
 *
 * Empty means the draft can be saved. Each problem names its field, because
 * a Save button that is disabled with no reason next to it is a Save button
 * the operator presses harder.
 */
export function policyDraftProblems(draft = {}) {
  const problems = [];
  const thresholds = [
    ['mint_threshold', POLICY_FIELD_LABELS.mintThreshold],
    ['fund_threshold', POLICY_FIELD_LABELS.fundThreshold],
    ['cashout_threshold', POLICY_FIELD_LABELS.cashoutThreshold],
  ];
  for (const [key, label] of thresholds) {
    if (!thresholdIsValid(draft[key])) {
      problems.push(`The ${label} Must Be A Number Of Zero Or More, To At Most Two Decimals.`);
    }
  }
  if (!ttlIsValid(draft.approval_ttl_minutes)) {
    problems.push(
      `The Approval Window Must Be A Whole Number Between ${TTL_MIN_MINUTES.toLocaleString()} And ${TTL_MAX_MINUTES.toLocaleString()} Minutes.`,
    );
  }
  return problems;
}

/**
 * What a `set_policy` patch changes, field by field, as "Label From To To".
 *
 * The confirm dialog used to announce "Turning Approvals On" whenever the
 * draft had approvals on, so changing only the TTL with approvals already on
 * read as switching them on. The patch is the truth about what will be sent,
 * so the sentence is built from the patch and the row it was diffed against.
 * `approvalsEnabled` is left out on purpose: the dialog has a paragraph for
 * that switch, and this list is for the other five fields.
 */
export function describePolicyPatch(patch, saved = null) {
  if (!patch || typeof patch !== 'object') return [];
  const current = saved && typeof saved === 'object' ? saved : {};
  const savedKey = {
    allowSelfApproveWhenAlone: 'allow_self_approve_when_alone',
    mintThreshold: 'mint_threshold',
    fundThreshold: 'fund_threshold',
    cashoutThreshold: 'cashout_threshold',
    approvalTtlMinutes: 'approval_ttl_minutes',
  };
  const word = (key, value) => {
    if (key === 'allowSelfApproveWhenAlone') return value === true ? 'On' : 'Off';
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : 'Not Set';
  };
  const out = [];
  for (const key of Object.keys(savedKey)) {
    if (!(key in patch)) continue;
    const from = word(key, current[savedKey[key]]);
    const to = word(key, patch[key]);
    const unit = key === 'approvalTtlMinutes' ? ' Minutes' : '';
    out.push(`${POLICY_FIELD_LABELS[key]} ${from} To ${to}${unit}`);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// WHO IS AN OPERATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ask the route whether this bearer belongs to an operator.
 *
 * The sub-pages used to decide that for themselves from `profiles.role in
 * (admin, superadmin, god)`, which is exactly the list Phase 2 made
 * incomplete: `requireOperator` admits an active ca_operator_grants row too,
 * so a `finance` grant to an account whose profile role is `user` was a real
 * operator the pages sent home. The route's answer is the answer. A 200 is
 * an operator. A 401 or a 403 is a refusal. Anything else - a 503 while the
 * roster is down, a network failure, an HTML error page - is "could not
 * verify", which is neither a pass nor a denial and is reported as such so
 * the page can offer a retry.
 *
 * `fetchImpl` is injected so this stays unit testable without a browser.
 *
 * @returns {Promise<{ ok: true, status: number, body: object }
 *   | { ok: false, denied: boolean, status: number, error: string }>}
 */
export async function operatorGate(token, fetchImpl = globalThis.fetch) {
  if (!token) return { ok: false, denied: true, status: 401, error: 'Not Signed In.' };
  let res;
  try {
    res = await fetchImpl(policyUrl(), {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    return { ok: false, denied: false, status: 0, error: (err && err.message) || 'Network Failure.' };
  }
  let body = {};
  try { body = await res.json(); } catch { body = {}; }
  if (!body || typeof body !== 'object') body = {};
  const status = Number(res.status) || 0;
  if (status === 401 || status === 403) {
    return { ok: false, denied: true, status, error: body.error || 'Access Denied.' };
  }
  if (!res.ok || body.success === false) {
    return { ok: false, denied: false, status, error: body.error || `Request Failed (${status}).` };
  }
  return { ok: true, status, body };
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
