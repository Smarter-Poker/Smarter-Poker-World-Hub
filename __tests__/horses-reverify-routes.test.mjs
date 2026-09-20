/**
 * Re-verification fixes of 2026-09-03 (docs/horses/reverify-2026-09-03/server-db.md),
 * the server half that lives in routes and the two small libs:
 *
 *   M-3  operatorGate: the five routes outside /horses decide "platform staff"
 *        by the resolved permission set, not a literal list of legacy roles.
 *   M-4  mint and approve-cashout read markApprovalExecuted's answer and put
 *        it in the audit row and the response.
 *   M-5  merch-catalog-admin audits before the derived has_variants sync, and
 *        the sync reports rather than throws; no raw Supabase throw remains.
 *   M-6  approve-cashout closes the approval and audits before notifyPlayer,
 *        whose push fetch now has a timeout.
 *   L-5  approve-cashout's cancel path returns no database text.
 *   L-6  the hg routes share one RPC error mapping (403 / 401 / mapDbError).
 *   L-8  hg-appeals and hg-reports validate status before the RPC.
 *   L-9  club-arena-admin user_search masks email unless players.write.
 *   L-11 mint records `failed` on the approval row when the RPC refuses.
 *
 * Behaviour tests where the route can be imported without node_modules
 * (mint, the hg routes, club-arena-admin, the two libs), and source-text
 * contracts where it cannot (approve-cashout, execute-sql, admin-promo-codes,
 * anti-cheat and union-application import `src/lib/serverAuth` without an
 * extension; merch-catalog-admin requires a module outside this repo).
 *
 * Nothing here touches Supabase, retired error provider or the network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operatorHoldsPermission, isLegacyOperatorRole } from '../src/lib/horses/operatorGate.js';
import { _resetOperatorCachesForTests } from '../src/lib/horses/operatorAuth.js';
import { PERMISSIONS, permissionsForRole, ALL_PERMISSIONS } from '../src/lib/horses/permissions.js';
import { mapHgRpcError } from '../src/lib/horses/hgOperator.js';
import { handle as mintHandle } from '../pages/api/horses/mint.js';
import { handle as appealsHandle, APPEAL_STATUSES } from '../pages/api/horses/hg-appeals.js';
import { handle as reportsHandle, REPORT_STATUSES } from '../pages/api/horses/hg-reports.js';
import { handle as onboardingHandle } from '../pages/api/horses/hg-onboarding-status.js';
import { handle as gdprHandle } from '../pages/api/horses/hg-gdpr-erase.js';
import { handle as caHandle, maskEmail, maskSearchRows } from '../pages/api/horses/club-arena-admin.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const source = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const OPERATOR_ID = '11111111-1111-1111-1111-111111111111';
const CLUB_ID = '44444444-4444-4444-4444-444444444444';
const APPROVAL_ID = '33333333-3333-3333-3333-333333333333';

/** Silence the console for a call that is expected to warn or error. */
async function quiet(fn) {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

// ------------------------------------------------------------------ fakes

/**
 * A recording query builder plus scripted RPCs. `tables[name]` is
 * { rows, error }; every terminal resolves the seeded rows after the recorded
 * range, and `rpcs[name]` is a function of the args or a fixed answer. An
 * unscripted RPC answers { data: null, error: null }, which is what
 * requireApproval treats as "the migration is not applied".
 */
function fakeDb(tables = {}, rpcs = {}) {
  const calls = [];
  function chainFor(table) {
    const script = tables[table] || { rows: [] };
    const record = { table, filters: [], range: null, select: null, countMode: null, head: false };
    calls.push(record);
    const result = () => {
      if (script.error) return { data: null, count: null, error: script.error };
      let out = [...(script.rows || [])];
      if (record.range) out = out.slice(record.range[0], record.range[1] + 1);
      return { data: record.head ? [] : out, count: record.countMode ? out.length : null, error: null };
    };
    const push = (...f) => {
      record.filters.push(f);
      return chain;
    };
    const chain = {
      select(cols, opts) {
        record.select = cols;
        record.countMode = opts?.count || null;
        record.head = Boolean(opts?.head);
        return chain;
      },
      eq: (c, v) => push('eq', c, v),
      or: (expr) => push('or', expr),
      order: (c, opts) => push('order', c, opts),
      limit: (n) => push('limit', n),
      range(from, to) {
        record.range = [from, to];
        return chain;
      },
      update(row) {
        record.update = row;
        return chain;
      },
      insert(rows) {
        record.insert = rows;
        return chain;
      },
      async maybeSingle() {
        const r = result();
        return { data: (r.data || [])[0] ?? null, error: r.error };
      },
      then(resolve, reject) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    calls,
    from: chainFor,
    rpcCalls: () => calls.filter((c) => c.rpc),
    rpcNames: () => calls.filter((c) => c.rpc).map((c) => c.rpc),
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      const scripted = rpcs[name];
      if (typeof scripted === 'function') return scripted(args);
      return scripted || { data: null, error: null };
    },
  };
}

const fakeReq = (extra = {}) => ({
  method: 'POST',
  headers: { 'user-agent': 'node-test', 'x-real-ip': '10.0.0.1' },
  socket: { remoteAddress: '127.0.0.1' },
  ...extra,
});

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    headersSent: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
}

const policyRow = (over = {}) => ({
  ca_operator_policy: { rows: [{ id: true, approvals_enabled: false, enforce_named_roles: false, ...over }] },
});

const permissionRpc = (answer) => ({
  fn_ca_operator_permissions: async () => ({ data: answer, error: null }),
});

// ------------------------------------------------------------- M-3: the gate

test('operatorGate: a granted finance operator with profiles.role user holds cashier.write', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb(
    policyRow(),
    permissionRpc({ role: 'user', roles: ['finance'], permissions: permissionsForRole('finance'), source: 'granted' })
  );
  const gate = await operatorHoldsPermission(db, { userId: OPERATOR_ID, profileRole: 'user' }, PERMISSIONS.CASHIER_WRITE);
  assert.equal(gate.ok, true, 'the Approvals tab let this operator decide the cashout; the cashout screen must let them complete it');
  assert.equal(gate.degraded, false);
  assert.equal(gate.reason, null);
  assert.ok(gate.permissions.includes('cashier.write'));
  // And the same account does NOT hold what finance does not carry.
  const sql = await operatorHoldsPermission(db, { userId: OPERATOR_ID, profileRole: 'user' }, PERMISSIONS.SQL_EXECUTE);
  assert.equal(sql.ok, false);
  assert.equal(sql.reason, 'permission_missing');
  _resetOperatorCachesForTests();
});

test('operatorGate: a support grant does not pass the cashout gate', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb(
    policyRow(),
    permissionRpc({ role: 'user', roles: ['support'], permissions: permissionsForRole('support'), source: 'granted' })
  );
  const gate = await operatorHoldsPermission(db, { userId: OPERATOR_ID, profileRole: 'user' }, PERMISSIONS.CASHIER_WRITE);
  assert.equal(gate.ok, false);
  assert.equal(gate.degraded, false);
  assert.equal(gate.reason, 'permission_missing');
  _resetOperatorCachesForTests();
});

test('operatorGate: a legacy admin still passes while the resolver is degraded', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb(policyRow(), {
    fn_ca_operator_permissions: async () => ({ data: null, error: { message: 'connection reset' } }),
  });
  const gate = await quiet(() =>
    operatorHoldsPermission(db, { userId: OPERATOR_ID, profileRole: 'admin' }, PERMISSIONS.CASHIER_WRITE)
  );
  assert.equal(gate.ok, true, 'section 0: nothing that works today may stop working because an RPC is down');
  assert.equal(gate.degraded, true, 'and the route can say so in its audit row');
  assert.deepEqual([...gate.permissions].sort(), [...ALL_PERMISSIONS].sort());

  // The same outage admits NOBODY who was not an operator yesterday.
  _resetOperatorCachesForTests();
  const stranger = await quiet(() =>
    operatorHoldsPermission(db, { userId: OPERATOR_ID, profileRole: 'user' }, PERMISSIONS.CASHIER_WRITE)
  );
  assert.equal(stranger.ok, false);
  assert.equal(stranger.degraded, true);
  _resetOperatorCachesForTests();
});

test('operatorGate: under enforcement a narrowed legacy account loses the door, and admin.manage survives', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb(
    policyRow({ enforce_named_roles: true }),
    permissionRpc({ role: 'admin', roles: ['read_only'], permissions: permissionsForRole('read_only'), source: 'both' })
  );
  const gate = await quiet(() =>
    operatorHoldsPermission(db, { userId: OPERATOR_ID, profileRole: 'admin' }, PERMISSIONS.CASHIER_WRITE)
  );
  assert.equal(gate.ok, false, 'the narrowing the policy panel promises must reach the cashout screen');
  assert.equal(gate.enforced, true);
  assert.ok(gate.permissions.includes(PERMISSIONS.ADMIN_MANAGE), 'the floor under the narrowing stays');
  _resetOperatorCachesForTests();
});

test('operatorGate: an unknown permission is refused, not admitted; isLegacyOperatorRole is the legacy three', async () => {
  const db = fakeDb(policyRow(), permissionRpc({ role: 'admin', roles: [], permissions: ALL_PERMISSIONS }));
  const gate = await quiet(() => operatorHoldsPermission(db, { userId: OPERATOR_ID, profileRole: 'god' }, 'money.print'));
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'unknown_permission');
  assert.equal(db.rpcNames().length, 0, 'a misconfigured route must not even ask');
  for (const r of ['god', 'superadmin', 'admin']) assert.equal(isLegacyOperatorRole(r), true);
  for (const r of ['owner', 'finance', 'user', null, undefined]) assert.equal(isLegacyOperatorRole(r), false);
});

test('contract: the five outside routes gate on the resolved permission, not the legacy literal', () => {
  const expected = {
    'pages/api/club-arena/approve-cashout.js': 'PERMISSIONS.CASHIER_WRITE',
    'pages/api/admin/execute-sql.js': 'PERMISSIONS.SQL_EXECUTE',
    'pages/api/promo/admin-promo-codes.js': 'PERMISSIONS.PROMO_WRITE',
    'pages/api/club-arena/anti-cheat.js': 'PERMISSIONS.MODERATION_WRITE',
    'pages/api/club-arena/union-application.js': 'PERMISSIONS.CLUBS_WRITE',
  };
  for (const [file, permission] of Object.entries(expected)) {
    const text = source(file);
    assert.match(text, /operatorHoldsPermission\(/, `${file} must ask the resolver`);
    assert.ok(text.includes(permission), `${file} must ask for ${permission}`);
    assert.doesNotMatch(text, /\['admin',\s*'superadmin',\s*'god'\]/, `${file} must not inline the legacy role literal`);
    assert.doesNotMatch(text, /ADMIN_ROLES/, `${file} must not keep its own role list`);
  }
  // The non-operator doors still bind the verified actor to the actual club
  // agent, owner/membership or union authority.
  const cashout = source('pages/api/club-arena/approve-cashout.js');
  assert.match(cashout, /const isAgent = cashout\.agent_id === auth\.actorId;/);
  assert.match(cashout, /club\.owner_id === auth\.actorId \|\| \['owner',\s*'co_owner',\s*'admin'\]\.includes\(member\?\.role\)/);
  assert.match(cashout, /typeof platformGate\?\.ok !== 'boolean' \|\| platformGate\.degraded === true/);
  assert.match(cashout, /from\('union_admins'\)/);
  const cheat = source('pages/api/club-arena/anti-cheat.js');
  assert.match(cheat, /\['owner', 'admin', 'super_agent'\]\.includes\(membership\.role\)/);
  const union = source('pages/api/club-arena/union-application.js');
  assert.match(union, /data\?\.role === 'union_lead'/);
  assert.match(union, /const platformAdmin = await isPlatformAdmin\(user\.id, actorRole\);/);
  const sql = source('pages/api/admin/execute-sql.js');
  assert.match(sql, /sessionRole = profile\.role;/, 'the audit role stays the profile role');
});

// --------------------------------------------------- M-4 / L-11: the mint

function mintBody(over = {}) {
  return {
    action: 'mint',
    asset: 'chips',
    target: 'club',
    targetId: CLUB_ID,
    amount: '5000.00',
    reason: 'Seeding the new club treasury for launch',
    opId: 'op-mint-1',
    ...over,
  };
}

function mintOp(db) {
  return {
    db,
    user: { id: OPERATOR_ID, email: 'op@example.com' },
    role: 'admin',
    roles: ['admin'],
    grantedRoles: [],
    permissions: ALL_PERMISSIONS,
    policy: { approvalsEnabled: false, loaded: true },
    requestId: 'req-reverify',
  };
}

const requestRpc = (answer) => ({
  fn_ca_operator_request_approval: async () => ({ data: answer, error: null }),
});
const logRpc = { fn_log_admin_action: async () => ({ data: true, error: null }) };
const mintOk = {
  fn_ca_mint: async () => ({
    data: { ok: true, balance_before: 0, balance_after: 5000, supply_after: 5000, ledger_id: 'l1' },
    error: null,
  }),
};

const auditRowOf = (db, action) => db.rpcCalls().find((c) => c.rpc === 'fn_log_admin_action' && c.args.p_action === action);

test('mint: a refused mark_executed reaches the audit row and the response (M-4)', async () => {
  const db = fakeDb({}, {
    ...logRpc,
    ...mintOk,
    ...requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }),
    fn_ca_operator_mark_executed: async () => ({ data: { ok: false, error: 'not_approved' }, error: null }),
  });
  const payload = await quiet(() =>
    mintHandle({ req: fakeReq(), res: fakeRes(), op: mintOp(db), db, body: mintBody(), query: {}, method: 'POST' })
  );
  assert.equal(payload.result.ok, true, 'the chips moved; the response must not pretend otherwise');
  assert.equal(payload.trailClosed, false, 'and the operator is told the row did not close');
  assert.equal(payload.approvalStatus, 'auto_approved', 'the status the request released under is unchanged');
  assert.equal(payload.approvalStatusAfter, 'auto_approved', 'the row did not become executed');

  const audit = auditRowOf(db, 'mint.issue');
  assert.ok(audit, 'the issue is audited');
  assert.equal(audit.args.p_details.trail_closed, false);
  assert.equal(audit.args.p_details.mark_executed_refused, true);
  assert.equal(audit.args.p_details.mark_executed_reason, 'not_approved');
  assert.equal(audit.args.p_details.approvalStatus, 'auto_approved');
});

test('mint: a closed trail records executed as the post-execution status (M-4)', async () => {
  const db = fakeDb({}, {
    ...logRpc,
    ...mintOk,
    ...requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }),
    fn_ca_operator_mark_executed: async (args) => {
      assert.equal(args.p_status, 'executed');
      return { data: { ok: true }, error: null };
    },
  });
  const payload = await mintHandle({
    req: fakeReq(), res: fakeRes(), op: mintOp(db), db, body: mintBody(), query: {}, method: 'POST',
  });
  assert.equal(payload.trailClosed, true);
  assert.equal(payload.approvalStatus, 'auto_approved');
  assert.equal(payload.approvalStatusAfter, 'executed');
  const audit = auditRowOf(db, 'mint.issue');
  assert.equal(audit.args.p_details.approvalStatus, 'executed', 'the audit row carries the POST-execution status');
  assert.equal(audit.args.p_details.approvalStatusBefore, 'auto_approved');
  assert.equal(audit.args.p_details.trail_closed, true);
  assert.equal(audit.args.p_details.mark_executed_refused, false);
});

test('mint: with no approval row there is nothing to close, and the response says so honestly', async () => {
  // The state of production between this deploy and the Phase 2 migration:
  // the request RPC is missing, the advisory row is unrecorded, the mint runs.
  const db = fakeDb({}, { ...logRpc, ...mintOk });
  const payload = await quiet(() =>
    mintHandle({ req: fakeReq(), res: fakeRes(), op: mintOp(db), db, body: mintBody(), query: {}, method: 'POST' })
  );
  assert.equal(payload.result.ok, true);
  assert.equal(payload.trailClosed, false, 'no row was closed because there was no row');
  assert.equal(payload.approvalStatus, 'unrecorded');
  assert.ok(!db.rpcNames().includes('fn_ca_operator_mark_executed'), 'nothing to mark');
});

test('mint: an RPC refusal marks the approval row failed with the reason code (L-11)', async () => {
  const marks = [];
  const db = fakeDb({}, {
    ...logRpc,
    ...requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }),
    fn_ca_mint: async () => ({ data: { ok: false, reason: 'club_not_found' }, error: null }),
    fn_ca_operator_mark_executed: async (args) => {
      marks.push(args);
      return { data: { ok: true }, error: null };
    },
  });
  await assert.rejects(
    mintHandle({ req: fakeReq(), res: fakeRes(), op: mintOp(db), db, body: mintBody(), query: {}, method: 'POST' }),
    (err) => err.status === 400 && err.code === 'club_not_found'
  );
  assert.equal(marks.length, 1, 'exactly one mark, as failed');
  assert.equal(marks[0].p_approval_id, APPROVAL_ID);
  assert.equal(marks[0].p_status, 'failed');
  assert.deepEqual(marks[0].p_result, { ok: false, error: 'club_not_found' });
  assert.ok(!db.rpcNames().includes('fn_log_admin_action') || !auditRowOf(db, 'mint.issue'), 'no issue audit row for a refusal');
});

test('mint: an RPC error marks the approval row failed too, and no database text escapes (L-11)', async () => {
  const marks = [];
  const db = fakeDb({}, {
    ...logRpc,
    ...requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }),
    fn_ca_mint: async () => ({ data: null, error: { message: 'relation "ca_op_claims" does not exist', code: '42P01' } }),
    fn_ca_operator_mark_executed: async (args) => {
      marks.push(args);
      return { data: { ok: true }, error: null };
    },
  });
  await assert.rejects(
    quiet(() =>
      mintHandle({ req: fakeReq(), res: fakeRes(), op: mintOp(db), db, body: mintBody(), query: {}, method: 'POST' })
    ),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'mint_unavailable');
      assert.doesNotMatch(err.message, /ca_op_claims|relation/);
      return true;
    }
  );
  assert.equal(marks.length, 1);
  assert.equal(marks[0].p_status, 'failed');
  assert.deepEqual(marks[0].p_result, { ok: false, error: 'mint_unavailable' });
});

test('mint: the burn path closes its row the same way', async () => {
  const db = fakeDb({}, {
    ...logRpc,
    ...requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }),
    fn_ca_burn: async () => ({ data: { ok: true, ledger_id: 'l2', balance_after: 10 }, error: null }),
    fn_ca_operator_mark_executed: async () => ({ data: { ok: false, error: 'not_approved' }, error: null }),
  });
  const payload = await quiet(() =>
    mintHandle({
      req: fakeReq(), res: fakeRes(), op: mintOp(db), db, body: mintBody({ action: 'burn' }), query: {}, method: 'POST',
    })
  );
  assert.equal(payload.trailClosed, false);
  const audit = auditRowOf(db, 'mint.retire');
  assert.equal(audit.args.p_details.mark_executed_refused, true);
  assert.equal(audit.args.p_details.trail_closed, false);
});

// ---------------------------------------------- M-4 / M-6 / L-5: the cashout

test('contract: approve-cashout audits the canonical receipt and reports an unconfirmed trail without duplicate delivery', () => {
  const text = source('pages/api/club-arena/approve-cashout.js');
  const iRpc = text.indexOf('await dispatchCashout(client, context)');
  const iMark = text.indexOf('await markApprovalExecuted(');
  const iAudit = text.indexOf('const audit = await auditOperatorAction(', iMark);
  const iLegacyAudit = text.indexOf('await logAudit(', iAudit);
  const iReturn = text.indexOf('return res.status(200).json(', iLegacyAudit);
  assert.ok(iRpc > -1 && iMark > -1 && iAudit > -1 && iLegacyAudit > -1 && iReturn > -1);
  assert.ok(iRpc < iMark, 'the row closes after the chips moved');
  assert.ok(iMark < iAudit, 'then the audit row');
  assert.ok(iAudit < iLegacyAudit && iLegacyAudit < iReturn, 'both audit attempts precede the response');
  // M-4: the answer is read, and it reaches the row and the operator.
  assert.match(text, /let trailClosed = mark\?\.ok === true;/);
  assert.match(text, /operation_id: receipt\.operationId, invoice_id: receipt\.cashier\.invoice_id/);
  assert.match(text, /trail_closed: trailClosed/);
  assert.match(text, /mark_executed_refused: mark\?\.refused === true/);
  assert.match(text, /approval_status: approvalStatus/);
  assert.match(text, /if \(audit\?\.ok !== true\) trailClosed = false;/);
  assert.match(text, /catch \{ mark = \{ ok: false, reason: 'approval_close_unconfirmed' \}; \}/);
  assert.match(text, /catch \{ trailClosed = false; \}/);
  assert.match(text, /approvalStatus, trailClosed, followUpRequired: !trailClosed/);
  assert.match(text, /legacyAuditStatus: 'unconfirmed', receipt/);
  // M-6: mandatory delivery belongs to the database receipt transaction. The
  // HTTP route must not send a duplicate notification after the chip commit.
  assert.doesNotMatch(text, /notifyPlayer|\bfetch\(|fn_send_message|fn_approve_cashout_atomic|fn_cancel_cashout_atomic/);
  // L-5: the shared boundary never returns an unrecognized database message.
  assert.doesNotMatch(text, /details: rpcErr\?\.message/);
  assert.match(text, /catch \(error\) \{ return sendCashoutError\(res, error\); \}/);
  const bridge = source('src/lib/club-arena/cashoutBridge.js');
  assert.match(bridge, /const known = error instanceof CashoutBridgeError;/);
  assert.match(bridge, /error: known \? error\.message : 'Cashout outcome is unconfirmed\./);
});

// ----------------------------------------------------- M-5: merch catalog

test('contract: merch-catalog-admin audits before the derived sync, and the sync reports instead of throwing', () => {
  const text = source('pages/api/horses/merch-catalog-admin.js');
  // No raw Supabase throw remains.
  assert.doesNotMatch(text, /throw (error|beforeError|itemError|variantError|updateError);/);
  assert.equal((text.match(/mapDbError\(\w+, 'That Catalog Record'\)/g) || []).length >= 4, true);
  // syncHasVariants has no throw in it and returns its outcome.
  const start = text.indexOf('async function syncHasVariants(');
  const end = text.indexOf('\nexport const spec', start);
  const body = text.slice(start, end);
  assert.doesNotMatch(body, /\bthrow\b/, 'the sync runs after an audited write and must not un-record it');
  assert.match(body, /return \{ synced: true, hasVariants, reason: null \};/);
  // In each of the three variant write paths the audit precedes the sync.
  for (const action of ['merchandise.variant_created', '_archived', '_updated']) {
    const iAudit = text.indexOf(action);
    assert.ok(iAudit > -1, `${action} is audited`);
    const iSync = text.indexOf('await syncHasVariants(', iAudit);
    const iNextAudit = text.indexOf('await auditOperatorAction(', iAudit);
    assert.ok(iSync > -1, `${action}: the sync follows the audit`);
    assert.ok(iNextAudit === -1 || iSync < iNextAudit, `${action}: the sync belongs to this write, not the next`);
  }
  assert.equal((text.match(/hasVariantsSynced: sync\.synced/g) || []).length, 3, 'all three paths report the sync');
  assert.doesNotMatch(text, /await syncHasVariants\([^)]*\);\s*\n\s*await auditOperatorAction/, 'no path syncs first');
});

// ------------------------------------------------------ L-6: hg mapping

test('mapHgRpcError: 42501 and UNAUTHORIZED are 403, an expired JWT is 401, the rest is mapDbError', async () => {
  await quiet(async () => {
    const denied = mapHgRpcError({ code: '42501', message: 'UNAUTHORIZED' }, 'The Appeal');
    assert.equal(denied.status, 403);
    assert.equal(denied.code, 'forbidden');
    assert.match(denied.message, /Not Authorized To Act On The Appeal/);

    const raised = mapHgRpcError({ code: 'P0001', message: 'UNAUTHORIZED' }, 'That Report');
    assert.equal(raised.status, 403, 'the RPC raises UNAUTHORIZED under P0001 too');

    const expired = mapHgRpcError({ code: 'PGRST301', message: 'JWT expired' }, 'The Reports Queue');
    assert.equal(expired.status, 401);
    assert.equal(expired.code, 'session_expired');
    const lapsed = mapHgRpcError({ message: 'invalid JWT: unable to parse or verify signature, token is expired' });
    assert.equal(lapsed.status, 401);

    const dup = mapHgRpcError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, 'That Appeal');
    assert.equal(dup.status, 409);
    assert.doesNotMatch(dup.message, /unique constraint/);

    const other = mapHgRpcError({ code: '57014', message: 'canceling statement due to statement timeout' }, 'The Onboarding Status');
    assert.equal(other.status, 503);
    assert.equal(other.code, 'database_unavailable');
    assert.doesNotMatch(other.message, /statement/);
    assert.equal(other.isApiError, true);
  });
});

function fakeUserDb(responder) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const r = typeof responder === 'function' ? responder(name, args) : responder;
      return r || { data: null, error: null };
    },
  };
}

const hgOp = { user: { id: OPERATOR_ID }, role: 'admin', requestId: 'req-hg' };
const UNAUTHORIZED = { data: null, error: { code: '42501', message: 'UNAUTHORIZED' } };
const EXPIRED = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };

test('the four hg routes answer 403 on UNAUTHORIZED and 401 on an expired session, never 500', async () => {
  await quiet(async () => {
    const appealsBody = { appeal_id: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab', decision: 'approved' };
    const reportsBody = { report_id: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab', action: 'dismiss' };
    const runs = [
      () => appealsHandle({ method: 'GET', op: hgOp, userDb: fakeUserDb(UNAUTHORIZED), query: {} }),
      () => appealsHandle({ req: fakeReq(), method: 'PATCH', op: hgOp, userDb: fakeUserDb(UNAUTHORIZED), body: appealsBody, query: {} }),
      () => reportsHandle({ method: 'GET', op: hgOp, userDb: fakeUserDb(UNAUTHORIZED), query: {} }),
      () => reportsHandle({ method: 'GET', op: hgOp, userDb: fakeUserDb(UNAUTHORIZED), query: { id: '018f5c2e-1a2b-7c3d-8e4f-0123456789ab' } }),
      () => reportsHandle({ req: fakeReq(), method: 'PATCH', op: hgOp, userDb: fakeUserDb(UNAUTHORIZED), body: reportsBody, query: {} }),
      () => onboardingHandle({ req: fakeReq(), op: hgOp, userDb: fakeUserDb(UNAUTHORIZED), query: { userId: CLUB_ID } }),
      () => gdprHandle({ req: fakeReq(), op: hgOp, userDb: fakeUserDb(UNAUTHORIZED), body: { userId: CLUB_ID, confirmed: true } }),
    ];
    for (const run of runs) {
      await assert.rejects(run, (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.code, 'forbidden');
        return true;
      });
    }
    const expiredRuns = [
      () => appealsHandle({ method: 'GET', op: hgOp, userDb: fakeUserDb(EXPIRED), query: {} }),
      () => reportsHandle({ method: 'GET', op: hgOp, userDb: fakeUserDb(EXPIRED), query: {} }),
      () => onboardingHandle({ req: fakeReq(), op: hgOp, userDb: fakeUserDb(EXPIRED), query: { userId: CLUB_ID } }),
      () => gdprHandle({ req: fakeReq(), op: hgOp, userDb: fakeUserDb(EXPIRED), body: { userId: CLUB_ID, confirmed: true } }),
    ];
    for (const run of expiredRuns) {
      await assert.rejects(run, (err) => err.status === 401 && err.code === 'session_expired');
    }
  });
});

// --------------------------------------------------- L-8: status validation

test('hg-appeals validates status against what the queue offers, and passes blank as all', async () => {
  assert.deepEqual([...APPEAL_STATUSES], ['pending', 'approved', 'denied']);
  const ok = fakeUserDb({ data: [], error: null });
  await appealsHandle({ method: 'GET', op: hgOp, userDb: ok, query: { status: 'pending' } });
  assert.equal(ok.calls[0].args.p_status, 'pending');
  await appealsHandle({ method: 'GET', op: hgOp, userDb: ok, query: { status: '' } });
  assert.equal(ok.calls[1].args.p_status, null);
  await appealsHandle({ method: 'GET', op: hgOp, userDb: ok, query: {} });
  assert.equal(ok.calls[2].args.p_status, null);
  await appealsHandle({ method: 'GET', op: hgOp, userDb: ok, query: { status: 'DENIED' } });
  assert.equal(ok.calls[3].args.p_status, 'denied');

  const bad = fakeUserDb({ data: [], error: null });
  await assert.rejects(
    () => appealsHandle({ method: 'GET', op: hgOp, userDb: bad, query: { status: 'resolved' } }),
    (err) => err.status === 400 && err.code === 'invalid_status'
  );
  assert.equal(bad.calls.length, 0, 'a 400 is decided before the RPC');
});

test('hg-reports validates status and reported_type before the RPC', async () => {
  assert.deepEqual([...REPORT_STATUSES], ['pending', 'hidden_pending_review', 'reviewed', 'actioned', 'dismissed']);
  const ok = fakeUserDb({ data: { reports: [] }, error: null });
  await reportsHandle({ method: 'GET', op: hgOp, userDb: ok, query: { status: 'actioned', reported_type: 'post' } });
  assert.equal(ok.calls[0].args.p_status, 'actioned');
  assert.equal(ok.calls[0].args.p_reported_type, 'post');
  await reportsHandle({ method: 'GET', op: hgOp, userDb: ok, query: { status: '', reported_type: '' } });
  assert.equal(ok.calls[1].args.p_status, null);
  assert.equal(ok.calls[1].args.p_reported_type, null);

  const bad = fakeUserDb({ data: { reports: [] }, error: null });
  await assert.rejects(
    () => reportsHandle({ method: 'GET', op: hgOp, userDb: bad, query: { status: 'resolved' } }),
    (err) => err.status === 400 && err.code === 'invalid_status'
  );
  await assert.rejects(
    () => reportsHandle({ method: 'GET', op: hgOp, userDb: bad, query: { reported_type: "post' or 1=1" } }),
    (err) => err.status === 400 && err.code === 'invalid_reported_type'
  );
  assert.equal(bad.calls.length, 0);
});

// --------------------------------------------------- L-9: masked search

test('maskSearchRows masks email unless the operator holds players.write', () => {
  const rows = [
    { id: 'p1', display_name: 'Dan', email: 'daniel@example.com' },
    { id: 'p2', display_name: 'No Address', email: null },
  ];
  const masked = maskSearchRows(rows, ['clubs.read', 'players.read']);
  assert.equal(masked[0].email, 'd***@example.com');
  assert.equal(masked[0].emailMasked, true);
  assert.equal(masked[1].email, null);
  assert.equal(masked[1].emailMasked, true);
  const open = maskSearchRows(rows, ['clubs.read', 'players.write']);
  assert.equal(open[0].email, 'daniel@example.com');
  assert.equal(open[0].emailMasked, false);
  assert.equal(maskEmail('a@b.co'), 'a***@b.co');
  assert.equal(maskEmail('not-an-address'), null);
  // Input rows are not mutated.
  assert.equal(rows[0].email, 'daniel@example.com');
});

test('club-arena-admin user_search ships masked email to a clubs.read operator and real email to players.write', async () => {
  const profiles = [{ id: 'p1', display_name: 'Dan', username: 'dan', email: 'daniel@example.com', created_at: 1 }];
  const base = { req: fakeReq({ method: 'GET' }), body: {}, query: { section: 'user_search', q: 'dan' }, method: 'GET' };
  const opWith = (db, permissions) => ({ db, user: { id: OPERATOR_ID }, role: 'user', permissions, requestId: 'req-l9' });

  const db1 = fakeDb({ profiles: { rows: profiles } });
  const readOnly = await caHandle({ ...base, db: db1, op: opWith(db1, permissionsForRole('read_only')) });
  assert.equal(readOnly.results[0].email, 'd***@example.com');
  assert.equal(readOnly.results[0].emailMasked, true);
  assert.equal(readOnly.emailsMasked, true);
  assert.deepEqual(readOnly.users, readOnly.results);
  assert.deepEqual(readOnly.rows, readOnly.results);
  // The search itself still matches on the full address.
  const call = db1.calls.find((c) => c.table === 'profiles');
  assert.ok(call.filters.some(([op, expr]) => op === 'or' && /email\.ilike/.test(expr)));

  const db2 = fakeDb({ profiles: { rows: profiles } });
  const support = await caHandle({ ...base, db: db2, op: opWith(db2, permissionsForRole('support')) });
  assert.equal(support.results[0].email, 'daniel@example.com', 'support holds players.write');
  assert.equal(support.results[0].emailMasked, false);
  assert.equal(support.emailsMasked, false);

  const db3 = fakeDb({ profiles: { rows: profiles } });
  const god = await caHandle({ ...base, db: db3, op: opWith(db3, ALL_PERMISSIONS) });
  assert.equal(god.results[0].email, 'daniel@example.com');
});

// ------------------------------------------------------------ house rules

test('the files this pass touched obey the house rules', () => {
  const EM_DASH = String.fromCharCode(0x2014);
  const EN_DASH = String.fromCharCode(0x2013);
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
  for (const file of [
    'src/lib/horses/operatorGate.js',
    'src/lib/horses/hgOperator.js',
    'pages/api/horses/mint.js',
    'pages/api/horses/merch-catalog-admin.js',
    'pages/api/horses/hg-appeals.js',
    'pages/api/horses/hg-reports.js',
    'pages/api/horses/hg-onboarding-status.js',
    'pages/api/horses/hg-gdpr-erase.js',
    'pages/api/horses/club-arena-admin.js',
    'pages/api/club-arena/approve-cashout.js',
    'pages/api/club-arena/anti-cheat.js',
    'pages/api/club-arena/union-application.js',
    'pages/api/admin/execute-sql.js',
    'pages/api/promo/admin-promo-codes.js',
    '__tests__/horses-reverify-routes.test.mjs',
  ]) {
    const text = source(file);
    assert.equal(text.includes(EM_DASH), false, `${file} contains an em dash`);
    assert.equal(text.includes(EN_DASH), false, `${file} contains an en dash`);
    assert.equal(EMOJI_RE.test(text), false, `${file} contains an emoji`);
    assert.doesNotMatch(text, /\.single\(/, `${file} must use .maybeSingle()`);
  }
});
