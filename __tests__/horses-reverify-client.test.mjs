/**
 * /horses console - re-verification pass, client side (index.js and the pure
 * helpers under src/components/horses that it grew for it).
 *
 * Each block names the finding it closes from
 * docs/horses/reverify-2026-09-03/client.md. The split is the same as the
 * Phase 1 and Phase 2 suites: every decision that could be made pure WAS,
 * and is exercised here as behaviour; what is left in index.js is JSX wiring
 * and is pinned by source contract, with the regex written to match the one
 * line that proves the wiring rather than a declaration that may be dead.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  isPendingApproval,
  thresholdDecision,
} from '../src/components/horses/approvalModel.js';
import {
  isOperatorDenial,
  operatorContextChange,
  operatorRoleFromPayload,
} from '../src/components/horses/operatorPermissions.js';
import {
  nextUrlQuery,
  urlMatchesState,
  urlNeedsNormalising,
} from '../src/components/horses/urlState.js';
import * as tabRegistry from '../src/components/horses/tabRegistry.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const INDEX = 'pages/horses/index.js';

/** Source with block and line comments removed, for "no X remains" checks. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The body of one function in index.js, by the line that opens it. */
function block(src, opener, length = 3000) {
  const start = src.indexOf(opener);
  assert.ok(start > 0, `${opener} must exist`);
  return src.slice(start, start + length);
}

// ═══════════════════════════════════════════════════════════════════════════
// B-1  force-approving a cashout on a 202 moves nothing, and the console
//      has to say so
// ═══════════════════════════════════════════════════════════════════════════

const CASHOUT_POLICY = {
  approvals_enabled: true,
  allow_self_approve_when_alone: true,
  mint_threshold: 10_000,
  fund_threshold: 10_000,
  cashout_threshold: 500,
  approval_ttl_minutes: 60,
};

test('B-1: the cashout confirm reads the cashout threshold, not the mint one', () => {
  const over = thresholdDecision({
    policy: CASHOUT_POLICY, kind: 'cashout', amount: 600, asset: 'chips', aloneRule: null,
  });
  assert.equal(over.threshold, 500);
  assert.equal(over.willRequest, true);
  assert.equal(over.headline, 'This Will Be Sent For Approval');

  const under = thresholdDecision({
    policy: CASHOUT_POLICY, kind: 'cashout', amount: 499.99, asset: 'chips', aloneRule: null,
  });
  assert.equal(under.willRequest, false);
  assert.equal(under.headline, 'This Will Execute Immediately');

  // At the threshold is over it: the DB default is 0 and "everything" has to
  // mean everything.
  const at = thresholdDecision({ policy: CASHOUT_POLICY, kind: 'cashout', amount: 500 });
  assert.equal(at.willRequest, true);
});

test('B-1: with approvals off, or the operator alone, the cashout executes on Confirm', () => {
  const off = thresholdDecision({
    policy: { ...CASHOUT_POLICY, approvals_enabled: false }, kind: 'cashout', amount: 5000,
  });
  assert.equal(off.willRequest, false);

  const alone = thresholdDecision({
    policy: CASHOUT_POLICY,
    kind: 'cashout',
    amount: 5000,
    asset: 'chips',
    aloneRule: { permission: 'cashier.write', eligibleApprovers: 0, applies: true },
  });
  assert.equal(alone.willRequest, false);
  assert.equal(alone.aloneRuleApplies, true);
  assert.match(alone.headline, /Self Approved/);
});

test('B-1: the 202 body approve-cashout sends is a pending approval; its 200 is not', () => {
  // approve-cashout.js: approvalPendingResponse(res, approval, { message })
  const pending = {
    success: true,
    pending: true,
    approvalId: '9e0d3c3a-0000-4000-8000-000000000001',
    message: 'Sent For Approval. Another Operator Must Approve This Cashout Before Any Chips Move',
  };
  assert.equal(isPendingApproval(pending), true);

  // approve-cashout.js: the paid branch
  const paid = {
    success: true,
    action: 'approved',
    amount: 600,
    playerId: 'p1',
    approvalId: null,
    approvalStatus: 'executed',
    trailClosed: true,
  };
  assert.equal(isPendingApproval(paid), false);
  // And a 200 that happens to carry an approvalId (the alone rule executed
  // it) is still an execution.
  assert.equal(isPendingApproval({ ...paid, approvalId: 'abc' }), false);
});

test('B-1: submitCashout reads the body, keeps a pending row, and reports an unclosed trail', async () => {
  const src = await read(INDEX);
  const submit = block(src, 'const submitCashout = useCallback(async () => {');
  assert.match(submit, /const body = await authFetch\('\/api\/club-arena\/approve-cashout'/);
  assert.match(submit, /if \(isPendingApproval\(body\)\) \{/);
  // The pending branch tags the row and RETURNS before the filter that
  // removes it.
  const pendingAt = submit.indexOf('if (isPendingApproval(body)) {');
  const removeAt = submit.indexOf('prev.filter((c) => c.id !== cashout.id)');
  assert.ok(pendingAt > 0 && removeAt > pendingAt, 'the 202 branch runs before the row is removed');
  assert.match(submit, /markCashoutPendingApproval\(cashout\.id, body\.approvalId\)/);
  assert.match(submit, /body\.message \|\| 'Sent For Approval\. No Chips Have Moved\.'/);
  assert.match(submit, /body\.trailClosed === false/);
  assert.match(
    submit,
    /The Cashout Went Through But The Approval Row Could Not Be Closed\. Check The Audit Trail\./,
  );
});

test('B-1: a tagged cashout row renders a Waiting For Approval pill instead of its buttons', async () => {
  const src = await read(INDEX);
  const tagged = block(src, 'const markCashoutPendingApproval = useCallback(', 500);
  assert.match(tagged, /pendingApprovalId: approvalId/);
  const pills = src.match(/c\.pendingApprovalId \? \(/g) || [];
  assert.equal(pills.length, 2, 'both cashout tables (club detail and platform finance) branch on the tag');
  assert.equal((src.match(/label="Waiting For Approval"/g) || []).length, 2);
});

test('B-1: the cashout confirmation is the shared dialog carrying thresholdDecision for kind cashout', async () => {
  const src = await read(INDEX);
  const open = block(src, 'const resolveCashout = useCallback((cashout, action) => {', 700);
  assert.match(open, /thresholdDecision\(\{[\s\S]*kind: 'cashout'[\s\S]*asset: 'chips'[\s\S]*aloneRule: operatorAloneRule/);
  assert.match(src, /\{cashoutConfirm && \(\s*<ConfirmDialog/);
  assert.match(src, /onConfirm=\{submitCashout\}/);
  assert.match(src, /\{cashoutConfirm\.decision\.headline\}/);
  assert.ok(!codeOnly(src).includes('window.confirm('), 'no window.confirm remains in index.js');
});

// ═══════════════════════════════════════════════════════════════════════════
// H-3  a policy save refreshes the alone rule and the permissions too
// ═══════════════════════════════════════════════════════════════════════════

test('H-3: operatorContextChange reads the full save payload', () => {
  const change = operatorContextChange({
    policy: { approvals_enabled: true, mint_threshold: 0 },
    aloneRule: { permission: 'money.write', eligibleApprovers: 0, applies: true },
    permissions: ['console.read', 'money.write'],
  });
  assert.deepEqual(change.policy, { approvals_enabled: true, mint_threshold: 0 });
  assert.deepEqual(change.aloneRule, { permission: 'money.write', eligibleApprovers: 0, applies: true });
  assert.deepEqual(change.permissions, ['console.read', 'money.write']);
});

test('H-3: a full payload with no alone rule clears it; a null or empty permission list is not applied', () => {
  const change = operatorContextChange({ policy: { approvals_enabled: false }, aloneRule: null, permissions: null });
  assert.equal(change.aloneRule, null, 'null means "the route said nobody is alone", and is applied');
  assert.equal(change.permissions, undefined, 'null permissions are the show-everything fallback, never applied by a save');
  const empty = operatorContextChange({ policy: { approvals_enabled: false }, permissions: [] });
  assert.equal(empty.permissions, undefined);
  assert.equal(empty.aloneRule, null);
});

test('H-3: a bare policy object is still accepted and changes only the policy', () => {
  for (const bare of [
    { approvals_enabled: true, mint_threshold: 5 },
    { approvalsEnabled: true, mintThreshold: 5 },
  ]) {
    const change = operatorContextChange(bare);
    assert.equal(change.policy, bare);
    assert.equal(change.aloneRule, undefined, 'undefined means "leave the alone rule as it is"');
    assert.equal(change.permissions, undefined);
  }
  assert.deepEqual(operatorContextChange(null), { policy: null, aloneRule: undefined, permissions: undefined });
});

test('H-3: index.js applies all three from handlePolicyChange', async () => {
  const src = await read(INDEX);
  assert.match(src, /onPolicyChange=\{handlePolicyChange\}/);
  const handler = block(src, 'const handlePolicyChange = useCallback((payload) => {', 500);
  assert.match(handler, /const change = operatorContextChange\(payload\);/);
  assert.match(handler, /setOperatorPolicy\(normalizePolicy\(change\.policy\)\)/);
  assert.match(handler, /if \(change\.aloneRule !== undefined\) setOperatorAloneRule\(change\.aloneRule\)/);
  assert.match(handler, /if \(change\.permissions !== undefined\) setOperatorPermissions\(change\.permissions\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// M-1  the route decides who is an operator
// ═══════════════════════════════════════════════════════════════════════════

test('M-1: only a 401 or 403 is a denial; a 503 or a network failure is "could not verify"', () => {
  const err = (status, code) => Object.assign(new Error('x'), { status, code });
  assert.equal(isOperatorDenial(err(401, 'unauthorized')), true);
  assert.equal(isOperatorDenial(err(403, 'forbidden')), true);
  assert.equal(isOperatorDenial(err(403, 'permission_denied')), true);
  assert.equal(isOperatorDenial(err(undefined, 'forbidden')), true);
  assert.equal(isOperatorDenial(err(503, 'role_lookup_failed')), false);
  assert.equal(isOperatorDenial(err(503, 'service_role_missing')), false);
  assert.equal(isOperatorDenial(err(500, 'route_misconfigured')), false);
  assert.equal(isOperatorDenial(new Error('Failed to fetch')), false);
  assert.equal(isOperatorDenial(null), false);
});

test('M-1: the header role comes from the operator envelope, and a grantee reads as their grant', () => {
  assert.equal(operatorRoleFromPayload({ operator: { role: 'god', roles: ['god'], grantedRoles: [] } }), 'god');
  assert.equal(
    operatorRoleFromPayload({ operator: { role: 'user', roles: ['user', 'finance'], grantedRoles: ['finance'] } }),
    'finance',
  );
  assert.equal(operatorRoleFromPayload({ operator: { role: null, roles: ['support'], grantedRoles: [] } }), 'support');
  assert.equal(operatorRoleFromPayload({ operator: {} }), null);
  assert.equal(operatorRoleFromPayload({}), null);
  assert.equal(operatorRoleFromPayload(null), null);
});

test('M-1: index.js keeps no role list and asks section=policy on both sign-in paths', async () => {
  const src = await read(INDEX);
  const code = codeOnly(src);
  assert.ok(!code.includes('ADMIN_ROLES'), 'ADMIN_ROLES is gone from index.js');
  assert.ok(!code.includes(".from('profiles')"), 'the browser no longer reads profiles.role to decide access');
  const reader = block(src, 'const readOperatorContext = useCallback(async (authUser) => {', 600);
  assert.match(reader, /const body = await authFetch\(policyUrl\(\)\);/);
  assert.match(reader, /applyOperatorContext\(body, authUser\.id\)/);
  const check = block(src, 'const checkAuth = useCallback(async () => {', 900);
  assert.match(check, /const answer = await readOperatorContext\(authUser\);/);
  assert.match(check, /setRole\(operatorRoleFromPayload\(answer\.body\)\)/);
  const login = block(src, 'const handleLogin = async (e) => {', 1200);
  assert.match(login, /const answer = await readOperatorContext\(data\.user\);/);
  assert.match(login, /if \(answer\.denied\) \{[\s\S]*await supabase\.auth\.signOut\(\);[\s\S]*setLoginError\(ACCESS_DENIED_MESSAGE\)/);
  assert.match(src, /const ACCESS_DENIED_MESSAGE = 'Access Denied\. Operator Privileges Are Required\.';/);
  // One read per sign-in: the old bootstrap effect keyed on `user` is gone,
  // so the context is not fetched twice.
  assert.equal((code.match(/authFetch\(policyUrl\(\)\)/g) || []).length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// M-2  the audit target inputs are debounced
// ═══════════════════════════════════════════════════════════════════════════

test('M-2: the audit target type and id inputs debounce 300 ms into the query', async () => {
  const src = await read(INDEX);
  assert.match(src, /value=\{auditTargetTypeInput\}/);
  assert.match(src, /onChange=\{\(e\) => setAuditTargetTypeInput\(e\.target\.value\)\}/);
  assert.match(src, /value=\{auditTargetInput\}/);
  assert.match(src, /onChange=\{\(e\) => setAuditTargetInput\(e\.target\.value\)\}/);
  assert.match(src, /setTimeout\(\(\) => setAuditTarget\(auditTargetInput\), 300\)/);
  assert.match(src, /setTimeout\(\(\) => setAuditTargetType\(auditTargetTypeInput\), 300\)/);
  // The query still reads the debounced values, never the input ones.
  assert.match(src, /targetId: auditTarget\.trim\(\) \|\| undefined/);
  assert.match(src, /targetType: auditTargetType\.trim\(\) \|\| undefined/);
});

// ═══════════════════════════════════════════════════════════════════════════
// M-3  sequence guards on the grinder roster and the Mint ledger
// ═══════════════════════════════════════════════════════════════════════════

test('M-3: the mint ledger drops a superseded response, and the grinder loader it named is gone', async () => {
  const src = await read(INDEX);
  // Phase 3 replaced the grinder tab with Fleet Command, whose roster is paged
  // by usePagedList (its own monotonic sequence plus an AbortController), so
  // the loader this finding hardened no longer exists to harden. Both halves
  // are asserted: the loader is gone AND nothing left behind refers to it.
  assert.ok(!src.includes('const loadGrinderData ='), 'the grinder loader belongs to Fleet Command now');
  assert.ok(!src.includes('grinderSeqRef'), 'and its sequence guard went with it');

  const ledger = block(src, 'const loadMintLedger = useCallback(async (asset = ', 1000);
  assert.match(ledger, /const seq = \+\+mintLedgerSeqRef\.current;/);
  assert.match(ledger, /setMintLedgerLoading\(true\);/);
  assert.match(ledger, /if \(seq !== mintLedgerSeqRef\.current\) return;/);
  assert.match(ledger, /if \(seq === mintLedgerSeqRef\.current\) setMintLedgerLoading\(false\);/);
  // And the ledger pager is disabled while ITS page loads, not only while the
  // whole panel does.
  assert.match(src, /loading=\{mintLoading \|\| mintLedgerLoading\}/);
});

// ═══════════════════════════════════════════════════════════════════════════
// M-5  a code-split panel whose chunk fails says so
// ═══════════════════════════════════════════════════════════════════════════

test('M-5: the dynamic loading component renders the error and a Try Again that calls retry', async () => {
  const src = await read(INDEX);
  const panel = block(src, 'function panelComponentFor(tab) {', 1600);
  assert.match(panel, /loading: \(\{ error, retry \}\) => \(error/);
  assert.match(panel, /\{tab\.label\} Could Not Be Loaded/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /onClick=\{retry\}/);
  assert.match(panel, /Try Again/);
  assert.match(panel, /Loading \{tab\.label\}/);
});

// ═══════════════════════════════════════════════════════════════════════════
// L-1  an unknown ?tab= is normalised
// ═══════════════════════════════════════════════════════════════════════════

test('L-1: urlNeedsNormalising is true for a bare URL and for an unknown tab that resolved to the view', () => {
  const stable = { activeTab: 'stable', caSection: 'overview' };
  assert.equal(urlMatchesState(stable, { tab: 'bogus' }), true, 'the resolver maps bogus to the default');
  assert.equal(urlNeedsNormalising(stable, { tab: 'bogus' }), true, 'so the bar must be rewritten');
  assert.equal(urlNeedsNormalising(stable, {}), true, 'a bare /horses gets ?tab= stamped in');
  assert.equal(urlNeedsNormalising(stable, { tab: 'stable' }), false, 'a correct URL is left alone');
  assert.equal(urlNeedsNormalising(stable, { tab: ['stable', 'mint'] }), false);
  assert.equal(urlNeedsNormalising(stable, null), true);
});

test('L-1: urlNeedsNormalising is false whenever the URL is a navigation, and converges after one replace', () => {
  const mint = { activeTab: 'mint', caSection: 'overview' };
  assert.equal(urlNeedsNormalising(mint, { tab: 'bogus' }), false, 'a disagreement is the push branch, not a cleanup');
  assert.equal(urlNeedsNormalising(mint, { tab: 'stable' }), false);
  // After the replace the query is what nextUrlQuery wrote, and the answer is
  // false, so the write effect cannot loop.
  const stable = { activeTab: 'stable', caSection: 'overview' };
  const written = nextUrlQuery(stable, { tab: 'bogus' });
  assert.deepEqual(written, { tab: 'stable' });
  assert.equal(urlNeedsNormalising(stable, written), false);
});

test('L-1: sections normalise the same way', () => {
  const ledger = { activeTab: 'clubarena', caSection: 'ledger' };
  assert.equal(urlNeedsNormalising(ledger, { tab: 'clubarena', section: 'ledger' }), false);
  const overview = { activeTab: 'clubarena', caSection: 'overview' };
  assert.equal(urlNeedsNormalising(overview, { tab: 'clubarena', section: 'bogus' }), true);
  assert.equal(urlNeedsNormalising(overview, { tab: 'clubarena' }), false);
  assert.equal(urlNeedsNormalising(overview, { tab: 'clubarena', section: 'overview' }), true, 'the default section is not spelled out');
});

test('L-1: the write effect asks urlNeedsNormalising in its agreement branch', async () => {
  const src = await read(INDEX);
  assert.match(src, /if \(urlNeedsNormalising\(\{ activeTab, caSection \}, router\.query\)\) \{\s*const query = nextUrlQuery/);
  // Still a replace, never a push: normalising must not cost a Back press.
  const branch = block(src, 'if (urlNeedsNormalising({ activeTab, caSection }, router.query)) {', 300);
  assert.match(branch, /router\.replace\(/);
  assert.doesNotMatch(branch, /router\.push\(/);
});

// ═══════════════════════════════════════════════════════════════════════════
// L-3  chips take two decimals, and are shown with two
// ═══════════════════════════════════════════════════════════════════════════

test('L-3: the compose guard refuses a third decimal on chips and the pattern is the one money2dp applies', async () => {
  const src = await read(INDEX);
  const literal = src.match(/const CHIP_AMOUNT_PATTERN = (\/[^\n]+\/);/);
  assert.ok(literal, 'CHIP_AMOUNT_PATTERN is declared');
  const pattern = new RegExp(literal[1].slice(1, -1));
  assert.equal(pattern.test('100'), true);
  assert.equal(pattern.test('100.1'), true);
  assert.equal(pattern.test('100.10'), true);
  assert.equal(pattern.test('100.005'), false);
  assert.equal(pattern.test('1e3'), false);
  assert.equal(pattern.test('.5'), false);
  assert.match(
    src,
    /if \(mintAsset === 'chips' && !CHIP_AMOUNT_PATTERN\.test\(String\(mintAmount\)\.trim\(\)\)\) \{\s*showNotification\('Chips Take At Most Two Decimals\.', 'error'\)/,
  );
});

test('L-3: chip amounts render with two decimals in the confirm sentence, the toast and the receipts', async () => {
  const src = await read(INDEX);
  const fmt = block(src, 'function formatAmount(value, asset) {', 400);
  assert.match(fmt, /minimumFractionDigits: 2, maximumFractionDigits: 2/);
  assert.match(src, /formatAmount\(mintConfirm\.amount, mintConfirm\.asset\)\} \{assetLabel\(mintConfirm\.asset\)\}/);
  assert.equal((src.match(/formatAmount\(mintReceipt\.amount, mintReceipt\.asset\)/g) || []).length, 2);
  assert.match(src, /Yes, \$\{mintConfirm\.action === 'mint' \? 'Issue' : 'Retire'\} \$\{formatAmount\(mintConfirm\.amount, mintConfirm\.asset\)\}/);
});

// ═══════════════════════════════════════════════════════════════════════════
// L-7 / L-8  the registry
// ═══════════════════════════════════════════════════════════════════════════

test('L-7: the Club Arena section keeps its key and is no longer a second "Approvals"', () => {
  const section = tabRegistry.CA_SECTIONS.find(([id]) => id === 'approvals');
  assert.ok(section, 'the key survives so ?section=approvals bookmarks still work');
  assert.equal(section[1], 'Union Applications');
  assert.equal(tabRegistry.resolveSectionFromQuery('approvals'), 'approvals');
  const tab = tabRegistry.TABS.find((t) => t.id === 'approvals');
  assert.equal(tab.label, 'Approvals', 'the maker-checker tab keeps the name');
  const labels = tabRegistry.CA_SECTIONS.map(([, label]) => label);
  assert.ok(!labels.includes('Approvals'));
});

test('L-8: the dead OPERATOR_PERMISSION export is gone', async () => {
  assert.equal('OPERATOR_PERMISSION' in tabRegistry, false);
  const src = await read('src/components/horses/tabRegistry.js');
  assert.doesNotMatch(src, /operator\.console/);
});

// ═══════════════════════════════════════════════════════════════════════════
// L-2  one audit effect
// ═══════════════════════════════════════════════════════════════════════════

test('L-2: a filter change on a later page resets first and lets the page change load', async () => {
  const src = await read(INDEX);
  const effect = block(src, 'const auditQuerySeenRef = useRef(auditQuery);', 700);
  assert.match(effect, /const filterChanged = auditQuerySeenRef\.current !== auditQuery;/);
  assert.match(effect, /if \(filterChanged && auditPage !== 0\) \{\s*setAuditPage\(0\);\s*return;\s*\}/);
  assert.match(effect, /if \(activeTab === 'audit' && auditLoaded\) loadAuditLog\(\);/);
  assert.match(effect, /\}, \[auditQuery, auditPage\]\);/);
  // The old wrong comment is gone.
  assert.ok(!src.includes('the load that runs in\n  // this commit already sees page 0'));
  assert.match(src, /auditSeqRef/);
});

// ═══════════════════════════════════════════════════════════════════════════
// L-11 / M-7  copy
// ═══════════════════════════════════════════════════════════════════════════

test('L-11: the CSV header and the trail rows both say Request ID, and the fragments are Title Case', async () => {
  const src = await read(INDEX);
  assert.match(src, /\['request_id', 'Request ID'\]/);
  assert.equal((src.match(/\|\| 'Not Recorded'\}/g) || []).length, 2);
  assert.equal((src.match(/` - Request ID \$\{(entry|row)\.request_id\}`/g) || []).length, 2);
  assert.ok(!src.includes("'not recorded'"));
  assert.ok(!src.includes('` - request ${'));
});

const SMALL_WORDS = new Set(
  'a an the of to and or for in on at by but nor as is it with into onto per via so if than that this these those from up out off over under vs are be not no'.split(' '),
);

function lowerCaseOffenders(text) {
  return text
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/[^A-Za-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => /^[a-z]/.test(w) && !SMALL_WORDS.has(w));
}

test('M-7: every attribute string and toast in index.js is Title Case', async () => {
  const src = await read(INDEX);
  const failures = [];
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(/(placeholder|aria-label|title|confirmLabel|cancelLabel|noun|note)=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`]*)`\})/g)) {
      const text = m[2] ?? m[3] ?? m[4];
      if (text.includes('@')) continue; // an example e-mail address
      const bad = lowerCaseOffenders(text);
      if (bad.length) failures.push(`${i + 1}: ${m[1]} ${JSON.stringify(text)} -> ${bad.join(', ')}`);
    }
    for (const m of line.matchAll(/(showNotification|setLoginError)\(\s*(?:'([^']*)'|`([^`]*)`)/g)) {
      const text = m[2] ?? m[3];
      const bad = lowerCaseOffenders(text);
      if (bad.length) failures.push(`${i + 1}: ${m[1]} ${JSON.stringify(text)} -> ${bad.join(', ')}`);
    }
  });
  assert.deepEqual(failures, []);
});

test('M-7: the review list of lower-case copy is gone from index.js', async () => {
  const src = await read(INDEX);
  for (const gone of [
    'Could not verify admin status',
    'Access denied. Administrator privileges required.',
    'Connection failed.',
    'Enter an amount greater than zero.',
    'Diamonds are whole numbers.',
    'Pick a club or union.',
    'Write a reason of at least ten characters.',
    'Console sections',
    'Stable admin tabs',
    'Target type (club, user)',
    'Target id (club, user, ticket)',
    "? 'entry' : 'entries'",
    'IP not recorded',
    'No horses in the stable yet',
    'No pending applications.',
    'No leave requests found.',
  ]) {
    assert.ok(!src.includes(gone), `${JSON.stringify(gone)} must be Title Case now`);
  }
  for (const present of [
    'Enter An Amount Greater Than Zero.',
    'Diamonds Are Whole Numbers.',
    'Pick A Club Or Union.',
    'Write A Reason Of At Least Ten Characters.',
    "? 'Entry' : 'Entries'",
  ]) {
    assert.ok(src.includes(present), `${JSON.stringify(present)} must be present`);
  }
});

test('the files touched by this pass obey the house rules on dashes, emoji and single-row reads', async () => {
  // Assembled, so this file does not itself contain the banned call.
  const SINGLE_CALL = ['.single', '('].join('');
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const file of [
    INDEX,
    'src/components/horses/tabRegistry.js',
    'src/components/horses/urlState.js',
    'src/components/horses/operatorPermissions.js',
    '__tests__/horses-reverify-client.test.mjs',
  ]) {
    const text = await read(file);
    assert.ok(!text.includes('\u2014'), `${file}: no em dashes`);
    assert.ok(!text.includes('\u2013'), `${file}: no en dashes`);
    assert.ok(!EMOJI.test(text), `${file}: no emoji`);
    assert.ok(!text.includes(SINGLE_CALL), `${file}: maybeSingle only`);
  }
});
