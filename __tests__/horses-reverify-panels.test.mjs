/**
 * Re-verification fixes, panels and sub-pages (docs/horses/reverify-2026-09-03/client.md).
 *
 * H-1 the stranded approval (execute_approval, Run Again), H-2 the Approve
 * dialog and toast by kind, L-12 withdraw, H-3 the whole section=policy body
 * flowing back up, M-4 the policy confirm built from the patch, L-4 client
 * side threshold validation, M-7 Title Case, L-5 Modal initial focus, M-6 and
 * L-6 the CSS, M-8 hg-moderation on the shared dialogs, M-1 the sub-pages
 * taking the route's answer on who is an operator, L-9 sql-console reading
 * bodies through readJsonBody, L-10 sequence guards.
 *
 * The pure helpers are exercised for real; the React wiring is pinned by
 * source, because nothing React renders under this Node.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EXECUTABLE_KINDS,
  isExecutableKind,
} from '../src/components/horses/approvalModel.js';
import {
  EXECUTABLE_APPROVAL_KINDS as SERVER_EXECUTABLE_KINDS,
} from '../src/lib/horses/approvals.js';
import {
  TTL_MAX_MINUTES,
  TTL_MIN_MINUTES,
  describePolicyPatch,
  executeApprovalBody,
  operatorGate,
  policyDraftProblems,
  policyUrl,
  setPolicyBody,
  thresholdIsValid,
  ttlIsValid,
} from '../src/components/horses/operatorAdmin.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const COMPONENT_DIR = 'src/components/horses/';
const APPROVALS = `${COMPONENT_DIR}ApprovalsPanel.jsx`;
const STAFF = `${COMPONENT_DIR}StaffPanel.jsx`;
const MODAL = `${COMPONENT_DIR}Modal.jsx`;
const CSS = `${COMPONENT_DIR}shared.module.css`;
const SQL = 'pages/horses/sql-console.js';
const HGM = 'pages/horses/hg-moderation.js';
const HAND = 'pages/horses/hand-reviews.js';

/** Executable lines only: a commented-out call is not a call. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

// ── H-1: execute_approval and the executable kinds ──────────────────────────

test('executeApprovalBody carries the id and nothing else', () => {
  assert.deepEqual(executeApprovalBody('abc-123'), { action: 'execute_approval', approvalId: 'abc-123' });
  assert.deepEqual(executeApprovalBody(42), { action: 'execute_approval', approvalId: '42' });
  assert.equal(executeApprovalBody(''), null);
  assert.equal(executeApprovalBody(null), null);
  assert.equal(executeApprovalBody(undefined), null);
  // Nothing the client could re-supply is accepted: the row holds the op_id.
  assert.deepEqual(Object.keys(executeApprovalBody('x')).sort(), ['action', 'approvalId']);
});

test('isExecutableKind names mint, burn and fund_club and nothing else', () => {
  for (const kind of ['mint', 'burn', 'fund_club', 'MINT', 'Fund_Club']) {
    assert.equal(isExecutableKind(kind), true, kind);
  }
  for (const kind of ['cashout', 'fleet_policy', 'sanction', '', null, undefined, 'unknown']) {
    assert.equal(isExecutableKind(kind), false, String(kind));
  }
  // The same table as the server's, member for member.
  assert.deepEqual([...EXECUTABLE_KINDS].sort(), [...SERVER_EXECUTABLE_KINDS].sort());
});

test('the Approvals panel treats an approval that could not be run like a stale row', async () => {
  const src = await read(APPROVALS);
  assert.match(src, /function isExecutionFailure\(err\)/);
  assert.match(src, /code === 'execution_unavailable' \|\| code === 'execution_refused'/);
  assert.match(src, /Number\(err\.status\) === 503/);
  const at = src.indexOf('isStaleRowRefusal(err) || isExecutionFailure(err)');
  assert.ok(at > 0, 'the catch branches on both');
  const branch = src.slice(at, at + 300);
  assert.match(branch, /setDecideFor\(null\)/, 'the modal closes');
  assert.match(branch, /loadPending\(\)/, 'the queue is re-read');
  assert.match(branch, /history\.refresh\(\)/, 'the history is re-read');
  // And the server's sentence reaches the operator, not a constant.
  assert.match(src, /showNotification\(err\.message, 'error'\)/);
});

test('the History table offers Run Again on failed rows and unexecuted approved executable rows', async () => {
  const src = await read(APPROVALS);
  assert.match(src, /function canRunAgain\(row, permissions\)/);
  assert.match(src, /if \(!row \|\| !isExecutableKind\(row\.kind\)\) return false;/);
  assert.match(src, /if \(status === 'failed'\) return true;/);
  assert.match(src, /return status === 'approved' && !row\.executed_at;/);
  assert.match(src, /Run Again/);
  assert.match(src, /executeApprovalBody\(runAgainFor\.id\)/);
  // Through a ConfirmDialog, then both lists reload whatever happened.
  assert.match(src, /import ConfirmDialog from '\.\/ConfirmDialog';/);
  assert.match(src, /title="Run This Approval Again"/);
  const at = src.indexOf('const runAgain = useCallback');
  const fn = src.slice(at, src.indexOf('}, [authFetch, runAgainFor', at));
  assert.match(fn, /finally \{[\s\S]*loadPending\(\);[\s\S]*history\.refresh\(\);/);
  // The CSV carries executed_at, which the button reads.
  assert.match(src, /\['executed_at', 'Executed At'\]/);
});

// ── H-2: the body is read and the dialog speaks by kind ─────────────────────

test('the decide toast is the route\'s message, toned by execution.ok', async () => {
  const src = await read(APPROVALS);
  const at = src.indexOf('const submitDecision = useCallback');
  const fn = src.slice(at, src.indexOf('}, [authFetch, decideFor, note', at));
  assert.match(fn, /const answer = await authFetch\(OPERATOR_ADMIN/, 'the body is read, not discarded');
  assert.match(fn, /\(answer && answer\.message\) \|\| \(execution && execution\.message\) \|\| fallback/);
  assert.match(fn, /execution && execution\.ok === false \? 'info' : 'success'/);
  assert.ok(
    !src.includes('Approved. The Operation Will Be Carried Out And Recorded.'),
    'the constant "carried out" toast is gone',
  );
});

test('the Approve dialog sentence branches on the kind', async () => {
  const src = await read(APPROVALS);
  assert.match(src, /function approveSentence\(kind\)/);
  assert.match(src, /if \(isExecutableKind\(kind\)\) \{/);
  assert.ok(src.includes('Approving Carries The Operation Out. It Is Executed Once And Only Once, Against The Operation ID This Request Already Holds.'));
  assert.ok(src.includes('Approving Records Your Decision. The Cashout Itself Is Still Completed From The Cashout Screen, So No Chips Move Here.'));
  assert.ok(src.includes('Approving Records Your Decision. Nothing Moves Until Its Own Screen Runs It.'));
  assert.match(src, /approveSentence\(decideFor\.row\.kind\)/);
});

// ── L-12: withdraw ──────────────────────────────────────────────────────────

test('the requester may withdraw their own pending row, as a reject with a note', async () => {
  const src = await read(APPROVALS);
  assert.match(src, /row\.can_withdraw === true/);
  assert.match(src, /setDecideFor\(\{ row, decision: 'reject', withdraw: true \}\)/);
  assert.ok(src.includes('Withdrawing Cancels Your Own Request. Say Why In At Least Ten Characters.'));
  assert.match(src, /answer\.withdrawn === true/);
  assert.ok(src.includes("showNotification('Request Withdrawn.', 'success')"));
  assert.match(src, /'Withdraw This Request'/);
  // The button is drawn on a self-raised row (canDecide false) as well.
  const at = src.indexOf('if (!state.canDecide) {');
  const branch = src.slice(at, at + 400);
  assert.match(branch, /\{withdraw \?/);
});

// ── H-3: the whole policy answer flows back up ──────────────────────────────

test('StaffPanel.refreshPolicy forwards policy, aloneRule and permissions', async () => {
  const src = await read(STAFF);
  assert.match(src, /import \{ ADMIN_MANAGE, canManageOperators, permissionsFromPayload \} from '\.\/operatorPermissions';/);
  assert.match(src, /onPolicyChange\(\{\s*policy: normalizePolicy\(body && body\.policy\),\s*aloneRule: \(body && body\.aloneRule\) \|\| null,\s*permissions: permissionsFromPayload\(body\),\s*\}\)/);
});

// ── M-4: the confirm dialog is built from the patch ─────────────────────────

test('describePolicyPatch lists the changed fields as From To sentences', () => {
  const saved = {
    approvals_enabled: true,
    allow_self_approve_when_alone: true,
    mint_threshold: 0,
    fund_threshold: 0,
    cashout_threshold: 0,
    approval_ttl_minutes: 1440,
  };
  const patch = setPolicyBody({ ...saved, mint_threshold: 500, approval_ttl_minutes: 60 }, saved);
  assert.deepEqual(describePolicyPatch(patch, saved), [
    'Mint Threshold 0 To 500',
    'Approval Window 1,440 To 60 Minutes',
  ]);
  // The approvals switch is the paragraph's business, not the list's.
  const flip = setPolicyBody({ ...saved, approvals_enabled: false, allow_self_approve_when_alone: false }, saved);
  assert.deepEqual(describePolicyPatch(flip, saved), ['Alone Rule On To Off']);
  assert.deepEqual(describePolicyPatch(null, saved), []);
  assert.deepEqual(describePolicyPatch({ action: 'set_policy' }, saved), []);
});

test('the policy confirm dialog branches on the patch, danger only when switching ON', async () => {
  const src = await read(STAFF);
  assert.match(src, /const switchingApprovals = !!\(policyPatch && 'approvalsEnabled' in policyPatch\);/);
  assert.match(src, /tone=\{switchingApprovals && policyDraft\.approvals_enabled \? 'danger' : 'go'\}/);
  assert.match(src, /\{switchingApprovals && policyDraft\.approvals_enabled \? \(/);
  assert.match(src, /\) : switchingApprovals \? \(/);
  assert.match(src, /Turning Approvals On\./);
  assert.match(src, /Turning Approvals Off\./);
  assert.match(src, /Approvals Stay \{approvalsStateLabel\(policy\)\}\./);
  assert.match(src, /policyChanges\.join\(', '\)/);
  assert.match(src, /describePolicyPatch\(policyPatch, policy\)/);
  assert.ok(
    !/tone=\{policyDraft\.approvals_enabled \? 'danger' : 'go'\}/.test(src),
    'the tone no longer follows the draft alone',
  );
});

// ── L-4: client-side validation of the thresholds and the TTL ───────────────

test('thresholdIsValid refuses negatives, three decimals, and an emptied box', () => {
  for (const ok of ['0', 0, '500', 500, '10.5', '10.05', 10.05, ' 7 ']) {
    assert.equal(thresholdIsValid(ok), true, String(ok));
  }
  for (const bad of ['', ' ', null, undefined, '-5', -5, '10.005', 'abc', '1e3', '.5', '5.']) {
    assert.equal(thresholdIsValid(bad), false, String(bad));
  }
});

test('ttlIsValid is a whole number inside the route\'s bounds', () => {
  assert.equal(ttlIsValid(TTL_MIN_MINUTES), true);
  assert.equal(ttlIsValid(TTL_MAX_MINUTES), true);
  assert.equal(ttlIsValid('1440'), true);
  assert.equal(ttlIsValid(TTL_MIN_MINUTES - 1), false);
  assert.equal(ttlIsValid(TTL_MAX_MINUTES + 1), false);
  assert.equal(ttlIsValid('60.5'), false);
  assert.equal(ttlIsValid(''), false);
  assert.equal(ttlIsValid(null), false);
});

test('policyDraftProblems names every field the route would refuse', () => {
  const good = {
    mint_threshold: 0, fund_threshold: '25.50', cashout_threshold: 100, approval_ttl_minutes: 1440,
  };
  assert.deepEqual(policyDraftProblems(good), []);
  const bad = {
    mint_threshold: '', fund_threshold: '-1', cashout_threshold: '1.234', approval_ttl_minutes: 3,
  };
  const problems = policyDraftProblems(bad);
  assert.equal(problems.length, 4);
  assert.ok(problems[0].startsWith('The Mint Threshold Must Be'));
  assert.ok(problems[1].startsWith('The Club Funding Threshold Must Be'));
  assert.ok(problems[2].startsWith('The Cashout Threshold Must Be'));
  assert.ok(problems[3].startsWith('The Approval Window Must Be'));
  // Every hint is Title Case.
  for (const p of problems) assert.ok(!/\b[a-z]/.test(p.replace(/[A-Z][a-z]*/g, '')), p);
});

test('the Staff panel disables Save with a hint while the draft is invalid', async () => {
  const src = await read(STAFF);
  assert.match(src, /const policyProblems = useMemo\(\(\) => policyDraftProblems\(policyDraft\), \[policyDraft\]\);/);
  assert.match(src, /disabled=\{busy \|\| !policyDirty \|\| !policyValid\}/);
  assert.match(src, /\{policyProblems\.map\(\(problem\) => \(/);
  // And the submit refuses too, so the button and the request agree.
  assert.match(src, /const problems = policyDraftProblems\(policyDraft\);\s*if \(problems\.length\) \{/);
  assert.ok(!src.includes('ttlInRange'), 'the TTL-only check is folded into policyDraftProblems');
  // Two decimals and whole minutes, said on the inputs as well.
  assert.equal((src.match(/step="0\.01"/g) || []).length, 3);
  assert.match(src, /step="1"/);
});

// ── M-7: Title Case ─────────────────────────────────────────────────────────

test('the grant toast names the role as a human reads it', async () => {
  const src = await read(STAFF);
  assert.match(src, /showNotification\(`Granted \$\{roleLabel\(grantRole\)\} To /);
  assert.ok(!src.includes('`Granted ${grantRole} To'), 'the raw role key must not reach a toast');
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

test('M-7: every attribute string, toast and JSX ternary copy in the panels and sub-pages is Title Case', async () => {
  const ATTRS = 'placeholder|aria-label|title|label|caption|empty|loadingLabel|noun|note|confirmLabel|cancelLabel';
  const CALLS = 'showNotification|setErr|setModalErr|setAuthError|setAuthFailure|setRoleError|setDetailErr|setPendingError';
  for (const file of [APPROVALS, STAFF, MODAL, `${COMPONENT_DIR}ConfirmDialog.jsx`, SQL, HGM, HAND]) {
    const src = await read(file);
    const failures = [];
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const m of line.matchAll(new RegExp(`\\b(${ATTRS})=(?:"([^"]*)"|\\{'([^']*)'\\}|\\{\`([^\`]*)\`\\})`, 'g'))) {
        const text = m[2] ?? m[3] ?? m[4];
        if (!text || text.includes('@') || /^x{8}-/.test(text)) continue;
        const bad = lowerCaseOffenders(text);
        if (bad.length) failures.push(`${file}:${i + 1}: ${m[1]} ${JSON.stringify(text)} -> ${bad.join(', ')}`);
      }
      for (const m of line.matchAll(new RegExp(`(${CALLS})\\(\\s*(?:'([^']*)'|\`([^\`]*)\`)`, 'g'))) {
        const text = m[2] ?? m[3];
        const bad = lowerCaseOffenders(text);
        if (bad.length) failures.push(`${file}:${i + 1}: ${m[1]} ${JSON.stringify(text)} -> ${bad.join(', ')}`);
      }
      // A quoted sentence (two words or more) on either side of a ternary.
      for (const m of line.matchAll(/(?:\?|:)\s*'([A-Z][^']*\s[^']*)'/g)) {
        const bad = lowerCaseOffenders(m[1]);
        if (bad.length) failures.push(`${file}:${i + 1}: ternary ${JSON.stringify(m[1])} -> ${bad.join(', ')}`);
      }
    });
    assert.deepEqual(failures, []);
  }
});

test('M-7: the review\'s list of lower-case sub-page copy is gone', async () => {
  const sql = await read(SQL);
  for (const gone of ['Could not verify your role', 'Session expired. Please refresh the page or log in again.', 'Request failed', 'Retype the statement above', 'Confirmation matches.', 'Rows that would be affected']) {
    assert.ok(!sql.includes(gone), `${JSON.stringify(gone)} must be Title Case now`);
  }
  const hgm = await read(HGM);
  for (const gone of ['IRREVERSIBLE:', 'Filter reports by status', 'Filter appeals by status', 'User UUID to look up', 'Target user UUID', 'Moderation sections', 'Waiting for the reported content', 'Load the reported content', 'Role lookup failed', 'Empty response from']) {
    assert.ok(!hgm.includes(gone), `${JSON.stringify(gone)} must be Title Case now`);
  }
  const hand = await read(HAND);
  for (const gone of ['Fleet summary time window', 'Filter flagged hands', 'No league runs recorded yet', 'No tagged hands in the window', 'Role lookup failed']) {
    assert.ok(!hand.includes(gone), `${JSON.stringify(gone)} must be Title Case now`);
  }
  // Acronyms are upper-case in the CSV headers.
  const approvals = await read(APPROVALS);
  for (const header of ['Target ID', 'Requested By ID', 'Decided By ID', 'Operation ID', 'Request ID']) {
    assert.ok(approvals.includes(`'${header}'`), `${header} header`);
  }
  assert.ok(!/'[A-Za-z ]+ Id'/.test(approvals), 'no "Id" left in a header');
});

// ── L-5: Modal initial focus ────────────────────────────────────────────────

test('Modal puts initial focus on the first control in the body, not the header Close', async () => {
  const src = await read(MODAL);
  assert.match(src, /const bodyRef = useRef\(null\);/);
  assert.match(src, /ref=\{bodyRef\} className=\{styles\.dialogBody\}/);
  assert.match(src, /const first = \(body \? body\.querySelector\(FOCUSABLE\) : null\)\s*\|\| \(box \? box\.querySelector\(FOCUSABLE\) : null\);/);
  assert.match(src, /if \(first\) first\.focus\(\);\s*else if \(box\) box\.focus\(\);/);
});

// ── M-6 and L-6: the stylesheet ─────────────────────────────────────────────

test('the backdrop never centres a dialog it cannot scroll to, and .btn is 44px on touch', async () => {
  const css = await read(CSS);
  const backdrops = [...css.matchAll(/\.backdrop\s*\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(backdrops.length >= 2, 'the base rule and the 768px rule');
  for (const rule of backdrops) {
    assert.ok(!/align-items:\s*center/.test(rule), `no centring: ${rule}`);
    assert.match(rule, /align-items:\s*flex-start/);
  }
  const dialog = css.match(/\n\.dialog\s*\{[^}]*\}/)[0];
  assert.match(dialog, /margin:\s*auto;/);
  assert.ok(!/margin:\s*24px auto/.test(dialog), 'the fixed vertical margin is gone');
  const coarse = css.match(/@media \(pointer: coarse\)\s*\{[\s\S]*?\n\}/)[0];
  assert.match(coarse, /\.btn,/);
  assert.match(coarse, /min-height:\s*44px/);
});

// ── M-8 and L-10: hg-moderation on the shared dialogs, with guards ──────────

test('hg-moderation uses the shared Modal and ConfirmDialog and has no dialog of its own', async () => {
  const src = await read(HGM);
  const code = codeOnly(src);
  assert.match(src, /import Modal from '\.\.\/\.\.\/src\/components\/horses\/Modal';/);
  assert.match(src, /import ConfirmDialog from '\.\.\/\.\.\/src\/components\/horses\/ConfirmDialog';/);
  assert.ok(!/function Modal\(/.test(code), 'the page-local Modal is gone');
  assert.ok(!code.includes('FOCUSABLE'), 'the page-local focus trap is gone');
  assert.ok(!code.includes('offsetParent'), 'the offsetParent heuristic is gone');
  assert.ok(!code.includes('window.confirm('), 'no window.confirm remains');
  assert.ok(!code.includes('useId'), 'useId is no longer imported or used');
  assert.ok(!/S\.modal\b|S\.backdrop\b|hgm-modal/.test(code), 'the local dialog styles are gone');
  // Both writes hold their dialog open while in flight.
  assert.equal((src.match(/sticky=\{submitting\}/g) || []).length, 2);
  assert.equal((src.match(/blockEscape=\{submitting\}/g) || []).length, 2);
  assert.equal((src.match(/hideClose=\{submitting\}/g) || []).length, 2);
  assert.equal((src.match(/onClose=\{submitting \? undefined : closeReview\}/g) || []).length, 2);
  // The GDPR erase is typed.
  assert.match(src, /requireTyped="ERASE"/);
  assert.match(src, /sticky=\{loading\}/);
  assert.match(src, /blockEscape=\{loading\}/);
  assert.match(src, /onConfirm=\{handleErase\}/);
});

test('hg-moderation loaders carry a sequence guard and nothing sets state after unmount', async () => {
  const src = await read(HGM);
  assert.match(src, /function useRequestSeq\(\)/);
  assert.match(src, /useEffect\(\(\) => \(\) => \{ seq\.current \+= 1; \}, \[\]\);/);
  assert.equal((src.match(/const loadReq = useRequestSeq\(\);/g) || []).length, 2, 'Reports and Appeals');
  assert.equal((src.match(/const mine = \+\+loadReq\.current;/g) || []).length, 2);
  // Every setState after an await in the two loaders is behind the guard.
  assert.ok((src.match(/if \(loadReq\.current !== mine\) return;/g) || []).length >= 6);
  // The writes check the mount flag before touching state.
  assert.match(src, /function useAlive\(\)/);
  assert.ok((src.match(/if \(!alive\.current\) return;/g) || []).length >= 9);
});

// ── M-1: the sub-pages take the route's answer ──────────────────────────────

function fakeFetch(status, body, { throwWith = null, htmlBody = false } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (throwWith) throw throwWith;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (htmlBody) throw new SyntaxError('Unexpected token <');
        return body;
      },
    };
  };
  impl.calls = calls;
  return impl;
}

test('operatorGate asks section=policy with the bearer and reads the answer', async () => {
  const body = { success: true, policy: {}, operator: { id: 'u1', permissions: ['console.read'] }, aloneRule: null };
  const fetch200 = fakeFetch(200, body);
  const ok = await operatorGate('tok', fetch200);
  assert.deepEqual(ok, { ok: true, status: 200, body });
  assert.equal(fetch200.calls.length, 1);
  assert.equal(fetch200.calls[0].url, policyUrl());
  assert.equal(fetch200.calls[0].url, '/api/horses/operator-admin?section=policy');
  assert.equal(fetch200.calls[0].init.headers.Authorization, 'Bearer tok');

  // 401 and 403 are denials.
  for (const status of [401, 403]) {
    const denied = await operatorGate('tok', fakeFetch(status, { success: false, error: 'No' }));
    assert.equal(denied.ok, false);
    assert.equal(denied.denied, true, String(status));
    assert.equal(denied.status, status);
  }
  // No token is a denial without a request.
  const none = await operatorGate('', fetch200);
  assert.equal(none.denied, true);
  assert.equal(fetch200.calls.length, 1, 'no request without a bearer');

  // A 503, an HTML 502 and a network failure are "could not verify".
  const down = await operatorGate('tok', fakeFetch(503, { success: false, error: 'Roster Down' }));
  assert.deepEqual(down, { ok: false, denied: false, status: 503, error: 'Roster Down' });
  const html = await operatorGate('tok', fakeFetch(502, null, { htmlBody: true }));
  assert.deepEqual(html, { ok: false, denied: false, status: 502, error: 'Request Failed (502).' });
  const net = await operatorGate('tok', fakeFetch(0, null, { throwWith: new TypeError('Failed to fetch') }));
  assert.deepEqual(net, { ok: false, denied: false, status: 0, error: 'Failed to fetch' });
  // A 200 whose envelope says success:false is not a pass.
  const soft = await operatorGate('tok', fakeFetch(200, { success: false, error: 'Nope' }));
  assert.deepEqual(soft, { ok: false, denied: false, status: 200, error: 'Nope' });
});

test('the sub-pages keep their retry screen for a failed check and send a denial away', async () => {
  for (const [file, denial] of [[SQL, "router.push('/')"], [HGM, 'setAuthed(false)'], [HAND, "router.push('/')"]]) {
    const code = codeOnly(await read(file));
    const at = code.indexOf('await operatorGate(token)');
    assert.ok(at > 0, `${file} calls the gate`);
    const branch = code.slice(at, at + 700);
    assert.ok(branch.includes(denial), `${file}: a denial -> ${denial}`);
    assert.match(branch, /gate\.error/, `${file}: the failure message reaches the retry screen`);
  }
});

// ── L-9: sql-console reads bodies through readJsonBody ─────────────────────

test('sql-console never calls res.json() blind', async () => {
  const src = await read(SQL);
  const code = codeOnly(src);
  assert.match(src, /import \{ readJsonBody \} from '\.\.\/\.\.\/src\/components\/horses\/useOperatorFetch';/);
  assert.match(code, /const data = await readJsonBody\(res\);/);
  assert.ok(!code.includes('await res.json()'), 'no blind res.json()');
  assert.match(code, /`Request Failed \(\$\{res\.status\}\)`/);
});

// ── House rules over every file this pass touched ───────────────────────────

test('the files touched by this pass obey the house rules on dashes, emoji, single-row reads and hex', async () => {
  const SINGLE_CALL = ['.single', '('].join('');
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const HEX = /#[0-9a-fA-F]{3,8}\b/;
  for (const file of [
    APPROVALS, STAFF, MODAL, `${COMPONENT_DIR}ConfirmDialog.jsx`,
    `${COMPONENT_DIR}operatorAdmin.js`, `${COMPONENT_DIR}approvalModel.js`,
    SQL, HGM, HAND,
    '__tests__/horses-reverify-panels.test.mjs',
  ]) {
    const text = await read(file);
    assert.ok(!text.includes('\u2014'), `${file}: no em dashes`);
    assert.ok(!text.includes('\u2013'), `${file}: no en dashes`);
    assert.ok(!EMOJI.test(text), `${file}: no emoji`);
    assert.ok(!text.includes(SINGLE_CALL), `${file}: maybeSingle only`);
    if (!file.startsWith('__tests__/')) assert.ok(!HEX.test(text), `${file}: no raw hex`);
    assert.ok(!/\bbots?\b/i.test(text.replace(/robots/g, '')), `${file}: horses are players`);
  }
});
