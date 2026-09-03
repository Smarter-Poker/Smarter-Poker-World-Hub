/**
 * /horses console - Phase 2 client contract tests.
 *
 * Same split as the Phase 1 suite, and for the same reason: a test that only
 * asserts a string appears in a file passes happily while the function that
 * string belongs to has no caller.
 *
 * 1. BEHAVIOUR. Every decision Phase 2 adds to this console is a pure
 *    function in src/components/horses - who may see which tab, who may
 *    decide which approval, whether an operation executes or waits, how old a
 *    request is, and what a trail request looks like - and all of them are
 *    imported and exercised for real here. That is the half that can fail for
 *    the right reason.
 *
 * 2. FILE CONTRACTS. There is no node_modules in this snapshot, so nothing
 *    can render React. What is left is asserted against the WIRING (the
 *    string that proves a handler is bound to a button, the branch that
 *    proves a response shape is read) rather than against a declaration that
 *    may be dead.
 *
 * THE ONE THING THIS SUITE IS MOST FOR. PHASE2-CONTRACTS section 0: nothing
 * in Phase 2 may lock an operator out. Production has three operator accounts
 * and the permission list they are filtered by comes from a route that is
 * being written in parallel. So the first behaviour test below is that an
 * absent, empty or unknown permission list shows EVERY tab, and it is the
 * test that must never be "fixed" by making the filter stricter.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { TABS, visibleTabs } from '../src/components/horses/tabRegistry.js';
import {
  ADMIN_MANAGE,
  canManageOperators,
  hasPermission,
  operatorIdFromPayload,
  permissionsFromPayload,
  permittedTabs,
} from '../src/components/horses/operatorPermissions.js';
import {
  aloneRuleApplies,
  approvalRowState,
  formatAge,
  formatDuration,
  formatExpiresIn,
  isExpired,
  isPendingApproval,
  kindLabel,
  normalizePolicy,
  permissionForKind,
  serverDecision,
  statusLabel,
  thresholdDecision,
  thresholdForKind,
  toneForApprovalStatus,
} from '../src/components/horses/approvalModel.js';
import {
  MIN_REASON_LENGTH,
  approvalsUrl,
  auditTrailUrl,
  decideApprovalBody,
  grantRoleBody,
  operatorAdminUrl,
  permissionMatrix,
  policyUrl,
  reasonIsValid,
  revokeRoleBody,
  rowsOf,
  setPolicyBody,
  staffUrl,
} from '../src/components/horses/operatorAdmin.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const INDEX = 'pages/horses/index.js';
const COMPONENT_DIR = 'src/components/horses/';

/** The files this phase owns. The hygiene block at the bottom runs over all
 *  of them; the Phase 1 suite already runs over every component file, so this
 *  list exists to make sure index.js is covered too. */
const PHASE2_FILES = [
  INDEX,
  `${COMPONENT_DIR}operatorPermissions.js`,
  `${COMPONENT_DIR}approvalModel.js`,
  `${COMPONENT_DIR}operatorAdmin.js`,
  `${COMPONENT_DIR}StaffPanel.jsx`,
  `${COMPONENT_DIR}ApprovalsPanel.jsx`,
  `${COMPONENT_DIR}tabRegistry.js`,
];

const EM_DASH = '\u2014';
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

/** A minute, in ms, so the time tests read as what they mean. */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - tab visibility from a permission set
// ═══════════════════════════════════════════════════════════════════════════

test('THE SAFETY RULE: an unknown permission set shows every tab', () => {
  // PHASE2-CONTRACTS section 0. Null is "the route has not told us" - it is
  // not "this operator holds nothing", and collapsing the two would empty the
  // nav of the three accounts that run this platform the first time
  // /api/horses/operator-admin is slow.
  const all = visibleTabs(TABS);
  assert.equal(permittedTabs(all, null).length, all.length);
  assert.equal(permittedTabs(all, undefined).length, all.length);
  assert.equal(permittedTabs(all, []).length, all.length);
  assert.equal(hasPermission(null, 'mint.write'), true);
  assert.equal(hasPermission([], 'mint.write'), true);
});

test('a populated permission set filters the nav down to what it names', () => {
  const all = visibleTabs(TABS);
  const permissions = ['console.read', 'audit.read', 'mint.write'];
  const ids = permittedTabs(all, permissions).map((t) => t.id);

  // The two Phase 2 tabs declare console.read, so both survive.
  assert.ok(ids.includes('staff'));
  assert.ok(ids.includes('approvals'));
  assert.ok(ids.includes('audit'));
  assert.ok(ids.includes('mint'));
  // And everything this operator does not hold is gone.
  assert.ok(!ids.includes('stable'));
  assert.ok(!ids.includes('clubarena'));
  assert.ok(ids.length < all.length);
});

test('a wildcard permission holds everything', () => {
  const all = visibleTabs(TABS);
  assert.equal(permittedTabs(all, ['*']).length, all.length);
});

test('a placeholder tab is never shown, whatever the operator holds', () => {
  const tabs = [
    { id: 'real', label: 'Real', permission: 'a.read' },
    { id: 'ghost', label: 'Ghost', permission: 'a.read', placeholder: true },
  ];
  assert.deepEqual(permittedTabs(tabs, ['a.read']).map((t) => t.id), ['real']);
  assert.deepEqual(permittedTabs(tabs, null).map((t) => t.id), ['real']);
});

test('admin.manage is what gates granting, revoking and the policy panel', () => {
  assert.equal(canManageOperators([ADMIN_MANAGE]), true);
  assert.equal(canManageOperators(['console.read']), false);
  // And an unknown set does not hide the panel from the operators who have
  // always had it.
  assert.equal(canManageOperators(null), true);
});

test('permissionsFromPayload keeps null distinct from an empty list', () => {
  assert.equal(permissionsFromPayload(null), null);
  assert.equal(permissionsFromPayload({}), null);
  assert.equal(permissionsFromPayload({ policy: {} }), null);
  assert.deepEqual(permissionsFromPayload({ permissions: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(
    permissionsFromPayload({ operator: { permissions: ['c'] } }),
    ['c'],
  );
  // An empty list from the route survives as an empty list; hasPermission is
  // where it is read as "show everything", so the two decisions stay apart.
  assert.deepEqual(permissionsFromPayload({ permissions: [] }), []);
});

test('operatorIdFromPayload falls back to the signed-in account, never to a guess', () => {
  assert.equal(operatorIdFromPayload({ operatorId: 'a' }, 'b'), 'a');
  assert.equal(operatorIdFromPayload({ operator: { id: 'a' } }, 'b'), 'a');
  assert.equal(operatorIdFromPayload({}, 'b'), 'b');
  assert.equal(operatorIdFromPayload(null, null), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - the approval row state machine
// ═══════════════════════════════════════════════════════════════════════════

const NOW = Date.parse('2026-09-03T12:00:00Z');
const ME = 'operator-me';
const OTHER = 'operator-other';

function pendingRow(overrides = {}) {
  return {
    id: 'req-1',
    kind: 'mint',
    status: 'pending',
    amount: 1000,
    asset: 'chips',
    requested_by: OTHER,
    requested_at: new Date(NOW - 30 * MINUTE).toISOString(),
    expires_at: new Date(NOW + 2 * HOUR).toISOString(),
    ...overrides,
  };
}

test('another operator raised it, and it is decidable', () => {
  const state = approvalRowState({ row: pendingRow(), operatorId: ME, now: NOW });
  assert.equal(state.canDecide, true);
  assert.equal(state.reason, 'ready');
});

test('THE FOUR-EYES RULE: a request you raised is not yours to decide', () => {
  const state = approvalRowState({
    row: pendingRow({ requested_by: ME }),
    operatorId: ME,
    now: NOW,
  });
  assert.equal(state.canDecide, false);
  assert.equal(state.reason, 'self');
  assert.equal(state.label, 'Waiting For Another Operator');
});

test('THE ALONE RULE: the route saying so unlocks your own request', () => {
  // A single-operator platform cannot four-eyes anything. The route is the
  // only party that can count eligible approvers, so its answer wins.
  const state = approvalRowState({
    row: pendingRow({ requested_by: ME, alone_rule: true }),
    operatorId: ME,
    now: NOW,
  });
  assert.equal(state.canDecide, true);
  assert.equal(state.reason, 'alone');
  assert.match(state.note, /Only Eligible Approver/);
});

test('THE ALONE RULE: no_second_approver plus the policy flag means the same', () => {
  const row = pendingRow({ requested_by: ME, blocked_reason: 'no_second_approver' });
  assert.equal(aloneRuleApplies(row, { allow_self_approve_when_alone: true }), true);
  assert.equal(aloneRuleApplies(row, { allow_self_approve_when_alone: false }), false);
  assert.equal(aloneRuleApplies(row, null), false);

  assert.equal(
    approvalRowState({
      row, operatorId: ME, policy: { allow_self_approve_when_alone: true }, now: NOW,
    }).canDecide,
    true,
  );
  assert.equal(
    approvalRowState({
      row, operatorId: ME, policy: { allow_self_approve_when_alone: false }, now: NOW,
    }).canDecide,
    false,
  );
});

test('the route can say alone_rule is false and that beats the local guess', () => {
  const row = pendingRow({
    requested_by: ME,
    blocked_reason: 'no_second_approver',
    alone_rule: false,
  });
  assert.equal(aloneRuleApplies(row, { allow_self_approve_when_alone: true }), false);
});

test('an already-decided row offers no buttons, whoever is looking', () => {
  for (const status of ['approved', 'rejected', 'executed', 'auto_approved', 'failed']) {
    const state = approvalRowState({
      row: pendingRow({ status }), operatorId: ME, now: NOW,
    });
    assert.equal(state.canDecide, false, `${status} must not be decidable`);
    assert.equal(state.reason, 'decided');
    assert.match(state.label, /^Already /);
  }
});

test('an expired row is expired, by status or by the clock', () => {
  assert.equal(isExpired(pendingRow({ status: 'expired' }), NOW), true);
  assert.equal(
    isExpired(pendingRow({ expires_at: new Date(NOW - MINUTE).toISOString() }), NOW),
    true,
  );
  assert.equal(isExpired(pendingRow(), NOW), false);
  // A row with no expiry has not expired - it is not given one from thin air.
  assert.equal(isExpired(pendingRow({ expires_at: null }), NOW), false);

  const state = approvalRowState({
    row: pendingRow({ expires_at: new Date(NOW - MINUTE).toISOString() }),
    operatorId: ME,
    now: NOW,
  });
  assert.equal(state.canDecide, false);
  assert.equal(state.reason, 'expired');
});

test('expiry is checked BEFORE the alone rule, so a lapsed window is not reopened', () => {
  const state = approvalRowState({
    row: pendingRow({
      requested_by: ME,
      alone_rule: true,
      expires_at: new Date(NOW - MINUTE).toISOString(),
    }),
    operatorId: ME,
    now: NOW,
  });
  assert.equal(state.canDecide, false);
  assert.equal(state.reason, 'expired');
});

test('deciding needs the permission the KIND needs, not one blanket permission', () => {
  assert.equal(permissionForKind('mint'), 'money.write');
  assert.equal(permissionForKind('burn'), 'money.write');
  assert.equal(permissionForKind('fund_club'), 'money.write');
  assert.equal(permissionForKind('cashout'), 'cashier.write');
  // An unknown kind falls back to a permission the legacy roles hold, so it
  // can never lock out an operator who exists today.
  assert.equal(permissionForKind('something_new'), 'money.write');

  const cashout = pendingRow({ kind: 'cashout' });
  assert.equal(
    approvalRowState({
      row: cashout, operatorId: ME, permissions: ['money.write'], now: NOW,
    }).reason,
    'permission',
  );
  assert.equal(
    approvalRowState({
      row: cashout, operatorId: ME, permissions: ['cashier.write'], now: NOW,
    }).canDecide,
    true,
  );
});

test('a route veto blocks a row this file would otherwise allow', () => {
  const state = approvalRowState({
    row: pendingRow({ can_decide: false }), operatorId: ME, now: NOW,
  });
  assert.equal(state.canDecide, false);
  assert.equal(state.reason, 'blocked');
});

// ---------------------------------------------------------------------------
// THE SERVER'S PER-ROW VERDICT, AND THE FALLBACK WHEN IT DOES NOT SEND ONE
//
// `section=approvals` computes the decision per row from the caller's real
// permissions, the policy and the roster, and sends it as `can_decide` and
// `decide_blocked_reason`. Those are preferred; the derivation in this file
// is what answers when they are absent. Both directions are tested, because
// only having one is how a console ends up trusting a field nobody sends.
// ---------------------------------------------------------------------------

test('the route\'s own refusal is preferred over anything this file would derive', () => {
  // Each of the four codes the route can send, on a row whose local facts
  // would otherwise say "go ahead": raised by somebody else, in date,
  // pending, and with every permission held.
  const cases = [
    ['self_approval', 'self', /Second Operator Has To Decide It/],
    ['no_permission', 'permission', /Does Not Hold The Permission/],
    ['expired', 'expired', /Approval Window Closed/],
    ['already_decided', 'decided', /Already Been Recorded/],
  ];
  for (const [code, reason, note] of cases) {
    const state = approvalRowState({
      row: pendingRow({ can_decide: false, decide_blocked_reason: code }),
      operatorId: ME,
      permissions: ['money.write', 'cashier.write'],
      now: NOW,
    });
    assert.equal(state.canDecide, false, `${code} must not be decidable`);
    assert.equal(state.reason, reason, `${code} should read as ${reason}`);
    assert.match(state.note, note);
  }
});

test('the route saying can_decide unlocks a row this file could not have cleared', () => {
  // The operator raised it themselves and this console holds no permission
  // list at all, so the local derivation would stop at "self". The route
  // counted the eligible approvers, found none, and said so.
  const state = approvalRowState({
    row: pendingRow({ requested_by: ME, can_decide: true, alone_rule: true }),
    operatorId: ME,
    now: NOW,
  });
  assert.equal(state.canDecide, true);
  assert.equal(state.reason, 'alone');
  assert.match(state.note, /Only Eligible Approver/);

  // Same flag, another operator's request: ready, with no alone-rule note.
  const other = approvalRowState({
    row: pendingRow({ can_decide: true }), operatorId: ME, now: NOW,
  });
  assert.equal(other.canDecide, true);
  assert.equal(other.reason, 'ready');
});

test('a stale row cannot be reopened by a verdict the route gave earlier', () => {
  // The route said yes at 10:00. It is now past the expiry, and the row on
  // screen is the one the operator is about to click.
  const lapsed = approvalRowState({
    row: pendingRow({
      can_decide: true,
      alone_rule: true,
      expires_at: new Date(NOW - MINUTE).toISOString(),
    }),
    operatorId: ME,
    now: NOW,
  });
  assert.equal(lapsed.canDecide, false);
  assert.equal(lapsed.reason, 'expired');

  // And a row decided since the page was fetched reads as decided.
  const decided = approvalRowState({
    row: pendingRow({ status: 'approved', can_decide: true }), operatorId: ME, now: NOW,
  });
  assert.equal(decided.canDecide, false);
  assert.equal(decided.reason, 'decided');
});

test('with no server verdict at all, the local derivation still answers', () => {
  // The fallback path: a route that predates the per-row flags, or a row
  // this console composed itself. Nothing below carries can_decide or
  // decide_blocked_reason.
  const self = approvalRowState({
    row: pendingRow({ requested_by: ME }),
    operatorId: ME,
    permissions: ['money.write'],
    now: NOW,
  });
  assert.equal(self.reason, 'self');

  const noPermission = approvalRowState({
    row: pendingRow({ kind: 'cashout' }), operatorId: ME, permissions: ['money.write'], now: NOW,
  });
  assert.equal(noPermission.reason, 'permission');

  const ready = approvalRowState({
    row: pendingRow(), operatorId: ME, permissions: ['money.write'], now: NOW,
  });
  assert.equal(ready.canDecide, true);
  assert.equal(ready.reason, 'ready');

  // And the alone-rule the old way: the request recorded no_second_approver
  // and the policy still lets a lone operator decide.
  const alone = approvalRowState({
    row: pendingRow({ requested_by: ME, blocked_reason: 'no_second_approver' }),
    operatorId: ME,
    permissions: ['money.write'],
    policy: { allow_self_approve_when_alone: true },
    now: NOW,
  });
  assert.equal(alone.canDecide, true);
  assert.equal(alone.reason, 'alone');
});

test('serverDecision reads only what the route actually sent', () => {
  assert.equal(serverDecision(null), null);
  assert.equal(serverDecision({}), null, 'a row with neither field has no server verdict');
  assert.equal(serverDecision({ decide_blocked_reason: null, can_decide: undefined }), null);
  assert.equal(serverDecision({ can_decide: false }).reason, 'blocked');
  assert.equal(serverDecision({ can_decide: true }).reason, 'ready');
  assert.equal(serverDecision({ decide_blocked_reason: 'expired' }).reason, 'expired');
  // A code this console does not know is still a refusal, not an absence.
  assert.equal(serverDecision({ decide_blocked_reason: 'some_new_rule' }).reason, 'blocked');
});

test('a missing row is stated as unavailable rather than crashing the queue', () => {
  const state = approvalRowState({ row: null, operatorId: ME, now: NOW });
  assert.equal(state.canDecide, false);
  assert.equal(state.reason, 'unknown');
});

test('with no operator id known, a row is never treated as self-raised', () => {
  // The alternative - guessing - would enable Approve on a request the
  // operator made. Not knowing has to fail towards the server's check.
  const state = approvalRowState({
    row: pendingRow({ requested_by: ME }), operatorId: null, now: NOW,
  });
  assert.equal(state.canDecide, true);
});

test('kind and status labels are Title Case and never leak a raw enum', () => {
  assert.equal(kindLabel('fund_club'), 'Fund Club');
  assert.equal(statusLabel('auto_approved'), 'Auto Approved');
  assert.equal(toneForApprovalStatus('pending'), 'warn');
  assert.equal(toneForApprovalStatus('rejected'), 'danger');
  assert.equal(toneForApprovalStatus('executed'), 'good');
});

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - threshold copy
// ═══════════════════════════════════════════════════════════════════════════

test('approvals OFF always reads "This Will Execute Immediately"', () => {
  // This is the state production is in. It is also what a null policy means,
  // which is what the console holds when the route has not answered.
  for (const policy of [null, undefined, { approvals_enabled: false, mint_threshold: 0 }]) {
    const d = thresholdDecision({ policy, kind: 'mint', amount: 1e9, asset: 'chips' });
    assert.equal(d.willRequest, false);
    assert.equal(d.headline, 'This Will Execute Immediately');
  }
});

test('approvals ON and at or over the threshold reads "This Will Be Sent For Approval"', () => {
  const policy = { approvals_enabled: true, mint_threshold: 1000 };
  const over = thresholdDecision({ policy, kind: 'mint', amount: 5000, asset: 'chips' });
  assert.equal(over.willRequest, true);
  assert.equal(over.headline, 'This Will Be Sent For Approval');

  // AT the threshold, not just over it.
  const at = thresholdDecision({ policy, kind: 'mint', amount: 1000, asset: 'chips' });
  assert.equal(at.willRequest, true);

  const under = thresholdDecision({ policy, kind: 'mint', amount: 999, asset: 'chips' });
  assert.equal(under.willRequest, false);
  assert.equal(under.headline, 'This Will Execute Immediately');
  // And it still says maker-checker is on, so "immediately" is not read as
  // "the control is off".
  assert.match(under.detail, /Maker-Checker Is On/);
});

test('a zero threshold with approvals on sends everything for approval', () => {
  // ca_operator_policy defaults every threshold to 0. With ">" instead of
  // ">=" that default would mean the control is on and catches nothing.
  const d = thresholdDecision({
    policy: { approvals_enabled: true, mint_threshold: 0 },
    kind: 'mint',
    amount: 1,
  });
  assert.equal(d.willRequest, true);
});

test('each kind reads its own threshold column', () => {
  const policy = {
    approvals_enabled: true,
    mint_threshold: 100,
    fund_threshold: 200,
    cashout_threshold: 300,
  };
  assert.equal(thresholdForKind(policy, 'mint'), 100);
  assert.equal(thresholdForKind(policy, 'burn'), 100);
  assert.equal(thresholdForKind(policy, 'fund_club'), 200);
  assert.equal(thresholdForKind(policy, 'cashout'), 300);
  assert.equal(thresholdForKind(null, 'mint'), null);

  assert.equal(thresholdDecision({ policy, kind: 'cashout', amount: 250 }).willRequest, false);
  assert.equal(thresholdDecision({ policy, kind: 'fund_club', amount: 250 }).willRequest, true);
});

test('an amount that is not a number never counts as over the threshold', () => {
  const policy = { approvals_enabled: true, mint_threshold: 0 };
  for (const amount of [null, undefined, '', 'abc', NaN]) {
    assert.equal(thresholdDecision({ policy, kind: 'mint', amount }).willRequest, false);
  }
});

test('the 202 branch is only taken for a body that actually says pending', () => {
  assert.equal(isPendingApproval({ pending: true, approvalId: 'a-1' }), true);
  assert.equal(isPendingApproval({ success: true, result: { ok: true } }), false);
  assert.equal(isPendingApproval({ pending: true }), false);       // no id, no receipt
  assert.equal(isPendingApproval({ pending: 'true', approvalId: 'a' }), false);
  assert.equal(isPendingApproval(null), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - age and expiry formatting
// ═══════════════════════════════════════════════════════════════════════════

test('a duration is the shortest thing that is still true', () => {
  assert.equal(formatDuration(30 * 1000), 'Under A Minute');
  assert.equal(formatDuration(5 * MINUTE), '5m');
  assert.equal(formatDuration(2 * HOUR), '2h');
  assert.equal(formatDuration(2 * HOUR + 10 * MINUTE), '2h 10m');
  assert.equal(formatDuration(3 * DAY), '3d');
  assert.equal(formatDuration(3 * DAY + 4 * HOUR), '3d 4h');
  // Never a negative duration.
  assert.equal(formatDuration(-1000), 'Under A Minute');
  assert.equal(formatDuration(NaN), '-');
});

test('age counts up from when the request was raised', () => {
  assert.equal(formatAge(new Date(NOW - 45 * MINUTE).toISOString(), NOW), '45m');
  assert.equal(formatAge(new Date(NOW - 26 * HOUR).toISOString(), NOW), '1d 2h');
  // A missing or unparseable timestamp is a dash, not "0m" - an unknown age
  // must not read as a fresh request.
  assert.equal(formatAge(null, NOW), '-');
  assert.equal(formatAge('not a date', NOW), '-');
});

test('expiry counts down, states Expired, and never invents a deadline', () => {
  assert.equal(formatExpiresIn(new Date(NOW + 90 * MINUTE).toISOString(), NOW), 'In 1h 30m');
  assert.equal(formatExpiresIn(new Date(NOW - MINUTE).toISOString(), NOW), 'Expired');
  assert.equal(formatExpiresIn(new Date(NOW).toISOString(), NOW), 'Expired');
  assert.equal(formatExpiresIn(null, NOW), 'No Expiry');
});

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - the operator-admin request shapes
// ═══════════════════════════════════════════════════════════════════════════

test('the audit trail request names the section, the type and the id', () => {
  const url = auditTrailUrl({
    targetType: 'club', targetId: 'club-123', limit: 25, offset: 50,
  });
  assert.equal(
    url,
    '/api/horses/operator-admin?section=audit_trail&targetType=club&targetId=club-123&limit=25&offset=50',
  );
});

test('a trail needs BOTH a type and an id, which is what the route requires', () => {
  // The route answers 400 "A Target Type And Target Id Are Both Required" for
  // either one alone, and an id with no type matches the same uuid in every
  // other table. Refusing here is what lets the button be disabled instead of
  // the rule being discovered as a failed request.
  assert.equal(auditTrailUrl({ targetType: 'club', targetId: '' }), null);
  assert.equal(auditTrailUrl({ targetType: 'club', targetId: '   ' }), null);
  assert.equal(auditTrailUrl({ targetId: 'abc' }), null);
  assert.equal(auditTrailUrl({ targetType: '  ', targetId: 'abc' }), null);
  assert.equal(auditTrailUrl({}), null);
  assert.equal(auditTrailUrl(), null);
});

test('a negative offset can never be asked for', () => {
  assert.ok(
    auditTrailUrl({ targetType: 'club', targetId: 'a', offset: -100 }).includes('offset=0'),
  );
  assert.ok(approvalsUrl({ offset: -1 }).includes('offset=0'));
});

test('empty filters are dropped rather than sent as a filter for the empty string', () => {
  assert.equal(approvalsUrl({ limit: 50, offset: 0 }),
    '/api/horses/operator-admin?section=approvals&limit=50&offset=0');
  const filtered = approvalsUrl({ status: 'pending', kind: 'mint', limit: 50, offset: 0 });
  assert.ok(filtered.includes('status=pending'));
  assert.ok(filtered.includes('kind=mint'));
  assert.ok(!filtered.includes('from='));
  assert.ok(!filtered.includes('to='));
});

test('the read sections are the five the contract names', () => {
  assert.equal(staffUrl(), '/api/horses/operator-admin?section=staff');
  assert.equal(policyUrl(), '/api/horses/operator-admin?section=policy');
  assert.ok(operatorAdminUrl('roles').endsWith('section=roles'));
  assert.ok(approvalsUrl().startsWith('/api/horses/operator-admin?section=approvals'));
  assert.ok(auditTrailUrl({ targetType: 'club', targetId: 'x' }).includes('section=audit_trail'));
});

test('a grant or a revoke without a real reason is never composed', () => {
  assert.equal(reasonIsValid('too short'), false);
  assert.equal(reasonIsValid('x'.repeat(MIN_REASON_LENGTH)), true);
  assert.equal(reasonIsValid(null), false);
  assert.equal(reasonIsValid('         '), false, 'whitespace is not a reason');

  assert.equal(grantRoleBody({ userId: 'u', roleKey: 'finance', reason: 'short' }), null);
  assert.equal(grantRoleBody({ userId: 'u', reason: 'a long enough reason' }), null);
  assert.equal(grantRoleBody({ roleKey: 'finance', reason: 'a long enough reason' }), null);
  assert.deepEqual(
    grantRoleBody({ userId: 'u', roleKey: 'finance', reason: '  covering for Sam  ' }),
    { action: 'grant_role', userId: 'u', roleKey: 'finance', reason: 'covering for Sam' },
  );

  assert.equal(revokeRoleBody({ grantId: 'g', reason: 'nope' }), null);
  assert.deepEqual(
    revokeRoleBody({ grantId: 'g', reason: 'left the company' }),
    { action: 'revoke_role', grantId: 'g', reason: 'left the company' },
  );
});

test('a decision body accepts only approve or reject, and only with an id', () => {
  assert.equal(decideApprovalBody({ approvalId: 'a', decision: 'maybe' }), null);
  assert.equal(decideApprovalBody({ decision: 'approve' }), null);
  assert.deepEqual(
    decideApprovalBody({ approvalId: 'a', decision: 'APPROVE', note: ' ok ' }),
    { action: 'decide_approval', approvalId: 'a', decision: 'approve', note: 'ok' },
  );
  assert.equal(decideApprovalBody({ approvalId: 'a', decision: 'reject' }).note, '');
});

test('the policy body sends numbers as numbers', () => {
  // A threshold typed into an input arrives as a string, and a string
  // threshold compared against an amount only misbehaves above 9.
  const body = setPolicyBody({
    approvals_enabled: true,
    allow_self_approve_when_alone: false,
    mint_threshold: '10000',
    fund_threshold: '',
    cashout_threshold: 250,
    approval_ttl_minutes: '60',
  });
  assert.equal(body.action, 'set_policy');
  assert.equal(body.approvalsEnabled, true);
  assert.equal(body.allowSelfApproveWhenAlone, false);
  assert.strictEqual(body.mintThreshold, 10000);
  assert.strictEqual(body.cashoutThreshold, 250);
  assert.strictEqual(body.approvalTtlMinutes, 60);
  // '' is Number('') === 0, which is the documented default for a threshold.
  assert.strictEqual(body.fundThreshold, 0);

  const empty = setPolicyBody({});
  assert.equal(empty.approvalsEnabled, false, 'approvals default OFF');
  assert.equal(empty.approvalTtlMinutes, 1440);
});

test('THE POLICY IS READ IN BOTH SPELLINGS, and defaults the safe way', () => {
  // The route normalises the policy row to camelCase before sending it while
  // the contract, the table and every RPC argument are snake_case. Reading
  // only one spelling reports maker-checker as OFF while it is ON, and "off"
  // is the answer that lets money move.
  const camel = normalizePolicy({
    approvalsEnabled: true,
    allowSelfApproveWhenAlone: false,
    mintThreshold: 5000,
    fundThreshold: 10,
    cashoutThreshold: 20,
    approvalTtlMinutes: 60,
  });
  assert.equal(camel.approvals_enabled, true);
  assert.equal(camel.allow_self_approve_when_alone, false);
  assert.equal(camel.mint_threshold, 5000);
  assert.equal(camel.approval_ttl_minutes, 60);

  const snake = normalizePolicy({
    approvals_enabled: true, mint_threshold: 5000, allow_self_approve_when_alone: false,
  });
  assert.equal(snake.approvals_enabled, true);
  assert.equal(snake.mint_threshold, 5000);
  assert.equal(snake.allow_self_approve_when_alone, false);

  // Defaults: approvals OFF (the shipped state), alone-rule ON (a lone
  // operator must not be deadlocked), thresholds 0, TTL 1440.
  const bare = normalizePolicy({});
  assert.equal(bare.approvals_enabled, false);
  assert.equal(bare.allow_self_approve_when_alone, true);
  assert.equal(bare.mint_threshold, 0);
  assert.equal(bare.approval_ttl_minutes, 1440);

  // No policy at all stays null, which every reader treats as approvals off.
  assert.equal(normalizePolicy(null), null);
  assert.equal(normalizePolicy(undefined), null);
});

test('a camelCase policy drives the threshold copy end to end', () => {
  const policy = normalizePolicy({ approvalsEnabled: true, mintThreshold: 1000 });
  assert.equal(thresholdDecision({ policy, kind: 'mint', amount: 1000 }).willRequest, true);
  assert.equal(thresholdDecision({ policy, kind: 'mint', amount: 999 }).willRequest, false);
});

test('the matrix reads the shape the route actually sends', () => {
  // section=roles answers { rows: [role objects], permissions: [...],
  // matrix: { key: [permissions] } } - the role objects are under `rows`,
  // which is also where a raw join table's PAIRS would be.
  const m = permissionMatrix({
    rows: [
      { key: 'owner', label: 'Owner', is_legacy: false, permissions: ['admin.manage'] },
      { key: 'god', label: 'god', is_legacy: true, permissions: ['admin.manage', 'mint.write'] },
    ],
    permissions: ['admin.manage', 'mint.write', 'audit.read'],
    matrix: { owner: ['admin.manage'], god: ['admin.manage', 'mint.write'] },
  });
  assert.deepEqual(m.roles.map((r) => r.key), ['owner', 'god']);
  assert.equal(m.roles[0].label, 'Owner', 'the label must survive the matrix map');
  assert.equal(m.roles[1].isLegacy, true);
  assert.equal(m.grid.god['mint.write'], true);
  assert.equal(m.grid.owner['mint.write'], undefined);
  // A permission nobody holds still gets a row, or the table understates the
  // vocabulary it is showing.
  assert.ok(m.permissions.includes('audit.read'));
});

test('a role met in the map first still keeps the label it is given later', () => {
  const m = permissionMatrix({
    matrix: { owner: ['admin.manage'] },
    rows: [{ key: 'owner', label: 'Owner', is_legacy: false }],
  });
  assert.equal(m.roles.length, 1);
  assert.equal(m.roles[0].label, 'Owner');
});

test('the permission matrix reads a join table, a map or folded roles', () => {
  const fromRows = permissionMatrix({
    roles: [{ key: 'finance', label: 'Finance' }, { key: 'support', label: 'Support' }],
    rows: [
      { role_key: 'finance', permission: 'money.write' },
      { role_key: 'support', permission: 'support.read' },
    ],
  });
  assert.deepEqual(fromRows.permissions, ['money.write', 'support.read']);
  assert.equal(fromRows.grid.finance['money.write'], true);
  assert.equal(fromRows.grid.support['money.write'], undefined);

  const fromMap = permissionMatrix({ matrix: { owner: ['admin.manage', 'money.write'] } });
  assert.equal(fromMap.grid.owner['admin.manage'], true);
  assert.deepEqual(fromMap.permissions, ['admin.manage', 'money.write']);

  const folded = permissionMatrix({
    roles: [{ key: 'owner', label: 'Owner', is_legacy: false, permissions: ['admin.manage'] }],
  });
  assert.equal(folded.grid.owner['admin.manage'], true);
  assert.equal(folded.roles[0].label, 'Owner');
});

test('a role with no permissions still gets a column instead of vanishing', () => {
  const m = permissionMatrix({
    roles: [{ key: 'read_only', label: 'Read Only' }],
    permissions: ['money.write'],
  });
  assert.deepEqual(m.roles.map((r) => r.key), ['read_only']);
  assert.deepEqual(m.permissions, ['money.write']);
  assert.equal(m.grid.read_only['money.write'], undefined);
});

test('an unreadable roles payload produces an empty matrix, never a partial one', () => {
  for (const payload of [null, undefined, 'nonsense', 42]) {
    const m = permissionMatrix(payload);
    assert.deepEqual(m.roles, []);
    assert.deepEqual(m.permissions, []);
  }
});

test('the legacy roles are carried through as legacy', () => {
  const m = permissionMatrix({
    roles: [{ key: 'god', label: 'god', is_legacy: true, permissions: ['money.write'] }],
  });
  assert.equal(m.roles[0].isLegacy, true);
});

test('rowsOf reads the paged field name and the legacy alias beside it', () => {
  assert.deepEqual(rowsOf({ rows: [1] }, 'staff'), [1]);
  assert.deepEqual(rowsOf({ staff: [2] }, 'staff'), [2]);
  assert.deepEqual(rowsOf({ approvals: [3] }, 'staff', 'approvals'), [3]);
  assert.deepEqual(rowsOf({}, 'staff'), []);
  assert.deepEqual(rowsOf(null), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// FILE CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

test('the registry carries the two Phase 2 tabs, with a permission and a module', () => {
  const staff = TABS.find((t) => t.id === 'staff');
  const approvals = TABS.find((t) => t.id === 'approvals');

  assert.ok(staff, 'the staff tab must be registered');
  assert.equal(staff.label, 'Staff And Roles');
  assert.equal(staff.permission, 'console.read');
  assert.equal(typeof staff.load, 'function', 'a Phase 2 tab is its own code-split module');
  assert.notEqual(staff.legacy, true, 'a Phase 2 tab is not rendered inline by index.js');

  assert.ok(approvals, 'the approvals tab must be registered');
  assert.equal(approvals.label, 'Approvals');
  assert.equal(approvals.permission, 'console.read');
  assert.equal(typeof approvals.load, 'function');
});

test('both Phase 2 panels exist as real files the registry can load', async () => {
  const entries = await readdir(new URL(COMPONENT_DIR, ROOT));
  assert.ok(entries.includes('StaffPanel.jsx'), 'tabRegistry loads ./StaffPanel');
  assert.ok(entries.includes('ApprovalsPanel.jsx'), 'tabRegistry loads ./ApprovalsPanel');
});

test('the nav is filtered through permittedTabs, not rendered raw', async () => {
  const src = await read(INDEX);
  assert.match(src, /permittedTabs\(visibleTabs\(TABS\), operatorPermissions\)/);
  // And the console reads the permission list from the route rather than
  // deciding it locally from profiles.role.
  assert.match(src, /permissionsFromPayload\(body\)/);
});

test('THE MINT CONFIRM READS THE PENDING BRANCH', async () => {
  const src = await read(INDEX);
  // The 202 test is a function call, not an inline truthiness check that
  // would take the branch for any body carrying a `pending` key.
  assert.match(src, /if \(isPendingApproval\(body\)\) \{/);
  // The receipt names the approval id...
  assert.match(src, /approvalId: body\.approvalId/);
  assert.match(src, /Approval \{mintReceipt\.approvalId\}/);
  // ...and the jump to the queue is bound to a button.
  assert.match(src, /goToTab\('approvals'\)/);
  // The confirm dialog states which of the two things is about to happen.
  assert.match(src, /thresholdDecision\(\{/);
  assert.match(src, /mintConfirm\.approval\.headline/);
  assert.match(src, /mintConfirm\.approval\?\.willRequest/);
});

test('the pending branch does not reload the ledger as if something was written', async () => {
  const src = await read(INDEX);
  const start = src.indexOf('if (isPendingApproval(body)) {');
  assert.ok(start > 0);
  const branch = src.slice(start, src.indexOf('const result = body.result', start));
  assert.ok(!branch.includes('loadMintData'), 'nothing was written, so nothing is re-read');
  assert.ok(branch.includes('return;'), 'the branch must not fall through to the receipt');
});

test('goToTab is a state move, so the URL write effect owns the navigation', async () => {
  const src = await read(INDEX);
  assert.match(src, /const goToTab = useCallback\(\(tabId\) => \{ setActiveTab\(tabId\); \}, \[\]\);/);
  // The one place that writes the query string still routes through the pure
  // helper, which is what makes this a real navigation with a history entry.
  assert.match(src, /nextUrlQuery\(\{ activeTab, caSection \}, router\.query\)/);
});

test('an operator can never be stranded on a tab they cannot see', async () => {
  const src = await read(INDEX);
  assert.match(src, /if \(navTabs\.some\(\(tab\) => tab\.id === activeTab\)\) return;/);
  assert.match(src, /setActiveTab\(navTabs\[0\]\.id\);/);
});

test('the operator context is cleared on logout', async () => {
  const src = await read(INDEX);
  assert.match(src, /setOperatorPermissions\(null\); setOperatorPolicy\(null\); setOperatorId\(null\);/);
});

test('a failed operator-context read leaves everything visible', async () => {
  const src = await read(INDEX);
  const start = src.indexOf('const body = await authFetch(policyUrl());');
  assert.ok(start > 0, 'the console must read the policy section');
  const block = src.slice(start, start + 800);
  assert.match(block, /catch \{[\s\S]*setOperatorPermissions\(null\)/);
  assert.match(block, /setOperatorPolicy\(null\)/);
});

test('the Audit tab sends targetType and targetId, and renders inputs for both', async () => {
  const src = await read(INDEX);
  assert.match(src, /targetType: auditTargetType\.trim\(\) \|\| undefined/);
  assert.match(src, /targetId: auditTarget\.trim\(\) \|\| undefined/);
  assert.match(src, /id="audit-target-type"/);
  assert.match(src, /id="audit-target"/);
  // A filter change returns to page one.
  assert.match(
    src,
    /setAuditPage\(0\);\s*\}, \[auditPrefix, auditAdmin, auditDays, auditTarget, auditTargetType, auditFrom, auditTo\]\);/,
  );
});

test('IP, user agent and request id are columns AND CSV columns', async () => {
  const src = await read(INDEX);
  assert.match(src, /<th scope="col">IP<\/th>/);
  assert.match(src, /<th scope="col">User Agent<\/th>/);
  assert.match(src, /<th scope="col">Request ID<\/th>/);
  assert.match(src, /entry\.ip_address \|\| '-'/);
  assert.match(src, /entry\.user_agent \|\| '-'/);
  assert.match(src, /entry\.request_id \|\| '-'/);
  for (const key of ['ip_address', 'user_agent', 'request_id']) {
    assert.match(src, new RegExp(`\\['${key}', '[^']+'\\]`), `the CSV must export ${key}`);
  }
});

test('the Trail action is bound, paged, and inside the shared Modal', async () => {
  const src = await read(INDEX);
  assert.match(src, /onClick=\{\(\) => openAuditTrail\(entry\)\}/);
  // Both, because the route requires both and answers 400 for either alone.
  assert.match(src, /disabled=\{!entry\.target_id \|\| !entry\.target_type\}/);
  assert.match(src, /auditTrailUrl\(\{/);
  assert.match(src, /\{auditTrailFor && \(\s*<Modal/);
  assert.match(src, /goAuditTrailPage\(auditTrailOffset \+ AUDIT_TRAIL_PAGE_SIZE\)/);
  // The expanded-row colspan follows the column count, or the detail row
  // stops spanning the table.
  assert.match(src, /colSpan=\{8\}/);
});

test('the registry panels are handed the operator context rather than refetching it', async () => {
  const src = await read(INDEX);
  const start = src.indexOf('<RegistryPanel');
  assert.ok(start > 0);
  const clause = src.slice(start, src.indexOf('/>', start));
  for (const prop of ['authFetch', 'showNotification', 'permissions', 'operatorId', 'policy', 'onPolicyChange']) {
    assert.ok(clause.includes(prop), `RegistryPanel must receive ${prop}`);
  }
});

test('the Staff panel gates grant, revoke and the policy behind admin.manage', async () => {
  const src = await read(`${COMPONENT_DIR}StaffPanel.jsx`);
  assert.match(src, /canManageOperators\(permissions\)/);
  assert.match(src, /if \(mayManage\) \{/);
  assert.match(src, /\{!mayManage \?/);
  // The reason is required by the builder, and the button is disabled until
  // it is valid - both, because either alone is a bug waiting to happen.
  assert.match(src, /grantRoleBody\(\{/);
  assert.match(src, /revokeRoleBody\(\{/);
  assert.match(src, /!reasonIsValid\(grantReason\)/);
  assert.match(src, /!reasonIsValid\(revokeReason\)/);
  // The policy change is typed-confirmed and says what it will do in words.
  assert.match(src, /requireTyped="POLICY"/);
  assert.match(src, /Turning Approvals On\./);
  assert.match(src, /Turning Approvals Off\./);
  // The matrix comes from the route.
  assert.match(src, /permissionMatrix\(rolesPayload\)/);
  assert.match(src, /className=\{styles\.legend\}/);
});

test('the Staff panel reads the field names fn_ca_operator_staff actually returns', async () => {
  const src = await read(`${COMPONENT_DIR}StaffPanel.jsx`);
  // user_id, not id: the RPC aggregates profiles as user_id, and reading `id`
  // would compose every Grant Role body with no user in it.
  assert.match(src, /row\.user_id \|\| row\.id/);
  assert.match(src, /grant_history_count \?\? row\?\.grant_count/);
  assert.match(src, /granted_roles/);
  // Bare role-key strings are handled, not assumed to be objects.
  assert.match(src, /typeof entry === 'string'/);
});

test('the Staff panel revokes by grant id, from the grants array', async () => {
  const src = await read(`${COMPONENT_DIR}StaffPanel.jsx`);
  assert.match(src, /function revocableGrants\(row\)/);
  assert.match(src, /revocable\.length > 0 \?/);
  // fn_ca_operator_staff returns `grants` with ids beside the bare
  // `granted_roles` strings, so the Revoke button is real.
  assert.match(src, /Array\.isArray\(row\?\.grants\)/);
  assert.match(src, /entry\?\.id \|\| entry\?\.grant_id/);
  // And the copy that stood in for the missing ids is gone with them: a
  // note explaining why an action is impossible must not outlive the
  // impossibility.
  assert.ok(
    !src.includes('Revoke Needs Grant Ids'),
    'the roster returns grant ids now, so the apology for not having them must go',
  );
});

test('the console normalises the policy rather than reading one spelling', async () => {
  const src = await read(INDEX);
  assert.match(src, /setOperatorPolicy\(normalizePolicy\(body && body\.policy\)\)/);
  const staff = await read(`${COMPONENT_DIR}StaffPanel.jsx`);
  assert.match(staff, /onPolicyChange\(normalizePolicy\(body && body\.policy\)\)/);
});

test('the Approvals history sends its dates to a route that filters by them', async () => {
  const src = await read(`${COMPONENT_DIR}ApprovalsPanel.jsx`);
  // The dates go to the route, on the page fetch AND on the export.
  assert.equal(
    (src.match(/from: (?:filters|history\.filters)\.from \|\| ''/g) || []).length,
    2,
    'both the page fetch and the CSV export must send `from`',
  );
  assert.equal(
    (src.match(/to: (?:filters|history\.filters)\.to \|\| ''/g) || []).length,
    2,
    'both the page fetch and the CSV export must send `to`',
  );
  // The local pass is kept as a belt against an older route, and it now
  // announces itself ONLY when it actually removes something.
  assert.match(src, /const visibleHistory = useMemo/);
  assert.match(src, /rows=\{visibleHistory\}/);
  assert.match(src, /visibleHistory\.length !== history\.rows\.length/);
  // The two standing claims that the route does not filter by date are gone,
  // because it does.
  assert.ok(
    !/Not By Date, So Page Through/.test(src),
    'the "dates apply to this page only" note must go once the route filters',
  );
  assert.ok(
    !/route does not filter by date/i.test(src),
    'the CSV tooltip caveat must go once the route filters',
  );
});

test('the Approvals panel disables a self-raised row and pages its history', async () => {
  const src = await read(`${COMPONENT_DIR}ApprovalsPanel.jsx`);
  assert.match(src, /approvalRowState\(\{ row, operatorId, permissions, policy, now \}\)/);
  assert.match(src, /if \(!state\.canDecide\)/);
  assert.match(src, /decideApprovalBody\(\{/);
  assert.match(src, /<Pager/);
  assert.match(src, /exportAllCsv\(\{/);
  assert.match(src, /history\.setFilter\(/);
  // The note is required for a rejection.
  assert.match(src, /decideFor\.decision === 'reject' && !reasonIsValid\(note\)/);
});

test('every Phase 2 module import in the panels is actually called', async () => {
  for (const file of [`${COMPONENT_DIR}StaffPanel.jsx`, `${COMPONENT_DIR}ApprovalsPanel.jsx`]) {
    const src = await read(file);
    const importRe = /import\s+([^;]*?)\s+from\s+'[^']+';/g;
    for (const match of src.matchAll(importRe)) {
      const clause = match[1];
      const identifiers = [];
      for (const named of clause.matchAll(/\{([\s\S]*?)\}/g)) {
        for (const part of named[1].split(',')) {
          const id = part.trim().split(/\s+as\s+/).pop().trim();
          if (id) identifiers.push(id);
        }
      }
      const fallback = clause.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim();
      for (const id of fallback.split(/\s+/)) if (id) identifiers.push(id);

      for (const id of identifiers) {
        // React itself is the exception: the classic JSX runtime compiles
        // every element to React.createElement, so the binding is used by
        // the compiler even when the source never names it. Every other
        // component in this directory imports it the same way.
        if (id === 'React') continue;
        const word = new RegExp(`\\b${id}\\b`, 'g');
        const total = (src.match(word) || []).length;
        const inClause = (match[0].match(word) || []).length;
        assert.ok(total - inClause > 0, `${file}: ${id} is imported and never used`);
      }
    }
  }
});

test('every React hook imported by the Phase 2 panels is called', async () => {
  for (const file of [`${COMPONENT_DIR}StaffPanel.jsx`, `${COMPONENT_DIR}ApprovalsPanel.jsx`]) {
    const src = await read(file);
    const clause = src.match(/import React, \{([^}]*)\} from 'react';/);
    assert.ok(clause, `${file} should import its hooks from react`);
    for (const raw of clause[1].split(',')) {
      const hook = raw.trim();
      if (!hook) continue;
      assert.match(src, new RegExp(`${hook}\\(`), `${file}: ${hook} is imported but never called`);
    }
  }
});

test('every Phase 2 file obeys the house rules', async () => {
  for (const file of PHASE2_FILES) {
    const src = await read(file);
    assert.ok(!src.includes(EM_DASH), `${file}: no em dashes (U+2014)`);
    assert.ok(!EMOJI.test(src), `${file}: no emoji`);
    assert.ok(!src.includes('.single('), `${file}: no .single()`);
    assert.ok(
      !RAW_HEX.test(stripComments(src)),
      `${file}: no raw hex - use a T token or a CSS class`,
    );
  }
});

test('the two panels reach for tokens and classes, never a literal colour', async () => {
  for (const file of [`${COMPONENT_DIR}StaffPanel.jsx`, `${COMPONENT_DIR}ApprovalsPanel.jsx`]) {
    const body = stripComments(await read(file));
    assert.ok(!/\brgba?\(\s*\d/.test(body), `${file}: no literal rgb()`);
    assert.match(body, /styles\.[a-zA-Z]/, `${file}: should style through the shared module`);
  }
});
