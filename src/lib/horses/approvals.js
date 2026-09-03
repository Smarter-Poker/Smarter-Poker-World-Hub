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
 * And one more, which is the same rule read from the other end: the cached
 * policy is a CEILING, never a floor. If the local policy says this move is not
 * gated, `required` is false whatever the database returns. A stale 30-second
 * cache can therefore let a move through that a fresh read would have held; it
 * can never hold a move that today runs unimpeded.
 *
 * NEVER THROWS INTO THE MONEY PATH except that one deliberate 503, and
 * markApprovalExecuted never throws at all - it runs AFTER the chips have
 * already moved, and an operator told "it failed" about a completed mint is how
 * money gets minted twice.
 */
import { ApiError, requestIdOf } from './apiEnvelope.js';

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
 */
export function canDecideApproval(approval, operatorId, policy) {
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
  return { allowed: true, reason: 'alone_rule' };
}

/** Operator-safe sentence for a refusal code. Title Case, house rule. */
export const DECISION_REFUSAL_TEXT = Object.freeze({
  not_found: 'That Approval Was Not Found',
  already_decided: 'That Approval Has Already Been Decided',
  expired: 'That Approval Has Expired. Raise It Again',
  self_approval: 'Another Operator Must Decide This. You Raised It',
});

function payloadFor(spec) {
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
      p_payload: payloadFor(spec),
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
  // The ceiling rule. The database may say a gated move is NOT required (the
  // alone-rule cleared it); it may not say an ungated move IS.
  const required = decision.required && dbRequired;
  const status =
    typeof data.status === 'string' && data.status ? data.status : required ? 'pending' : 'auto_approved';

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
 */
export async function markApprovalExecuted(op, approvalId, result, { status = 'executed' } = {}) {
  if (!approvalId) return { ok: false, skipped: true };
  try {
    const db = op?.db;
    if (!db || typeof db.rpc !== 'function') throw new Error('no operator database on the request');
    const { error } = await db.rpc('fn_ca_operator_mark_executed', {
      p_approval_id: approvalId,
      p_result: result && typeof result === 'object' ? result : { result: result ?? null },
      p_status: status,
    });
    if (error) throw error;
    return { ok: true, skipped: false };
  } catch (err) {
    console.error(
      `[approvals] could not mark approval ${approvalId} as ${status}:`,
      err?.message || err
    );
    return { ok: false, skipped: false };
  }
}
