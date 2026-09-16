import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import * as transport from '../src/lib/club-arena/cashoutReceipt.mjs';
import { retainCashoutTerminalIntent, createCashoutActorFence } from '../src/lib/club-arena/cashoutTerminalIntent.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-09-15T04:18:21.123456+00:00';
const later = '2026-09-15T04:20:21.123456+00:00';
const digest = bytes => webcrypto.subtle.digest('SHA-256', bytes);
function fixture(kind = 'hold') {
  const hold = kind === 'hold', approval = kind === 'approval', player = id(8);
  const actor = hold || kind === 'cancellation' ? player : id(12);
  const status = { hold: 'pending', approval: 'approved', cancellation: 'cancelled', decline: 'rejected' }[kind];
  const note = kind === 'hold' ? null : kind === 'approval' ? 'Approved' : kind === 'decline' ? 'Cancelled by agent' : 'Cancelled by player';
  const cashier = {
    contract_version: 1, event_id: id(2), invoice_id: id(1), cashout_id: id(3), escrow_id: id(4),
    source_transaction_id: id(5), source_ledger_id: id(6), club_id: id(7), player_id: player,
    assigned_agent_id: id(9), issuer_representative_id: id(10), actor_user_id: actor,
    actor_role: hold || kind === 'cancellation' ? 'player' : 'admin', event_kind: kind,
    display_state: hold ? 'held' : approval ? 'approved' : 'refunded', amount: '1234.56',
    occurred_at: hold ? at : later, issued_at: later,
    hold_event_id: hold ? null : id(13), hold_invoice_id: hold ? null : id(14),
    ledger_from_type: hold ? 'player_wallet' : 'escrow', ledger_from_entity_id: hold ? player : id(4),
    ledger_to_type: hold ? 'escrow' : approval ? 'agent_wallet' : 'player_wallet',
    ledger_to_entity_id: hold ? id(4) : approval ? actor : player,
    custody_movement_recorded: true, cashout_completed: approval, refund_recorded: !hold && !approval,
  };
  const data = { ...cashier, success: true, replayed: false, op_id: id(50), request_status: status,
    accepted_note: note, actor_wallet_after: kind === 'decline' ? null : '5000.00', cashier,
    request: { id: id(3), club_id: id(7), player_id: player, agent_id: id(9), amount: '1234.56',
      status, created_at: at, updated_at: hold ? at : later,
      acknowledged_at: ['approved','rejected'].includes(status) ? later : null,
      completed_at: approval ? later : null,
      cancelled_at: ['cancelled','rejected'].includes(status) ? later : null,
      player_note: null, agent_note: ['approval','decline'].includes(kind) ? note : null } };
  const context = { kind, actorId: actor, operationId: id(50), clubId: id(7), playerId: player,
    amount: '1234.56', note, ...(hold ? {} : { cashoutId: id(3) }) };
  return { data, context };
}
function compiled(path, mocks) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { fileName: 'route.js', compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
function response() { return { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function lookupEcho(args, receipt = null) {
  return { contract_version: 1, found: receipt !== null, actor_user_id: args.p_expected_actor_id,
    op_id: args.p_op_id, action: args.p_action, club_id: args.p_club_id, amount: args.p_amount,
    cashout_id: args.p_cashout_id, accepted_note: args.p_note, receipt };
}
function tableDb(results) {
  return { from(name) {
    const chain = { select() { return chain; }, eq() { return chain; }, limit() { return Promise.resolve(results[name]); },
      maybeSingle() { return Promise.resolve(results[name] || { data: null, error: null }); } };
    return chain;
  } };
}

test('operation UUID accepts the full 8-4-4-4-12 shape and rejects missing groups and nil', () => {
  assert.equal(transport.cashoutUUID(id(1)), true);
  assert.equal(transport.cashoutUUID(id(1).toUpperCase()), true);
  for (const value of ['00000000-0000-4000-000000000001','00000000-0000-0000-0000-000000000000','bad',null,[],id(1)+'x']) {
    assert.equal(transport.cashoutUUID(value), false);
  }
});
for (const kind of ['hold','approval','cancellation','decline']) {
  test(`${kind} dispatches exactly once with retained original actor and returns whitelisted receipt`, async () => {
    const { data, context } = fixture(kind), calls = [];
    data.cashier.counterparty_balance = '999.99'; data.request.player_balance_after = '123.00';
    const receipt = await transport.dispatchCashout({ rpc: async (...args) => { calls.push(args); return { data, error: null }; } }, context);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], kind === 'hold' ? 'fn_cashout_request_v2' : kind === 'approval' ? 'fn_cashout_approve_v2' : 'fn_cashout_release_v2');
    assert.equal(calls[0][1].p_expected_actor_id, context.actorId);
    assert.equal(calls[0][1].p_op_id, context.operationId);
    assert.equal(calls[0][1].p_note, context.note);
    assert.equal(calls[0][1].p_amount, '1234.56');
    assert.equal(receipt.request.clubId, id(7));
    assert.equal(receipt.request.club_id, undefined);
    assert.equal(receipt.cashier.counterparty_balance, undefined);
    assert.equal(receipt.request.player_balance_after, undefined);
    assert.equal(receipt.actor_wallet_after, undefined);
  });
}

test('bare successes, arrays, mismatched actor/op/note/amount/status and malformed dates cannot acknowledge money', () => {
  const { context } = fixture('approval');
  for (const input of [{ success: true },id(3),[fixture('approval').data],null]) {
    assert.throws(() => transport.validateCashoutReceipt(input, context), /unconfirmed/);
  }
  for (const mutate of [
    d => { d.op_id = id(51); }, d => { d.actor_user_id = id(51); },
    d => { d.accepted_note = 'A different approval'; }, d => { d.amount = 1234.56; },
    d => { d.request_status = 'paid'; }, d => { d.request.agent_id = id(99); },
    d => { d.request.completed_at = null; }, d => { d.request.updated_at = '2026-02-30T04:20:21+00:00'; },
    d => { d.request.agent_note = 'Changed'; }, d => { d.cashier.ledger_to_type = 'club_treasury'; },
  ]) {
    const { data } = fixture('approval'); mutate(data);
    assert.throws(() => transport.validateCashoutReceipt(data, context), /unconfirmed/);
  }
});

test('replayed historical hold preserves the current terminal request without reporting pending', () => {
  const { data, context } = fixture();
  data.replayed = true;
  Object.assign(data.request, { status: 'expired', updated_at: later, cancelled_at: later });
  assert.equal(transport.validateCashoutReceipt(data, context).request.status, 'expired');
  data.replayed = false;
  assert.throws(() => transport.validateCashoutReceipt(data, context), /unconfirmed/);
});

test('lost transport, errors and malformed receipts retain the same operation and never auto-retry', async () => {
  for (const outcome of ['throw','error','malformed']) {
    const { context } = fixture(); let calls = 0;
    await assert.rejects(transport.dispatchCashout({ rpc: async () => {
      calls++; if (outcome === 'throw') throw new Error('lost');
      return outcome === 'error' ? { error: { message: 'unknown' } } : { data: { success: true } };
    } }, context), error => error.code === 'cashout_outcome_unknown' && error.operationId === context.operationId);
    assert.equal(calls, 1);
  }
});

test('strict gate authentication forwards only original Bearer and refuses missing or changed actor', async () => {
  const clients = [], user = { id: id(8) };
  const bridge = compiled('../src/lib/club-arena/cashoutBridge.js', {
    '@supabase/supabase-js': { createClient: (...args) => { clients.push(args); return {}; } },
    '../serverAuth': { getServerUserWithFallback: async () => ({ user, error: null }) },
    './cashoutReceipt.mjs': transport,
  });
  const req = { headers: { authorization: 'Bearer original-token', 'x-idempotency-key': id(50) }, body: { expectedActorId: id(8) } };
  const auth = await bridge.authenticateCashout(req, {});
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon';
    bridge.cashoutUserClient(auth.token);
    assert.equal(clients[0][1], 'test-anon');
    assert.equal(clients[0][2].global.headers.Authorization, 'Bearer original-token');
    assert.equal(clients[0][2].auth.autoRefreshToken, false);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldAnon;
  }
  for (const actor of [undefined, id(99)]) {
    await assert.rejects(bridge.authenticateCashout({ ...req, body: { expectedActorId: actor } }, {}), error => error.code === 'cashout_actor_changed');
  }
  await assert.rejects(bridge.authenticateCashout({ ...req, headers: { ...req.headers, authorization: '' } }, {}), error => error.status === 401);
  for (const result of [{ data: null }, { error: { message: 'offline' } }, { data: { settlement_locked: null } }]) {
    await assert.rejects(bridge.requireCashoutSettlementOpen(tableDb({ clubs: result }), id(7)));
  }
  await assert.rejects(bridge.requireCashoutSettlementOpen(tableDb({ clubs: { data: { settlement_locked: true, settlement_locked_until: '2000-01-01' } } }), id(7)), error => error.status === 423);
  await bridge.requireCashoutSettlementOpen(tableDb({ clubs: { data: { settlement_locked: false } } }), id(7));
});

function storage() { const rows = new Map(); return { getItem: key => rows.has(key) ? rows.get(key) : null, setItem: (key, value) => rows.set(key, value) }; }
function serialLocks() { let pending = Promise.resolve(); return { request(_key, _options, fn) { const next = pending.then(fn); pending = next.catch(() => {}); return next; } }; }

test('terminal intent survives retry, simultaneous tabs, pending approvals and reload; another actor gets its own UUID', async () => {
  const intent = { actorId: id(12), clubId: id(7), cashoutId: id(3), action: 'approve', note: 'Approved' };
  let minted = 100;
  const dependencies = { storage: storage(), locks: serialLocks(), randomUUID: () => id(minted++), isCurrent: () => true, digest };
  const results = await Promise.all([retainCashoutTerminalIntent(intent, dependencies), retainCashoutTerminalIntent(intent, dependencies)]);
  assert.equal(results[0], results[1]); assert.equal(minted, 101);
  assert.equal(await retainCashoutTerminalIntent({ ...intent }, dependencies), results[0]);
  assert.notEqual(await retainCashoutTerminalIntent({ ...intent, actorId: id(13) }, dependencies), results[0]);
  assert.notEqual(await retainCashoutTerminalIntent({ ...intent, note: 'Different' }, dependencies), results[0]);
  await assert.rejects(retainCashoutTerminalIntent(intent, { ...dependencies, locks: null }), /unavailable/);
  await assert.rejects(retainCashoutTerminalIntent(intent, { ...dependencies, storage: { getItem() { throw new Error('blocked'); } } }));
});

test('A to B to A while waiting for the cross-tab lock refuses without dispatch or a new operation', async () => {
  const fence = createCashoutActorFence(); fence.update(id(12)); const isCurrent = fence.capture(id(12));
  let release, enteredLock, minted = 0;
  const held = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { enteredLock = resolve; });
  const pending = retainCashoutTerminalIntent({ actorId: id(12), clubId: id(7), cashoutId: id(3), action: 'approve', note: 'Approved' },
    { storage: storage(), locks: { request: async (_key, _options, fn) => { enteredLock(); await held; return fn(); } },
      randomUUID: () => { minted++; return id(100); }, isCurrent, digest });
  await entered;
  fence.update(id(99)); fence.update(id(12)); release();
  await assert.rejects(pending, /changed/); assert.equal(minted, 0);
});

function approvalHandler({ markThrows = false, auditFails = false, pending = false, gateError = null, dispatchFails = false,
  lookupFound = false, lookupFails = false, self = false, kind = 'approval' } = {}) {
  const { data, context } = fixture(kind);
  let dispatched = 0, marked = 0, lookedUp = 0;
  const db = tableDb({
    user_mfa_factors: gateError === 'mfa' ? { error: { message: 'offline' } } : { data: { enabled: false } },
    profiles: { data: { role: 'admin' } }, club_members: { data: null }, clubs: { data: { owner_id: id(77), union_id: null } },
    ca_operator_policy: gateError === 'policy' ? { error: { message: 'offline' } } : { data: {
      approvals_enabled: true, allow_self_approve_when_alone: false, enforce_named_roles: true,
      cashout_threshold: '0', approval_ttl_minutes: 1440 } },
  });
  const handler = compiled('../pages/api/club-arena/approve-cashout.js', {
    '../../../src/lib/supabaseServerClient': { createClient: () => db },
    '../../../src/lib/club-arena/platformFreeze': { refuseWhileFrozen: async () => false },
    '../../../src/lib/mfaGate': { requireRecentMfa: async () => ({ ok: true }) },
    '../../../src/lib/club-arena/cashoutBridge': {
      authenticateCashout: async () => ({ actorId: context.actorId, operationId: context.operationId, token: 'original-token', user: { id: context.actorId } }),
      cashoutUserClient: token => { assert.equal(token, 'original-token'); return { rpc: async (rpc, args) => {
        if (rpc === 'fn_cashout_operation_receipt_v2') {
          lookedUp++;
          return lookupFails ? { error: { message: 'unknown' } } : { data: lookupEcho(args,
            lookupFound ? { ...data, replayed: true } : null), error: null };
        }
        dispatched++; if (dispatchFails) return { error: { message: 'not eligible' } }; return { data, error: null };
      } }; },
      readCashout: async () => ({ id: id(3), club_id: id(7), player_id: self ? context.actorId : id(8), agent_id: id(9), amount: '1234.56', status: 'pending' }),
      requireCashoutSettlementOpen: async () => {},
      sendCashoutError: (res, e) => res.status(e.status || 503).json({ success: false, code: e.code }),
    },
    '../../../src/lib/club-arena/cashoutReceipt.mjs': transport,
    '../../../src/lib/horses/operatorAudit.js': { auditOperatorAction: async () => ({ ok: !auditFails }) },
    '../../../src/lib/horses/apiEnvelope.js': { requestIdOf: () => 'request' },
    '../../../src/lib/horses/operatorAuth.js': { normalizeOperatorPolicy: row => row },
    '../../../src/lib/horses/operatorGate.js': { operatorHoldsPermission: async () => ({ ok: true, degraded: false }) },
    '../../../src/lib/horses/permissions.js': { PERMISSIONS: { CASHIER_WRITE: 'cashier.write' } },
    '../../../src/lib/horses/approvals.js': {
      cashoutAuthPath: () => ({ path: 'platform_override', viaPlatformOverride: true }),
      requireApproval: async (_op, _req, spec) => { assert.equal(spec.opId, `cashout:${id(3)}`); return { required: pending, approvalId: id(80), status: 'approved' }; },
      markApprovalExecuted: async () => { marked++; if (markThrows) throw new Error('lost audit'); return { ok: true }; },
      approvalPendingResponse: res => res.status(202).json({ success: true, pendingApproval: true }),
    },
    '../../../src/lib/poker-engine/RateLimiter': { applyRateLimit: () => true },
    '../../../src/lib/club-arena/redteam-validation': { runStandardGuards: () => null },
    '../../../src/lib/club-arena/auditLogger': { logAudit: async () => {}, extractIP: () => 'test' },
  }).default;
  return { handler, counts: () => ({ dispatched, marked, lookedUp }) };
}

test('approval routes retain confirmed financial receipt when approval-close or audit persistence fails', async () => {
  const previous = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
    for (const options of [{ markThrows: true }, { auditFails: true }]) {
      const { handler, counts } = approvalHandler(options), res = response();
      await handler({ method: 'POST', body: { cashoutId: id(3), clubId: id(7), action: 'approve' } }, res);
      assert.equal(res.statusCode, 200); assert.equal(res.body.success, true);
      assert.equal(res.body.receipt.operationId, id(50)); assert.equal(res.body.trailClosed, false);
      assert.equal(res.body.followUpRequired, true); assert.equal(counts().dispatched, 1);
    }
    for (const options of [{ pending: true }, { gateError: 'mfa' }, { gateError: 'policy' }]) {
      const { handler, counts } = approvalHandler(options), res = response();
      await handler({ method: 'POST', body: { cashoutId: id(3), clubId: id(7), action: 'approve' } }, res);
      assert.equal(counts().dispatched, 0); assert.equal(counts().marked, 0);
      assert.equal(res.statusCode, options.pending ? 202 : 503);
    }
    const { handler, counts } = approvalHandler({ dispatchFails: true }), res = response();
    await handler({ method: 'POST', body: { cashoutId: id(3), action: 'approve' } }, res);
    assert.equal(res.statusCode, 503); assert.equal(counts().dispatched, 1); assert.equal(counts().marked, 0);
    assert.equal(res.body.receipt, undefined);
    const { handler: declineHandler, counts: declineCounts } = approvalHandler({ kind: 'decline' }), declineRes = response();
    await declineHandler({ method: 'POST', body: { cashoutId: id(3), action: 'cancel' } }, declineRes);
    assert.equal(declineRes.statusCode, 200); assert.equal(declineRes.body.status, 'rejected');
    assert.equal(declineRes.body.chipsReturned, '1234.56');
    assert.deepEqual(declineCounts(), { lookedUp: 1, dispatched: 1, marked: 0 });
    for (const options of [{ lookupFound: true, gateError: 'mfa' }, { lookupFound: true, gateError: 'policy' },
      { lookupFound: true, pending: true }]) {
      const { handler: replayHandler, counts: replayCounts } = approvalHandler(options), replayRes = response();
      await replayHandler({ method: 'POST', body: { cashoutId: id(3), action: 'approve' } }, replayRes);
      assert.equal(replayRes.statusCode, 200); assert.equal(replayRes.body.receipt.replayed, true);
      assert.equal(replayRes.body.approvalStatus, 'unconfirmed');
      assert.equal(replayRes.body.trailStatus, 'not_checked'); assert.equal(replayRes.body.trailClosed, null);
      assert.equal(replayRes.body.followUpRequired, undefined);
      assert.deepEqual(replayCounts(), { lookedUp: 1, dispatched: 0, marked: 0 });
    }
    for (const action of ['approve','cancel']) {
      const { handler: selfHandler, counts: selfCounts } = approvalHandler({ self: true }), selfRes = response();
      await selfHandler({ method: 'POST', body: { cashoutId: id(3), action } }, selfRes);
      assert.equal(selfRes.statusCode, 403); assert.deepEqual(selfCounts(), { lookedUp: 0, dispatched: 0, marked: 0 });
    }
    const { handler: unknownHandler, counts: unknownCounts } = approvalHandler({ lookupFails: true }), unknownRes = response();
    await unknownHandler({ method: 'POST', body: { cashoutId: id(3), action: 'approve' } }, unknownRes);
    assert.equal(unknownRes.statusCode, 503); assert.equal(unknownCounts().dispatched, 0);
  } finally {
    for (const [key, value] of [['NEXT_PUBLIC_SUPABASE_URL', previous[0]],['SUPABASE_SERVICE_ROLE_KEY', previous[1]]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('existing operator fetch refuses auth ABA during token refresh before any request', async () => {
  let finishToken, fetches = 0;
  const token = new Promise(resolve => { finishToken = resolve; });
  const hook = compiled('../src/components/horses/useOperatorFetch.js', {
    react: { useRef: current => ({ current }), useEffect: effect => effect(), useCallback: fn => fn },
    '../../lib/authUtils': { getFreshAccessToken: () => token },
  }).default;
  const fence = createCashoutActorFence(); fence.update(id(12));
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { fetches++; return { ok: true, json: async () => ({ success: true }) }; };
  try {
    const pending = hook()('/api/club-arena/approve-cashout', { isCurrent: fence.capture(id(12)) });
    fence.update(id(99)); fence.update(id(12)); finishToken('same-account-new-session');
    await assert.rejects(pending, /changed/); assert.equal(fetches, 0);
  } finally { globalThis.fetch = fetchBefore; }
});

test('request refuses unknown active-table state without a money call; requester cancellation accepts only canonical replay', async () => {
  const old = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  try {
    for (const kind of ['hold','cancellation']) {
      const { data, context } = fixture(kind); let calls = 0;
      if (kind === 'cancellation') data.replayed = true;
      const mocks = {
        '../../../src/lib/supabaseServerClient': { createClient: () => tableDb({ table_sessions: { error: { message: 'offline' } } }) },
        '../../../src/lib/club-arena/platformFreeze': { refuseWhileFrozen: async () => false },
        '../../../src/lib/club-arena/cashoutBridge': {
          authenticateCashout: async () => ({ actorId: context.actorId, operationId: context.operationId, token: 'original' }),
          cashoutUserClient: () => ({ rpc: async (rpc, args) => {
            if (rpc === 'fn_cashout_operation_receipt_v2') return { data: lookupEcho(args, kind === 'cancellation' ? data : null), error: null };
            calls++; return { data, error: null };
          } }),
          readCashout: async () => ({ id: id(3), club_id: id(7), player_id: id(8), agent_id: id(9), amount: '1234.56', status: 'cancelled' }),
          requireCashoutSettlementOpen: async () => {},
          sendCashoutError: (res, e) => res.status(e.status || 503).json({ success: false, code: e.code }),
        },
        '../../../src/lib/club-arena/cashoutReceipt.mjs': transport,
        '../../../src/lib/poker-engine/RateLimiter': { applyRateLimit: () => true },
        '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
        '../../../src/lib/club-arena/sanitize': { sanitizeNote: note => note },
        '../../../src/lib/club-arena/validate': { isUUID: transport.cashoutUUID, rejectBadPayload: () => false,
          validateAmount: amount => ({ valid: true, value: amount }) },
        '../../../src/lib/club-arena/auditLogger': { logAudit: async () => {}, extractIP: () => 'test' },
      };
      const route = kind === 'hold' ? 'request-cashout' : 'cancel-my-cashout';
      const handler = compiled(`../pages/api/club-arena/${route}.js`, mocks).default, res = response();
      await handler({ method: 'POST', body: { cashoutId: id(3), clubId: id(7), amount: 1234 } }, res);
      assert.equal(res.statusCode, kind === 'hold' ? 503 : 200);
      assert.equal(calls, 0);
      if (kind === 'cancellation') {
        assert.equal(res.body.receipt.replayed, true); assert.equal(res.body.returned, '1234.56');
        assert.equal(res.body.trailStatus, 'not_checked'); assert.equal(res.body.trailClosed, null);
        assert.equal(res.body.approvalStatus, undefined); assert.equal(res.body.followUpRequired, undefined);
      }
    }
  } finally {
    for (const [key, value] of [['NEXT_PUBLIC_SUPABASE_URL', old[0]],['SUPABASE_SERVICE_ROLE_KEY', old[1]]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('source integration retains a single V2 dispatcher and no legacy response cache or duplicate delivery', () => {
  for (const route of ['request-cashout','approve-cashout','cancel-my-cashout']) {
    const source = fs.readFileSync(new URL(`../pages/api/club-arena/${route}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /checkIdempotency|cacheResponse|fn_(?:request|approve|cancel)_cashout|fn_send_message|notifications\/send|remainingBalance|agentNotified|playerNewBalance/);
    assert.match(source, /cashoutUserClient\(auth.token\)/);
    assert.match(source, /dispatchCashout\(client, context\)/);
  }
  const horses = fs.readFileSync(new URL('../pages/horses/index.js', import.meta.url), 'utf8');
  assert.match(horses, /retainCashoutTerminalIntent/);
  assert.match(horses, /'X-Idempotency-Key': operationId/);
  assert.match(horses, /expectedActorId: user.id/);
  assert.match(horses, /body\?\.receipt\?\.operationId !== operationId/);
  assert.doesNotMatch(horses, /localStorage\.removeItem\([^\n]*cashout-terminal/);
});

// Run the actual hook's subscription/effect lifecycle through a small hook-slot
// harness. This is bounded hook behavior, not a browser or mounted-page proof.
function scopeHarness() {
  const slots = [], effects = [], cleanups = [], routes = new Map(); let cursor = 0, onAuth;
  const react = {
    useRef(value) { const index = cursor++; return slots[index] || (slots[index] = { current: value }); },
    useEffect(effect) { effects.push(effect); },
  };
  const router = { events: { on: (key, fn) => routes.set(key, fn), off: key => routes.delete(key) } };
  const scope = compiled('../src/components/horses/useCashoutTerminalScope.js', {
    react, '../../lib/supabase': { supabase: { auth: { onAuthStateChange(fn) {
      onAuth = fn; return { data: { subscription: { unsubscribe() { onAuth = null; } } } };
    } } } },
    '../../lib/club-arena/cashoutTerminalIntent.mjs': { createCashoutActorFence },
  }).default;
  let mounted = false;
  return {
    render(actor, key) {
      cursor = 0; effects.length = 0;
      const capture = scope(actor, key, router);
      if (!mounted) { mounted = true; for (const effect of effects) cleanups.push(effect()); }
      return capture;
    },
    auth(actor) { onAuth?.('TOKEN_REFRESHED', actor ? { user: { id: actor } } : null); },
    route() { routes.get('routeChangeStart')?.(); },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}

test('actual scope subscription latches auth, view/dialog epoch, route ABA and unmount retirement', () => {
  const h = scopeHarness(); let capture = h.render(id(12), 'dialog-one'); h.auth(id(12));
  let current = capture(); assert.equal(current(), true);
  h.auth(id(99)); h.auth(id(12)); assert.equal(current(), false);
  current = capture(); assert.equal(current(), true);
  h.render(id(12), 'dialog-two'); capture = h.render(id(12), 'dialog-one'); assert.equal(current(), false);
  current = capture(); h.route(); assert.equal(current(), false);
  current = capture(); h.unmount(); assert.equal(current(), false);
});

test('late confirmed response after account ABA cannot acknowledge or mutate the retired caller view', async () => {
  const h = scopeHarness(), capture = h.render(id(12), 'cashouts'); h.auth(id(12));
  let finishBody, mutations = 0, fetches = 0;
  const body = new Promise(resolve => { finishBody = resolve; });
  const hook = compiled('../src/components/horses/useOperatorFetch.js', {
    react: { useRef: current => ({ current }), useEffect: effect => effect(), useCallback: fn => fn },
    '../../lib/authUtils': { getFreshAccessToken: async () => 'original-token' },
  }).default;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetches++; return { ok: true, json: () => body }; };
  try {
    const call = hook()('/api/club-arena/approve-cashout', { isCurrent: capture() }).then(() => { mutations++; });
    await Promise.resolve(); await Promise.resolve();
    h.auth(id(99)); h.auth(id(12)); finishBody({ success: true, receipt: { operationId: id(50) } });
    await assert.rejects(call, /changed/);
    assert.equal(fetches, 1); assert.equal(mutations, 0);
  } finally { globalThis.fetch = oldFetch; h.unmount(); }
});

test('saved terminal identity hashes the normalized tuple without persisting financial note text', async () => {
  const rows = new Map(), adapter = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) };
  let minted = 100;
  const deps = { storage: adapter, locks: serialLocks(), randomUUID: () => id(minted++), isCurrent: () => true, digest };
  const intent = { actorId: 'abcdefab-1234-4000-8000-000000000001', clubId: id(7), cashoutId: id(3), action: 'approve', note: ' Private cashout note ' };
  const first = await retainCashoutTerminalIntent(intent, deps);
  assert.equal(await retainCashoutTerminalIntent({ ...intent, actorId: intent.actorId.toUpperCase(), note: intent.note.trim() }, deps), first);
  assert.doesNotMatch(JSON.stringify([...rows]), /Private cashout note|"tuple"/);
  assert.equal(rows.size, 1);
});

test('read-only lookup accepts only exact absent and exact canonical historical receipt', async () => {
  const { data, context } = fixture('approval');
  const previous = { ...data, replayed: true };
  let calls = 0;
  const client = result => ({ rpc: async (name, args) => {
    calls++; assert.equal(name, 'fn_cashout_operation_receipt_v2'); return result(args);
  } });
  assert.equal(await transport.lookupCashoutReceipt(client(args => ({ data: lookupEcho(args) })), context), null);
  assert.equal((await transport.lookupCashoutReceipt(client(args => ({ data: lookupEcho(args, previous) })), context)).replayed, true);
  for (const mutate of [
    d => { delete d.found; }, d => { d.found = 'false'; }, d => { d.receipt = undefined; },
    d => { d.op_id = id(99); }, d => { d.actor_user_id = id(99); }, d => { d.action = 'release'; },
    d => { d.accepted_note = 'Another note'; }, d => { d.amount = 1234.56; }, d => { d.cashout_id = null; },
    d => { d.found = true; d.receipt = { ...previous, replayed: false }; },
    d => { d.found = true; d.receipt = { ...previous, accepted_note: 'Wrong' }; },
  ]) {
    await assert.rejects(transport.lookupCashoutReceipt(client(args => {
      const result = lookupEcho(args); mutate(result); return { data: result };
    }), context), error => error.code === 'cashout_outcome_unknown');
  }
  for (const result of [null, { error: { message: 'missing resolver' } }, { data: { found: false } }]) {
    await assert.rejects(transport.lookupCashoutReceipt(client(() => result), context));
  }
  assert.ok(calls > 2);
});

test('intent actor relation and noncanonical UUID casing refuse before read or write RPC', async () => {
  for (const kind of ['hold','approval','cancellation','decline']) {
    const { context } = fixture(kind);
    const invalid = { ...context, actorId: ['hold','cancellation'].includes(kind) ? id(99) : context.playerId };
    let calls = 0; const client = { rpc: async () => { calls++; throw new Error('should not dispatch'); } };
    await assert.rejects(transport.dispatchCashout(client, invalid), error => error.code === 'cashout_invalid_intent');
    await assert.rejects(transport.lookupCashoutReceipt(client, invalid), error => error.code === 'cashout_invalid_intent');
    assert.equal(calls, 0);
  }
  const { context } = fixture('approval');
  let calls = 0;
  await assert.rejects(transport.dispatchCashout({ rpc: async () => { calls++; } }, {
    ...context, clubId: 'ABCDEFAB-1234-4000-8000-000000000001',
  }), error => error.code === 'cashout_invalid_intent');
  assert.equal(calls, 0);
});

test('auth ABA while hashing an intent refuses before acquiring storage or minting a UUID', async () => {
  let finishHash, locks = 0, minted = 0;
  const hashed = new Promise(resolve => { finishHash = resolve; });
  const fence = createCashoutActorFence(); fence.update(id(12));
  const pending = retainCashoutTerminalIntent({ actorId: id(12), clubId: id(7), cashoutId: id(3), action: 'approve', note: 'Approved' },
    { storage: storage(), locks: { request() { locks++; } }, digest: () => hashed,
      randomUUID: () => { minted++; return id(100); }, isCurrent: fence.capture(id(12)) });
  fence.update(id(99)); fence.update(id(12)); finishHash(new Uint8Array(32).buffer);
  await assert.rejects(pending, /changed/); assert.equal(locks, 0); assert.equal(minted, 0);
});
