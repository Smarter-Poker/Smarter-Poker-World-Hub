import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { ApiError } from '../src/lib/horses/apiEnvelope.js';
import { handle, spec } from '../pages/api/horses/integrity-admin.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const routeSource = await readFile(
  path.join(HERE, '..', 'pages/api/horses/integrity-admin.js'),
  'utf8'
);

const OPERATOR_ID = '11111111-1111-4111-8111-111111111111';
const CASE_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_A = '33333333-3333-4333-8333-333333333333';
const SUBJECT_B = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const RESTRICTION_ID = '66666666-6666-4666-8666-666666666666';
const APPROVAL_ID = '77777777-7777-4777-8777-777777777777';

const HEALTH = Object.freeze({
  ok: true,
  state: 'degraded',
  measured_at: '2026-09-06T12:00:00.000Z',
  worker: {
    status: 'live',
    stale: true,
    has_unscanned_gap: true,
    seconds_behind: 864,
    catching_up: false,
    detection_span_minutes: 30,
    detection_thresholds: { aggregates_across_runs: false },
  },
  latest_cron: {
    job_name: 'collusion-scan',
    status: 'success',
    started_at: '2026-09-06T11:30:00.000Z',
    completed_at: '2026-09-06T11:30:08.000Z',
    duration_ms: 8000,
    error: null,
    result: { scannedHands: 11924 },
  },
  daily_scans: {},
  sources: {},
  source_errors: [],
});

function makeDb(overrides = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const answer = Object.prototype.hasOwnProperty.call(overrides, name)
        ? overrides[name]
        : name === 'fn_ca_integrity_detector_health'
          ? { data: HEALTH, error: null }
          : name === 'fn_ca_integrity_case'
            ? { data: { ok: true, case: { id: CASE_ID, status: 'decided', decision: 'warned' }, items: [] }, error: null }
          : { data: { ok: true }, error: null };
      return typeof answer === 'function' ? answer(args, calls) : answer;
    },
  };
}

function makeOp(db, permissions = ['players.read', 'moderation.write', 'money.write']) {
  return {
    db,
    user: { id: OPERATOR_ID },
    role: 'god',
    permissions,
    policy: {
      approvalsEnabled: true,
      allowSelfApproveWhenAlone: false,
      approvalTtlMinutes: 1440,
    },
    requestId: 'phase5-test-request',
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headersSent: false,
    writableEnded: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      this.writableEnded = true;
      return body;
    },
  };
}

function context({ method = 'GET', query = {}, body = {}, db, permissions, res } = {}) {
  const database = db || makeDb();
  return {
    method,
    query,
    body,
    db: database,
    op: makeOp(database, permissions),
    req: {
      method,
      headers: {
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        'user-agent': 'Phase Five Test',
      },
    },
    res: res || makeRes(),
    requestId: 'phase5-test-request',
  };
}

async function rejectsCode(promise, code, status = null) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, code);
    if (status !== null) assert.equal(error.status, status);
    return true;
  });
}

test('the route has one operator door and the correct permission floor', () => {
  assert.match(routeSource, /export default withOperatorRoute\(spec, handle\)/);
  assert.ok(!/createClient\(/.test(routeSource));
  assert.deepEqual(spec.methods, ['GET', 'POST']);
  assert.equal(spec.permission.GET, 'players.read');
  assert.equal(spec.permission.POST, 'moderation.write');
  assert.deepEqual(spec.durable.POST, { max: 30, windowSeconds: 60 });
});

test('every read gets live health first and preserves full cron and gap detail', async () => {
  for (const section of ['queue', 'case', 'pairs', 'flags', 'timing', 'hands', 'health']) {
    const db = makeDb({
      fn_ca_integrity_queue: {
        data: {
          ok: true,
          state: 'review_available',
          groups: [],
          totals: { groups: 0 },
        },
        error: null,
      },
      fn_ca_integrity_case: { data: { ok: true, case: { id: CASE_ID }, items: [] }, error: null },
    });
    const query = section === 'case' ? { section, caseId: CASE_ID } : { section };
    const answer = await handle(context({ query, db }));
    assert.equal(db.calls[0].name, 'fn_ca_integrity_detector_health', `${section} skipped health`);
    assert.deepEqual(db.calls[0].args, { p_stale_after_minutes: 30 });
    assert.equal(answer.health.worker.has_unscanned_gap, true);
    assert.equal(answer.health.status, 'live', 'the established worker health stays directly readable');
    assert.equal(answer.health.stale, true);
    assert.equal(answer.health.worker.detection_thresholds.aggregates_across_runs, false);
    assert.equal(answer.health.latest_cron.status, 'success');
    assert.equal(answer.health.latest_cron.duration_ms, 8000);
  }
});

test('the queue defaults to all players and forwards ranked cursor filters to the RPC', async () => {
  const db = makeDb({
    fn_ca_integrity_queue: {
      data: {
        ok: true,
        state: 'review_available',
        groups: [{ player_a_id: SUBJECT_A, player_b_id: SUBJECT_B }],
        totals: {
          groups: 6508,
          observations: 6515,
          by_tier: { chip_dump: 425, timing_only: 6078 },
          by_pattern: {},
          by_composition: { horse_horse: 6504, horse_human: 4, human_human: 0 },
          by_source: {},
        },
        next_cursor: { tier_rank: 4, distinct_window_count: 2 },
      },
      error: null,
    },
  });
  const cursor = {
    tier_rank: 4,
    distinct_window_count: 3,
    absolute_net_flow: null,
    gross_flow: 500,
    sample_size: 20,
    last_seen: '2026-09-06T11:00:00Z',
    player_a_id: SUBJECT_A,
    player_b_id: SUBJECT_B,
  };
  const answer = await handle(context({
    db,
    query: {
      section: 'queue',
      tier: 'CHIP_DUMP',
      pattern: 'chip_dump',
      composition: 'HORSE_HORSE',
      cursor: JSON.stringify(cursor),
      limit: '25',
      asOf: '2026-09-06T12:00:00Z',
    },
  }));
  const call = db.calls.find((entry) => entry.name === 'fn_ca_integrity_queue');
  assert.deepEqual(call.args, {
    p_include_horses: true,
    p_composition: 'horse_horse',
    p_tier: 'chip_dump',
    p_pattern: 'CHIP_DUMP',
    p_as_of: '2026-09-06T12:00:00.000Z',
    p_limit: 25,
    p_cursor: cursor,
  });
  assert.equal(answer.state, 'review_available');
  assert.equal(answer.queueState, 'review_available');
  assert.strictEqual(answer.rows, answer.groups);
  assert.equal(answer.totals.by_composition.horse_horse, 6504);
  assert.equal(answer.total, 6508);
  assert.deepEqual(answer.tierTotals, { chip_dump: 425, timing_only: 6078 });
  assert.deepEqual(answer.compositionTotals, { horse_horse: 6504, horse_human: 4, human_human: 0 });
  assert.deepEqual(answer.nextCursor, { tier_rank: 4, distinct_window_count: 2 });
  assert.equal(answer.hasMore, true);
});

test('horse exclusion is never implicit and an explicit view filter remains possible', async () => {
  const db = makeDb({
    fn_ca_integrity_queue: {
      data: { ok: true, queue_state: 'nothing_to_review', rows: [], totals: { groups: 0 } },
      error: null,
    },
  });
  const answer = await handle(context({ db, query: { section: 'queue', includeHorses: 'false' } }));
  const call = db.calls.find((entry) => entry.name === 'fn_ca_integrity_queue');
  assert.equal(call.args.p_include_horses, false);
  assert.equal(answer.state, 'nothing_to_review');
  assert.strictEqual(answer.groups, answer.rows);
  assert.match(routeSource, /queryBoolean\(query\.includeHorses, true\)/);
});

test('each non-health section maps to its one service-role RPC with bounded arguments', async () => {
  const cases = [
    ['case', { caseId: CASE_ID }, 'fn_ca_integrity_case', { p_case_id: CASE_ID }],
    ['pairs', {}, 'fn_ca_integrity_pairs', {
      p_include_horses: true, p_composition: 'all', p_limit: 50, p_cursor: null,
    }],
    ['flags', {}, 'fn_ca_integrity_flags', { p_limit: 50, p_cursor: null }],
    ['timing', { limit: '400', since: '2026-09-01' }, 'fn_ca_integrity_timing', {
      p_include_horses: true,
      p_since: '2026-09-01T00:00:00.000Z',
      p_hand_limit: 400,
    }],
    ['hands', { playerId: SUBJECT_A, pairPlayerId: SUBJECT_B }, 'fn_ca_integrity_hands', {
      p_player_id: SUBJECT_A,
      p_pair_player_id: SUBJECT_B,
      p_limit: 50,
      p_cursor: null,
    }],
  ];

  for (const [section, extra, rpc, args] of cases) {
    const db = makeDb();
    await handle(context({ db, query: { section, ...extra } }));
    assert.deepEqual(db.calls.find((entry) => entry.name === rpc)?.args, args);
  }
});

test('malformed and oversized read parameters are rejected before the content RPC', async () => {
  for (const query of [
    { section: 'queue', limit: '101' },
    { section: 'queue', includeHorses: 'sometimes' },
    { section: 'queue', composition: 'horses_only' },
    { section: 'queue', cursor: '{bad json' },
    { section: 'queue', cursor: JSON.stringify({ value: 'x'.repeat(5000) }) },
    { section: 'timing', handLimit: '1001' },
    { section: 'case', caseId: 'not-a-uuid' },
  ]) {
    const db = makeDb();
    await assert.rejects(handle(context({ db, query })), ApiError);
    assert.deepEqual(
      db.calls.map((entry) => entry.name),
      ['fn_ca_integrity_detector_health'],
      `content RPC ran for ${JSON.stringify(query)}`
    );
  }
});

test('transport failures and malformed payloads are unavailable, never empty', async () => {
  const transport = makeDb({
    fn_ca_integrity_queue: { data: null, error: { message: 'relation secret_table does not exist' } },
  });
  await rejectsCode(
    handle(context({ db: transport, query: { section: 'queue' } })),
    'fn_ca_integrity_queue_unavailable',
    503
  );

  const malformed = makeDb({
    fn_ca_integrity_queue: { data: { ok: true, groups: [] }, error: null },
  });
  await rejectsCode(
    handle(context({ db: malformed, query: { section: 'queue' } })),
    'fn_ca_integrity_queue_unavailable',
    503
  );

  const thrown = makeDb({
    fn_ca_integrity_queue: async () => {
      throw new Error('socket closed');
    },
  });
  await rejectsCode(
    handle(context({ db: thrown, query: { section: 'queue' } })),
    'fn_ca_integrity_queue_unavailable',
    503
  );

  const incompleteHealth = makeDb({
    fn_ca_integrity_detector_health: {
      data: { ok: true, state: 'live', worker: HEALTH.worker },
      error: null,
    },
  });
  await rejectsCode(
    handle(context({ db: incompleteHealth, query: { section: 'health' } })),
    'fn_ca_integrity_detector_health_unavailable',
    503
  );
});

test('structured RPC refusals keep an actionable code and honest status', async () => {
  const stale = makeDb({
    fn_ca_integrity_case_assign: {
      data: { ok: false, code: 'STALE_VERSION', message: 'raw message is not needed' },
      error: null,
    },
  });
  await rejectsCode(handle(context({
    method: 'POST',
    db: stale,
    body: {
      action: 'assign',
      caseId: CASE_ID,
      assignedTo: OPERATOR_ID,
      expectedVersion: 2,
      opId: 'assign-case-0001',
    },
  })), 'stale_version', 409);

  const undecided = makeDb({
    fn_ca_integrity_sanction: {
      data: { ok: false, code: 'DECISION_REQUIRED', message: 'private database wording' },
      error: null,
    },
  });
  await assert.rejects(
    handle(context({
      method: 'POST',
      db: undecided,
      body: {
        action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'warning',
        note: 'Formal warning follows the case decision', opId: 'warning-00000003',
      },
    })),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'decision_required');
      assert.equal(error.message, 'Record A Human Decision Before Applying A Sanction');
      return true;
    }
  );

  const sourceFailure = makeDb({
    fn_ca_integrity_queue: {
      data: { ok: false, code: 'QUEUE_SOURCE_ERROR', message: 'relation private_name failed' },
      error: null,
    },
  });
  await assert.rejects(
    handle(context({ db: sourceFailure, query: { section: 'queue' } })),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'queue_source_error');
      assert.equal(error.message, 'The Integrity Queue Sources Could Not Be Read');
      assert.ok(!error.message.includes('private_name'));
      return true;
    }
  );
});

test('all case writes use their dedicated RPC, actor, idempotency key and request context', async () => {
  const actions = [
    ['open_case', {
      subjectIds: [SUBJECT_A, SUBJECT_B], kind: 'collusion', severity: 'high', note: 'Linked pair',
    }, 'fn_ca_integrity_case_open'],
    ['add_item', {
      caseId: CASE_ID, itemType: 'hand', itemRef: 'hand:abc', detail: { tableId: 't-1' },
    }, 'fn_ca_integrity_case_add_item'],
    ['retract_item', {
      caseId: CASE_ID, itemId: ITEM_ID, reason: 'Attached to the wrong case',
    }, 'fn_ca_integrity_case_retract_item'],
    ['assign', {
      caseId: CASE_ID, assignedTo: OPERATOR_ID, expectedVersion: 1,
    }, 'fn_ca_integrity_case_assign'],
    ['decide', {
      caseId: CASE_ID, decision: 'no_action', decisionNote: 'Evidence does not support action',
    }, 'fn_ca_integrity_case_decide'],
    ['close', {
      caseId: CASE_ID, closeNote: 'Review and decision are complete',
    }, 'fn_ca_integrity_case_close'],
  ];

  for (const [action, fields, rpc] of actions) {
    const db = makeDb();
    await handle(context({
      method: 'POST',
      db,
      body: { action, ...fields, opId: `${action}-00000001` },
    }));
    const calls = db.calls.filter((entry) => entry.name === rpc);
    assert.equal(calls.length, 1, `${action} did not call exactly one write RPC`);
    assert.equal(calls[0].args.p_actor, OPERATOR_ID);
    assert.equal(calls[0].args.p_op_id, `${action}-00000001`);
    assert.equal(calls[0].args.p_ip_address, '203.0.113.7');
    assert.equal(calls[0].args.p_user_agent, 'Phase Five Test');
    assert.equal(calls[0].args.p_request_id, 'phase5-test-request');
    assert.equal(
      db.calls.some((entry) => entry.name === 'fn_log_admin_action'),
      false,
      'the write RPC owns its one audit row; the route must not duplicate it'
    );
  }
});

test('evidence is retracted through an append-only RPC and never deleted', () => {
  const code = routeSource
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.match(code, /fn_ca_integrity_case_retract_item/);
  assert.ok(!/\.delete\s*\(/.test(code));
  assert.ok(!/\.update\s*\(/.test(code));
  assert.ok(!/\.single\s*\(/.test(code), 'there is no unsafe single-row PostgREST read');
});

test('a sanction cannot be raised straight from a detector finding', async () => {
  const db = makeDb();
  await assert.rejects(handle(context({
    method: 'POST',
    db,
    body: {
      action: 'sanction',
      findingId: ITEM_ID,
      subjectId: SUBJECT_A,
      kind: 'warning',
      note: 'This warning has a recorded reason',
      opId: 'warning-00000001',
    },
  })), /Case Id/);
  assert.equal(db.calls.length, 0);
});

test('warning and restriction sanctions only record case-owned canonical state', async () => {
  const warningDb = makeDb();
  await handle(context({
    method: 'POST',
    db: warningDb,
    body: {
      action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'warning',
      note: 'Formal warning recorded for this case', opId: 'warning-00000002',
    },
  }));
  const warning = warningDb.calls.find((entry) => entry.name === 'fn_ca_integrity_sanction');
  assert.equal(warning.args.p_case_id, CASE_ID);
  assert.equal(warning.args.p_restriction_id, null);
  assert.equal(warning.args.p_amount, null);
  assert.equal(warningDb.calls.some((entry) => entry.name.includes('player_restrict')), false);

  const restrictionDb = makeDb({
    fn_ca_integrity_case: {
      data: { ok: true, case: { id: CASE_ID, status: 'decided', decision: 'restricted' }, items: [] },
      error: null,
    },
  });
  await handle(context({
    method: 'POST',
    db: restrictionDb,
    body: {
      action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'restriction',
      restrictionId: RESTRICTION_ID, note: 'Existing restriction recorded on this case',
      opId: 'restriction-0001',
    },
  }));
  const restriction = restrictionDb.calls.find((entry) => entry.name === 'fn_ca_integrity_sanction');
  assert.equal(restriction.args.p_restriction_id, RESTRICTION_ID);
});

test('confiscation needs money.write before an approval can be raised', async () => {
  const db = makeDb({
    fn_ca_integrity_case: {
      data: { ok: true, case: { id: CASE_ID, status: 'decided', decision: 'confiscated' }, items: [] },
      error: null,
    },
  });
  await rejectsCode(handle(context({
    method: 'POST',
    db,
    permissions: ['players.read', 'moderation.write'],
    body: {
      action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'confiscation',
      amount: '100.00', note: 'Confiscation requested after case review', opId: 'confiscate-0001',
    },
  })), 'money_write_required', 403);
  assert.deepEqual(db.calls.map((entry) => entry.name), ['fn_ca_integrity_case']);
});

test('an undecided or mismatched case cannot create a confiscation approval', async () => {
  for (const [status, decision, code] of [
    ['investigating', null, 'decision_required'],
    ['decided', 'warned', 'sanction_decision_mismatch'],
  ]) {
    const db = makeDb({
      fn_ca_integrity_case: {
        data: { ok: true, case: { id: CASE_ID, status, decision }, items: [] },
        error: null,
      },
    });
    await rejectsCode(handle(context({
      method: 'POST',
      db,
      body: {
        action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'confiscation',
        amount: '100.00', note: 'Confiscation requested after case review', opId: `block-${code}`,
      },
    })), code, 409);
    assert.deepEqual(db.calls.map((entry) => entry.name), ['fn_ca_integrity_case']);
  }
});

test('a pending confiscation returns 202 without writing a sanction or moving chips', async () => {
  const db = makeDb({
    fn_ca_integrity_case: {
      data: { ok: true, case: { id: CASE_ID, status: 'decided', decision: 'confiscated' }, items: [] },
      error: null,
    },
    fn_ca_operator_request_approval: {
      data: { ok: true, required: true, approval_id: APPROVAL_ID, status: 'pending' },
      error: null,
    },
  });
  const res = makeRes();
  await handle(context({
    method: 'POST',
    db,
    res,
    body: {
      action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'confiscation',
      amount: '250.25', note: 'Case evidence supports proposed confiscation',
      opId: 'confiscate-0002',
    },
  }));
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.pending, true);
  assert.equal(res.body.noChipsMoved, true);
  assert.equal(res.body.executionRequired, true);
  assert.equal(db.calls.some((entry) => entry.name === 'fn_ca_integrity_sanction'), false);
  assert.deepEqual(db.calls.map((entry) => entry.name), [
    'fn_ca_integrity_case',
    'fn_ca_operator_request_approval',
  ]);
});

test('an approved confiscation replay records the ledger only and does not close the approval', async () => {
  const db = makeDb({
    fn_ca_integrity_case: {
      data: { ok: true, case: { id: CASE_ID, status: 'decided', decision: 'confiscated' }, items: [] },
      error: null,
    },
    fn_ca_operator_request_approval: {
      data: { ok: true, required: false, approval_id: APPROVAL_ID, status: 'approved' },
      error: null,
    },
    fn_ca_integrity_sanction: {
      data: { ok: true, state: 'approved', sanction: { id: ITEM_ID, applied_at: null } },
      error: null,
    },
  });
  const answer = await handle(context({
    method: 'POST',
    db,
    body: {
      action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'confiscation',
      amount: '250.25', note: 'Case evidence supports proposed confiscation',
      opId: 'confiscate-0002',
    },
  }));
  assert.deepEqual(db.calls.map((entry) => entry.name), [
    'fn_ca_integrity_case',
    'fn_ca_operator_request_approval',
    'fn_ca_integrity_sanction',
  ]);
  const sanction = db.calls[2].args;
  assert.equal(sanction.p_approval_id, APPROVAL_ID);
  assert.equal(sanction.p_amount, 250.25);
  assert.equal(answer.noChipsMoved, true);
  assert.equal(answer.executionRequired, true);
  assert.equal(db.calls.some((entry) => entry.name === 'fn_ca_operator_mark_executed'), false);
});

test('the route has no chip movement path and sanction is not an executable approval kind', () => {
  const code = routeSource
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  for (const forbidden of [
    'fn_ca_mint',
    'fn_ca_burn',
    'fn_ca_fund_club',
    'chip_ledger',
    'atomic_table_buyin',
    'markApprovalExecuted',
  ]) {
    assert.ok(!code.includes(forbidden), `${forbidden} must not be reachable here`);
  }
  assert.match(code, /approvalPendingResponse/);
  assert.match(code, /fn_ca_integrity_sanction/);
});

test('every mutation requires a bounded idempotency key before its write RPC', async () => {
  const bodies = [
    { action: 'open_case', subjectIds: [SUBJECT_A], kind: 'other' },
    { action: 'add_item', caseId: CASE_ID, itemType: 'note', itemRef: 'note:one' },
    { action: 'retract_item', caseId: CASE_ID, itemId: ITEM_ID, reason: 'Wrong evidence item' },
    { action: 'assign', caseId: CASE_ID, assignedTo: OPERATOR_ID },
    { action: 'decide', caseId: CASE_ID, decision: 'no_action', decisionNote: 'No action is supported' },
    { action: 'close', caseId: CASE_ID, closeNote: 'The review is complete' },
    {
      action: 'sanction', caseId: CASE_ID, subjectId: SUBJECT_A, kind: 'warning',
      note: 'Warning reason is recorded here',
    },
  ];
  for (const body of bodies) {
    const db = makeDb();
    await assert.rejects(handle(context({ method: 'POST', db, body })), /Idempotency Key/);
    assert.equal(db.calls.length, 0, `${body.action} wrote before checking its key`);
  }
});
