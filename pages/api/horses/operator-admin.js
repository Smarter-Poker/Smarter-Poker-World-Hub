/**
 * OPERATOR ADMIN - staff, roles, policy and the approvals queue.
 *
 * GET  /api/horses/operator-admin?section=staff
 * GET  /api/horses/operator-admin?section=roles
 * GET  /api/horses/operator-admin?section=policy
 * GET  /api/horses/operator-admin?section=approvals&status=&kind=&from=&to=&limit=&offset=
 * GET  /api/horses/operator-admin?section=audit_trail&targetType=&targetId=&limit=&offset=
 *
 * POST /api/horses/operator-admin { action: 'grant_role',      userId, roleKey, reason }
 * POST /api/horses/operator-admin { action: 'revoke_role',     grantId, reason }
 * POST /api/horses/operator-admin { action: 'set_policy',      ...fields }
 * POST /api/horses/operator-admin { action: 'decide_approval', approvalId, decision, note }
 *
 * PHASE2-CONTRACTS.md SECTION 2. Permissions, exactly as the contract states
 * them: staff / roles / policy read `console.read`; grant_role, revoke_role and
 * set_policy need `admin.manage`, which only `owner` and the three legacy roles
 * hold; decide_approval needs the permission the underlying KIND needs, so a
 * finance operator can approve a mint and a support operator cannot.
 *
 * SECTION 0 STILL OUTRANKS ALL OF IT. Every read here degrades to a default
 * rather than a 500 when the Phase 2 migration has not been applied yet, and no
 * write on this route can remove access anybody has today: a revoke only bites
 * once `enforce_named_roles` is true, and that flag defaults to false.
 *
 * The route-level permission is the console FLOOR (console.read). The real gate
 * is SECTION_PERMISSIONS / ACTION_PERMISSIONS below, checked inside the handler,
 * because the wrapper cannot see `query.section` or `body.action`. This is the
 * same shape stable-admin.js settled on for the same reason.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import {
  PERMISSIONS,
  ROLE_META,
  ALL_PERMISSIONS,
  OPERATOR_ROLE_KEYS,
  hasPermission,
  isKnownRole,
  permissionsForRole,
  permissionsForRoles,
} from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, forbidden } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import {
  loadOperatorPolicy,
  normalizeOperatorPolicy,
  invalidateOperatorPolicyCache,
} from '../../../src/lib/horses/operatorAuth.js';
import {
  APPROVAL_KINDS,
  KIND_PERMISSION,
  canDecideApproval,
  DECISION_REFUSAL_TEXT,
} from '../../../src/lib/horses/approvals.js';
import { mapDbError } from '../../../src/lib/horses/dbErrors.js';
import { runPaged } from '../../../src/lib/horses/paged.js';
import { pageFor, shapeList } from '../../../src/lib/horses/listShape.js';
import { uuid, enumOf, int, text, bool, money2dp, isoDate } from '../../../src/lib/horses/validate.js';

const SECTIONS = ['staff', 'roles', 'policy', 'approvals', 'audit_trail'];
const ACTIONS = ['grant_role', 'revoke_role', 'set_policy', 'decide_approval'];

/**
 * Addendum item 10: a list the console renders without a pager keeps its own
 * cap, the cap is visible here in code, and the response always says
 * `truncated` so a capped list can never pass as a complete one.
 */
const STAFF_PAGE = { defaultLimit: 200, max: 500 };
const APPROVALS_PAGE = { defaultLimit: 100, max: 500 };
const TRAIL_PAGE = { defaultLimit: 100, max: 500 };

/**
 * The audit trail's minimum reason length, shared with the console
 * (src/components/horses/operatorAdmin.js MIN_REASON_LENGTH) and with
 * /api/horses/mint, which has always required ten.
 */
const MIN_REASON_LENGTH = 10;

const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'executed',
  'expired',
  'auto_approved',
  'failed',
];

const APPROVAL_FIELDS =
  'id, kind, status, requested_by, requested_at, decided_by, decided_at, executed_at, ' +
  'expires_at, amount, asset, target_type, target_id, reason, op_id, blocked_reason, request_id';

const SECTION_PERMISSIONS = Object.freeze({
  staff: PERMISSIONS.CONSOLE_READ,
  roles: PERMISSIONS.CONSOLE_READ,
  policy: PERMISSIONS.CONSOLE_READ,
  approvals: PERMISSIONS.CONSOLE_READ,
  audit_trail: PERMISSIONS.AUDIT_READ,
});

const ACTION_PERMISSIONS = Object.freeze({
  grant_role: PERMISSIONS.ADMIN_MANAGE,
  revoke_role: PERMISSIONS.ADMIN_MANAGE,
  set_policy: PERMISSIONS.ADMIN_MANAGE,
  // decide_approval is resolved per KIND, from KIND_PERMISSION, once the row is
  // read. It has no fixed answer.
  decide_approval: null,
});

function requirePermission(op, permission) {
  if (!hasPermission(op?.permissions, permission)) {
    throw forbidden('Permission Required: ' + permission, 'permission_denied');
  }
}

/**
 * WHO IS ASKING, said out loud.
 *
 * The console filters its tab strip and its buttons on `op.permissions`, and
 * until this shipped no section of this route ever SENT them - the client's
 * `permissionsFromPayload` read a key that was never there, got null, and
 * fell back to "show everything". That fallback is correct (section 0: never
 * hide a tab because a fetch failed) but it is a safety net, not an answer,
 * and a console that always takes the net cannot describe a narrow role
 * honestly. So `section=policy`, which is the one read this console makes on
 * every load, carries the operator envelope.
 *
 * `degraded` is the honest half: true means fn_ca_operator_permissions did
 * not answer and this list is the LEGACY set the profile role carries, so a
 * granted role may be missing from it. The client shows what it shows either
 * way; the flag is what lets a panel say so.
 */
function operatorEnvelope(op) {
  const roles = Array.isArray(op?.roles) && op.roles.length
    ? [...op.roles]
    : (op?.role ? [op.role] : []);
  return {
    id: op?.user?.id || null,
    role: op?.role || null,
    roles,
    grantedRoles: Array.isArray(op?.grantedRoles) ? [...op.grantedRoles] : [],
    permissions: Array.isArray(op?.permissions) ? [...op.permissions] : [],
    permissionSource: op?.permissionSource || null,
    degraded: op?.permissionsDegraded === true,
  };
}

/**
 * THE POLICY, IN BOTH SPELLINGS, ON PURPOSE.
 *
 * ca_operator_policy and every RPC parameter are snake_case
 * (`approvals_enabled`); operatorAuth.normalizeOperatorPolicy hands the
 * server a camelCase object (`approvalsEnabled`) because that is what the
 * money routes read. Picking one for the wire would leave the other half of
 * the codebase reading a key that is not there, and the answer it would get
 * is `undefined`, which every one of these fields treats as "off" or "zero".
 * Being wrong that way round means a console reporting maker-checker as OFF
 * while it is ON, so a policy READ carries BOTH spellings of every field and
 * `set_policy` ACCEPTS both (POLICY_ALIASES below). The client's
 * normalizePolicy stays as the belt to this pair of braces.
 */
function policyPayload(policy) {
  const p = policy && typeof policy === 'object' ? policy : {};
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    ...p,
    approvals_enabled: p.approvalsEnabled === true,
    allow_self_approve_when_alone: p.allowSelfApproveWhenAlone !== false,
    enforce_named_roles: p.enforceNamedRoles === true,
    mint_threshold: number(p.mintThreshold),
    fund_threshold: number(p.fundThreshold),
    cashout_threshold: number(p.cashoutThreshold),
    approval_ttl_minutes: Number.isFinite(Number(p.approvalTtlMinutes))
      ? Number(p.approvalTtlMinutes)
      : 1440,
    updated_by: p.updatedBy ?? null,
    updated_at: p.updatedAt ?? null,
  };
}

/** The staff rows, whichever field fn_ca_operator_staff wrapped them in. */
function staffRowsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.staff)) return data.staff;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

/** The role keys one staff row currently holds, granted ones included. */
function rolesOfStaffRow(row, { enforced = false } = {}) {
  const granted = [];
  for (const entry of Array.isArray(row?.grants) ? row.grants : []) {
    const key = entry?.role_key || entry?.key;
    if (key) granted.push(String(key));
  }
  for (const entry of Array.isArray(row?.granted_roles) ? row.granted_roles : []) {
    const key = typeof entry === 'string' ? entry : entry?.role_key || entry?.key;
    if (key && !granted.includes(String(key))) granted.push(String(key));
  }
  const profileRole = row?.profile_role || row?.role || null;
  // The same union rule fn_ca_operator_permissions applies: under enforcement
  // an operator WITH grants is described by those grants alone, and everyone
  // else keeps the legacy set.
  if (enforced && granted.length) return granted;
  return profileRole ? [profileRole, ...granted] : granted;
}

/**
 * HOW MANY OTHER OPERATORS COULD DECIDE A MONEY REQUEST RIGHT NOW.
 *
 * The alone-rule is the difference between a control and a deadlock
 * (PHASE2-CONTRACTS section 0), and the client cannot answer it: counting
 * eligible approvers needs the roster. So the policy read answers it, and the
 * Approvals tab can say "you are the only eligible approver" as a fact rather
 * than as a guess from a blocked_reason string.
 *
 * `permission` is money.write, which is what mint, burn and fund_club need -
 * the kinds a threshold applies to. A count of null means the roster could
 * not be read; `applies` is then false, because an unknown must not be
 * reported as "you are alone" and the per-row `can_decide` below is the flag
 * the buttons actually follow. fn_ca_operator_has_second_approver remains the
 * authority at decision time; this is the same rule, for display.
 */
async function aloneRuleFor(db, op, policy) {
  const permission = KIND_PERMISSION.mint;
  const enforced = policy?.enforceNamedRoles === true;
  let eligibleApprovers = null;
  try {
    const { data, error } = await db.rpc('fn_ca_operator_staff');
    if (error) throw error;
    const me = op?.user?.id ? String(op.user.id) : null;
    eligibleApprovers = staffRowsOf(data).filter((row) => {
      const id = String(row?.user_id || row?.id || '');
      if (!id || (me && id === me)) return false;
      return permissionsForRoles(rolesOfStaffRow(row, { enforced })).includes(permission);
    }).length;
  } catch (err) {
    console.warn(
      '[horses.operator-admin] the roster could not be counted for the alone-rule:',
      err?.message || err
    );
    eligibleApprovers = null;
  }
  return {
    permission,
    eligibleApprovers,
    applies:
      policy?.approvalsEnabled === true &&
      policy?.allowSelfApproveWhenAlone !== false &&
      eligibleApprovers === 0,
  };
}

// -- READS -------------------------------------------------------------------

/**
 * The operator roster. fn_ca_operator_staff shapes it server-side (profile
 * role, granted roles AND their grant ids, last sign-in from auth.users, MFA
 * state, grant count), because auth.users is not readable through PostgREST
 * at all.
 *
 * Every field the RPC returns is passed through untouched, `grants` included:
 * that array is what makes Revoke possible on the Staff tab, because
 * fn_ca_operator_revoke takes a grant id and `granted_roles` is bare strings.
 *
 * Paged in memory: the RPC takes no limit/offset and the platform has three
 * operator accounts, so a page of 200 is the whole table for the foreseeable
 * future. `truncated` still tells the truth if that ever stops being so.
 */
async function sectionStaff(db, query) {
  const page = pageFor(query, 'staff', STAFF_PAGE);
  const { data, error } = await db.rpc('fn_ca_operator_staff');
  if (error) {
    console.error('[horses.operator-admin] fn_ca_operator_staff failed:', error.message);
    throw new ApiError(503, 'The Operator Roster Is Unavailable', 'staff_unavailable');
  }
  // The RPC answers { staff, total }; older shapes answered an array or
  // { rows }. Reading only one of the three is how a populated roster renders
  // as "No Operator Accounts Were Returned".
  const all = staffRowsOf(data);
  const total = typeof data?.total === 'number' ? data.total : all.length;
  const rows = all.slice(page.offset, page.offset + page.limit);
  return {
    rows,
    staff: rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.offset + rows.length < total,
    truncated: total > rows.length,
  };
}

/**
 * The permission matrix. Read from ca_operator_roles /
 * ca_operator_role_permissions when they exist, and from the JS vocabulary when
 * they do not, so the Staff And Roles tab renders before the Phase 2 migration
 * is applied instead of showing an empty grid that reads as "nobody can do
 * anything".
 */
async function sectionRoles(db) {
  const fallback = () => ({
    rows: OPERATOR_ROLE_KEYS.map((key) => ({
      key,
      label: ROLE_META[key]?.label || key,
      description: ROLE_META[key]?.description || null,
      rank: ROLE_META[key]?.rank ?? 0,
      is_legacy: ROLE_META[key]?.isLegacy === true,
      permissions: permissionsForRole(key),
    })),
    permissions: [...ALL_PERMISSIONS],
    matrix: Object.fromEntries(OPERATOR_ROLE_KEYS.map((k) => [k, permissionsForRole(k)])),
    source: 'code',
  });

  const [rolesRes, permsRes] = await Promise.all([
    db.from('ca_operator_roles').select('key, label, description, rank, is_legacy').order('rank', {
      ascending: false,
    }),
    db.from('ca_operator_role_permissions').select('role_key, permission'),
  ]);

  if (rolesRes.error || permsRes.error || !(rolesRes.data || []).length) {
    if (rolesRes.error || permsRes.error) {
      console.warn(
        '[horses.operator-admin] role tables unavailable, serving the code vocabulary:',
        rolesRes.error?.message || permsRes.error?.message
      );
    }
    const shaped = fallback();
    return { ...shaped, total: shaped.rows.length, truncated: false };
  }

  const byRole = {};
  for (const row of permsRes.data || []) {
    if (!row?.role_key || !row?.permission) continue;
    (byRole[row.role_key] = byRole[row.role_key] || []).push(row.permission);
  }
  const rows = (rolesRes.data || []).map((r) => ({
    key: r.key,
    label: r.label || ROLE_META[r.key]?.label || r.key,
    description: r.description || ROLE_META[r.key]?.description || null,
    rank: r.rank ?? ROLE_META[r.key]?.rank ?? 0,
    is_legacy: r.is_legacy === true,
    permissions: byRole[r.key] || permissionsForRole(r.key),
  }));
  return {
    rows,
    total: rows.length,
    truncated: false,
    permissions: [...ALL_PERMISSIONS],
    matrix: Object.fromEntries(rows.map((r) => [r.key, r.permissions])),
    source: 'database',
  };
}

/**
 * The one policy row, read fresh so the panel shows what it just saved - plus
 * everything else this console needs on load and cannot work out for itself:
 * who it is talking to (`operator`), and whether a lone operator is currently
 * the only person who could approve a money move (`aloneRule`).
 *
 * This is the console's bootstrap read. `policy` and `defaults` keep their
 * existing keys and meanings; the two new ones are additive.
 */
async function sectionPolicy(db, op) {
  const policy = await loadOperatorPolicy(db, { force: true });
  const aloneRule = await aloneRuleFor(db, op, policy);
  return {
    policy: policyPayload(policy),
    defaults: { approvalsEnabled: false, enforceNamedRoles: false },
    operator: operatorEnvelope(op),
    aloneRule,
  };
}

/**
 * One page of the queue or of the history.
 *
 * THE DATES ARE FILTERED HERE, NOT ON THE PAGE THE CLIENT HAPPENS TO HOLD.
 * The panel has had From and To boxes since it shipped; without this they
 * narrowed the fifty rows already on screen and nothing else, so "everything
 * in August" quietly meant "whatever part of August is on page one". A filter
 * that appears to work and does not is the Phase 1 audit-tab bug, so the
 * route takes `from` and `to` and applies them to the whole set, which is
 * what the pager and the CSV export then describe.
 *
 * `to` is inclusive of the day it names: the client sends a date input's
 * YYYY-MM-DD, and an operator asking for requests up to the 3rd means the
 * end of the 3rd, not its first instant.
 *
 * EVERY ROW ALSO CARRIES ITS OWN DECISION (`can_decide`,
 * `decide_blocked_reason`) AND A NAME FOR ITS REQUESTER (`requester_label`).
 * All three are things only the server can answer honestly - it holds the
 * caller's permissions, the policy and the profiles table - and all three are
 * computed with the same functions the POST path uses, so a row that offers
 * a button is a row the decision endpoint will accept.
 */
async function sectionApprovals(db, op, query) {
  const page = pageFor(query, 'approvals', APPROVALS_PAGE);
  let q = db
    .from('ca_operator_approvals')
    .select(APPROVAL_FIELDS, { count: 'exact' })
    .order('requested_at', { ascending: false });

  const status = enumOf(query.status, APPROVAL_STATUSES);
  if (status) q = q.eq('status', status);
  const kind = enumOf(query.kind, APPROVAL_KINDS);
  if (kind) q = q.eq('kind', kind);
  const requestedBy = uuid(query.requestedBy);
  if (requestedBy) q = q.eq('requested_by', requestedBy);

  if (query.from !== undefined && query.from !== null && query.from !== '') {
    const from = isoDate(query.from);
    if (!from) throw badRequest('From Must Be A Date');
    q = q.gte('requested_at', from);
  }
  if (query.to !== undefined && query.to !== null && query.to !== '') {
    const to = isoDate(query.to);
    if (!to) throw badRequest('To Must Be A Date');
    q = q.lte('requested_at', endOfDayIfDateOnly(query.to, to));
  }

  const result = await runPaged(q, page);
  if (result.error) {
    console.error('[horses.operator-admin] approvals read failed:', result.error.message);
    throw new ApiError(503, 'The Approvals Queue Is Unavailable', 'approvals_unavailable');
  }
  const shaped = shapeList(result, page);
  const rows = await decorateApprovals(db, op, shaped.rows);
  return { ...shaped, rows, approvals: rows };
}

/** A bare YYYY-MM-DD covers the whole day it names, not just midnight. */
function endOfDayIfDateOnly(raw, iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())
    ? `${String(raw).trim()}T23:59:59.999Z`
    : iso;
}

/**
 * Add `can_decide`, `decide_blocked_reason` and `requester_label` to a page of
 * approvals.
 *
 * The refusal codes are the four a human can act on: self_approval (four eyes,
 * and the alone-rule did not clear it), no_permission (this kind needs a
 * permission this account does not hold), expired (the window closed) and
 * already_decided. `can_decide` is not a promise - the RPC checks the same
 * rules again inside the transaction - but it must never be true where the
 * decision endpoint would refuse, which is why it is computed from
 * canDecideApproval and KIND_PERMISSION, the two the endpoint itself uses.
 */
async function decorateApprovals(db, op, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;

  const labels = await profileLabels(db, list);
  return list.map((row) => {
    const needed = KIND_PERMISSION[row?.kind] || null;
    let canDecide = false;
    let blocked = null;
    let aloneRule = false;

    const gate = canDecideApproval(row, op?.user?.id, op?.policy);
    if (gate.reason === 'already_decided' || gate.reason === 'expired') {
      blocked = gate.reason;
    } else if (!needed || !hasPermission(op?.permissions, needed)) {
      // Checked after status and expiry so a closed row reads as closed to
      // everybody, rather than as "you are not allowed" to some.
      blocked = 'no_permission';
    } else if (!gate.allowed) {
      blocked = gate.reason === 'self_approval' ? 'self_approval' : gate.reason;
    } else {
      canDecide = true;
      aloneRule = gate.reason === 'alone_rule';
    }

    return {
      ...row,
      can_decide: canDecide,
      decide_blocked_reason: blocked,
      alone_rule: aloneRule,
      requester_label: labels[String(row?.requested_by || '')] || row?.requested_by || null,
      decided_by_label: row?.decided_by
        ? labels[String(row.decided_by)] || row.decided_by
        : null,
    };
  });
}

/**
 * uuid -> display name, for the requesters and deciders on this page.
 *
 * One `.in()` over the ids on the page rather than a join (admin_audit_log
 * and ca_operator_approvals have no declared FK to profiles, so PostgREST
 * cannot embed) and never N+1. A profile that cannot be read keeps its uuid:
 * the uuid is the answer, and "Unknown" over a row that names its requester
 * perfectly well would be the console withholding what it has.
 */
async function profileLabels(db, rows) {
  const ids = [
    ...new Set(
      rows
        .flatMap((row) => [row?.requested_by, row?.decided_by])
        .filter((id) => typeof id === 'string' && id)
    ),
  ];
  if (!ids.length) return {};
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, username, display_name')
      .in('id', ids.slice(0, 500));
    if (error) throw error;
    const out = {};
    for (const row of data || []) {
      if (!row?.id) continue;
      const label = row.display_name || row.username || null;
      if (label) out[String(row.id)] = label;
    }
    return out;
  } catch (err) {
    console.warn(
      '[horses.operator-admin] requester names unavailable, falling back to ids:',
      err?.message || err
    );
    return {};
  }
}

/** One record's full history, newest first, straight out of admin_audit_log. */
async function sectionAuditTrail(db, query) {
  const page = pageFor(query, 'trail', TRAIL_PAGE);
  const targetType = text(query.targetType, { min: 1, max: 80 });
  const targetId = text(query.targetId == null ? '' : String(query.targetId), { min: 1, max: 200 });
  if (!targetType || !targetId) throw badRequest('A Target Type And Target Id Are Both Required');

  const { data, error } = await db.rpc('fn_ca_operator_audit_trail', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) {
    console.error('[horses.operator-admin] fn_ca_operator_audit_trail failed:', error.message);
    throw new ApiError(503, 'The Audit Trail Is Unavailable', 'audit_trail_unavailable');
  }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
  const total = typeof data?.total === 'number' ? data.total : rows.length + page.offset;
  return {
    rows,
    entries: rows,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.offset + rows.length < total,
    truncated: total > rows.length,
    targetType,
    targetId,
  };
}

// -- WRITES ------------------------------------------------------------------

async function grantRole(db, op, req, body) {
  const userId = uuid(body.userId);
  if (!userId) throw badRequest('Pick A Valid Operator');
  const roleKey = enumOf(body.roleKey, OPERATOR_ROLE_KEYS);
  if (!roleKey || !isKnownRole(roleKey)) throw badRequest('Pick A Role This Console Knows');
  // TEN characters, the same minimum the contract states and the console
  // enforces before it composes the body. A minimum is a real control on an
  // audit trail: "why does this account hold finance" cannot be answered by
  // "asked", and the reason is the one part of the record a database cannot
  // reconstruct later. Five here and ten in the client meant the console
  // refused what the route would have accepted, which teaches an operator
  // that the rule is a client-side nag.
  const reason = text(body.reason, { min: MIN_REASON_LENGTH, max: 500 });
  if (!reason) throw badRequest('Write A Reason Of At Least Ten Characters For This Grant');

  const { data, error } = await db.rpc('fn_ca_operator_grant', {
    p_user_id: userId,
    p_role_key: roleKey,
    p_granted_by: op.user.id,
    p_reason: reason,
  });
  if (error) throw mapDbError(error, 'That Role Grant', { route: 'horses.operator-admin' });
  if (data && data.ok === false) {
    throw new ApiError(409, `Grant Refused: ${data.reason || 'unknown'}`, data.reason || 'grant_refused');
  }

  invalidateOperatorPolicyCache();
  await auditOperatorAction(op, req, {
    action: 'operator.grant_role',
    targetType: 'operator',
    targetId: userId,
    before: { role_key: roleKey, granted: false },
    after: { role_key: roleKey, granted: true, grant_id: data?.grant_id ?? null },
    details: { reason, role_key: roleKey, granted_by: op.user.id },
  });
  return { grant: data || null, roleKey, userId };
}

async function revokeRole(db, op, req, body) {
  const grantId = uuid(body.grantId);
  if (!grantId) throw badRequest('Pick A Valid Grant To Revoke');
  const reason = text(body.reason, { min: MIN_REASON_LENGTH, max: 500 });
  if (!reason) throw badRequest('Write A Reason Of At Least Ten Characters For This Revoke');

  const { data, error } = await db.rpc('fn_ca_operator_revoke', {
    p_grant_id: grantId,
    p_revoked_by: op.user.id,
    p_reason: reason,
  });
  if (error) throw mapDbError(error, 'That Role Grant', { route: 'horses.operator-admin' });
  if (data && data.ok === false) {
    throw new ApiError(409, `Revoke Refused: ${data.reason || 'unknown'}`, data.reason || 'revoke_refused');
  }

  invalidateOperatorPolicyCache();
  await auditOperatorAction(op, req, {
    action: 'operator.revoke_role',
    targetType: 'operator',
    targetId: data?.user_id || grantId,
    before: { grant_id: grantId, revoked: false, role_key: data?.role_key ?? null },
    after: { grant_id: grantId, revoked: true, role_key: data?.role_key ?? null },
    details: { reason, grant_id: grantId, revoked_by: op.user.id },
  });
  return { grant: data || null, grantId };
}

/** Only these columns are writable, and each is validated on its own terms. */
const POLICY_FIELDS = [
  'approvals_enabled',
  'allow_self_approve_when_alone',
  'enforce_named_roles',
  'mint_threshold',
  'fund_threshold',
  'cashout_threshold',
  'approval_ttl_minutes',
];

/**
 * BOTH SPELLINGS ARE ACCEPTED, and this is the map that does it.
 *
 * The console composes camelCase (`approvalsEnabled`), the table and every
 * RPC parameter are snake_case (`approvals_enabled`), and a reader of this
 * route should not have to know which of the two it guessed right. Either
 * arrives here and lands on the column; snake_case wins when both are sent,
 * because that is the name the database actually has. Reads answer in both
 * spellings for the same reason (policyPayload above).
 */
const POLICY_ALIASES = Object.freeze({
  approvalsEnabled: 'approvals_enabled',
  allowSelfApproveWhenAlone: 'allow_self_approve_when_alone',
  enforceNamedRoles: 'enforce_named_roles',
  mintThreshold: 'mint_threshold',
  fundThreshold: 'fund_threshold',
  cashoutThreshold: 'cashout_threshold',
  approvalTtlMinutes: 'approval_ttl_minutes',
});

export function validatePolicyPatch(body) {
  const patch = {};
  const source = {};
  for (const [camel, snake] of Object.entries(POLICY_ALIASES)) {
    if (body[snake] !== undefined) source[snake] = body[snake];
    else if (body[camel] !== undefined) source[snake] = body[camel];
  }
  for (const field of POLICY_FIELDS) {
    if (source[field] === undefined) continue;
    if (field.endsWith('_enabled') || field.startsWith('allow_') || field.startsWith('enforce_')) {
      const value = bool(source[field]);
      if (value === null) throw badRequest('Policy Switches Must Be True Or False');
      patch[field] = value;
      continue;
    }
    if (field === 'approval_ttl_minutes') {
      const value = int(source[field], { min: 5, max: 43_200 });
      if (value === null) throw badRequest('The Approval Window Must Be Between 5 And 43200 Minutes');
      patch[field] = value;
      continue;
    }
    const value = money2dp(source[field], { allowZero: true });
    if (value === null) throw badRequest('A Threshold Must Be Zero Or More, To At Most Two Decimals');
    patch[field] = value;
  }
  if (!Object.keys(patch).length) throw badRequest('Nothing To Change');
  return patch;
}

async function setPolicy(db, op, req, body) {
  const patch = validatePolicyPatch(body);

  const { data: current, error: readErr } = await db
    .from('ca_operator_policy')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  if (readErr) throw mapDbError(readErr, 'The Operator Policy', { route: 'horses.operator-admin' });

  const { data, error } = await db
    .from('ca_operator_policy')
    .update({ ...patch, updated_by: op.user.id, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select('*')
    .maybeSingle();
  if (error) throw mapDbError(error, 'The Operator Policy', { route: 'horses.operator-admin' });

  // The cache is 30s per lambda, so without this the operator who just turned
  // approvals on would watch the panel say they are still off.
  invalidateOperatorPolicyCache();

  await auditOperatorAction(op, req, {
    action: 'operator.set_policy',
    targetType: 'ca_operator_policy',
    targetId: 'singleton',
    before: current ? pickPolicy(current) : null,
    after: data ? pickPolicy(data) : patch,
    details: { fields: Object.keys(patch) },
  });

  // Both spellings on the way back too, so the panel that just saved reads
  // the same object shape it reads from section=policy.
  return { policy: policyPayload(normalizeOperatorPolicy(data || { ...(current || {}), ...patch })) };
}

function pickPolicy(row) {
  const out = {};
  for (const field of POLICY_FIELDS) if (row && field in row) out[field] = row[field];
  return out;
}

/**
 * Approve or reject one pending request.
 *
 * The permission needed is the permission the KIND needs (contract section 2),
 * so this is the one action whose gate cannot be a constant. The row is read
 * first for exactly that reason, and the self-approval / alone-rule decision is
 * made here as well so the operator gets a sentence rather than a bare refusal.
 * The RPC enforces both again, because the first check is javascript.
 */
async function decideApproval(db, op, req, body) {
  const approvalId = uuid(body.approvalId);
  if (!approvalId) throw badRequest('Pick A Valid Approval');
  const decision = enumOf(String(body.decision || '').toLowerCase(), ['approve', 'reject']);
  if (!decision) throw badRequest('Decision Must Be Approve Or Reject');
  // A note is optional, but an unusable one is a 400 rather than a silent drop:
  // the note is the only explanation the next reader of this decision gets.
  let note = null;
  if (body.note !== undefined && body.note !== null && body.note !== '') {
    note = text(String(body.note), { min: 1, max: 500 });
    if (!note) throw badRequest('A Decision Note Must Be Under 500 Characters');
  }

  const { data: approval, error: readErr } = await db
    .from('ca_operator_approvals')
    .select(APPROVAL_FIELDS)
    .eq('id', approvalId)
    .maybeSingle();
  if (readErr) throw mapDbError(readErr, 'That Approval', { route: 'horses.operator-admin' });
  if (!approval) throw new ApiError(404, 'That Approval Was Not Found', 'not_found');

  const needed = KIND_PERMISSION[approval.kind];
  if (!needed) throw new ApiError(409, 'That Approval Has An Unknown Kind', 'unknown_kind');
  requirePermission(op, needed);

  const gate = canDecideApproval(approval, op.user.id, op.policy);
  if (!gate.allowed) {
    const message = DECISION_REFUSAL_TEXT[gate.reason] || 'That Approval Cannot Be Decided';
    throw new ApiError(gate.reason === 'not_found' ? 404 : 409, message, gate.reason);
  }

  const { data, error } = await db.rpc('fn_ca_operator_decide_approval', {
    p_approval_id: approvalId,
    p_decision: decision,
    p_decided_by: op.user.id,
    p_note: note,
  });
  if (error) throw mapDbError(error, 'That Approval', { route: 'horses.operator-admin' });
  if (data && data.ok === false) {
    throw new ApiError(
      409,
      `Decision Refused: ${data.reason || 'unknown'}`,
      data.reason || 'decision_refused'
    );
  }

  await auditOperatorAction(op, req, {
    action: 'operator.decide_approval',
    targetType: 'ca_operator_approval',
    targetId: approvalId,
    before: { status: approval.status, decided_by: approval.decided_by ?? null },
    after: {
      status: data?.status || (decision === 'approve' ? 'approved' : 'rejected'),
      decided_by: op.user.id,
    },
    details: {
      decision,
      note,
      kind: approval.kind,
      amount: approval.amount ?? null,
      op_id: approval.op_id ?? null,
      // The alone-rule is the whole reason a single-operator platform can move
      // at all with approvals on, so the audit row has to say when it fired.
      alone_rule: gate.reason === 'alone_rule',
      permission: needed,
    },
  });

  return { approval: data || null, approvalId, decision, aloneRule: gate.reason === 'alone_rule' };
}

// -- ROUTE -------------------------------------------------------------------

export const spec = {
  name: 'horses.operator-admin',
  methods: ['GET', 'POST'],
  // The floor. The real gate is SECTION_PERMISSIONS / ACTION_PERMISSIONS below.
  permission: PERMISSIONS.CONSOLE_READ,
  limit: { GET: 'read', POST: 'write' },
};

export async function handle({ req, op, db, body, query, method }) {
  if (method === 'POST') {
    const action = enumOf(body.action, ACTIONS);
    if (!action) throw badRequest('Unknown Action');

    const fixed = ACTION_PERMISSIONS[action];
    // decide_approval has no fixed permission: it is resolved from the kind
    // once the row is read, inside decideApproval.
    if (fixed) requirePermission(op, fixed);

    if (action === 'grant_role') return grantRole(db, op, req, body);
    if (action === 'revoke_role') return revokeRole(db, op, req, body);
    if (action === 'set_policy') return setPolicy(db, op, req, body);
    return decideApproval(db, op, req, body);
  }

  const section = enumOf(String(query.section || 'staff'), SECTIONS);
  if (!section) throw badRequest('Unknown Section');
  requirePermission(op, SECTION_PERMISSIONS[section]);

  if (section === 'staff') return sectionStaff(db, query);
  if (section === 'roles') return sectionRoles(db);
  if (section === 'policy') return sectionPolicy(db, op);
  if (section === 'approvals') return sectionApprovals(db, op, query);
  return sectionAuditTrail(db, query);
}

export default withOperatorRoute(spec, handle);
