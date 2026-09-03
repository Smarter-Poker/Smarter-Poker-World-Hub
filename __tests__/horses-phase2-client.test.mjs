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

import {
  DEFAULT_TAB, TABS, resolveTabFromQuery, visibleTabs,
} from '../src/components/horses/tabRegistry.js';
import {
  ADMIN_MANAGE,
  canManageOperators,
  hasPermission,
  isKnownPermission,
  operatorIdFromPayload,
  permissionsFromPayload,
  permittedTabs,
  relocationTarget,
} from '../src/components/horses/operatorPermissions.js';
import {
  ALL_PERMISSIONS,
  OPERATOR_ROLE_KEYS,
  permissionsForRole,
} from '../src/lib/horses/permissions.js';
import { KIND_PERMISSION as SERVER_KIND_PERMISSION } from '../src/lib/horses/approvals.js';
import {
  aloneRuleApplies,
  approvalRowState,
  blockedReasonLabel,
  isStaleRowRefusal,
  KIND_PERMISSIONS,
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
  TTL_MAX_MINUTES,
  TTL_MIN_MINUTES,
  approvalsStateLabel,
  approvalsUrl,
  auditTrailUrl,
  decideApprovalBody,
  grantRoleBody,
  listMeta,
  operatorAdminUrl,
  permissionMatrix,
  policyIsKnown,
  policyUrl,
  reasonIsValid,
  revokeRoleBody,
  rowsOf,
  setPolicyBody,
  staffUrl,
  trailActor,
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
  assert.equal(hasPermission(null, 'money.read'), true);
  assert.equal(hasPermission([], 'money.read'), true);
});

test('THE BLOCKER THIS SUITE MISSED: a god sees EVERY tab', () => {
  // Phase 2 turned tabRegistry's dormant `permission` field into a live nav
  // filter while thirteen of the sixteen legacy tabs still declared names
  // that are in no role and in no vocabulary (mint.write, stable.read,
  // clubarena.read, economy.read ...). The result was a `god` - the account
  // that runs this platform - seeing 5 tabs of 18, with the default tab
  // hidden, so the stranding guard relocated and rewrote the URL on every
  // single load. The suite was green throughout, because the one test that
  // exercised the filter invented a permission set that nobody holds.
  //
  // This is that test written against a set somebody actually holds. It is
  // the assertion that must never be "fixed" by narrowing the expectation.
  const all = visibleTabs(TABS);
  const god = permittedTabs(all, permissionsForRole('god'));
  assert.equal(
    god.length,
    all.length,
    `a god must see every tab; missing: ${all.filter((t) => !god.includes(t)).map((t) => t.id).join(', ')}`,
  );
  // And the same for every other role that is defined as the full superset.
  for (const role of ['superadmin', 'admin', 'owner']) {
    assert.equal(
      permittedTabs(all, permissionsForRole(role)).length,
      all.length,
      `${role} holds ALL_PERMISSIONS, so it must see every tab`,
    );
  }
  // The DEFAULT tab in particular, because hiding that one is what made the
  // guard fire on every load.
  assert.ok(god.some((tab) => tab.id === DEFAULT_TAB), 'the default tab must be visible to a god');
});

test('EVERY tab.permission is a real permission, so a typo can never hide a tab', () => {
  for (const tab of TABS) {
    assert.ok(
      isKnownPermission(tab.permission),
      `tab ${tab.id} declares "${tab.permission}", which is not in ALL_PERMISSIONS`,
    );
    assert.ok(
      ALL_PERMISSIONS.includes(tab.permission),
      `tab ${tab.id} declares "${tab.permission}", which is not in ALL_PERMISSIONS`,
    );
  }
});

test('every named role reaches the console, and only settings.write narrows one', () => {
  // A sanity check on the mapping rather than a snapshot of it: a tab
  // declares the permission that lets an operator LOOK, so every role that
  // holds the console floor sees most of the console, and the one tab whose
  // view IS its write (Settings) is the only one a read-only role loses.
  const all = visibleTabs(TABS);
  for (const role of OPERATOR_ROLE_KEYS) {
    const ids = permittedTabs(all, permissionsForRole(role)).map((t) => t.id);
    assert.ok(ids.includes('staff'), `${role} holds console.read, so Staff is visible`);
    assert.ok(ids.includes('approvals'), `${role} holds console.read, so Approvals is visible`);
    assert.ok(ids.includes('audit'), `${role} holds audit.read, so the Audit Log is visible`);
  }
  const readOnly = permittedTabs(all, permissionsForRole('read_only')).map((t) => t.id);
  assert.ok(!readOnly.includes('settings'), 'read_only holds no settings.write');
  assert.ok(readOnly.includes('mint'), 'read_only holds money.read, so it may LOOK at the Mint');
});

test('a populated permission set filters the nav down to what it names', () => {
  const all = visibleTabs(TABS);
  // A real, narrow set: the console floor and nothing else.
  const ids = permittedTabs(all, ['console.read']).map((t) => t.id);
  assert.ok(ids.includes('staff'));
  assert.ok(ids.includes('approvals'));
  assert.ok(ids.includes('merch'));
  // And everything this operator does not hold is gone.
  assert.ok(!ids.includes('stable'), 'stable needs fleet.read');
  assert.ok(!ids.includes('clubarena'), 'clubarena needs clubs.read');
  assert.ok(!ids.includes('audit'), 'audit needs audit.read');
  assert.ok(ids.length < all.length);
});

test('a permission the vocabulary does not define can never hide anything', () => {
  // The other half of the blocker fix. A name no role has ever held is not
  // something a permission list can meaningfully "leave out", so reading its
  // absence as a refusal turns one typo in a registry into an operator
  // lockout. The vocabulary is the enforcement surface; the test above is
  // what keeps the typo visible.
  assert.equal(isKnownPermission('mint.write'), false);
  assert.equal(hasPermission(['console.read'], 'mint.write'), true);
  assert.equal(hasPermission(['console.read'], 'money.write'), false);
  const tabs = [{ id: 'invented', label: 'Invented', permission: 'nothing.real' }];
  assert.equal(permittedTabs(tabs, ['console.read']).length, 1);
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

test('THE GUARD CANNOT FIRE ON A LEGACY OPERATOR', () => {
  // This test used to assert that index.js contained two literal source
  // lines. It passed while the guard it was describing relocated every
  // operator on every load, because a string in a file says nothing about
  // what the code does. The whole decision is `relocationTarget` now, and
  // this exercises it.
  const all = visibleTabs(TABS);
  for (const role of ['god', 'superadmin', 'admin', 'owner']) {
    const permissions = permissionsForRole(role);
    for (const tab of all) {
      assert.equal(
        relocationTarget({ activeTab: tab.id, tabs: all, permissions }),
        null,
        `${role} holds every permission, so nothing may move them off ${tab.id}`,
      );
    }
  }
});

test('A DEEP LINK SURVIVES THE GUARD', () => {
  // /horses?tab=mint used to land on Settings and lose the link: the mint tab
  // asked for a permission nobody held, so the guard relocated and the URL
  // write effect rewrote ?tab= behind it. Both halves are checked here - the
  // URL resolves to the tab it names, and the guard leaves it alone.
  const all = visibleTabs(TABS);
  for (const role of ['god', 'superadmin', 'admin']) {
    const permissions = permissionsForRole(role);
    for (const id of ['mint', 'clubarena', 'economy', 'stable', 'audit', 'approvals']) {
      assert.equal(resolveTabFromQuery(id, TABS), id, `?tab=${id} must resolve to ${id}`);
      assert.equal(
        relocationTarget({ activeTab: id, tabs: all, permissions }),
        null,
        `${role} must stay on ${id}`,
      );
    }
  }
  // A stale bookmark still lands on the default rather than a blank panel.
  assert.equal(resolveTabFromQuery('a-tab-that-was-renamed', TABS), DEFAULT_TAB);
});

test('the guard stays put unless the route has actually answered', () => {
  const all = visibleTabs(TABS);
  // Null and [] are both "nobody has told us yet". Relocating on either is
  // how a slow fetch turns into a lost deep link.
  assert.equal(relocationTarget({ activeTab: 'settings', tabs: all, permissions: null }), null);
  assert.equal(relocationTarget({ activeTab: 'settings', tabs: all, permissions: [] }), null);
  assert.equal(
    relocationTarget({ activeTab: 'settings', tabs: all, permissions: undefined }),
    null,
  );
});

test('the guard stays put when the tab asks for a permission nobody could hold', () => {
  // A registry typo is this repo's bug and must not cost an operator their
  // tab. It is caught by the ALL_PERMISSIONS assertion above, not by moving
  // somebody off the page they are reading.
  const tabs = [
    { id: 'typo', label: 'Typo', permission: 'invented.read' },
    { id: 'staff', label: 'Staff And Roles', permission: 'console.read' },
  ];
  assert.equal(
    relocationTarget({ activeTab: 'typo', tabs, permissions: ['console.read'] }),
    null,
  );
});

test('the guard DOES move an operator off a tab a populated list really refuses', () => {
  // The half that has to keep working: a genuinely narrow role landing on a
  // deep link it cannot open gets the first tab it CAN open, not a blank
  // panel under a nav that highlights nothing.
  const all = visibleTabs(TABS);
  const target = relocationTarget({
    activeTab: 'settings',
    tabs: all,
    permissions: permissionsForRole('read_only'),
  });
  assert.ok(target, 'read_only holds no settings.write, so it must be moved');
  const allowed = permittedTabs(all, permissionsForRole('read_only')).map((t) => t.id);
  assert.ok(allowed.includes(target));
  assert.notEqual(target, 'settings');
  // And once they are somewhere they can be, it stops.
  assert.equal(
    relocationTarget({ activeTab: target, tabs: all, permissions: permissionsForRole('read_only') }),
    null,
  );
});

test('the stranding guard is wired to relocationTarget, not to an inline condition', async () => {
  const src = await read(INDEX);
  assert.match(src, /const target = relocationTarget\(\{/);
  assert.match(src, /if \(target\) setActiveTab\(target\);/);
  // The unconditional version is gone with it.
  assert.ok(
    !src.includes('setActiveTab(navTabs[0].id);'),
    'the guard must not relocate off a bare navTabs miss',
  );
});

test('the operator context is cleared on logout', async () => {
  const src = await read(INDEX);
  assert.match(src, /setOperatorPermissions\(null\); setOperatorPolicy\(null\); setOperatorId\(null\);/);
});

test('a failed operator-context read leaves everything visible', async () => {
  const src = await read(INDEX);
  const start = src.indexOf('const body = await authFetch(policyUrl());');
  assert.ok(start > 0, 'the console must read the policy section');
  const block = src.slice(start, start + 1600);
  assert.match(block, /catch \{[\s\S]*setOperatorPermissions\(null\)/);
  assert.match(block, /setOperatorPolicy\(null\)/);
  // The two Phase 2 additions clear the same way, for the same reason: an
  // alone-rule left over from the last successful read would let the Mint's
  // confirm dialog claim a self-approval this console can no longer verify.
  assert.match(block, /setOperatorAloneRule\(null\)/);
  assert.match(block, /setOperatorDegraded\(false\)/);
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

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOUR - the findings this review pass fixed
// ═══════════════════════════════════════════════════════════════════════════

test('the kind/permission table is IDENTICAL to the server\'s, for all six kinds', () => {
  // The client said sanction -> `sanction.write`, which is in neither the
  // server table nor the vocabulary, so the local check refused every
  // sanction row - including for a god - and explained the refusal in terms
  // of a permission that has never existed.
  const kinds = Object.keys(SERVER_KIND_PERMISSION);
  assert.ok(kinds.length >= 6);
  for (const kind of kinds) {
    assert.equal(
      KIND_PERMISSIONS[kind],
      SERVER_KIND_PERMISSION[kind],
      `${kind}: the client and the server must ask for the same permission`,
    );
    assert.equal(permissionForKind(kind), SERVER_KIND_PERMISSION[kind]);
    assert.ok(
      isKnownPermission(SERVER_KIND_PERMISSION[kind]),
      `${kind} maps to ${SERVER_KIND_PERMISSION[kind]}, which must be a real permission`,
    );
  }
  assert.equal(permissionForKind('sanction'), 'moderation.write');

  // A god could not decide a sanction row at all before this, because the
  // local check asked for a permission no role has ever held.
  const asGod = approvalRowState({
    row: pendingRow({ kind: 'sanction' }),
    operatorId: ME,
    permissions: permissionsForRole('god'),
    now: NOW,
  });
  assert.equal(asGod.canDecide, true);

  // And an account that genuinely lacks it is refused in terms of the
  // permission that actually gates the decision.
  const asSupport = approvalRowState({
    row: pendingRow({ kind: 'sanction' }),
    operatorId: ME,
    permissions: permissionsForRole('support'),
    now: NOW,
  });
  assert.equal(asSupport.canDecide, false);
  assert.equal(asSupport.reason, 'permission');
  assert.match(asSupport.note, /moderation\.write/);
  assert.ok(!/sanction\.write/.test(asSupport.note));
});

test('UNDER THE ALONE-RULE THE DIALOG SAYS THE MONEY MOVES', () => {
  // With approvals on, a threshold breach and one eligible approver,
  // requireApproval answers `required: false` and the money moves the moment
  // Confirm is pressed - while the dialog said "Nothing Moves Until A Second
  // Operator Approves It" over a button reading "Yes, Send For Approval".
  const policy = normalizePolicy({ approvals_enabled: true, mint_threshold: 1000 });
  const alone = { permission: 'money.write', eligibleApprovers: 0, applies: true };

  const d = thresholdDecision({ policy, kind: 'mint', amount: 5000, asset: 'chips', aloneRule: alone });
  assert.equal(d.gated, true, 'the threshold is still breached');
  assert.equal(d.aloneRuleApplies, true);
  assert.equal(d.willRequest, false, 'nothing is waiting for anybody');
  assert.match(d.headline, /Execute/);
  assert.ok(!/Nothing Moves/.test(d.detail));
  assert.match(d.detail, /Self Approved|Only Eligible Approver/);

  // With a second approver in the roster it goes back to waiting.
  const shared = thresholdDecision({
    policy, kind: 'mint', amount: 5000, asset: 'chips',
    aloneRule: { permission: 'money.write', eligibleApprovers: 1, applies: false },
  });
  assert.equal(shared.willRequest, true);
  assert.match(shared.headline, /Sent For Approval/);
  assert.match(shared.detail, /Nothing Moves/);
});

test('an unreadable roster is never reported as "you are alone"', () => {
  const policy = normalizePolicy({ approvals_enabled: true, mint_threshold: 0 });
  // The route sets applies:false when it could not count, and a missing
  // aloneRule is the same unknown. Both must keep saying "sent for approval",
  // which is the answer that does NOT promise an execution.
  for (const aloneRule of [null, undefined, {}, { eligibleApprovers: null, applies: false }]) {
    const d = thresholdDecision({ policy, kind: 'mint', amount: 10, aloneRule });
    assert.equal(d.willRequest, true, 'an unknown must not be read as alone');
    assert.equal(d.aloneRuleApplies, false);
  }
});

test('with approvals off the alone-rule changes nothing', () => {
  const policy = normalizePolicy({ approvals_enabled: false, mint_threshold: 0 });
  const d = thresholdDecision({
    policy, kind: 'mint', amount: 10,
    aloneRule: { eligibleApprovers: 0, applies: true },
  });
  assert.equal(d.gated, false);
  assert.equal(d.aloneRuleApplies, false);
  assert.equal(d.willRequest, false);
  assert.match(d.headline, /Execute Immediately/);
});

test('THE TRAIL NAMES WHO DID IT, from the fields the RPC actually returns', () => {
  // fn_ca_operator_audit_trail selects admin_user_id and actor_role; only the
  // stable-admin audit_log route synthesises admin_name / admin_role. Reading
  // just that pair attributed every entry to "System / Cron" with no role, on
  // the one dialog whose whole purpose is who did what to this record.
  const rpcRow = {
    admin_user_id: '11111111-2222-3333-4444-555555555555',
    actor_role: 'god',
    action: 'operator.role.grant',
  };
  const actor = trailActor(rpcRow);
  assert.equal(actor.label, '11111111-2222-3333-4444-555555555555');
  assert.equal(actor.role, 'god');
  assert.equal(actor.isId, true);
  assert.ok(actor.label !== 'System / Cron');

  // The enriched shape still wins where a route sends it.
  assert.deepEqual(
    trailActor({ admin_name: 'Dan', admin_role: 'god' }),
    { label: 'Dan', role: 'god', isId: false },
  );
  // A genuinely actorless row - a cron writes those - still says so.
  assert.equal(trailActor({ action: 'cron.sweep' }).label, 'System / Cron');
  assert.equal(trailActor(null).label, 'Not Recorded');
});

test('A FAILED POLICY READ IS NEVER RENDERED AS "OFF"', () => {
  assert.equal(approvalsStateLabel(null), 'Not Known');
  assert.equal(approvalsStateLabel(undefined), 'Not Known');
  assert.equal(approvalsStateLabel(normalizePolicy({ approvals_enabled: false })), 'Off');
  assert.equal(approvalsStateLabel(normalizePolicy({ approvalsEnabled: true })), 'On');
  assert.equal(policyIsKnown(null), false);
  assert.equal(policyIsKnown(normalizePolicy({})), true);
});

test('SAVE POLICY OVER AN UNREAD POLICY WOULD ZERO THE LIVE ROW, so it is refused', () => {
  // The failure this guards: with the bootstrap read failed the panel seeded
  // its form from DEFAULT_POLICY and presented it AS the current policy, and
  // setPolicyBody sent every field, so one Save turned approvals off and
  // zeroed all three thresholds and the TTL - the exact control Phase 2 adds.
  // The builder is a patch when there is something to diff against...
  const saved = normalizePolicy({
    approvals_enabled: true,
    allow_self_approve_when_alone: true,
    mint_threshold: 10000,
    fund_threshold: 5000,
    cashout_threshold: 2500,
    approval_ttl_minutes: 120,
  });
  const draft = { ...saved, mint_threshold: 25000 };
  const patch = setPolicyBody(draft, saved);
  assert.deepEqual(patch, { action: 'set_policy', mintThreshold: 25000 });
  assert.ok(!('approvalsEnabled' in patch), 'an untouched switch is not resent');
  assert.ok(!('cashoutThreshold' in patch), 'an untouched threshold is not resent');

  // ...and null when nothing changed, so the console says so rather than
  // sending a body the route answers 400 to.
  assert.equal(setPolicyBody({ ...saved }, saved), null);

  // Turning approvals off is a change like any other, and travels alone.
  assert.deepEqual(
    setPolicyBody({ ...saved, approvals_enabled: false }, saved),
    { action: 'set_policy', approvalsEnabled: false },
  );
});

test('the TTL bounds the console offers are the bounds the route enforces', () => {
  assert.equal(TTL_MIN_MINUTES, 5);
  assert.equal(TTL_MAX_MINUTES, 43200);
});

test('the staff list reads total and truncated, so a capped roster says so', () => {
  const capped = listMeta({ rows: [], total: 412, truncated: true, hasMore: true }, 200);
  assert.equal(capped.total, 412);
  assert.equal(capped.truncated, true);
  assert.equal(capped.hasMore, true);
  // truncated is inferred where the route only sent a total.
  assert.equal(listMeta({ total: 412 }, 200).truncated, true);
  assert.equal(listMeta({ total: 3 }, 3).truncated, false);
  // A missing total stays null. A fabricated one is the Phase 1 addendum
  // item 15 bug.
  assert.equal(listMeta({ rows: [] }, 0).total, null);
  assert.equal(listMeta(null, 0).total, null);
});

test('a blocked_reason enum never reaches an operator raw', () => {
  assert.equal(blockedReasonLabel('no_second_approver'), 'No Second Approver');
  assert.equal(blockedReasonLabel('self_approval'), 'Raised By The Same Operator');
  assert.equal(blockedReasonLabel(null), '-');
  assert.equal(blockedReasonLabel(''), '-');
  // An enum this console has not met is still shown - hiding it loses the
  // only thing the row has to say - but not with underscores in it.
  assert.equal(blockedReasonLabel('some_new_reason'), 'Some New Reason');
});

test('a refusal that means "your queue is stale" is recognised as one', () => {
  assert.equal(isStaleRowRefusal({ code: 'already_decided' }), true);
  assert.equal(isStaleRowRefusal({ code: 'expired' }), true);
  assert.equal(isStaleRowRefusal({ status: 409 }), true);
  assert.equal(isStaleRowRefusal({ code: 'no_permission', status: 403 }), false);
  assert.equal(isStaleRowRefusal(null), false);
  // The message is deliberately not parsed: copy changes.
  assert.equal(isStaleRowRefusal(new Error('That Approval Has Already Been Decided')), false);
});

test('the approvals CSV declares no column the route cannot fill', async () => {
  const src = await read(`${COMPONENT_DIR}ApprovalsPanel.jsx`);
  // section=approvals selects APPROVAL_FIELDS, which carries neither payload
  // nor result, so both columns exported blank on every row - and a blank
  // Payload cell reads as "this request carried none".
  assert.ok(!/\['payload', 'Payload'\]/.test(src), 'no Payload column');
  assert.ok(!/\['result', 'Result'\]/.test(src), 'no Result column');
  assert.ok(!/jsonColumns/.test(src), 'and no jsonColumns registration for them');
});

test('the history belt parses its dates in UTC, like the route', async () => {
  const src = await read(`${COMPONENT_DIR}ApprovalsPanel.jsx`);
  assert.match(src, /T00:00:00Z/);
  assert.match(src, /T23:59:59\.999Z/);
  assert.ok(
    !/T00:00:00`/.test(src) && !/T23:59:59\.999`/.test(src),
    'a local-time bound disagrees with the route by the offset',
  );
  // And the surviving note no longer claims the route ignores the dates.
  assert.ok(!/Are Not Narrowed By Date/.test(src));
});

test('the history pager counts the rows the table actually renders', async () => {
  const src = await read(`${COMPONENT_DIR}ApprovalsPanel.jsx`);
  assert.match(src, /count=\{visibleHistory\.length\}/);
  assert.ok(
    !/count=\{history\.rows\.length\}/.test(src),
    'counting rows the belt removed labels 43 visible rows "Showing 1-50"',
  );
});

test('a decision refused as stale reloads the queue instead of leaving the row', async () => {
  const src = await read(`${COMPONENT_DIR}ApprovalsPanel.jsx`);
  assert.match(src, /isStaleRowRefusal\(err\)/);
  const start = src.indexOf('isStaleRowRefusal(err)');
  const branch = src.slice(start, start + 300);
  assert.match(branch, /setDecideFor\(null\)/, 'the open modal closes');
  assert.match(branch, /loadPending\(\)/, 'the queue is re-read');
});

test('the three unguarded fetches now carry a sequence guard', async () => {
  const index = await read(INDEX);
  assert.match(index, /auditTrailSeqRef\.current \+= 1;/);
  assert.match(index, /if \(seq !== auditTrailSeqRef\.current\) return;/);
  const staff = await read(`${COMPONENT_DIR}StaffPanel.jsx`);
  assert.match(staff, /loadSeqRef\.current \+= 1;/);
  assert.match(staff, /if \(seq !== loadSeqRef\.current\) return;/);
  const approvals = await read(`${COMPONENT_DIR}ApprovalsPanel.jsx`);
  assert.match(approvals, /pendingSeqRef\.current \+= 1;/);
  assert.match(approvals, /if \(seq !== pendingSeqRef\.current\) return;/);
});

test('the Staff panel refuses to save a policy it has not read', async () => {
  const src = await read(`${COMPONENT_DIR}StaffPanel.jsx`);
  assert.match(src, /const policyKnown = policyIsKnown\(policy\);/);
  assert.match(src, /if \(!policyKnown\) \{/);
  // The form is replaced by an honest third state, not seeded with defaults.
  assert.match(src, /The Approval Policy Could Not Be Read/);
  // The prop is normalised on the way in, so a raw camelCase row cannot read
  // as approvals-off.
  assert.match(src, /normalizePolicy\(policy\)/);
  // And the body is composed as a patch against the loaded policy.
  assert.match(src, /setPolicyBody\(policyDraft, policy\)/);
});

test('the Staff panel surfaces a degraded permission list and a capped roster', async () => {
  const src = await read(`${COMPONENT_DIR}StaffPanel.jsx`);
  assert.match(src, /permissionsDegraded/);
  assert.match(src, /staffMeta && staffMeta\.truncated/);
  const index = await read(INDEX);
  assert.match(index, /permissionsDegraded=\{operatorDegraded\}/);
  assert.match(index, /operator\.degraded === true/);
});

test('the Mint dialog is handed the route\'s aloneRule', async () => {
  const src = await read(INDEX);
  assert.match(src, /setOperatorAloneRule\(body && body\.aloneRule \? body\.aloneRule : null\)/);
  assert.match(src, /aloneRule: operatorAloneRule/);
  // And the 202 jump is only offered when that tab is in this nav.
  assert.match(src, /navTabs\.some\(\(tab\) => tab\.id === 'approvals'\)/);
});

test('the Trail dialog renders through trailActor', async () => {
  const src = await read(INDEX);
  assert.match(src, /trailActor\(row\)\.label/);
  assert.match(src, /trailActor\(row\)\.role/);
});

test('a write in flight hides the Close control rather than deadening it', async () => {
  for (const file of [`${COMPONENT_DIR}StaffPanel.jsx`, `${COMPONENT_DIR}ApprovalsPanel.jsx`]) {
    const src = await read(file);
    const opens = (src.match(/onClose=\{busy \? undefined :/g) || []).length;
    const hidden = (src.match(/hideClose=\{busy\}/g) || []).length;
    assert.equal(hidden, opens, `${file}: every busy-disabled Close must also be hidden`);
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
