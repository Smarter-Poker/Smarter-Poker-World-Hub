import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFloorAdmin, floorAdminSpec } from '../pages/api/horses/floor-admin.js';
import { clearFloorEngineCacheForTests } from '../src/lib/horses/floorAdmin.js';
import { payloadFor } from '../src/lib/horses/approvals.js';

const ID = '11111111-1111-4111-8111-111111111111';

function queryResult(result, calls, table) {
  const query = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve) => resolve(result);
      return (...args) => {
        calls.push({ table, method: String(prop), args });
        if (prop === 'range' || prop === 'maybeSingle') return Promise.resolve(result);
        return query;
      };
    },
  });
  return query;
}

function makeDb(results = {}, rpcResults = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ table, method: 'from', args: [] });
      const configured = results[table];
      const result = Array.isArray(configured) ? configured.shift() : configured;
      return queryResult(result || { data: [], count: 0, error: null }, calls, table);
    },
    async rpc(name, args) {
      calls.push({ method: 'rpc', name, args });
      const configured = rpcResults[name];
      return (Array.isArray(configured) ? configured.shift() : configured) || { data: [], error: null };
    },
  };
}

function context(section, db, permissions = ['console.read', 'clubs.read', 'money.read']) {
  return { db, query: { section, tournamentId: ID, tableId: ID }, op: { user: { id: ID }, permissions }, requestId: 'phase6-test' };
}

test('Phase 6 route keeps reads and export-receipt writes independently limited', () => {
  assert.deepEqual(floorAdminSpec.methods, ['GET', 'POST']);
  assert.deepEqual(floorAdminSpec.permission, { GET: 'console.read', POST: 'console.read' });
  assert.deepEqual(floorAdminSpec.limit, { GET: 'read', POST: 'write' });
});

test('a prepared export files one actor-bound audit row without claiming browser delivery completed', async () => {
  const db = makeDb({}, { fn_log_admin_action: { data: ID, error: null } });
  const op = { user: { id: ID }, role: 'operator', permissions: ['console.read', 'clubs.read'], db, requestId: 'export-request' };
  const result = await handleFloorAdmin({ op, db, method: 'POST', query: {}, requestId: 'export-request', req: { headers: { 'user-agent': 'test' } }, body: { action: 'record_export_prepared', exportId: ID, section: 'floor', filters: { status: 'live' }, rowCount: 42, complete: true } });
  assert.equal(result.recorded, true);
  const audits = db.calls.filter((call) => call.method === 'rpc' && call.name === 'fn_log_admin_action');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].args.p_action, 'floor.export_prepared');
  assert.deepEqual(audits[0].args.p_details, { section: 'floor', filters: { status: 'live' }, row_count: 42, complete: true, delivery: 'browser_download_requested' });
});

test('club suspension requires clubs.write, a ten character reason and writes a before-after audit', async () => {
  const db = makeDb({ clubs: [
    { data: { id: ID, name: 'One', status: 'active' }, error: null },
    { data: { id: ID, name: 'One', status: 'suspended' }, error: null },
  ] }, { fn_log_admin_action: { data: ID, error: null } });
  await assert.rejects(() => handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read'], db }, db, method: 'POST', req: {}, body: { action: 'set_club_status', clubId: ID, status: 'suspended', reason: 'Operational review' } }), (error) => error.status === 403);
  await assert.rejects(() => handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'clubs.write'], db }, db, method: 'POST', req: {}, body: { action: 'set_club_status', clubId: ID, status: 'suspended', reason: 'short' } }), (error) => error.code === 'invalid_reason');
  const result = await handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'clubs.write'], db }, db, method: 'POST', req: {}, body: { action: 'set_club_status', clubId: ID, status: 'suspended', reason: 'Operational review' } });
  assert.equal(result.club.status, 'suspended');
  assert.match(result.disclosure, /Tables Were Not Closed/);
  const audit = db.calls.find((call) => call.name === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'club.set_status');
  assert.equal(audit.args.p_details.reason, 'Operational review');
});

test('club funding uses maker-checker and the authoritative idempotency parameter', async () => {
  const db = makeDb({ clubs: { data: { id: ID, name: 'One', status: 'active', chip_treasury: '10.00' }, error: null } }, {
    fn_ca_operator_request_approval: { data: { required: false, status: 'auto_approved', approval_id: ID }, error: null },
    fn_ca_fund_club: { data: { ok: true, balance_before: '10.00', balance_after: '12.50', replayed: false }, error: null },
    fn_ca_operator_mark_executed: { data: { ok: true }, error: null },
    fn_log_admin_action: { data: ID, error: null },
  });
  const result = await handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'money.write'], policy: { approvalsEnabled: false }, db, requestId: 'fund-test' }, db, method: 'POST', req: {}, res: {}, body: { action: 'fund_club', clubId: ID, amount: '2.50', reason: 'Approved club funding', opId: ID } });
  assert.equal(result.funded, true);
  const fund = db.calls.find((call) => call.name === 'fn_ca_fund_club');
  assert.deepEqual(fund.args, { p_club_id: ID, p_amount: 2.5, p_reason: 'Approved club funding', p_idempotency_key: ID });
  assert.equal(Object.hasOwn(fund.args, 'p_op_id'), false);
});

test('an export receipt cannot bypass its source section permission', async () => {
  const db = makeDb(); const op = { user: { id: ID }, permissions: ['console.read'], db };
  await assert.rejects(() => handleFloorAdmin({ op, db, method: 'POST', query: {}, body: { action: 'record_export_prepared', exportId: ID, section: 'rake', rowCount: 1, complete: true } }), (error) => error.status === 403 && error.code === 'permission_denied');
});

test('chip approval uses the row op_id, maker-checker and one atomic decision RPC', async () => {
  const db = makeDb({ chip_requests: { data: { id: ID, club_id: ID, requester_id: ID, amount: '25.00', status: 'pending', responded_by: null, responded_at: null, op_id: ID }, error: null } }, {
    fn_ca_operator_request_approval: { data: { required: false, status: 'auto_approved', approval_id: ID }, error: null },
    fn_ca_operator_decide_chip_request: { data: { ok: true, status: 'approved', replayed: false }, error: null },
    fn_ca_operator_mark_executed: { data: { ok: true }, error: null },
    fn_log_admin_action: { data: ID, error: null },
  });
  const result = await handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'cashier.write'], policy: { approvalsEnabled: false }, db, requestId: 'chip-approve' }, db, method: 'POST', req: {}, res: {}, body: { action: 'decide_chip_request', requestId: ID, decision: 'approve' } });
  assert.equal(result.status, 'approved');
  const decision = db.calls.find((call) => call.name === 'fn_ca_operator_decide_chip_request');
  assert.deepEqual(decision.args, { p_request_id: ID, p_action: 'approve', p_actor_id: ID, p_expected_op_id: ID, p_expected_amount: 25 });
  const approval = db.calls.find((call) => call.name === 'fn_ca_operator_request_approval');
  assert.equal(approval.args.p_op_id, ID);
  assert.equal(approval.args.p_kind, 'fund_club');
  assert.equal(db.calls.filter((call) => call.name === 'fn_ca_operator_decide_chip_request').length, 1);
  const audit = db.calls.find((call) => call.name === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'chip_request.approve');
});

test('a gated chip approval remains pending and moves nothing', async () => {
  const db = makeDb({ chip_requests: { data: { id: ID, club_id: ID, requester_id: ID, amount: '25.00', status: 'pending', op_id: ID }, error: null } }, {
    fn_ca_operator_request_approval: { data: { required: true, status: 'pending', approval_id: ID }, error: null },
    fn_log_admin_action: { data: ID, error: null },
  });
  const response = { code: null, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return payload; } };
  const payload = await handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'cashier.write', 'money.write'], policy: { approvalsEnabled: true, fundThreshold: 10 }, db, requestId: 'chip-gated' }, db, method: 'POST', req: {}, res: response, body: { action: 'decide_chip_request', requestId: ID, decision: 'approve' } });
  assert.equal(response.code, 202);
  assert.equal(payload.pending, true);
  assert.match(payload.message, /Still Pending And No Chips Moved/);
  assert.equal(db.calls.some((call) => call.name === 'fn_ca_operator_decide_chip_request'), false);
  assert.equal(db.calls.some((call) => call.table === 'chip_requests' && call.method === 'update'), false);
});

test('fund-threshold chip approval additionally requires money.write', async () => {
  const db = makeDb({ chip_requests: { data: { id: ID, club_id: ID, requester_id: ID, amount: '25.00', status: 'pending', op_id: ID }, error: null } });
  await assert.rejects(
    () => handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'cashier.write'], policy: { approvalsEnabled: true, fundThreshold: 10 }, db }, db, method: 'POST', req: {}, res: {}, body: { action: 'decide_chip_request', requestId: ID, decision: 'approve' } }),
    (error) => error.status === 403 && error.code === 'permission_denied',
  );
  assert.equal(db.calls.some((call) => call.name === 'fn_ca_operator_request_approval'), false);
  assert.equal(db.calls.some((call) => call.name === 'fn_ca_operator_decide_chip_request'), false);
});

test('an approved fund_club chip payload executes the atomic decision RPC, not bare funding', () => {
  const shaped = payloadFor('fund_club')({
    action: 'fund_club', clubId: ID, amount: 25, reason: `Approved chip request ${ID}`,
    opId: ID, chipRequestId: ID, actorId: ID,
  }, ID);
  assert.equal(shaped.ok, true);
  assert.equal(shaped.rpc, 'fn_ca_operator_decide_chip_request');
  assert.deepEqual(shaped.args, {
    p_request_id: ID, p_action: 'approve', p_actor_id: ID,
    p_expected_op_id: ID, p_expected_amount: 25,
  });
  assert.equal(shaped.summary.chipRequestId, ID);
});

test('event payout reconciliation is always a dry run and overlay absence remains absence', async () => {
  const db = makeDb({
    tournaments: { data: { id: ID, name: 'Event', status: 'running' }, error: null },
    tournament_players: { data: null, count: 12, error: null },
    tournament_guarantee_overlays: { data: null, error: null },
    tournament_cancellation_receipts: { data: null, error: null },
  }, { fn_tournament_payout_reconcile: { data: { ok: true }, error: null } });
  const payload = await handleFloorAdmin(context('event', db));
  const call = db.calls.find((item) => item.method === 'rpc');
  assert.deepEqual(call, { method: 'rpc', name: 'fn_tournament_payout_reconcile', args: { p_tournament_id: ID, p_apply: false } });
  assert.equal(payload.overlay, null);
  assert.equal(payload.overlayState, 'not_recorded');
  assert.equal(payload.payoutAuditMode, 'dry_run');
});

test('the tournament window payout audit is permission-gated and always a dry run', async () => {
  const db = makeDb({ tournaments: [
    { data: [], count: 0, error: null },
    { data: null, count: 0, error: null },
  ] }, { fn_tournament_payout_sweep: { data: { checked: 14 }, error: null } });
  const payload = await handleFloorAdmin(context('tournaments', db));
  const sweep = db.calls.find((call) => call.name === 'fn_tournament_payout_sweep');
  assert.deepEqual(sweep.args, { p_days: 7, p_apply: false, p_limit: 200 });
  assert.equal(payload.payoutWindowAuditMode, 'dry_run');
  assert.equal(payload.payoutWindowAuditState, 'ready');

  const withoutMoney = makeDb({ tournaments: [
    { data: [], count: 0, error: null },
    { data: null, count: 0, error: null },
  ] });
  const limited = await handleFloorAdmin(context('tournaments', withoutMoney, ['console.read', 'clubs.read']));
  assert.equal(limited.payoutWindowAuditState, 'permission_required');
  assert.equal(withoutMoney.calls.some((call) => call.name === 'fn_tournament_payout_sweep'), false);
});

test('club detail marks dependent failures partial and exposes exact all-member chips with honest unavailable fields', async () => {
  const db = makeDb({
    clubs: { data: { id: ID, name: 'One', status: 'active', chip_treasury: '20.00' }, error: null },
    club_members: [
      { data: [{ club_id: ID, user_id: ID, chip_balance: '1.10' }], count: 2, error: null },
      { data: [{ chip_balance: '1.10' }, { chip_balance: '2.25' }], error: null },
    ],
    settlement_periods: { data: null, error: new Error('settlement unavailable') },
  });
  const payload = await handleFloorAdmin({ ...context('club', db), query: { section: 'club', clubId: ID } });
  assert.equal(payload.state, 'club.partial');
  assert.equal(payload.memberChips.amount, '3.35');
  assert.equal(payload.memberChips.scope, 'all_members');
  assert.equal(payload.stopLossVsDeposit.state, 'unavailable_no_authoritative_source');
  assert.equal(payload.clubHealth.state, 'unavailable_operator_authority_mismatch');
  assert.ok(payload.failedSources.includes('settlement_period read failed'));
});

test('terminal and deleted club states cannot be resurrected or funded', async () => {
  const statusDb = makeDb({ clubs: { data: { id: ID, name: 'Closed', status: 'deleted' }, error: null } });
  await assert.rejects(
    () => handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'clubs.write'], db: statusDb }, db: statusDb, method: 'POST', req: {}, body: { action: 'set_club_status', clubId: ID, status: 'active', reason: 'Restore this deleted club' } }),
    (error) => error.status === 409 && error.code === 'club_terminal',
  );
  assert.equal(statusDb.calls.some((call) => call.method === 'update'), false);

  const fundDb = makeDb({ clubs: { data: { id: ID, name: 'Closed', status: 'archived', chip_treasury: '0.00' }, error: null } });
  await assert.rejects(
    () => handleFloorAdmin({ op: { user: { id: ID }, permissions: ['console.read', 'money.write'], db: fundDb }, db: fundDb, method: 'POST', req: {}, body: { action: 'fund_club', clubId: ID, amount: '1.00', reason: 'Fund this archived club', opId: ID } }),
    (error) => error.status === 409 && error.code === 'club_terminal',
  );
  assert.equal(fundDb.calls.some((call) => call.name === 'fn_ca_fund_club'), false);
});

test('union detail includes money-permission-gated rake-share oversight', async () => {
  const empty = { data: [], count: 0, error: null };
  const db = makeDb({
    unions: { data: { id: ID, name: 'Union One' }, error: null },
    union_clubs: empty, union_settlement_rounds: empty, union_presettlements: empty,
    union_applications: empty, union_leave_requests: empty,
  }, { fn_union_rake_by_club: { data: [{ club_id: ID, rake: '4.20' }], error: null } });
  const payload = await handleFloorAdmin({ ...context('union', db), query: { section: 'union', unionId: ID } });
  assert.equal(payload.rakeShareState, 'ready');
  assert.equal(payload.rakeShareWindowDays, 30);
  const call = db.calls.find((item) => item.name === 'fn_union_rake_by_club');
  assert.deepEqual(call.args, { p_union_id: ID, p_days: 30 });
  assert.deepEqual(
    db.calls
      .filter((item) => item.method === 'order' && ['union_settlement_rounds', 'union_applications', 'union_leave_requests'].includes(item.table))
      .map((item) => [item.table, item.args[0]]),
    [
      ['union_settlement_rounds', 'executed_at'],
      ['union_applications', 'applied_at'],
      ['union_leave_requests', 'requested_at'],
    ],
  );
});

test('cashout queue reports never-used, none-pending and unknown as different states', async () => {
  const neverRow = { data: [], count: 0, error: null };
  const never = await handleFloorAdmin(context('cashouts', makeDb({ cashout_requests: [neverRow, neverRow, neverRow] })));
  assert.equal(never.state, 'queue.empty_none_ever');
  const quiet = await handleFloorAdmin(context('cashouts', makeDb({ cashout_requests: [
    { data: [{ id: ID, status: 'completed' }], count: 1, error: null },
    { data: null, count: 1, error: null },
    { data: null, count: 0, error: null },
  ] })));
  assert.equal(quiet.state, 'queue.empty_none_pending');
  const failed = { data: null, count: null, error: new Error('unavailable') };
  const unknown = await handleFloorAdmin(context('cashouts', makeDb({ cashout_requests: [failed, failed, failed] })));
  assert.equal(unknown.state, 'queue.unknown');
});

test('section permissions are enforced beyond the console floor', async () => {
  await assert.rejects(
    () => handleFloorAdmin(context('rake', makeDb(), ['console.read', 'clubs.read'])),
    (error) => error.status === 403 && error.code === 'permission_denied'
  );
});

test('seat and profile uncertainty never becomes an empty or human composition', async () => {
  const seatFailure = new Error('seat source unavailable');
  const failedSeats = await handleFloorAdmin(context('table', makeDb({
    tables: { data: { id: ID, name: 'One' }, error: null },
    table_seats: { data: null, count: null, error: seatFailure },
  })));
  assert.equal(failedSeats.state, 'table.unknown');
  assert.deepEqual(failedSeats.composition, { occupied: null, horses: null, humans: null, unknown: null });

  const missingProfile = await handleFloorAdmin(context('table', makeDb({
    tables: { data: { id: ID, name: 'One' }, error: null },
    table_seats: { data: [{ table_id: ID, user_id: ID, seat_number: 1 }], count: 1, error: null },
    profiles: { data: [], error: null },
  })));
  assert.equal(missingProfile.state, 'table.unknown');
  assert.equal(missingProfile.seats.rows[0].playerType, 'unknown');
  assert.deepEqual(missingProfile.composition, { occupied: 1, horses: null, humans: null, unknown: 1, knownHorses: 0, knownHumans: 0 });
});

test('a clamped floor seat read makes every page composition unknown instead of undercounted', async () => {
  const originalFetch = globalThis.fetch;
  clearFloorEngineCacheForTests();
  globalThis.fetch = async () => ({ ok: true, async json() { return { activeTables: 1 }; } });
  try {
    const db = makeDb({
      tables: [
        { data: [{ id: ID, name: 'Full Table', status: 'active' }], count: 1, error: null },
        { data: null, count: 1, error: null },
      ],
      table_seats: { data: [{ table_id: ID, user_id: ID, seat_number: 1 }], count: 2, error: null },
      profiles: { data: [{ id: ID, is_horse: true }], error: null },
    });
    const payload = await handleFloorAdmin(context('floor', db));
    assert.equal(payload.state, 'floor.partial');
    assert.deepEqual(payload.tables.rows[0].composition, { occupied: null, horses: null, humans: null, unknown: null });
  } finally {
    globalThis.fetch = originalFetch;
    clearFloorEngineCacheForTests();
  }
});

test('announcement delivery health reads only completed dispatch runs', async () => {
  const db = makeDb({
    club_announcements: { data: [], count: 0, error: null },
    union_announcements: { data: [], count: 0, error: null },
    push_outbox: { data: null, count: 0, error: null },
    push_dispatch_runs: { data: { finished_at: '2026-10-05T12:00:00Z' }, error: null },
  });
  await handleFloorAdmin(context('announcements', db));
  assert.ok(db.calls.some((call) => call.table === 'push_dispatch_runs' && call.method === 'not' && call.args[0] === 'finished_at' && call.args[1] === 'is' && call.args[2] === null));
});

test('event readiness includes every source and an overlay read failure stays unknown', async () => {
  const db = makeDb({
    tournaments: { data: { id: ID, name: 'Event', status: 'running' }, error: null },
    tournament_players: { data: null, count: 12, error: null },
    tournament_guarantee_overlays: { data: null, error: new Error('overlay unavailable') },
    tournament_cancellation_receipts: { data: null, error: null },
  }, { fn_tournament_payout_reconcile: { data: { ok: true }, error: null } });
  const payload = await handleFloorAdmin(context('event', db));
  assert.equal(payload.state, 'event.partial');
  assert.equal(payload.overlay, null);
  assert.equal(payload.overlayState, 'unknown');
});

test('a null tournament registration remains null', async () => {
  const db = makeDb({
    tournaments: [
      { data: [{ id: ID, current_players: null }], count: 1, error: null },
      { data: null, count: 0, error: null },
    ],
  });
  const payload = await handleFloorAdmin(context('tournaments', db));
  assert.equal(payload.tournaments.rows[0].registered_count, null);
});

test('rake uses full-window database aggregates and preserves exact decimal strings', async () => {
  const amount = '9007199254740993.123456';
  const db = makeDb({
    rake_rate_audit: { data: [], error: null },
  }, {
    fn_ca_operator_rake_report: { data: [{ group_key: ID, label: 'Exact Club', rake_amount: amount, bbj_contribution: '0.000001', record_count: '9007199254740994', first_recorded_at: '2026-09-05T00:00:00Z', last_recorded_at: '2026-10-05T00:00:00Z', total_groups: 1, window_record_count: '9007199254740994' }], error: null },
    fn_ca_operator_rake_freshness: { data: [{ union_id: ID, union_name: 'Union', stale_days: [], checked_from: '2026-09-05', checked_to_exclusive: '2026-10-05', checked_at: '2026-10-05T00:00:00Z' }], error: null },
  });
  const payload = await handleFloorAdmin(context('rake', db));
  assert.equal(payload.rake.rows[0].rake_amount, amount);
  assert.equal(payload.rake.rows[0].bbj_contribution, '0.000001');
  assert.equal(payload.rake.rows[0].record_count, '9007199254740994');
  assert.equal(payload.rake.windowRecordCount, '9007199254740994');
  assert.equal(payload.rake.hasMore, false);
  assert.equal(payload.rake.complete, true);
  assert.equal(payload.rake.aggregateWindowComplete, true);
  assert.equal(payload.includesHorses, true);
  const report = db.calls.find((call) => call.name === 'fn_ca_operator_rake_report');
  assert.equal(report.args.p_dimension, 'club');
  assert.equal(report.args.p_limit, 50);
  assert.equal(report.args.p_offset, 0);
  assert.equal('p_include_horses' in report.args, false);
});

test('named stale rake days produce a stale report without triggering a catchup', async () => {
  const db = makeDb({ rake_rate_audit: { data: [], error: null } }, {
    fn_ca_operator_rake_report: { data: [{ group_key: ID, label: 'Club', rake_amount: '12.34', bbj_contribution: '0', record_count: '1', total_groups: 1, window_record_count: '1' }], error: null },
    fn_ca_operator_rake_freshness: { data: [{ union_id: ID, union_name: 'Union', stale_days: ['2026-10-02'], checked_from: '2026-09-05', checked_to_exclusive: '2026-10-05', checked_at: '2026-10-05T00:00:00Z' }], error: null },
  });
  const payload = await handleFloorAdmin(context('rake', db));
  assert.equal(payload.state, 'rake.stale');
  assert.deepEqual(payload.freshness.staleDays, ['2026-10-02']);
  assert.equal(db.calls.some((call) => /catchup|refresh_day/.test(call.name || '')), false);
});
