/**
 * Maker-checker for the money routes.
 *
 *   const approval = await requireApproval(op, req, {
 *     kind: 'mint',
 *     amount,
 *     asset,
 *     targetType: 'club',
 *     targetId,
 *     reason,
 *     opId,
 *     payload: { ...everything needed to replay this exact request },
 *   });
 *   if (approval.required) return approvalPendingResponse(res, approval, { requestId });
 *   ... move the money ...
 *   await markApprovalExecuted(op, approval.approvalId, result);
 *
 * PHASE2-CONTRACTS.md SECTION 0 IS THE WHOLE DESIGN.
 *
 * Approvals are OFF by default (ca_operator_policy.approvals_enabled = false).
 * With them off, a money move above the threshold records a `ca_operator_approvals`
 * row marked auto_approved and proceeds exactly as it does today. Nothing about
 * this module may stop a move that worked yesterday.
 *
 * That gives two rules that look asymmetric and are not:
 *
 *   1. A failure to record an ADVISORY row (approvals off, or under threshold)
 *      is logged and the move PROCEEDS. The row is a paper trail, not a gate;
 *      losing it must not cost a club its chips, and until the Phase 2 migration
 *      is applied the RPC does not exist at all.
 *   2. A failure to record a REQUIRED approval REFUSES with 503. Once Dan turns
 *      approvals on, "the approvals table is down" cannot mean "so we minted it
 *      anyway" - that would be the gate quietly disabling itself under load.
 *
 * And one more, corrected on 2026-09-03 (re-verification H-2): a PENDING row
 * the database wrote HOLDS, whatever the local policy cache says. The cached
 * policy is still a ceiling for the RPC-UNAVAILABLE branch (rule 1 above), and
 * it still decides on its own whether an unrecognised status holds; but when
 * the database itself answers `required: true` it has already written a
 * pending row, and that only happens when ca_operator_policy.approvals_enabled
 * is true in the database - Dan's switch, not a failure mode. The old rule
 * ANDed that answer away for the 30 seconds a stale lambda still held "off",
 * minted the chips, and left the row pending in the queue for a second
 * operator to reject after the fact. Nothing that works today is blocked by
 * this: the RPC never answers required:true while approvals are off.
 *
 * NEVER THROWS INTO THE MONEY PATH except that one deliberate 503, and
 * markApprovalExecuted never throws at all - it runs AFTER the chips have
 * already moved, and an operator told "it failed" about a completed mint is how
 * money gets minted twice.
 *
 * ONE MORE DELIBERATE REFUSAL, ADDED 2026-09-03 (review B-2 / B-3).
 *
 * An op_id that already names a row is answered by the database with that row.
 * Only three of its statuses mean "the money may move now": auto_approved,
 * approved and executed. A `rejected` or `expired` replay, and a replay whose
 * material fields do not match the row the key was raised under, are REFUSALS
 * (409), not permissions - the alternative is a rejected request executing on
 * retry, with the trail still reading `rejected`.
 */
import { ApiError, requestIdOf } from './apiEnvelope.js';
import { enumOf, money2dp, text, uuid } from './validate.js';

/** ca_operator_approvals.kind. The last two exist for phases that wire them. */
export const APPROVAL_KINDS = Object.freeze([
  'mint',
  'burn',
  'fund_club',
  'cashout',
  'fleet_policy',
  'sanction',
]);

/**
 * Which policy threshold each kind is measured against. A kind with no
 * threshold is not a money amount at all (a fleet policy change, a sanction),
 * so once approvals are on it always needs a second pair of eyes.
 */
const THRESHOLD_FIELD = Object.freeze({
  mint: 'mintThreshold',
  burn: 'mintThreshold',
  fund_club: 'fundThreshold',
  cashout: 'cashoutThreshold',
  fleet_policy: null,
  sanction: null,
});

/** The permission a decision on each kind requires (contract section 2). */
export const KIND_PERMISSION = Object.freeze({
  mint: 'money.write',
  burn: 'money.write',
  fund_club: 'money.write',
  cashout: 'cashier.write',
  fleet_policy: 'fleet.write',
  sanction: 'moderation.write',
});

export function isApprovalKind(kind) {
  return typeof kind === 'string' && APPROVAL_KINDS.includes(kind);
}

/**
 * The policy shape this module reads, defaulted so a route that never loaded
 * one (or loaded it before the Phase 2 migration) behaves as the platform does
 * today: approvals off, alone-rule on.
 */
export function approvalPolicy(policy) {
  const p = policy && typeof policy === 'object' ? policy : {};
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    approvalsEnabled: p.approvalsEnabled === true,
    allowSelfApproveWhenAlone: p.allowSelfApproveWhenAlone !== false,
    mintThreshold: num(p.mintThreshold),
    fundThreshold: num(p.fundThreshold),
    cashoutThreshold: num(p.cashoutThreshold),
    approvalTtlMinutes: Number.isFinite(Number(p.approvalTtlMinutes)) ? Number(p.approvalTtlMinutes) : 1440,
  };
}

/** The threshold this kind is measured against, or null when it has none. */
export function thresholdFor(policy, kind) {
  const field = THRESHOLD_FIELD[kind];
  if (!field) return null;
  return approvalPolicy(policy)[field];
}

function toAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The pure threshold decision, so the maths is testable without a database.
 *
 * Returns { required, reason, threshold }. `reason` is a stable code, not text.
 *
 * A MISSING AMOUNT IS REQUIRED, not exempt. "We could not read the amount" is
 * not the same sentence as "the amount is small", and only one of them is a
 * safe reason to skip the second operator. This only ever fires once Dan has
 * turned approvals on.
 */
export function requiresApproval(policy, kind, amount) {
  const p = approvalPolicy(policy);
  if (!p.approvalsEnabled) return { required: false, reason: 'approvals_disabled', threshold: null };
  const field = THRESHOLD_FIELD[kind];
  if (!field) return { required: true, reason: 'kind_always_requires_approval', threshold: null };
  const threshold = p[field];
  const amt = toAmount(amount);
  if (amt === null) return { required: true, reason: 'amount_unknown', threshold };
  if (amt < threshold) return { required: false, reason: 'under_threshold', threshold };
  return { required: true, reason: 'at_or_over_threshold', threshold };
}

/**
 * Can this operator decide this approval?
 *
 * A single-operator platform cannot four-eyes anything, so with
 * `allow_self_approve_when_alone` true (the default) the requester may decide
 * their own request and the audit row says so. Dan turns that off when there
 * are two operators. The RPC enforces the same rule; this is the copy that lets
 * the console say why rather than showing a bare refusal.
 *
 * THE ALONE-RULE NEEDS TO KNOW THAT THE OPERATOR IS ALONE (review H-3).
 *
 * `fn_ca_operator_decide_approval` clears a self-decision only when
 * `fn_ca_operator_has_second_approver` says there is nobody else, so a copy of
 * the rule that never counts anybody renders an enabled Approve button on the
 * operator's own request and then watches the RPC refuse it. `eligibleApprovers`
 * is that count, of OTHER accounts holding the permission this kind needs:
 *
 *   0        -> the alone-rule applies and the requester may decide
 *   above 0  -> refused as a self approval, which is what the RPC will say
 *   null     -> the roster could not be counted. The rule FAILS OPEN, because
 *               section 0 says an unreadable roster must not freeze a platform
 *               that would otherwise move, and the RPC still has the last word.
 */
export function canDecideApproval(approval, operatorId, policy, { eligibleApprovers = null } = {}) {
  const p = approvalPolicy(policy);
  if (!approval || typeof approval !== 'object') return { allowed: false, reason: 'not_found' };
  const status = typeof approval.status === 'string' ? approval.status : null;
  if (status && status !== 'pending') return { allowed: false, reason: 'already_decided' };
  if (approval.expires_at) {
    const expires = Date.parse(approval.expires_at);
    if (Number.isFinite(expires) && expires <= Date.now()) return { allowed: false, reason: 'expired' };
  }
  const isSelf = Boolean(approval.requested_by) && approval.requested_by === operatorId;
  if (!isSelf) return { allowed: true, reason: 'second_operator' };
  if (!p.allowSelfApproveWhenAlone) return { allowed: false, reason: 'self_approval' };
  const count = Number.isFinite(Number(eligibleApprovers)) && eligibleApprovers !== null
    ? Number(eligibleApprovers)
    : null;
  if (count !== null && count > 0) return { allowed: false, reason: 'self_approval' };
  return { allowed: true, reason: 'alone_rule' };
}

/**
 * May this operator WITHDRAW this approval (re-verification L-12)?
 *
 * The four-eyes rule exists so nobody approves their own money move. It has
 * nothing to say about cancelling one: a requester who raised a mint by
 * mistake used to watch it sit in the queue until the TTL, because the self
 * rule was applied to `reject` as well as `approve`. A withdrawal is a
 * rejection by the requester of their own PENDING row, and only that: a
 * decided row stays decided, an expired row is expired, and somebody else's
 * request is a decision, not a withdrawal. fn_ca_operator_decide_approval
 * applies the same rule and files it as operator.withdraw_approval.
 */
export function canWithdrawApproval(approval, operatorId) {
  if (!approval || typeof approval !== 'object') return { allowed: false, reason: 'not_found' };
  const status = typeof approval.status === 'string' ? approval.status : null;
  if (status && status !== 'pending') return { allowed: false, reason: 'already_decided' };
  if (approval.expires_at) {
    const expires = Date.parse(approval.expires_at);
    if (Number.isFinite(expires) && expires <= Date.now()) return { allowed: false, reason: 'expired' };
  }
  const isSelf = Boolean(approval.requested_by) && Boolean(operatorId) && approval.requested_by === operatorId;
  if (!isSelf) return { allowed: false, reason: 'not_requester' };
  return { allowed: true, reason: 'withdraw' };
}

/**
 * WHICH DOOR A CASHOUT CALLER CAME THROUGH, AND WHETHER THE GATE APPLIES.
 *
 * /api/club-arena/approve-cashout has four of them and only one belongs to
 * platform staff: the assigned agent, a club owner or admin, a union admin or
 * union owner, and a platform operator overriding from /horses.
 *
 * REVIEW H-1. Phase 2 put `requireApproval` in front of all four. A club agent
 * cannot see the Approvals queue (that needs console.read), cannot clear it
 * (that needs cashier.write), and is not counted by
 * fn_ca_operator_has_second_approver, so the alone rule never releases their
 * request either. With cashout_threshold at 0, turning approvals on would have
 * frozen every cashout on the platform behind a queue invisible to the people
 * who file them - exactly what PHASE2-CONTRACTS.md section 0 forbids. It also
 * filed approval rows whose requested_by was not an operator at all.
 *
 * So the gate is the platform-override path and nothing else. A caller who is
 * platform staff AND the club's own agent is acting as the agent, and the agent
 * path is the one that works today.
 *
 * Pure, and here rather than in the route, because the route imports
 * `src/lib/serverAuth` without a file extension and therefore cannot be loaded
 * by a plain `node --test` process at all.
 */
export function cashoutAuthPath({ isPlatformAdmin, isAgent, isClubAdmin, isUnionAdmin } = {}) {
  const viaPlatformOverride = Boolean(isPlatformAdmin) && !isAgent && !isClubAdmin && !isUnionAdmin;
  const path = isAgent
    ? 'club_agent'
    : isClubAdmin
      ? 'club_admin'
      : isUnionAdmin
        ? 'union_admin'
        : viaPlatformOverride
          ? 'platform_operator'
          : 'unauthorized';
  return { path, viaPlatformOverride, gated: viaPlatformOverride };
}

/** Operator-safe sentence for a refusal code. Title Case, house rule. */
export const DECISION_REFUSAL_TEXT = Object.freeze({
  not_found: 'That Approval Was Not Found',
  already_decided: 'That Approval Has Already Been Decided',
  expired: 'That Approval Has Expired. Raise It Again',
  self_approval: 'Another Operator Must Decide This. You Raised It',
});

function requestPayload(spec) {
  const given = spec.payload && typeof spec.payload === 'object' ? spec.payload : null;
  if (given) return given;
  return {
    kind: spec.kind,
    amount: spec.amount ?? null,
    asset: spec.asset ?? null,
    target_type: spec.targetType ?? null,
    target_id: spec.targetId ?? null,
    op_id: spec.opId ?? null,
  };
}

// -- EXECUTING AN APPROVED REQUEST -------------------------------------------
//
// The kinds whose stored payload names a money RPC this console can drive.
// `cashout` is deliberately absent: its execution lives behind
// /api/club-arena/approve-cashout, which owns the settlement lock, the MFA
// gate, the notifications and the club-side authorisation, and none of that
// can be replayed from here.
export const EXECUTABLE_APPROVAL_KINDS = Object.freeze(['mint', 'burn', 'fund_club']);

export function isExecutableKind(kind) {
  return EXECUTABLE_APPROVAL_KINDS.includes(kind);
}

/** Dan's law, mirrored from /api/horses/mint. Chips never reach a person. */
const EXECUTION_TARGETS = Object.freeze({ chips: ['club', 'union'], diamonds: ['player'] });

const refuse = (reason, message) => ({ ok: false, reason, message });

/**
 * mint and burn: the payload /api/horses/mint stored, checked field by field
 * against what fn_ca_mint / fn_ca_burn will accept. Same six values, opposite
 * direction, and the parameter name says which way the chips move.
 */
function issuanceValidator(kind) {
  const rpc = kind === 'mint' ? 'fn_ca_mint' : 'fn_ca_burn';
  const directionKey = kind === 'mint' ? 'p_destination' : 'p_source';
  return (payload, opId) => {
    const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
    if (!p) return refuse('payload_missing', 'That Approval Has No Stored Request To Run');

    const action = typeof p.action === 'string' ? p.action.trim().toLowerCase() : kind;
    if (action !== kind) {
      return refuse('payload_kind_mismatch', 'The Stored Request Does Not Match The Approval Kind');
    }
    const asset = enumOf(String(p.asset ?? '').toLowerCase(), ['chips', 'diamonds']);
    if (!asset) return refuse('payload_asset_invalid', 'The Stored Request Names No Valid Asset');

    const target = enumOf(
      String(p.target ?? p.targetType ?? p.target_type ?? '').toLowerCase(),
      EXECUTION_TARGETS[asset]
    );
    if (!target) {
      return refuse(
        'payload_target_invalid',
        asset === 'chips'
          ? 'The Stored Request Sends Chips Somewhere Chips Cannot Go'
          : 'The Stored Request Sends Diamonds Somewhere Diamonds Cannot Go'
      );
    }
    const targetId = uuid(p.targetId ?? p.target_id);
    if (!targetId) return refuse('payload_target_invalid', 'The Stored Request Names No Valid Destination');

    const amount = money2dp(p.amount);
    if (amount === null) return refuse('payload_amount_invalid', 'The Stored Request Has No Usable Amount');
    if (asset === 'diamonds' && !Number.isInteger(amount)) {
      return refuse('payload_amount_invalid', 'Diamonds Are Whole Numbers, And The Stored Amount Is Not');
    }
    const reason = text(p.reason, { min: 10, max: 500 });
    if (!reason) return refuse('payload_reason_invalid', 'The Stored Request Has No Usable Reason');

    const key = executionKey(p, opId);
    if (!key.ok) return key;

    return {
      ok: true,
      kind,
      rpc,
      args: {
        p_asset: asset,
        [directionKey]: target,
        p_target_id: targetId,
        p_amount: amount,
        p_reason: reason,
        p_op_id: key.opId,
      },
      summary: { kind, asset, target, targetId, amount, opId: key.opId },
    };
  };
}

/**
 * fund_club. Declared in the vocabulary and in the policy thresholds since
 * Phase 2 shipped; no route raises one yet (review L-2), so this is the shape
 * the executor will demand on the day one does, rather than a call assembled
 * from whatever happens to be in the row.
 *
 * Production's signature is fn_ca_fund_club(p_club_id uuid, p_amount numeric,
 * p_reason text, p_idempotency_key text). The key parameter is named
 * differently from fn_ca_mint's p_op_id, and this validator shipped with
 * p_op_id (re-verification, live-routes). It is the same key under a different
 * name: `summary.opId` is the one place a caller should read it from.
 */
function fundClubValidator(payload, opId) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  if (!p) return refuse('payload_missing', 'That Approval Has No Stored Request To Run');
  const clubId = uuid(p.clubId ?? p.club_id ?? p.targetId ?? p.target_id);
  if (!clubId) return refuse('payload_target_invalid', 'The Stored Request Names No Valid Club');
  const amount = money2dp(p.amount);
  if (amount === null) return refuse('payload_amount_invalid', 'The Stored Request Has No Usable Amount');
  const reason = text(p.reason, { min: 10, max: 500 });
  if (!reason) return refuse('payload_reason_invalid', 'The Stored Request Has No Usable Reason');
  const key = executionKey(p, opId);
  if (!key.ok) return key;
  return {
    ok: true,
    kind: 'fund_club',
    rpc: 'fn_ca_fund_club',
    args: { p_club_id: clubId, p_amount: amount, p_reason: reason, p_idempotency_key: key.opId },
    summary: { kind: 'fund_club', clubId, amount, opId: key.opId },
  };
}

/**
 * The key the operation runs under is the key the APPROVAL was raised under,
 * so an approved request executes exactly once however many times it is
 * driven. A payload carrying a different key is a payload that does not belong
 * to this row.
 */
function executionKey(payload, opId) {
  const rowKey = text(opId == null ? '' : String(opId), { min: 1, max: 200 });
  const stored = payload.opId ?? payload.op_id;
  const storedKey = stored == null ? null : text(String(stored), { min: 1, max: 200 });
  if (!rowKey && !storedKey) {
    return refuse(
      'payload_op_id_missing',
      'That Approval Has No Idempotency Key, So It Cannot Be Run Exactly Once'
    );
  }
  if (rowKey && storedKey && rowKey !== storedKey) {
    return refuse(
      'payload_op_id_mismatch',
      'The Stored Request Carries A Different Idempotency Key To The Approval'
    );
  }
  return { ok: true, opId: rowKey || storedKey };
}

const PAYLOAD_VALIDATORS = Object.freeze({
  mint: issuanceValidator('mint'),
  burn: issuanceValidator('burn'),
  fund_club: fundClubValidator,
});

/**
 * The validator for one approval kind, or null when this console cannot
 * execute that kind at all.
 *
 *   const validate = payloadFor(row.kind);
 *   const shaped = validate(row.payload, row.op_id);
 *   if (!shaped.ok) ... refuse, and never call the RPC with junk ...
 *   await db.rpc(shaped.rpc, shaped.args);
 *
 * `ca_operator_approvals.payload` is jsonb written by a route that may have
 * been deployed weeks earlier, so it is INPUT, not internal state. It is
 * validated exactly as a request body would be.
 */
export function payloadFor(kind) {
  return PAYLOAD_VALIDATORS[kind] || null;
}

/**
 * The only three statuses that mean "this request may move money now".
 * `approved` is included because a decided row is exactly what the executor
 * drives; `executed` because a retry of an executed key replays through the
 * money RPC's own claim and mints nothing twice.
 */
const RELEASED_STATUSES = new Set(['auto_approved', 'approved', 'executed']);

/** Statuses that are a refusal on a replay, not a decision to wait for. */
const REPLAY_REFUSAL_STATUSES = new Set(['rejected', 'expired', 'failed']);

/** Operator-safe sentences for a refused replay. Title Case, house rule. */
export const REPLAY_REFUSAL_TEXT = Object.freeze({
  // The two codes fn_ca_operator_request_approval returns, and the bare
  // statuses, because a caller reading either spelling means the same thing.
  approval_rejected: 'That Request Was Rejected. Raise A New One, It Cannot Be Retried',
  approval_expired: 'That Request Expired Before It Was Decided. Raise A New One',
  rejected: 'That Request Was Rejected. Raise A New One, It Cannot Be Retried',
  expired: 'That Request Expired Before It Was Decided. Raise A New One',
  failed: 'That Request Already Failed When It Ran. Raise A New One',
  payload_mismatch: 'That Idempotency Key Was Raised For A Different Request. Reload The Panel And Try Again',
  op_id_reused: 'That Idempotency Key Was Raised For A Different Request. Reload The Panel And Try Again',
  default: 'That Request Cannot Be Raised Again Under The Same Key',
});

/**
 * The refusal code in an RPC answer, or null when the answer is usable.
 *
 * Both shapes are read: an explicit `ok: false` with a code (what the follow-up
 * migration returns for a mismatched payload on a reused op_id), and a status
 * that is itself a refusal. Reading only one of the two would leave whichever
 * the database chose to send unhandled.
 */
function replayRefusalOf(data, status) {
  if (data && data.ok === false) {
    const code = data.error || data.reason || data.refused_reason;
    return typeof code === 'string' && code ? code : 'approval_refused';
  }
  if (status && REPLAY_REFUSAL_STATUSES.has(status)) return status;
  return null;
}

/**
 * Record the request and say whether the money may move now.
 *
 * Always writes a `ca_operator_approvals` row (contract section 1: the row is
 * written even when `required` is false, with status auto_approved, so the
 * trail is complete). `op_id` travels with it and is unique in the table, so an
 * approved request executes exactly once no matter how many times it is
 * retried - the same key the money RPC itself claims.
 */
export async function requireApproval(op, req, spec = {}) {
  const kind = spec.kind;
  if (!isApprovalKind(kind)) {
    // A route asking for a kind that does not exist is a programming error.
    throw new ApiError(500, 'Route Misconfigured: Unknown Approval Kind', 'route_misconfigured');
  }

  const decision = requiresApproval(op?.policy, kind, spec.amount);
  const amount = toAmount(spec.amount);
  const requestId = op?.requestId || requestIdOf(req);

  let data = null;
  let failure = null;
  try {
    const db = op?.db;
    if (!db || typeof db.rpc !== 'function') throw new Error('no operator database on the request');
    const res = await db.rpc('fn_ca_operator_request_approval', {
      p_kind: kind,
      p_payload: requestPayload(spec),
      p_requested_by: op?.user?.id || null,
      p_amount: amount,
      p_asset: spec.asset ?? null,
      p_target_type: spec.targetType ?? null,
      p_target_id: spec.targetId == null ? null : String(spec.targetId),
      p_reason: spec.reason ?? null,
      p_op_id: spec.opId ?? null,
      p_request_id: requestId,
    });
    if (res?.error) throw res.error;
    if (!res?.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
      throw new Error('fn_ca_operator_request_approval returned no payload');
    }
    data = res.data;
  } catch (err) {
    failure = err;
  }

  if (failure) {
    if (!decision.required) {
      // Rule 1. The row is advisory here; losing it costs a line of history,
      // and refusing would cost the operator a move that works today.
      console.warn(
        `[approvals] ${requestId} advisory ${kind} row not recorded, the operation proceeds:`,
        failure?.message || failure
      );
      return {
        required: false,
        approvalId: null,
        status: 'unrecorded',
        blockedReason: null,
        recorded: false,
        threshold: decision.threshold,
        policyReason: decision.reason,
      };
    }
    // Rule 2. Approvals are ON and this move is over the line, so the gate is
    // load-bearing. It does not get to fail silently open.
    console.error(
      `[approvals] ${requestId} required ${kind} approval could not be recorded, refusing:`,
      failure?.message || failure
    );
    throw new ApiError(
      503,
      'Approvals Are Unavailable, So This Was Not Started. Try Again Shortly',
      'approval_unavailable'
    );
  }

  const approvalId = data.approval_id ?? data.approvalId ?? null;
  const blockedReason = data.blocked_reason ?? data.blockedReason ?? null;
  const dbRequired = data.required === true;
  const rawStatus = typeof data.status === 'string' && data.status ? data.status : null;

  // A REPLAY THAT IS NOT A PERMISSION. The key already names a row, and that
  // row is rejected, expired, failed, or was raised for a different request.
  // None of those is "go ahead", and reading `required: false` off any of them
  // is how a rejected mint executes on retry with the trail still saying
  // rejected.
  const refusal = replayRefusalOf(data, rawStatus);
  if (refusal) {
    console.warn(
      `[approvals] ${requestId} ${kind} replay refused (${refusal}) for op_id ${spec.opId ?? 'none'}`
    );
    throw new ApiError(409, REPLAY_REFUSAL_TEXT[refusal] || REPLAY_REFUSAL_TEXT.default, refusal);
  }

  // A PENDING ROW THE DATABASE WROTE HOLDS (re-verification H-2). The
  // database may say a gated move is NOT required (the alone-rule cleared
  // it), and the local policy may hold a move the database released with a
  // status this module does not recognise; but a `required: true` from the
  // RPC means a pending row exists in the queue, and the local cache does not
  // get to mint past it. Only the three RELEASED statuses mean the money may
  // move now.
  const released = rawStatus === null || RELEASED_STATUSES.has(rawStatus);
  const required = dbRequired || (decision.required && !released);
  const status = rawStatus || (required ? 'pending' : 'auto_approved');

  return {
    required,
    approvalId,
    status,
    blockedReason,
    recorded: true,
    threshold: decision.threshold,
    policyReason: decision.reason,
  };
}

const DEFAULT_PENDING_MESSAGE =
  'Sent For Approval. Another Operator Must Approve This Before Anything Moves';

/** The 202 body, as a value, so a test can assert the shape without a res. */
export function approvalPendingBody(approval, message) {
  return {
    success: true,
    pending: true,
    approvalId: approval?.approvalId ?? null,
    status: approval?.status || 'pending',
    message: message || DEFAULT_PENDING_MESSAGE,
  };
}

/**
 * 202 Accepted: the request is recorded, nothing has moved. Written straight to
 * `res` rather than returned through the wrapper because the wrapper's success
 * path is a 200 and this is deliberately not one. withOperatorRoute checks
 * res.headersSent before it sends, so returning this from a handler is safe.
 */
export function approvalPendingResponse(res, approval, { requestId, message, extra } = {}) {
  const body = approvalPendingBody(approval, message);
  if (approval?.blockedReason) body.blockedReason = approval.blockedReason;
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  if (requestId) body.requestId = requestId;
  return res.status(202).json(body);
}

/**
 * Close the loop after the money actually moved. NEVER THROWS: by the time this
 * runs the chips are already where they are going, and an exception here would
 * turn a completed mint into a 500 the operator reads as "it did not happen"
 * and retries.
 *
 * NEVER THROWS IS NOT NEVER NOTICES (review M-8). `fn_ca_operator_mark_executed`
 * answers `{ ok: false, error: 'not_approved' }` when the row it was handed was
 * never approved - which is the single loudest signal this system can produce,
 * because it means chips moved against a row nobody approved. It used to be
 * discarded: only `error` was read, `data.ok` never was, and the caller was
 * told the row closed cleanly. It is now read, logged at error level, and
 * RETURNED, so the route can put it in the audit row and in front of the
 * operator.
 */
export async function markApprovalExecuted(op, approvalId, result, { status = 'executed' } = {}) {
  if (!approvalId) return { ok: false, skipped: true, refused: false, reason: 'no_approval_id' };
  try {
    const db = op?.db;
    if (!db || typeof db.rpc !== 'function') throw new Error('no operator database on the request');
    const { data, error } = await db.rpc('fn_ca_operator_mark_executed', {
      p_approval_id: approvalId,
      p_result: result && typeof result === 'object' ? result : { result: result ?? null },
      p_status: status,
    });
    if (error) throw error;
    if (data && typeof data === 'object' && data.ok === false) {
      const reason = data.error || data.reason || 'unknown';
      console.error(
        `[approvals] fn_ca_operator_mark_executed REFUSED approval ${approvalId} as ${status} (${reason}). ` +
          'The operation it belongs to has already run, so this row and the money now disagree.'
      );
      return { ok: false, skipped: false, refused: true, reason };
    }
    return { ok: true, skipped: false, refused: false, reason: null };
  } catch (err) {
    console.error(
      `[approvals] could not mark approval ${approvalId} as ${status}:`,
      err?.message || err
    );
    return { ok: false, skipped: false, refused: false, reason: 'mark_executed_unavailable' };
  }
}
