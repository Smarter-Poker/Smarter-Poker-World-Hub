/**
 * Maker-checker, as pure decisions.
 *
 * Three questions get asked over and over in the Approvals queue and in the
 * Mint, and every one of them is a decision about plain objects, so all three
 * live here and are unit tested without React:
 *
 *   1. CAN THIS OPERATOR DECIDE THIS ROW? Self versus another operator, the
 *      alone-rule, an expired window, a row somebody already decided, and the
 *      permission the kind needs.
 *   2. WILL THIS OPERATION EXECUTE OR BE SENT FOR APPROVAL? One sentence the
 *      confirm dialog shows before any money moves.
 *   3. HOW OLD IS IT AND HOW LONG IS LEFT? A queue with no clock in it is a
 *      queue nobody works.
 *
 * THE ALONE-RULE, because it is the part that looks wrong until you know why.
 * A single-operator platform cannot four-eyes anything. With approvals ON and
 * only one eligible approver the request records `blocked_reason:
 * 'no_second_approver'` and, while `allow_self_approve_when_alone` is true,
 * the operator who raised it may decide it - and the audit row says so. That
 * is PHASE2-CONTRACTS section 0, and it is the difference between a control
 * and a deadlock. Dan turns the flag off when there are two operators.
 *
 * WHERE THE ROUTE WINS. The route knows things this file cannot: the
 * caller's real permission set, and how many eligible approvers exist right
 * now. So `section=approvals` computes the decision per row and sends it as
 * `can_decide` (boolean) and `decide_blocked_reason` (null, or one of
 * self_approval, no_permission, expired, already_decided), and those are
 * PREFERRED here whenever they are present. The local derivation below is the
 * fallback, for a row from an older route, an optimistic row that never came
 * from one, and the Mint's confirm dialog.
 *
 * THE TWO LOCAL CHECKS THAT STILL RUN FIRST are "already decided" and
 * "expired", because those are the only two facts that can become TRUE while
 * a row sits on screen: the route answered at 10:00 and it is now 10:31, the
 * window closed, and offering a button the server will refuse is worse than
 * being one refresh behind. Everything else defers to the route.
 */
import { hasPermission } from './operatorPermissions.js';

/** The kinds `ca_operator_approvals.kind` accepts (PHASE2-CONTRACTS 1). */
export const APPROVAL_KINDS = [
  ['mint', 'Mint'],
  ['burn', 'Burn'],
  ['fund_club', 'Fund Club'],
  ['cashout', 'Cashout'],
  ['fleet_policy', 'Fleet Policy'],
  ['sanction', 'Sanction'],
];

export const APPROVAL_STATUSES = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['executed', 'Executed'],
  ['expired', 'Expired'],
  ['auto_approved', 'Auto Approved'],
  ['failed', 'Failed'],
];

/**
 * The permission deciding a request of this kind needs.
 *
 * PHASE2-CONTRACTS section 2 names two of them: money.write for
 * mint/burn/fund, cashier.write for cashout. Fleet policy and sanctions are
 * wired in their own phases; their kinds exist now so the queue can already
 * render them, and they map to the permission those phases will use.
 *
 * An unknown kind falls back to money.write rather than to something narrow:
 * the legacy roles hold every permission, so the fallback cannot lock out any
 * operator who exists today, and the server refuses anything this is wrong
 * about.
 *
 * EVERY VALUE HERE IS A REAL PERMISSION AND MATCHES
 * `src/lib/horses/approvals.js#KIND_PERMISSION` EXACTLY, and a test compares
 * the two tables kind by kind. `sanction` used to say `sanction.write`, which
 * exists in neither table nor vocabulary, so the local check refused every
 * sanction row - including for a `god` - and told the operator the refusal
 * was about a permission that has never existed.
 */
export const KIND_PERMISSIONS = {
  mint: 'money.write',
  burn: 'money.write',
  fund_club: 'money.write',
  cashout: 'cashier.write',
  fleet_policy: 'fleet.write',
  sanction: 'moderation.write',
};

export function permissionForKind(kind) {
  return KIND_PERMISSIONS[String(kind || '').toLowerCase()] || 'money.write';
}

export function kindLabel(kind) {
  const found = APPROVAL_KINDS.find(([id]) => id === String(kind || '').toLowerCase());
  return found ? found[1] : (kind ? String(kind) : 'Unknown');
}

export function statusLabel(status) {
  const found = APPROVAL_STATUSES.find(([id]) => id === String(status || '').toLowerCase());
  return found ? found[1] : (status ? String(status) : 'Unknown');
}

/**
 * `blocked_reason` in words.
 *
 * The column is an enum the database writes and the History table used to
 * print it raw, so an operator read `no_second_approver` in a cell headed
 * Note. The vocabulary already exists twice on the same screen (the row state
 * machine below and the route's refusal names); this is the one place it is
 * turned into a sentence fragment, so all three agree.
 */
export const BLOCKED_REASON_LABELS = {
  no_second_approver: 'No Second Approver',
  self_approval: 'Raised By The Same Operator',
  already_decided: 'Already Decided',
  expired: 'Window Expired',
  no_permission: 'Permission Required',
  approvals_disabled: 'Approvals Were Off',
  under_threshold: 'Under The Threshold',
};

export function blockedReasonLabel(reason, fallback = '-') {
  const key = String(reason || '').toLowerCase();
  if (!key) return fallback;
  if (BLOCKED_REASON_LABELS[key]) return BLOCKED_REASON_LABELS[key];
  // An enum this console has not met yet is still shown, because hiding it
  // would lose the only thing the row has to say. Underscores out, so it at
  // least reads as words.
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Statuses that still tint as "needs a human". */
export function toneForApprovalStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return 'warn';
  if (s === 'approved' || s === 'executed' || s === 'auto_approved') return 'good';
  if (s === 'rejected' || s === 'failed') return 'danger';
  return 'neutral';
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME
// ═══════════════════════════════════════════════════════════════════════════

function msFrom(value) {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** A duration as the shortest thing that is still true. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '-';
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return 'Under A Minute';
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

/** How long a request has been waiting. */
export function formatAge(requestedAt, now = Date.now()) {
  const at = msFrom(requestedAt);
  if (at === null) return '-';
  return formatDuration(now - at);
}

/**
 * How long is left on the window.
 *
 * "Expired" is stated rather than rendered as a negative duration, and a row
 * with no expiry says so instead of borrowing the TTL from somewhere else -
 * a queue that invents a deadline is a queue that gets one wrong.
 */
export function formatExpiresIn(expiresAt, now = Date.now()) {
  const at = msFrom(expiresAt);
  if (at === null) return 'No Expiry';
  if (at <= now) return 'Expired';
  return `In ${formatDuration(at - now)}`;
}

export function isExpired(row, now = Date.now()) {
  if (!row) return false;
  if (String(row.status || '').toLowerCase() === 'expired') return true;
  const at = msFrom(row.expires_at);
  return at !== null && at <= now;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ROW STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Does the alone-rule apply to this row?
 *
 * The route's own answer first (`alone_rule`, or the legacy spelling
 * `allow_self_approve`), because only the server can count eligible
 * approvers. Failing that, the pair that means the same thing: the request
 * recorded `no_second_approver` and the policy still allows a lone operator
 * to decide their own.
 */
export function aloneRuleApplies(row, policy = null) {
  if (!row) return false;
  if (row.alone_rule === true || row.allow_self_approve === true) return true;
  if (row.alone_rule === false || row.allow_self_approve === false) return false;
  const blocked = String(row.blocked_reason || '');
  return blocked === 'no_second_approver'
    && !!(policy && policy.allow_self_approve_when_alone);
}

function decision(canDecide, reason, label, note) {
  return { canDecide, reason, label, note };
}

/**
 * The four refusals the route can name, as the state this file speaks in.
 *
 * They are deliberately the same four states the local derivation produces,
 * so a row decided server-side and a row decided here render identically -
 * an operator must not be able to tell which half of the system answered.
 */
const SERVER_REFUSALS = {
  already_decided: ['decided', 'Already Decided', 'A Decision Has Already Been Recorded Against This Request.'],
  expired: [
    'expired',
    'Expired',
    'The Approval Window Closed Before Anyone Decided. Raise The Operation Again.',
  ],
  no_permission: [
    'permission',
    'Permission Required',
    'This Account Does Not Hold The Permission Deciding This Request Needs.',
  ],
  self_approval: [
    'self',
    'Waiting For Another Operator',
    'You Raised This Request, So A Second Operator Has To Decide It.',
  ],
};

/**
 * The route's own verdict on a row, or null when it did not send one.
 *
 * `decide_blocked_reason` is read first because it says WHY; a bare
 * `can_decide: false` is still honoured, as a refusal this console cannot
 * explain rather than as an absence.
 */
export function serverDecision(row, policy = null) {
  if (!row || typeof row !== 'object') return null;
  const reason = row.decide_blocked_reason;
  if (typeof reason === 'string' && reason) {
    const known = SERVER_REFUSALS[reason];
    if (known) return decision(false, known[0], known[1], known[2]);
    return decision(
      false,
      'blocked',
      'Not Available To You',
      'The Server Will Not Accept A Decision From This Account On This Request.',
    );
  }
  if (row.can_decide === false) {
    return decision(
      false,
      'blocked',
      'Not Available To You',
      'The Server Will Not Accept A Decision From This Account On This Request.',
    );
  }
  if (row.can_decide === true) {
    return aloneRuleApplies(row, policy)
      ? decision(
        true,
        'alone',
        'Alone Rule Applies',
        'You Are The Only Eligible Approver, So This Decision Is Yours And The Audit Row Will Say So.',
      )
      : decision(true, 'ready', 'Ready To Decide', '');
  }
  return null;
}

/**
 * IS THIS REFUSAL THE NEWS THAT THE QUEUE ON SCREEN IS OUT OF DATE?
 *
 * `decide_approval` refuses a row somebody else has already decided, and one
 * whose window has closed, with a 409 and a code. Both mean the same thing to
 * this console: the page it is holding is stale, and the fix is to re-read it
 * rather than to leave a live Approve button over a request that no longer
 * exists in that state.
 *
 * The code is read first and the status second; the message is not parsed,
 * because copy changes and a refusal handler that turns on an English
 * sentence breaks the day somebody rewords it.
 */
export function isStaleRowRefusal(err) {
  if (!err) return false;
  const code = String(err.code || '').toLowerCase();
  if (code === 'already_decided' || code === 'expired' || code === 'conflict') return true;
  return Number(err.status) === 409;
}

/**
 * Everything the queue needs to know about one row and one operator.
 *
 * @returns {{ canDecide: boolean, reason: string, label: string, note: string }}
 *   `reason` is the machine-readable state (ready | alone | self | decided |
 *   expired | permission | blocked | unknown); `label` is what the row shows
 *   in place of its buttons; `note` is the sentence under it.
 */
export function approvalRowState({
  row = null,
  operatorId = null,
  permissions = null,
  policy = null,
  now = Date.now(),
} = {}) {
  if (!row) {
    return decision(false, 'unknown', 'Unavailable', 'This Request Could Not Be Read.');
  }

  const status = String(row.status || '').toLowerCase();
  if (status && status !== 'pending') {
    return decision(
      false,
      'decided',
      `Already ${statusLabel(status)}`,
      'A Decision Has Already Been Recorded Against This Request.',
    );
  }

  if (isExpired(row, now)) {
    return decision(
      false,
      'expired',
      'Expired',
      'The Approval Window Closed Before Anyone Decided. Raise The Operation Again.',
    );
  }

  // The route's answer, where it gave one. It is computed from the caller's
  // real permissions, the policy and the roster, all three of which this file
  // is only guessing at.
  const served = serverDecision(row, policy);
  if (served) return served;

  const permission = permissionForKind(row.kind);
  if (!hasPermission(permissions, permission)) {
    return decision(
      false,
      'permission',
      'Permission Required',
      `Deciding A ${kindLabel(row.kind)} Request Needs ${permission}.`,
    );
  }

  const isSelf = !!operatorId && String(row.requested_by || '') === String(operatorId);
  const alone = aloneRuleApplies(row, policy);

  if (isSelf && !alone) {
    return decision(
      false,
      'self',
      'Waiting For Another Operator',
      'You Raised This Request, So A Second Operator Has To Decide It.',
    );
  }

  if (isSelf && alone) {
    return decision(
      true,
      'alone',
      'Alone Rule Applies',
      'You Are The Only Eligible Approver, So This Decision Is Yours And The Audit Row Will Say So.',
    );
  }

  return decision(true, 'ready', 'Ready To Decide', '');
}

// ═══════════════════════════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The policy row, in ONE shape, whatever shape it arrived in.
 *
 * The route normalises the row to camelCase before sending it
 * (`approvalsEnabled`, `mintThreshold`) while the contract, the table and
 * every RPC parameter are snake_case. Reading only one of the two is how a
 * console decides maker-checker is off because it looked for
 * `approvals_enabled` in an object that spells it `approvalsEnabled` - and
 * "off" is the answer that lets money move, so it is the wrong way to be
 * wrong. Both spellings are read here, once, and the rest of the client sees
 * the snake_case names the contract uses.
 *
 * The DEFAULTS matter as much as the names: approvals default OFF (the
 * shipped state), the alone-rule defaults ON (a lone operator must not be
 * deadlocked), and a missing threshold is 0.
 */
export function normalizePolicy(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (snake, camel) => {
    if (raw[snake] !== undefined && raw[snake] !== null) return raw[snake];
    if (raw[camel] !== undefined && raw[camel] !== null) return raw[camel];
    return undefined;
  };
  const number = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    approvals_enabled: pick('approvals_enabled', 'approvalsEnabled') === true,
    allow_self_approve_when_alone:
      pick('allow_self_approve_when_alone', 'allowSelfApproveWhenAlone') !== false,
    enforce_named_roles: pick('enforce_named_roles', 'enforceNamedRoles') === true,
    mint_threshold: number(pick('mint_threshold', 'mintThreshold'), 0),
    fund_threshold: number(pick('fund_threshold', 'fundThreshold'), 0),
    cashout_threshold: number(pick('cashout_threshold', 'cashoutThreshold'), 0),
    approval_ttl_minutes: number(pick('approval_ttl_minutes', 'approvalTtlMinutes'), 1440),
    updated_at: pick('updated_at', 'updatedAt') || null,
    updated_by: pick('updated_by', 'updatedBy') || null,
  };
}

/** Which threshold column governs this kind. */
export function thresholdForKind(policy, kind) {
  if (!policy) return null;
  const k = String(kind || '').toLowerCase();
  if (k === 'cashout') return policy.cashout_threshold;
  if (k === 'fund_club') return policy.fund_threshold;
  // Issue and retire are both the Mint, and both read mint_threshold.
  return policy.mint_threshold;
}

/**
 * Does the route say this operator is currently the only eligible approver?
 *
 * `section=policy` answers `aloneRule { permission, eligibleApprovers,
 * applies }`, and `applies` is already the whole test: approvals on, the
 * alone-rule allowed, and zero OTHER eligible approvers. A null count means
 * the roster could not be read, and the route sets `applies` false for it, so
 * an unknown is never reported as "you are alone".
 */
export function aloneRuleIsInForce(aloneRule) {
  if (!aloneRule || typeof aloneRule !== 'object') return false;
  return aloneRule.applies === true;
}

/**
 * The sentence the confirm dialog owes the operator before money moves.
 *
 * "At or over" is the comparison, not "over": the DB default threshold is 0,
 * and with approvals on a zero threshold has to mean everything goes to a
 * second pair of eyes, not everything except a zero-value operation.
 *
 * With approvals off - which is the default and the state production is in -
 * this returns exactly what the console has always said: it executes now.
 *
 * THE ALONE-RULE IS THE THIRD ANSWER, and leaving it out made the dialog lie.
 * With approvals ON, the amount at or over the threshold, and one eligible
 * approver, `requireApproval` returns `required: false` and the money moves
 * the instant the operator confirms - while this said "Nothing Moves Until A
 * Second Operator Approves It" over a button labelled "Yes, Send For
 * Approval". That is not a copy defect: it is a dialog telling an operator
 * their money move is reversible when it is about to be irreversible. The
 * route is the only party that can count approvers, it already sends the
 * count, and now this reads it.
 */
export function thresholdDecision({
  policy = null,
  kind = 'mint',
  amount = null,
  asset = null,
  aloneRule = null,
} = {}) {
  const approvalsEnabled = !!(policy && policy.approvals_enabled === true);
  const rawThreshold = thresholdForKind(policy, kind);
  const threshold = Number.isFinite(Number(rawThreshold)) ? Number(rawThreshold) : 0;
  // Number(null) and Number('') are both 0, and 0 is at-or-over a zero
  // threshold - so an EMPTY amount box would have read as "this will be sent
  // for approval". An absent amount is not a number, it is an absence.
  const value = (amount === null || amount === undefined || amount === '')
    ? NaN
    : Number(amount);
  const atOrOver = Number.isFinite(value) && value >= threshold;
  const gated = approvalsEnabled && atOrOver;
  const alone = gated && aloneRuleIsInForce(aloneRule);
  // `willRequest` keeps its meaning: it is TRUE only when the operation stops
  // and waits for somebody else. Under the alone-rule it does not stop, so it
  // is false, and every caller that renders "waiting" from it is right again.
  const willRequest = gated && !alone;

  const assetWord = asset ? ` ${asset}` : '';
  let headline = 'This Will Execute Immediately';
  let detail = 'Maker-Checker Is Off, So This Operation Is Recorded And Executed As Soon As You Confirm.';
  if (willRequest) {
    headline = 'This Will Be Sent For Approval';
    detail = `Maker-Checker Is On And ${threshold.toLocaleString()}${assetWord} Is The Threshold For This Operation. Nothing Moves Until A Second Operator Approves It.`;
  } else if (alone) {
    headline = 'This Will Execute Now And Be Recorded As Self Approved';
    detail = `Maker-Checker Is On And This Is At Or Over The ${threshold.toLocaleString()}${assetWord} Threshold, But You Are The Only Eligible Approver. The Alone Rule Applies, So This Executes When You Confirm And The Audit Row Says You Approved Your Own Request.`;
  } else if (approvalsEnabled) {
    detail = `Maker-Checker Is On, But ${threshold.toLocaleString()}${assetWord} Is The Threshold And This Operation Is Under It.`;
  }

  return {
    approvalsEnabled,
    threshold,
    atOrOver,
    gated,
    aloneRuleApplies: alone,
    willRequest,
    headline,
    detail,
  };
}

/**
 * The receipt a 202 answer produces.
 *
 * The route answers 202 `{ success: true, pending: true, approvalId, message }`
 * (PHASE2-CONTRACTS section 2). `pending` is the branch that matters: a body
 * without it is an ordinary execution and must not be read as an approval, or
 * a real mint renders as "sent for approval" and the operator mints it twice.
 */
export function isPendingApproval(body) {
  return !!(body && body.pending === true && body.approvalId);
}
