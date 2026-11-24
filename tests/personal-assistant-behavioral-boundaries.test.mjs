import test from 'node:test';
import assert from 'node:assert/strict';

import { executeSingleHandAudit } from '../src/lib/personal-assistant/handAuditRouteCore.mjs';
import { ACCESS_LEVELS, checkSandboxAccess, CONTEXT_STATES, isFeatureAccessible } from '../src/lib/personal-assistant/contextAuthority.js';
import { openAuditCursor, sealAuditCursor } from '../src/lib/personal-assistant/auditCursor.mjs';
import aiSandboxHandler from '../pages/api/ai/sandbox.js';

function runHandAuditHandler(req, res, deps = {}) {
  const getDb = deps.getDb || (() => {
    if (deps.db) return deps.db;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Hand Audit Service Configuration Is Unavailable.');
    return deps.db;
  });
  return executeSingleHandAudit(req, res, {
    getDb,
    applyRateLimit: deps.applyRateLimit,
    limits: { read: { max: 60, windowMs: 60_000 }, write: { max: 20, windowMs: 60_000 } },
    getUser: deps.getServerUserWithFallback,
    checkAccess: deps.checkSandboxAccess,
    auditHands: deps.auditParsedHands,
  });
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const HAND_A_CASH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HAND_A_MTT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HAND_A_PLO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HAND_A_BOMB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const HAND_A_FOLDED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let ended = false;
  return {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; ended = true; return this; },
    end(payload) { if (payload !== undefined) body = payload; ended = true; return this; },
    getStatus() { return statusCode; },
    getBody() { return body; },
    getHeaders() { return headers; },
    isEnded() { return ended; },
  };
}

function createFakeDb({
  hands = [],
  facts = [],
  existingDecisions = [],
  leaks = [],
  activeSeats = [],
  lastHands = [],
} = {}) {
  return {
    from(table) {
      const filters = [];
      const chain = {
        select() { return chain; },
        eq(col, val) { filters.push({ op: 'eq', col, val }); return chain; },
        in(col, vals) { filters.push({ op: 'in', col, vals }); return chain; },
        is(col, val) { filters.push({ op: 'is', col, val }); return chain; },
        not(col, op, val) { filters.push({ op: 'not', col, subop: op, val }); return chain; },
        gte(col, val) { filters.push({ op: 'gte', col, val }); return chain; },
        contains(col, raw) { filters.push({ op: 'contains', col, raw }); return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          const rows = execute();
          return Promise.resolve({ data: rows[0] || null, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: execute(), error: null }).then(resolve, reject);
        },
      };

      function execute() {
        let source = [];
        if (table === 'hand_history') source = hands;
        else if (table === 'ca_hand_facts') source = facts;
        else if (table === 'hand_audit_decisions') source = existingDecisions;
        else if (table === 'user_leaks') source = leaks;
        else if (table === 'table_seats') source = activeSeats;
        else if (table === 'hands' || table === 'club_hands') source = lastHands;

        return source.filter((row) => filters.every((f) => {
          if (f.op === 'eq') return String(row[f.col]) === String(f.val);
          if (f.op === 'in') return f.vals.map(String).includes(String(row[f.col]));
          if (f.op === 'is') return row[f.col] === f.val;
          if (f.op === 'not') {
            if (f.subop === 'is' && f.val === null) return row[f.col] !== null && row[f.col] !== undefined;
            if (f.subop === 'in') return !String(f.val).includes(String(row[f.col]));
            return String(row[f.col]) !== String(f.val);
          }
          if (f.op === 'gte') return String(row[f.col] || '') >= String(f.val);
          if (f.op === 'contains') {
            const needle = JSON.parse(f.raw)[0];
            const [k, v] = Object.entries(needle)[0];
            return Array.isArray(row[f.col]) && row[f.col].some(item => String(item?.[k]) === String(v));
          }
          return true;
        }));
      }

      return chain;
    },
    rpc() {
      return Promise.resolve({ data: { success: true, removed: 0 }, error: null });
    },
  };
}

const sampleHands = [
  {
    id: HAND_A_CASH,
    hand_number: 101,
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    pot_size: 24,
    button_seat: 1,
    players: [{ userId: USER_A, seat: 1, stack: 200 }, { userId: USER_B, seat: 2, stack: 200 }],
    community_cards: ['Ah', '7d', '2c'],
    actions: [
      { street: 'preflop', playerId: USER_A, action: 'raise', amount: 6 },
      { street: 'preflop', playerId: USER_B, action: 'call', amount: 6 },
      { street: 'flop', playerId: USER_B, action: 'check' },
      { street: 'flop', playerId: USER_A, action: 'bet', amount: 8 },
    ],
    created_at: '2026-11-24T12:00:00.000Z',
  },
  {
    id: HAND_A_MTT,
    hand_number: 202,
    tournament_id: '99999999-9999-4999-8999-999999999999',
    game_variant: 'nlh',
    small_blind: 100,
    big_blind: 200,
    pot_size: 1600,
    button_seat: 1,
    players: [{ userId: USER_A, seat: 1, stack: 8000 }, { userId: '33333333-3333-4333-8333-333333333333', seat: 2, stack: 8000 }],
    community_cards: ['Kd', '9c', '4s'],
    actions: [
      { street: 'preflop', playerId: USER_A, action: 'raise', amount: 440 },
      { street: 'preflop', playerId: '33333333-3333-4333-8333-333333333333', action: 'call', amount: 440 },
    ],
    created_at: '2026-11-24T12:10:00.000Z',
  },
  {
    id: HAND_A_PLO,
    hand_number: 303,
    tournament_id: null,
    game_variant: 'plo5',
    small_blind: 1,
    big_blind: 2,
    players: [{ userId: USER_A, seat: 1, stack: 200 }],
    actions: [],
    created_at: '2026-11-24T12:20:00.000Z',
  },
  {
    id: HAND_A_BOMB,
    hand_number: 404,
    tournament_id: null,
    game_variant: 'nlh',
    bomb_pot: { ante: 4 },
    small_blind: 1,
    big_blind: 2,
    players: [{ userId: USER_A, seat: 1, stack: 200 }],
    actions: [],
    created_at: '2026-11-24T12:30:00.000Z',
  },
  {
    id: HAND_A_FOLDED,
    hand_number: 505,
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    players: [{ userId: USER_A, seat: 1, stack: 200 }, { userId: USER_B, seat: 2, stack: 200 }],
    actions: [{ street: 'preflop', playerId: USER_A, action: 'fold' }],
    created_at: '2026-11-24T12:40:00.000Z',
  },
];

const sampleFacts = [
  { user_id: USER_A, hand_id: HAND_A_CASH, hole_cards: ['As', 'Ks'] },
  { user_id: USER_A, hand_id: HAND_A_MTT, hole_cards: ['Qh', 'Jh'] },
  // HAND_A_FOLDED intentionally has NO hole_cards (Club Arena retention policy for preflop fold / uninvested hand)
  { user_id: USER_A, hand_id: HAND_A_FOLDED, hole_cards: null },
];

test('hand-audit enforces two-account isolation: Account B cannot read Account A tournament hand', async () => {
  const db = createFakeDb({ hands: sampleHands, facts: sampleFacts });

  const resB = mockRes();
  await runHandAuditHandler(
    { method: 'GET', query: { hand: HAND_A_MTT }, headers: { authorization: 'Bearer tok-b' } },
    resB,
    {
      db,
      applyRateLimit: () => true,
      getServerUserWithFallback: async () => ({ user: { id: USER_B }, error: null, status: 200 }),
      checkSandboxAccess: async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS, contextState: CONTEXT_STATES.NO_ACTIVE_SESSION }),
    },
  );
  assert.equal(resB.getStatus(), 404);
  assert.equal(resB.getHeader('cache-control'), 'private, no-store, max-age=0');
  assert.equal(resB.getHeader('vary'), 'Authorization');
  assert.equal(resB.getBody().success, false);
});

test('hand-audit enforces server-side live-play restriction (403) when player is seated', async () => {
  const seatedDb = createFakeDb({
    hands: sampleHands,
    facts: sampleFacts,
    activeSeats: [{ user_id: USER_A, table_id: 'tbl-live-1', left_at: null, status: 'seated' }],
  });

  // Verify real contextAuthority blocks both hand_review and leak_finder_detect while seated.
  const access = await checkSandboxAccess(seatedDb, USER_A);
  assert.equal(access.allowed, false);
  assert.equal(access.contextState, CONTEXT_STATES.LIVE_PLAY);
  assert.equal(isFeatureAccessible(access.accessLevel, 'hand_review'), false);
  assert.equal(isFeatureAccessible(access.accessLevel, 'leak_finder_detect'), false);

  const res = mockRes();
  await runHandAuditHandler(
    { method: 'GET', query: { hand: HAND_A_CASH }, headers: { authorization: 'Bearer tok-a' } },
    res,
    {
      db: seatedDb,
      applyRateLimit: () => true,
      getServerUserWithFallback: async () => ({ user: { id: USER_A }, error: null, status: 200 }),
      checkSandboxAccess,
    },
  );
  assert.equal(res.getStatus(), 403);
  assert.equal(res.getHeader('cache-control'), 'private, no-store, max-age=0');
  assert.equal(res.getHeader('vary'), 'Authorization');
  assert.equal(res.getBody().decisions, undefined, 'seated RTA block must never leak decisions');
});

test('hand-audit returns accurate limitation with zero fabricated grades for PLO5, Bomb Pot, and retained-null fold', async () => {
  const db = createFakeDb({ hands: sampleHands, facts: sampleFacts });
  const baseDeps = {
    db,
    applyRateLimit: () => true,
    getServerUserWithFallback: async () => ({ user: { id: USER_A }, error: null, status: 200 }),
    checkSandboxAccess: async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS, contextState: CONTEXT_STATES.NO_ACTIVE_SESSION }),
  };

  for (const [handId, expectedReason, expectedSupported] of [
    [HAND_A_PLO, 'unsupported_variant', false],
    [HAND_A_BOMB, 'unsupported_special_format', false],
    [HAND_A_FOLDED, 'missing_private_cards', true],
  ]) {
    const res = mockRes();
    await runHandAuditHandler({ method: 'GET', query: { hand: handId }, headers: {} }, res, baseDeps);
    assert.equal(res.getStatus(), 200);
    const body = res.getBody();
    assert.equal(body.supported, expectedSupported);
    assert.equal(body.audited, false);
    assert.equal(body.reason, expectedReason);
    assert.ok(typeof body.limitation === 'string' && body.limitation.length > 20);
    assert.deepEqual(body.decisions, []);
    assert.equal(body.trainingAction, null);
    assert.ok(body.returnToClubArenaHref.includes(`hand=${handId}`));
  }
});

test('hand-audit switches cleanly between Cash and Tournament hands and returns linked leak + return href', async () => {
  const db = createFakeDb({
    hands: sampleHands,
    facts: sampleFacts,
    leaks: [
      {
        id: 'leak-cbet-1',
        user_id: USER_A,
        leak_type: 'cbet_too_often',
        leak_category: 'flop',
        situation_class: 'C-Betting Too Often',
        status: 'persistent',
        occurrence_count: 14,
        avg_ev_loss_bb: 0.11,
        recommended_drill: 'cash-006',
      },
    ],
  });

  const fakeAudit = async (_db, _userId, hands) => ({
    persisted: true,
    analyses: [{
      handId: hands[0].id,
      decisions: [{
        decisionKey: 'flop:1',
        gameId: hands[0].format === 'tournament' ? 'mtt-001' : 'cash-006',
        street: 'flop',
        heroPosition: 'BTN',
        spotType: 'cbet',
        playerAction: 'bet',
        solverAction: 'check',
        classification: 'mistake',
        selectedFrequency: 0.18,
        optimalFrequency: 0.82,
        evLoss: 0.24,
        evLossMeasured: true,
        solverVerified: true,
        solverSource: 'hand-audit-v3',
        matchTier: 1,
      }],
    }],
  });

  const baseDeps = {
    db,
    applyRateLimit: () => true,
    getServerUserWithFallback: async () => ({ user: { id: USER_A }, error: null, status: 200 }),
    checkSandboxAccess: async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS, contextState: CONTEXT_STATES.NO_ACTIVE_SESSION }),
    auditParsedHands: fakeAudit,
  };

  // Hand 1: Cash NLH
  const resCash = mockRes();
  await runHandAuditHandler({ method: 'GET', query: { hand: HAND_A_CASH }, headers: {} }, resCash, baseDeps);
  assert.equal(resCash.getStatus(), 200);
  const cashBody = resCash.getBody();
  assert.equal(cashBody.supported, true);
  assert.equal(cashBody.audited, true);
  assert.equal(cashBody.hand.format, 'cash');
  assert.deepEqual(cashBody.hand.heroCards, ['As', 'Ks']);
  assert.equal(cashBody.decisions.length, 1);
  assert.equal(cashBody.solverVerifiedCount, 1);
  assert.equal(cashBody.matchedLeaks[0].id, 'leak-cbet-1');
  assert.equal(cashBody.trainingAction.leakId, 'leak-cbet-1');
  assert.equal(
    cashBody.returnToClubArenaHref,
    `/hub/club-arena/hand-history?hand=${HAND_A_CASH}&source=personal-assistant&leak=leak-cbet-1`,
  );

  // Hand 2: Tournament NLH (simulating switching linked hands in an open tab)
  const resMtt = mockRes();
  await runHandAuditHandler({ method: 'POST', body: { handId: HAND_A_MTT }, headers: {} }, resMtt, baseDeps);
  assert.equal(resMtt.getStatus(), 200);
  const mttBody = resMtt.getBody();
  assert.equal(mttBody.hand.id, HAND_A_MTT);
  assert.equal(mttBody.hand.format, 'tournament');
  assert.deepEqual(mttBody.hand.heroCards, ['Qh', 'Jh']);
  assert.equal(mttBody.persisted, true);
});

test('hand-audit enforces 405 before rate limit, private no-store on all errors, and fail-closed missing config', async () => {
  let rateLimitCalled = false;
  const res405 = mockRes();
  await runHandAuditHandler({ method: 'DELETE', query: {}, headers: {} }, res405, {
    applyRateLimit: () => { rateLimitCalled = true; return true; },
  });
  assert.equal(res405.getStatus(), 405);
  assert.equal(res405.getHeader('allow'), 'GET, POST');
  assert.equal(res405.getHeader('cache-control'), 'private, no-store, max-age=0');
  assert.equal(res405.getHeader('vary'), 'Authorization');
  assert.equal(rateLimitCalled, false, '405 must short-circuit before rate limiting');

  // Missing service role config fails closed with 503 + private, no-store
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res503 = mockRes();
    await runHandAuditHandler({ method: 'GET', query: { hand: HAND_A_CASH }, headers: {} }, res503, {
      applyRateLimit: () => true,
    });
    assert.equal(res503.getStatus(), 503);
    assert.equal(res503.getHeader('cache-control'), 'private, no-store, max-age=0');
    assert.equal(res503.getHeader('vary'), 'Authorization');
  } finally {
    if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
});

test('interrupted audit cursor preserves exact pagination state and rejects tampering', () => {
  const prevSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-audit-cursor-signing-key-2026';
  try {
    const now = Date.parse('2026-11-24T12:05:00.000Z');
    const sealed = sealAuditCursor({
      snapshotAt: '2026-11-24T12:00:00.000Z',
      boundary: { createdAt: '2026-11-20T09:15:00.000Z', id: HAND_A_CASH },
      cumulativeHandsFound: 400,
    }, USER_A, now);
    const opened = openAuditCursor(sealed, USER_A, now + 1000);
    assert.equal(opened.boundary.id, HAND_A_CASH);
    assert.equal(opened.cumulativeHandsFound, 400);

    // Cross-account cursor reuse or tampering fails closed.
    assert.throws(() => openAuditCursor(sealed, USER_B, now + 1000), /invalid_cursor/);
    assert.throws(() => openAuditCursor(`${sealed}tampered`, USER_A, now + 1000), /invalid_cursor/);
  } finally {
    if (prevSecret === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevSecret;
  }
});

test('/api/ai/sandbox reports truthful Holdem-only capabilities and rejects non-GET methods', () => {
  const resGet = mockRes();
  aiSandboxHandler({ method: 'GET', query: {} }, resGet);
  assert.equal(resGet.getStatus(), 200);
  const body = resGet.getBody();
  assert.deepEqual(body.sandbox_capabilities.format_support, ['No-Limit Texas Hold\'em (Cash Games And Tournaments)']);
  assert.ok(body.sandbox_capabilities.explicitly_unsupported.includes('Pot-Limit Omaha'));
  assert.ok(!JSON.stringify(body).includes('100% Free Interactive Table Simulator'));

  const resPost = mockRes();
  aiSandboxHandler({ method: 'POST', query: {} }, resPost);
  assert.equal(resPost.getStatus(), 405);
  assert.equal(resPost.getHeader('allow'), 'GET, OPTIONS');
});
