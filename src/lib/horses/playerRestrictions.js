/**
 * The restriction vocabulary, and the rule that decides which restrictions
 * need a second operator.
 *
 * PURE MODULE: no imports, safe to unit test under node --test, and imported
 * by BOTH the route and the panel so the sentence an operator reads before
 * they act is computed from the same rule the route gates on. Phase 3's H-1
 * is the reason that matters: the console said "This Change Will Be Applied
 * Now" for five changes that were in fact material, because the client and
 * the server each had their own idea of the word.
 *
 * The scopes and reason codes here are MIRRORED IN SQL, in the check
 * constraints on ca_player_restrictions. A value added to one and not the
 * other is a control the panel offers and the database refuses, so
 * __tests__/horses-phase4-migration.test.mjs reads the migration and asserts
 * the two lists are identical.
 */

/**
 * What a restriction can stop.
 *
 * `account` is the whole thing and IMPLIES every other scope - the reader in
 * SQL treats it that way, so an operator who restricts the account does not
 * also have to remember to tick cash.
 *
 * Only two of the five are ENFORCED today, and this list says which, because
 * an operator choosing `transfers` deserves to know it is recorded rather
 * than blocking anything: the guards are attached to table_seats (cash) and
 * tournament_players (tournaments), which is where every seat and every
 * tournament entry on the platform converges. `transfers` and `social` have
 * no convergence point yet and are recorded for the phase that gives them
 * one.
 */
export const RESTRICTION_SCOPES = Object.freeze([
  'account',
  'cash',
  'tournaments',
  'transfers',
  'social',
]);

/** Which scopes a guard actually watches today. */
export const ENFORCED_SCOPES = Object.freeze(['account', 'cash', 'tournaments']);

export const SCOPE_META = Object.freeze({
  account: {
    label: 'Whole Account',
    blurb: 'Everything Below, Together. The Heaviest Thing An Operator Can Do',
    enforced: true,
  },
  cash: {
    label: 'Cash Games',
    blurb: 'Cannot Take A Seat At A Cash Table',
    enforced: true,
  },
  tournaments: {
    label: 'Tournaments',
    blurb: 'Cannot Register For A Tournament',
    enforced: true,
  },
  transfers: {
    label: 'Transfers',
    blurb: 'Recorded Only. No Guard Watches Transfers Yet',
    enforced: false,
  },
  social: {
    label: 'Social',
    blurb: 'Recorded Only. No Guard Watches The Social Surfaces Yet',
    enforced: false,
  },
});

/**
 * Why. A fixed vocabulary, because a free-text reason is a reason nobody can
 * report on, and because "why was this account stopped" is the first question
 * asked three months later.
 */
export const RESTRICTION_REASON_CODES = Object.freeze([
  'collusion_suspected',
  'chip_dumping_suspected',
  'multi_accounting',
  'bot_or_rta_suspected',
  'abuse_or_harassment',
  'payment_dispute',
  'kyc_incomplete',
  'responsible_gaming',
  'self_requested',
  'security_compromise',
  'terms_violation',
  'other',
]);

export const REASON_LABELS = Object.freeze({
  collusion_suspected: 'Collusion Suspected',
  chip_dumping_suspected: 'Chip Dumping Suspected',
  multi_accounting: 'Multi Accounting',
  bot_or_rta_suspected: 'Bot Or RTA Suspected',
  abuse_or_harassment: 'Abuse Or Harassment',
  payment_dispute: 'Payment Dispute',
  kyc_incomplete: 'KYC Incomplete',
  responsible_gaming: 'Responsible Gaming',
  self_requested: 'Self Requested',
  security_compromise: 'Security Compromise',
  terms_violation: 'Terms Violation',
  other: 'Other',
});

/** The one reason code that cannot stand on its own. */
export const REASON_NEEDS_NOTE = 'other';

export const RESTRICTION_STATUSES = Object.freeze(['active', 'lifted', 'expired']);

/**
 * Does this restriction need a second pair of eyes?
 *
 * Two cases, and both are about how hard it is to undo by accident rather
 * than about a number:
 *
 *   * `account` stops everything at once.
 *   * no expiry means nobody is ever forced to look at it again. A
 *     time-boxed restriction reviews itself; an indefinite one only ends
 *     when somebody remembers.
 *
 * Deliberately NOT a threshold on a money amount: `sanction` has no
 * THRESHOLD_FIELD in approvals.js precisely because a judgement about a
 * person has no amount to measure.
 */
export function needsApproval({ scope, expiresAt } = {}) {
  if (scope === 'account') {
    return { required: true, reason: 'whole_account' };
  }
  if (expiresAt == null || expiresAt === '') {
    return { required: true, reason: 'no_expiry' };
  }
  return { required: false, reason: null };
}

/** What the operator is told about the gate, before they press anything. */
export const GATE_TEXT = Object.freeze({
  whole_account:
    'This Restricts The Whole Account, So It Needs A Second Operator To Approve It',
  no_expiry:
    'This Restriction Has No Expiry, So Nobody Is Forced To Revisit It. It Needs A Second Operator To Approve It',
});

/**
 * The sentence shown beside the confirm button, derived from the LIVE
 * enforcement switch rather than from a constant.
 *
 * PHASE4-CONTRACTS section 0 rule 2 in one function. "Suspend This Player"
 * while enforcement is off is the lie this phase exists not to tell, and an
 * UNKNOWN switch is not the same as off: told "this will not bite" when
 * nobody actually knows, an operator stops watching.
 */
export function enforcementNotice(enforced) {
  if (enforced === true) {
    return {
      tone: 'live',
      title: 'Enforcement Is On',
      body: 'A Restricted Player Will Be Refused At The Table And At Tournament Registration.',
    };
  }
  if (enforced === false) {
    return {
      tone: 'observing',
      title: 'Enforcement Is Off',
      body: 'This Will Be Recorded And Observed, Not Refused. The Player Keeps Playing Until Enforcement Is Turned On.',
    };
  }
  return {
    tone: 'unknown',
    title: 'Enforcement State Unknown',
    body: 'Whether Restrictions Are Being Enforced Could Not Be Read, So Assume Nothing About What This Will Do.',
  };
}

/**
 * Is this restriction row binding RIGHT NOW?
 *
 * expires_at is the CLOCK and status is only the INTENT. A row can still say
 * active while its expiry has passed, because only a sweep updates the
 * status, and the SQL reader takes the same view. The panel must agree with
 * the reader or it will show "Active" against a player who is not restricted.
 */
export function isBinding(row, now = Date.now()) {
  if (!row || row.status !== 'active') return false;
  if (!row.expires_at) return true;
  const at = new Date(row.expires_at).getTime();
  return Number.isFinite(at) ? at > now : true;
}

/** Active, lifted, expired, or run out while still marked active. */
export function displayStatus(row, now = Date.now()) {
  if (!row) return 'unknown';
  if (row.status === 'lifted') return 'lifted';
  if (row.status === 'expired') return 'expired';
  return isBinding(row, now) ? 'active' : 'expired';
}

/**
 * The responsible-gaming fields, and which DIRECTION is a tightening.
 *
 * Mirrored from fn_ca_player_rg_set so the panel can warn before the RPC
 * refuses. `lower` means a smaller number is tighter; `later` means a later
 * timestamp is tighter.
 *
 * reality_check_interval_minutes is the one that reads backwards if you skim
 * it: a SHORTER interval is TIGHTER, because it means more reminders. Sorting
 * it with the money limits would classify "remind me less often" as a
 * tightening, which is the kind of mistake that only shows up in somebody's
 * worst month.
 */
export const RG_FIELDS = Object.freeze([
  { key: 'daily_deposit_limit', label: 'Daily Deposit Limit', tighter: 'lower', kind: 'money' },
  { key: 'weekly_deposit_limit', label: 'Weekly Deposit Limit', tighter: 'lower', kind: 'money' },
  { key: 'monthly_deposit_limit', label: 'Monthly Deposit Limit', tighter: 'lower', kind: 'money' },
  { key: 'daily_loss_limit', label: 'Daily Loss Limit', tighter: 'lower', kind: 'money' },
  { key: 'session_time_limit_minutes', label: 'Session Time Limit', tighter: 'lower', kind: 'minutes' },
  { key: 'reality_check_interval_minutes', label: 'Reality Check Interval', tighter: 'lower', kind: 'minutes' },
  { key: 'self_excluded_until', label: 'Self Excluded Until', tighter: 'later', kind: 'time' },
  { key: 'cooling_off_until', label: 'Cooling Off Until', tighter: 'later', kind: 'time' },
]);

/**
 * Which fields in this patch LOOSEN the player's protection.
 *
 * Same classification as the RPC, so the panel can say "this will be held"
 * before the round trip instead of surfacing a refusal as a surprise. The
 * RPC still has the last word.
 */
export function loosensOf(before, patch) {
  const out = [];
  if (!patch || typeof patch !== 'object') return out;
  // No existing row means no limits at all, which is the loosest a player
  // can be, so creating one can only tighten.
  if (!before) return out;

  for (const field of RG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field.key)) continue;
    const next = patch[field.key];
    const prev = before[field.key];
    if (prev == null) continue;

    if (next == null || next === '') {
      out.push(`${field.key}:cleared`);
      continue;
    }
    if (field.tighter === 'lower') {
      if (Number(next) > Number(prev)) {
        out.push(`${field.key}:${field.key.includes('interval') ? 'lengthened' : 'raised'}`);
      }
    } else {
      const a = new Date(next).getTime();
      const b = new Date(prev).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && a < b) {
        out.push(`${field.key}:shortened`);
      }
    }
  }
  return out;
}

/** Is a loosening patch held right now? */
export function isHeld(before, patch, now = Date.now()) {
  if (!before) return false;
  if (loosensOf(before, patch).length === 0) return false;
  const until = new Date(before.limit_increase_available_at).getTime();
  return Number.isFinite(until) ? now < until : false;
}
