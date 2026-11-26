import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  ACCESS_LEVELS,
  CONTEXT_STATES,
  checkSandboxAccess,
  isFeatureAccessible,
} from '../src/lib/personal-assistant/contextAuthority.js';
import {
  buildAdviceExplanation,
  buildCoachingSnapshot,
  buildRepresentativeHandSummary,
  buildTrainingPlan,
  receiptFingerprint,
} from '../src/lib/personal-assistant/coachingIntelligence.mjs';
import {
  openDeletionChallenge,
  sanitizeExportHandRow,
  sealDeletionChallenge,
} from '../src/lib/personal-assistant/dataLifecycle.mjs';
import { summarizeLiveSpotAudit } from '../src/lib/personal-assistant/liveSpotHandHistory.mjs';
import { normalizeUserLeakRow } from '../src/lib/personal-assistant/leakRecord.js';
import { sealDrillBatch, openDrillBatch } from '../src/lib/personal-assistant/drillTelemetry.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function compileRoute(relPath, deps = {}) {
  const fullPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const module = { exports: {} };
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (name.startsWith('node:')) return require(name);
    if (deps[name]) return deps[name];
    for (const [key, val] of Object.entries(deps)) {
      if (name === key || name.endsWith(key) || key.endsWith(name)) return val;
    }
    throw new Error(`Unmocked dependency in compileRoute(${relPath}): ${name}`);
  }, module, module.exports);
  return module.exports;
}

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: null,
    headersSent: false,
    setHeader(k, v) {
      headers[String(k).toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return headers[String(k).toLowerCase()];
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

function createContextSupabase({
  activePokerSessions = [],
  recentPokerSessions = [],
  activeTableSeats = [],
  recentTableSeats = [],
  pokerSessionsError = null,
  tableSeatsError = null,
  extraTables = {},
  rpcHandler = null,
} = {}) {
  return {
    rpc: rpcHandler || (async () => ({ data: null, error: null })),
    from(table) {
      if (extraTables[table]) {
        return typeof extraTables[table] === 'function' ? extraTables[table]() : extraTables[table];
      }
      if (table === 'poker_sessions') {
        let mode = 'all';
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          is(col, val) {
            if (col === 'ended_at' && val === null) mode = 'active';
            return chain;
          },
          not(col, op, val) {
            if (col === 'ended_at' && op === 'is' && val === null) mode = 'recent';
            return chain;
          },
          gte() { return chain; },
          order() { return chain; },
          limit: async () => {
            if (pokerSessionsError) return { data: null, error: pokerSessionsError };
            if (mode === 'active') return { data: activePokerSessions, error: null };
            if (mode === 'recent') return { data: recentPokerSessions, error: null };
            return { data: [...activePokerSessions, ...recentPokerSessions], error: null };
          },
        };
        return chain;
      }
      if (table === 'table_seats') {
        let mode = 'all';
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          is(col, val) {
            if (col === 'left_at' && val === null) mode = 'active';
            return chain;
          },
          not(col, op, val) {
            if (col === 'left_at' && op === 'is' && val === null) mode = 'recent';
            return chain;
          },
          gte() { return chain; },
          order() { return chain; },
          limit: async () => {
            if (tableSeatsError) return { data: null, error: tableSeatsError };
            if (mode === 'active') return { data: activeTableSeats, error: null };
            if (mode === 'recent') return { data: recentTableSeats, error: null };
            return { data: [...activeTableSeats, ...recentTableSeats], error: null };
          },
        };
        return chain;
      }
      const genericChain = {
        select() { return genericChain; },
        eq() { return genericChain; },
        in() { return genericChain; },
        is() { return genericChain; },
        not() { return genericChain; },
        gte() { return genericChain; },
        lte() { return genericChain; },
        lt() { return genericChain; },
        like() { return genericChain; },
        or() { return genericChain; },
        contains() { return genericChain; },
        order() { return genericChain; },
        limit() { return genericChain; },
        range: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return genericChain;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. P0-3 & P2-3: custom-drill.js RTA bypass + 503 status propagation
// ═══════════════════════════════════════════════════════════════════════════

test('[P0-3 & P2-3] custom-drill.js blocks unauthenticated callers (401), enforces RTA on cookie sessions without Authorization header (403), and propagates 503 status from loadOwnedLeak', async () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  let currentAuth = { user: null, error: new Error('No session'), status: 401 };

  const customDrillMod = compileRoute('pages/api/sandbox/_routes/custom-drill.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => currentAuth,
    },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/drillTelemetry': { MIN_VERIFIED_QUESTIONS: 5, sealDrillBatch },
    '../../../../src/lib/sandbox/leakReview': { leakToDrill: () => ({ street: 'flop', position: 'BTN', limit: 5 }) },
    '../../../../src/lib/training/solverDecisionEvidence': {
      enforceSolverClaimHonesty: (q) => q,
      isVerifiedSolverQuestion: () => true,
      solverDecisionGroupKey: () => 'solver_club_arena_cash_002_flop_btn_cbet',
    },
    '../../../../src/lib/training/cacheTruthContract.mjs': { TRAINING_SOURCE_CLASSIFICATION: { SOLVER_EXACT: 'solver_exact' } },
    '../../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheQuestionFromRow: (r) => r.question_data,
      cacheRowIsServingEligible: () => true,
      recordTrainingQuestionsServed: async () => {},
    },
  });

  // 1) Unauthenticated request without Authorization header and without ?leak= must return 401
  customDrillMod._setSupabaseForTesting(createContextSupabase());
  const unauthRes = mockRes();
  await customDrillMod.default({ method: 'GET', headers: {}, query: { street: 'flop' } }, unauthRes);
  assert.equal(unauthRes.statusCode, 401, 'Unauthenticated custom-drill request without leak/auth header must 401');
  assert.equal(unauthRes.body.success, false);

  // 2) Cookie-authenticated user seated at live table without Authorization header -> 403 blocked
  currentAuth = { user: { id: USER_ID }, error: null, status: 200 };
  const seatedDb = createContextSupabase({
    activeTableSeats: [{ id: 'seat-1', table_id: 'tbl-1', left_at: null }],
  });
  customDrillMod._setSupabaseForTesting(seatedDb);
  const cookieSeatedRes = mockRes();
  await customDrillMod.default(
    { method: 'GET', headers: { cookie: 'sb-access-token=cookie-jwt' }, query: { street: 'flop' } },
    cookieSeatedRes,
  );
  assert.equal(cookieSeatedRes.statusCode, 403, 'Cookie-authenticated live-table caller must be blocked with 403');
  assert.equal(cookieSeatedRes.body.blocked, true);
  assert.equal(cookieSeatedRes.body.contextState, CONTEXT_STATES.LIVE_PLAY);

  // 3) 503 from loadOwnedLeak propagates 503 instead of collapsing to 500
  const leakOutageDb = createContextSupabase({
    extraTables: {
      user_leaks: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { code: '57014', message: 'statement timeout' },
              }),
            }),
          }),
        }),
      }),
    },
  });
  customDrillMod._setSupabaseForTesting(leakOutageDb);
  const outageRes = mockRes();
  await customDrillMod.default(
    { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { leak: 'river_overfold' } },
    outageRes,
  );
  assert.equal(outageRes.statusCode, 503, 'loadOwnedLeak DB outage must return 503, never 500');
  assert.equal(outageRes.body.success, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. P0-4, P1-4, P1-8, P2-2: coaching.js & coachingIntelligence.mjs
// ═══════════════════════════════════════════════════════════════════════════

test('[P0-4, P1-4, P1-8, P2-2] coachingIntelligence & coaching.js redact hand prescriptions during live play/cooldown, support camelCase & snake_case representative hands without fabricating BTN/Preflop, and keep practiceTarget.limit numeric', async () => {
  // 1) buildRepresentativeHandSummary accepts camelCase & snake_case and returns null when street/position absent
  const camelRep = buildRepresentativeHandSummary({
    representativeDecision: {
      handExternalId: 'club-arena:hand-camel-1',
      decisionKey: 'river:1',
      heroHand: 'AhKd',
      boardCards: ['Qs', 'Jd', '4c', '2h', '9s'],
      playerAction: 'call',
      solverAction: 'fold',
      evLossBB: 2.35,
      evLossMeasured: true,
      solverVerified: true,
    },
  }, []);
  assert.equal(camelRep.handId, 'hand-camel-1');
  assert.equal(camelRep.solverVerified, true);
  assert.equal(camelRep.solverAction, 'fold');
  assert.equal(camelRep.evLossMeasured, true);
  assert.equal(camelRep.evLossBB, 2.35);
  assert.equal(camelRep.street, null, 'Must return null when street is absent, never fabricate Preflop');
  assert.equal(camelRep.heroPosition, null, 'Must return null when heroPosition is absent, never fabricate BTN');

  const snakeRep = buildRepresentativeHandSummary({}, [
    {
      hand_external_id: 'club-arena:hand-snake-1',
      hero_hand: 'KsQs',
      board_cards: ['Ts', '8d', '2c'],
      player_action: 'check',
      solver_action: 'bet_33',
      ev_loss: 1.15,
      ev_loss_measured: true,
      solver_verified: true,
      classification: 'mistake',
    },
  ]);
  assert.equal(snakeRep.handId, 'hand-snake-1');
  assert.equal(snakeRep.solverVerified, true);
  assert.equal(snakeRep.solverAction, 'bet_33');
  assert.equal(snakeRep.evLossMeasured, true);
  assert.equal(snakeRep.evLossBB, 1.15);
  assert.equal(snakeRep.street, null);
  assert.equal(snakeRep.heroPosition, null);

  // 2) practiceTarget.limit defaults to numeric 10 (never 'NL100')
  const adviceDefaultLimit = buildAdviceExplanation({ id: 'unknown-custom-leak' }, []);
  assert.equal(typeof adviceDefaultLimit.practiceTarget.limit, 'number');
  assert.equal(adviceDefaultLimit.practiceTarget.limit, 10);
  assert.notEqual(adviceDefaultLimit.practiceTarget.limit, 'NL100');

  // 3) RTA redaction across priorities, leaks, trainingPlan.modules, and weeklyReport.focus during live play & cooldown
  const sampleLeaks = [
    {
      id: 'leak-rta-1',
      leak_type: 'river_overfold',
      leak_category: 'river',
      situation_class: 'BB vs BTN River Bet',
      status: 'persistent',
      total_samples: 30,
      mistake_count: 10,
      avg_ev_loss_bb: 1.4,
      ev_loss_measured: true,
    },
  ];
  const sampleDecisions = [
    {
      id: 'dec-rta-1',
      leak_id: 'leak-rta-1',
      hand_external_id: 'club-arena:99999999-9999-4999-8999-999999999999',
      decision_key: 'river:bb:1',
      street: 'river',
      hero_position: 'BB',
      spot_type: 'facing_bet',
      hero_hand: 'KdQd',
      board_cards: ['Ks', '9c', '4d', '2h', '7s'],
      player_action: 'fold',
      solver_action: 'call',
      classification: 'mistake',
      ev_loss: 1.4,
      ev_loss_measured: true,
      solver_verified: true,
      solver_source: 'PIO|hand-audit-v3',
      audited_at: '2026-11-26T12:00:00.000Z',
    },
  ];

  for (const liveTable of [
    { active: true, cooldown: false },
    { active: false, cooldown: true },
  ]) {
    const snap = buildCoachingSnapshot({
      leaks: sampleLeaks,
      decisions: sampleDecisions,
      reviews: [],
      liveTable,
    });

    for (const item of [
      ...snap.priorities,
      ...snap.leaks,
      ...snap.trainingPlan.modules,
      ...snap.weeklyReport.focus,
    ]) {
      if ('exampleHands' in item) {
        assert.deepEqual(item.exampleHands, [], 'exampleHands must be empty during live play or cooldown');
      }
      if (item.representativeHand) {
        assert.equal(item.representativeHand.heroHand, null);
        assert.deepEqual(item.representativeHand.boardCards, []);
        assert.equal(item.representativeHand.solverAction, null);
        assert.equal(item.representativeHand.evLossBB, null);
        assert.equal(item.representativeHand.handId, null);
        assert.equal(item.representativeHand.handExternalId, null);
      }
    }
  }

  // Also verify buildTrainingPlan direct call with liveTableActive / cooldownActive
  const planDuringCooldown = buildTrainingPlan({
    leaks: sampleLeaks,
    decisions: sampleDecisions,
    cooldownActive: true,
  });
  assert.deepEqual(planDuringCooldown.modules[0].exampleHands, []);
  assert.equal(planDuringCooldown.modules[0].representativeHand.solverAction, null);
  assert.equal(planDuringCooldown.modules[0].representativeHand.heroHand, null);

  // And verify coaching.js endpoint redacts snapshot during live play and cooldown
  const coachingMod = compileRoute('pages/api/assistant/coaching.js', {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../src/lib/personal-assistant/coachingIntelligence.mjs': {
      buildCoachingSnapshot,
      receiptFingerprint,
    },
    '../../../src/lib/personal-assistant/leakRecord': { normalizeUserLeakRow },
    '../../../src/lib/personal-assistant/contextAuthority': { ACCESS_LEVELS, checkSandboxAccess },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: 'u-coach' }, error: null, status: 200 }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
  });

  const cooldownCoachingDb = createContextSupabase({
    recentPokerSessions: [{ id: 'p-1', ended_at: new Date(Date.now() - 60_000).toISOString() }],
    extraTables: {
      user_leaks: () => {
        const c = {
          select: () => c,
          eq: () => c,
          order: () => c,
          limit: async () => ({ data: sampleLeaks, error: null }),
        };
        return c;
      },
      hand_audit_decisions: () => {
        const c = {
          select: () => c,
          eq: () => c,
          like: () => c,
          order: () => c,
          limit: async () => ({ data: sampleDecisions, error: null }),
        };
        return c;
      },
    },
  });
  coachingMod._setSupabaseForTesting(cooldownCoachingDb);
  const coachRes = mockRes();
  await coachingMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, coachRes);
  assert.equal(coachRes.statusCode, 200);
  assert.equal(coachRes.body.snapshot.cooldownActive, true);
  assert.deepEqual(coachRes.body.decisions, []);
  assert.equal(coachRes.body.snapshot.priorities[0].representativeHand.solverAction, null);
  assert.equal(coachRes.body.snapshot.leaks[0].representativeHand.heroHand, null);
  assert.deepEqual(coachRes.body.snapshot.trainingPlan.modules[0].exampleHands, []);
  assert.equal(coachRes.body.snapshot.weeklyReport.focus[0].representativeHand.evLossBB, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. P0-5: Complete RTA coverage on leaks/index.js, leaks/review.js, audit-jobs.js
// ═══════════════════════════════════════════════════════════════════════════

test('[P0-5] leaks/index.js, leaks/review.js (GET & POST), and leaks/audit-jobs.js (GET redaction) enforce checkSandboxAccess RTA gates', async () => {
  const USER_ID = '22222222-2222-4222-8222-222222222222';
  const rateLimitStub = { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } };
  const authStub = {
    getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null, status: 200 }),
  };

  const seatedDb = createContextSupabase({
    activeTableSeats: [{ id: 'seat-live', table_id: 'tbl-1', left_at: null }],
  });
  const outageDb = createContextSupabase({
    pokerSessionsError: { code: '53300', message: 'connection limit' },
  });
  const cooldownDb = createContextSupabase({
    recentPokerSessions: [{ id: 'sess-1', ended_at: new Date(Date.now() - 60_000).toISOString() }],
  });

  // A) leaks/index.js
  const leaksIndexMod = compileRoute('pages/api/assistant/leaks/index.js', {
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/supabaseServerClient': { createClient: () => seatedDb },
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/persistenceContract': {
      availabilityFailure: (msg) => ({ success: false, error: msg }),
      persistedResult: (d, extra) => ({ success: true, data: d, ...extra }),
    },
    '../../../../src/lib/personal-assistant/leakRecord': {
      default: {},
      leakStatusPersistenceFields: () => ({}),
      leakTypeSlug: (s) => s,
      normalizeUserLeakRow,
      toUserLeakPersistenceRow: (r) => r,
    },
    '../../../../src/lib/personal-assistant/leakStats': {
      readLeakStatsAggregate: async () => ({ data: { activeLeaks: 0, resolvedLeaks: 0 }, error: null }),
    },
  });

  // Signed-out POST/PATCH still returns 401
  for (const method of ['POST', 'PATCH']) {
    const unauthRes = mockRes();
    await leaksIndexMod.default({ method, headers: {}, query: {}, body: {} }, unauthRes);
    assert.equal(unauthRes.statusCode, 401, `Signed-out leaks/index.js ${method} must return 401`);
  }

  // Authenticated GET, POST, PATCH during live play or authority outage must return 403 blocked: true
  for (const db of [seatedDb, outageDb]) {
    leaksIndexMod._setSupabaseForTesting(db);
    for (const method of ['GET', 'POST', 'PATCH']) {
      const rtaRes = mockRes();
      await leaksIndexMod.default(
        { method, headers: { authorization: 'Bearer tok' }, query: {}, body: { leak_type: 'river_overfold', id: 'l1', status: 'resolved' } },
        rtaRes,
      );
      assert.equal(rtaRes.statusCode, 403, `Authenticated leaks/index.js ${method} must 403 during live play/outage`);
      assert.equal(rtaRes.body.blocked, true);
    }
  }

  // B) leaks/review.js handleGet & handlePost
  const reviewMod = compileRoute('pages/api/assistant/leaks/review.js', {
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/supabaseServerClient': { createClient: () => seatedDb },
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/sandbox/leakReview': {},
    '../../../../src/lib/personal-assistant/drillTelemetry': { openDrillBatch },
  });

  for (const db of [seatedDb, cooldownDb, outageDb]) {
    reviewMod._setSupabaseForTesting(db);
    const getRes = mockRes();
    await reviewMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: {} }, getRes);
    assert.equal(getRes.statusCode, 403, 'leaks/review GET must 403 during live play, cooldown, or authority outage');
    assert.equal(getRes.body.blocked, true);
  }

  // C) leaks/audit-jobs.js GET redacts job.result during live play / cooldown / authority outage
  const completedJobRow = {
    id: 'job-completed-1',
    user_id: USER_ID,
    status: 'completed',
    stage: 'completed',
    progress: { handsScanned: 300, complete: true },
    result: {
      leaksDetected: 2,
      leaks: [{ id: 'leak-1', leak_type: 'river_overfold', suggested_fix: 'Call river bluff catchers' }],
    },
  };

  const makeAuditJobDb = (baseCtxOpts) => createContextSupabase({
    ...baseCtxOpts,
    extraTables: {
      pa_leak_audit_jobs: () => {
        const c = {
          select: () => c,
          eq: () => c,
          order: () => c,
          limit: () => c,
          maybeSingle: async () => ({ data: completedJobRow, error: null }),
        };
        return c;
      },
    },
  });

  const auditJobsMod = compileRoute('pages/api/assistant/leaks/audit-jobs.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/auditJobRuntime.mjs': {
      kickAuditWorker: async () => ({ ok: true }),
      publicAuditJob: (j) => (j ? { id: j.id, status: j.status, progress: j.progress, result: j.result } : null),
    },
  });

  for (const ctxOpts of [
    { activeTableSeats: [{ id: 's1', left_at: null }] },
    { recentPokerSessions: [{ id: 'p1', ended_at: new Date(Date.now() - 60_000).toISOString() }] },
    { pokerSessionsError: { code: '53300', message: 'outage' } },
  ]) {
    auditJobsMod._setSupabaseForTesting(makeAuditJobDb(ctxOpts));
    const res = mockRes();
    await auditJobsMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.job.rtaRestricted, true);
    assert.equal('result' in res.body.job, false, 'job.result must be omitted when RTA restricted');
    assert.equal('leaks' in res.body.job, false, 'job.leaks must be omitted when RTA restricted');
  }

  // Off-table eligible session returns full job.result
  auditJobsMod._setSupabaseForTesting(makeAuditJobDb({}));
  const okJobRes = mockRes();
  await auditJobsMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, okJobRes);
  assert.equal(okJobRes.statusCode, 200);
  assert.ok(okJobRes.body.job.result, 'Eligible off-table GET returns job.result');
  assert.equal(okJobRes.body.job.result.leaks.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. P1-2: Complete PA lifecycle for training_tool_records (synced-hand-history)
// ═══════════════════════════════════════════════════════════════════════════

test('[P1-2] data-controls.js includes training_tool_records (synced-hand-history) in summary, sanitized export, fail-closed DELETE purge, and fail-closed POST retention', async () => {
  const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const OWNER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SECRET = 'phase7-lifecycle-test-secret-with-32-chars!!';
  const prevSecret = process.env.PA_DATA_LIFECYCLE_SECRET;
  process.env.PA_DATA_LIFECYCLE_SECRET = SECRET;

  try {
    let failToolDelete = false;
    let deletedFilters = [];
    const toolRecords = [
      {
        id: 'sync-a-1',
        user_id: OWNER_A,
        tool_id: 'synced-hand-history',
        record_key: 'h-sync-1',
        updated_at: '2026-01-01T00:00:00.000Z',
        data: {
          id: 'h-sync-1',
          players: [
            { userId: OWNER_A, cards: ['Ah', 'Kh'], showed: false },
            { userId: OWNER_B, cards: ['2c', '7d'], hole_cards: ['2c', '7d'], showed: false },
          ],
          hole_cards: {
            [OWNER_A]: ['Ah', 'Kh'],
            [OWNER_B]: ['2c', '7d'],
          },
        },
      },
      {
        id: 'sync-a-other-tool',
        user_id: OWNER_A,
        tool_id: 'other-training-tool',
        record_key: 'other-1',
        updated_at: '2026-01-01T00:00:00.000Z',
        data: {},
      },
      {
        id: 'sync-b-1',
        user_id: OWNER_B,
        tool_id: 'synced-hand-history',
        record_key: 'h-sync-b',
        updated_at: '2026-01-01T00:00:00.000Z',
        data: {},
      },
    ];

    const mockDb = {
      rpc: async (fn) => {
        if (fn === 'purge_personal_assistant_data') {
          return {
            data: {
              receipt_id: 'rec-del-p7',
              receipt_fingerprint: 'f'.repeat(32),
              counts: { leaks: 0 },
            },
            error: null,
          };
        }
        if (fn === 'apply_personal_assistant_retention') {
          return {
            data: {
              applied: true,
              retention_days: 30,
              counts: { leaks: 0 },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from(table) {
        const filters = [];
        let isCountHead = false;
        let isDelete = false;
        let insertedRow = null;
        let ltCutoff = null;

        const matchingRows = () => {
          const source = table === 'training_tool_records'
            ? toolRecords
            : table === 'pa_coaching_preferences'
              ? [{ user_id: OWNER_A, saved_view: 'data', analysis_depth: 'guided', panel_layout: {}, retention_days: 30 }]
              : [];
          return source.filter((r) => filters.every((fn) => fn(r)));
        };

        const chain = {
          select(_cols, opts) {
            if (opts?.count === 'exact' && opts?.head === true) isCountHead = true;
            if (insertedRow) {
              return { maybeSingle: async () => ({ data: insertedRow, error: null }) };
            }
            return chain;
          },
          delete() {
            isDelete = true;
            return chain;
          },
          eq(col, val) {
            filters.push((r) => String(r[col]) === String(val));
            return chain;
          },
          lt(col, val) {
            ltCutoff = { col, val };
            filters.push((r) => String(r[col] || '') < String(val));
            return chain;
          },
          in() { return chain; },
          contains() { return chain; },
          order() { return chain; },
          limit: async (n) => ({ data: matchingRows().slice(0, n), error: null }),
          range: async (from, to) => ({ data: matchingRows().slice(from, to + 1), error: null }),
          maybeSingle: async () => ({ data: matchingRows()[0] || null, error: null }),
          insert(payload) {
            insertedRow = { id: 'rec-exp-1', created_at: '2026-11-26T00:00:00Z', ...payload };
            return chain;
          },
          upsert(payload) {
            insertedRow = { retention_days: payload.retention_days, last_retention_run_at: payload.last_retention_run_at };
            return chain;
          },
          then(resolve, reject) {
            if (isDelete && table === 'training_tool_records') {
              if (failToolDelete) {
                return Promise.resolve({ data: null, count: null, error: new Error('tool records delete failed') }).then(resolve, reject);
              }
              const matched = matchingRows();
              deletedFilters.push({ count: matched.length, ltCutoff });
              return Promise.resolve({ data: matched, count: matched.length, error: null }).then(resolve, reject);
            }
            if (isCountHead) {
              return Promise.resolve({ count: matchingRows().length, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: matchingRows(), error: null }).then(resolve, reject);
          },
        };
        return chain;
      },
    };

    const dataControlsMod = compileRoute('pages/api/assistant/data-controls.js', {
      '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
      '../../../src/lib/personal-assistant/dataLifecycle.mjs': {
        openDeletionChallenge,
        retentionDays: (v) => Number(v),
        sanitizeExportHandRow,
        sealDeletionChallenge,
      },
      '../../../src/lib/serverAuth': {
        getServerUserWithFallback: async () => ({ user: { id: OWNER_A }, error: null, status: 200 }),
      },
      '../../../src/lib/supabaseServerClient': { createClient: () => mockDb },
    });
    dataControlsMod._setSupabaseForTesting(mockDb);

    // 1) GET summary includes syncedHands count (only OWNER_A + tool_id='synced-hand-history' -> 1)
    const sumRes = mockRes();
    await dataControlsMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, sumRes);
    assert.equal(sumRes.statusCode, 200);
    assert.equal(sumRes.body.counts.syncedHands, 1);

    // 2) POST export includes syncedHands sanitized via sanitizeExportHandRow
    const expRes = mockRes();
    await dataControlsMod.default({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'export' } }, expRes);
    assert.equal(expRes.statusCode, 200);
    assert.equal(expRes.body.data.syncedHands.length, 1);
    const exportedSynced = expRes.body.data.syncedHands[0];
    assert.deepEqual(exportedSynced.data.players[0].cards, ['Ah', 'Kh'], 'Hero hole cards preserved');
    assert.equal(exportedSynced.data.players[1].cards, undefined, 'Non-showdown villain cards stripped');
    assert.equal(exportedSynced.data.hole_cards[OWNER_B], undefined, 'Non-showdown villain hole_cards map stripped');

    // 3) DELETE purge (scope: 'audits') deletes synced-hand-history rows and reports deleted count
    const reqDelRes = mockRes();
    await dataControlsMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'request_deletion', scope: 'audits' } },
      reqDelRes,
    );
    assert.equal(reqDelRes.statusCode, 200);
    const delRes = mockRes();
    await dataControlsMod.default(
      {
        method: 'DELETE',
        headers: { authorization: 'Bearer tok' },
        body: {
          scope: 'audits',
          challenge: reqDelRes.body.challenge,
          confirmation: 'DELETE MY PERSONAL ASSISTANT DATA',
        },
      },
      delRes,
    );
    assert.equal(delRes.statusCode, 200);
    assert.equal(delRes.body.syncedHandsDeleted, 1);
    assert.equal(delRes.body.receipt.counts.syncedHands, 1);

    // Fail-closed when training_tool_records delete fails
    failToolDelete = true;
    const delFailRes = mockRes();
    await dataControlsMod.default(
      {
        method: 'DELETE',
        headers: { authorization: 'Bearer tok' },
        body: {
          scope: 'audits',
          challenge: reqDelRes.body.challenge,
          confirmation: 'DELETE MY PERSONAL ASSISTANT DATA',
        },
      },
      delFailRes,
    );
    assert.equal(delFailRes.statusCode, 503, 'DELETE must fail closed when synced-hand-history purge fails');

    // 4) POST save_retention prunes synced-hand-history rows with updated_at < cutoffIso and fails closed on error
    const retFailRes = mockRes();
    await dataControlsMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'save_retention', retentionDays: 30 } },
      retFailRes,
    );
    assert.equal(retFailRes.statusCode, 503, 'save_retention must fail closed when synced-hand-history retention prune fails');

    failToolDelete = false;
    deletedFilters = [];
    const retOkRes = mockRes();
    await dataControlsMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'save_retention', retentionDays: 30 } },
      retOkRes,
    );
    assert.equal(retOkRes.statusCode, 200);
    assert.equal(retOkRes.body.syncedHandsDeleted, 1);
    assert.ok(deletedFilters[0]?.ltCutoff?.col === 'updated_at', 'Retention must filter updated_at < cutoffIso');
  } finally {
    if (prevSecret === undefined) delete process.env.PA_DATA_LIFECYCLE_SECRET;
    else process.env.PA_DATA_LIFECYCLE_SECRET = prevSecret;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. P1-5 & Cross-App P1-5: pages/api/training/audit-hand-history.js
// ═══════════════════════════════════════════════════════════════════════════

test('[P1-5] audit-hand-history.js never fabricates hero/board cards or flop street, scopes GET ?handId= by user_id, reuses bigBlind/effectiveStackBb, and forwards sanitized source/returnTo', async () => {
  const USER_ID = '55555555-5555-4555-8555-555555555555';
  let activeDb = null;
  const dbProxy = {
    from: (...args) => activeDb.from(...args),
    rpc: (...args) => activeDb.rpc(...args),
  };

  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey || 'test-service-role-key';

  try {
    let parsedHandsFixture = [];
    const auditHhMod = compileRoute('pages/api/training/audit-hand-history.js', {
      '../../../src/lib/serverAuth.js': {
        getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null, status: 200 }),
      },
      '../../../src/lib/supabaseServerClient.js': { createClient: () => dbProxy },
      '../../../src/lib/apiRateLimit.js': { applyRateLimit: () => true, LIMITS: { write: {} } },
      '../../../src/lib/apiErrorHandler.js': { reportApiError() {} },
      '../../../src/lib/personal-assistant/contextAuthority.js': { checkSandboxAccess, isFeatureAccessible },
      '../../../src/engines/HandHistoryParser.js': {
        parseHandHistory: () => parsedHandsFixture,
      },
      '../../../src/lib/training/handAuditEngine.js': {
        auditParsedHands: async () => ({
          persisted: true,
          evidenceReconciled: true,
          analyses: parsedHandsFixture.map((h) => ({
            handId: h.id,
            solverVerified: true,
            totalEVLoss: 0.75,
            decisions: [{ street: 'preflop', heroPosition: 'BTN' }],
          })),
        }),
      },
      '../../../src/lib/training/customTrainingLaunchContract.mjs': { buildCustomTrainingArenaHref: () => '/hub/training' },
      '../../../src/lib/training/clubArenaTableParity.js': {
        parseStakesToBlinds: () => ({ smallBlind: 1, bigBlind: 2, stakesLabel: '1/2' }),
      },
      '../../../src/lib/training/horseBrainTrainingAdapter.js': {
        evaluateTrainingSpotWithHorseBrain: ({ heroCards, boardCards, street }) => ({
          recommendedAction: `Act-${street}-${heroCards.join('')}-${boardCards.length}`,
          actionEVs: { raise: 1.5, fold: 0 },
          handScore: 78,
        }),
      },
    });

    // 1) rankImportedHandsByEvLeak never fabricates ['As','Kd'], ['8d','5c','2s'], or 'flop'
    const { rankImportedHandsByEvLeak } = auditHhMod;
    const rankedMissing = rankImportedHandsByEvLeak([
      { id: 'no-hero-cards', heroCards: [], board: [] },
      { id: 'preflop-with-cards', heroCards: ['Qh', 'Qd'], board: [] },
    ]);
    const unpricedHand = rankedMissing.find((h) => h.id === 'no-hero-cards');
    assert.deepEqual(unpricedHand.heroCards, [], 'Must preserve empty heroCards without fabricating As Kd');
    assert.deepEqual(unpricedHand.boardCards, [], 'Must preserve empty boardCards without fabricating 8d 5c 2s');
    assert.equal(unpricedHand.street, 'preflop', 'Empty board must stay preflop, never flop');
    assert.equal(unpricedHand.estimatedEvLossBb, null, 'Missing heroCards must stay unpriced');
    assert.equal(unpricedHand.recommendedAction, null, 'Missing heroCards must not invent recommendedAction');

    const preflopPriced = rankedMissing.find((h) => h.id === 'preflop-with-cards');
    assert.equal(preflopPriced.street, 'preflop');
    assert.deepEqual(preflopPriced.boardCards, []);
    assert.ok(Number.isFinite(preflopPriced.estimatedEvLossBb));

    // 2) GET ?handId= scopes training_tool_records by user_id (succeeds with >5 other users, 404 when not owned)
    const manyUserRows = [
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `row-other-${i}`,
        user_id: `other-user-${i}`,
        tool_id: 'synced-hand-history',
        record_key: 'shared-hand-key',
        data: { id: 'shared-hand-key', heroCards: ['7c', '2d'], participants: [`other-user-${i}`] },
      })),
      {
        id: 'row-owned',
        user_id: USER_ID,
        tool_id: 'synced-hand-history',
        record_key: 'shared-hand-key',
        data: { id: 'shared-hand-key', heroCards: ['Ah', 'Ad'], board: [], participants: [USER_ID] },
      },
    ];

    const makeToolLookupDb = (rows) => createContextSupabase({
      extraTables: {
        training_tool_records: () => {
          const filters = [];
          const chain = {
            select() { return chain; },
            eq(col, val) {
              filters.push((r) => String(r[col]) === String(val));
              return chain;
            },
            maybeSingle: async () => ({
              data: rows.find((r) => filters.every((fn) => fn(r))) || null,
              error: null,
            }),
            limit: async (n) => ({
              data: rows.filter((r) => filters.every((fn) => fn(r))).slice(0, n),
              error: null,
            }),
          };
          return chain;
        },
      },
    });

    activeDb = makeToolLookupDb(manyUserRows);
    const getOwnedRes = mockRes();
    await auditHhMod.default(
      { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { handId: 'shared-hand-key' } },
      getOwnedRes,
    );
    assert.equal(getOwnedRes.statusCode, 200, 'Owner must resolve hand even when >5 other users share record_key');
    assert.deepEqual(getOwnedRes.body.hand.heroCards, ['Ah', 'Ad']);

    // When another user owns a record_key and USER_ID does not, return 404 (no cross-user 403 oracle)
    activeDb = makeToolLookupDb(manyUserRows.filter((r) => r.user_id !== USER_ID));
    const getForeignRes = mockRes();
    await auditHhMod.default(
      { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { handId: 'shared-hand-key' } },
      getForeignRes,
    );
    assert.equal(getForeignRes.statusCode, 404, 'Unowned record_key in training_tool_records must 404, not 403 oracle');
    assert.equal(getForeignRes.body.code, 'HAND_NOT_FOUND');

    // 3) POST reuses resolved bigBlind/effectiveStackBb and forwards sanitized source & returnTo into drillHref
    parsedHandsFixture = [
      {
        id: 'mtt-hand-500',
        gameType: 'Tournament',
        bigBlind: 100,
        smallBlind: 50,
        hero: { name: 'Hero', seat: 1, position: 'BTN', holeCards: ['As', 'Ks'], stack: 1500 },
        players: [
          { name: 'Hero', seat: 1, stack: 1500 },
          { name: 'Villain', seat: 2, stack: 1200 },
        ],
        result: { pot: 350 },
      },
    ];
    activeDb = createContextSupabase({
      extraTables: {
        training_tool_records: () => ({
          upsert: async () => ({ data: [], error: null }),
        }),
      },
    });
    const postRes = mockRes();
    await auditHhMod.default(
      {
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: {
          handHistoryText: 'PokerStars Hand #500: Tournament ...',
          source: 'personal-assistant-live-spot',
          returnTo: '/hub/personal-assistant/leaks?tab=quickspot',
        },
      },
      postRes,
    );
    assert.equal(postRes.statusCode, 200);
    const synced = postRes.body.syncedHands[0];
    assert.equal(synced.bigBlind, 100, 'Must reuse hand.bigBlind=100 instead of falling back to 1/2 (bigBlind=2)');
    assert.equal(synced.pot, 3.5, '350 chips at BB=100 must be 3.5 BB');
    assert.equal(synced.stackDepth, 12, 'Effective stack min(1500, 1200) at BB=100 must be 12 BB');
    assert.match(synced.drillHref, /source=personal-assistant-live-spot/);
    assert.match(synced.drillHref, /returnTo=%2Fhub%2Fpersonal-assistant%2Fleaks%3Ftab%3Dquickspot/);

    // External returnTo is stripped
    const badReturnRes = mockRes();
    await auditHhMod.default(
      {
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: {
          handHistoryText: 'PokerStars Hand #500: Tournament ...',
          source: 'invalid source!!',
          returnTo: 'https://evil.example/phish',
        },
      },
      badReturnRes,
    );
    assert.equal(badReturnRes.statusCode, 200);
    assert.match(badReturnRes.body.syncedHands[0].drillHref, /source=live-hand-sync/);
    assert.doesNotMatch(badReturnRes.body.syncedHands[0].drillHref, /returnTo=/);
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. P1-6: pages/api/assistant/leaks/detect.js ca_hand_facts pipeline
// ═══════════════════════════════════════════════════════════════════════════

test('[P1-6] detect.js validates UUIDs in linkHandExamples, links ca_hand_facts sample_hand_ids, and fails closed on ca_hand_facts DB errors without false auto-resolve', async () => {
  const USER_ID = '66666666-6666-4666-8666-666666666666';
  const VALID_HAND_UUID = '77777777-7777-4777-8777-777777777777';

  const detectMod = compileRoute('pages/api/assistant/leaks/detect.js', {
    '../../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null, status: 200 }),
    },
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/training/solverDecisionEvidence': {
      aggregateSolverLeaks: () => [],
      canResolveSolverLeakScope: () => false,
      solverDecisionGroupKey: () => 'solver_key',
      summarizeSolverDecisionGroups: () => [],
    },
    '../../../../src/lib/training/cacheTruthContract.mjs': { gradeCanonicalPolicyDecision: () => ({}) },
    '../../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheQuestionFromRow: (r) => r,
      cacheRowIsServingEligible: () => true,
    },
    '../../../../src/lib/personal-assistant/leakStats': {
      readLeakStatsAggregate: async () => ({ data: { activeLeaks: 1, resolvedLeaks: 0, avgEvLoss: 0.2 }, error: null }),
    },
    '../../../../src/lib/training/handAuditEngine': {
      MATCHER_VERSION: 'hand-audit-v3',
      syncClubArenaHandsForAudit: async () => ({
        available: true,
        persisted: true,
        complete: true,
        handsFound: 120,
        cumulativeHandsFound: 120,
        decisionsAnalyzed: 0,
        solverVerified: 0,
      }),
    },
    '../../../../src/lib/personal-assistant/auditJobRuntime.mjs': {
      incrementalBoundaryFromCompletedJob: () => null,
      isFullRescanRequested: () => false,
    },
    '../../../../src/lib/personal-assistant/caHandFactsAnalyzer.mjs': {
      analyzeCaHandFacts: () => ({
        totalEligibleHands: 120,
        excludedUnsupportedHands: 0,
        cash: { hands: 120, blindDefenseOpps: 40 },
        tournament: { hands: 0 },
        tournamentByStack: {},
        detectedLeaks: [
          {
            leak_type: 'cash_blind_defense_too_tight',
            leak_category: 'preflop',
            situation_class: 'Cash Big Blind Defense Too Tight',
            total_samples: 40,
            occurrence_count: 18,
            current_frequency: 22,
            optimal_frequency: 45,
            optimal_range: [38, 54],
            avg_ev_loss_bb: 0.18,
            recommended_drill: 'cash-003',
            explanation: 'Defending BB too rarely',
            why_leaking_ev: 'Opponents profit with any two cards',
            sample_hand_ids: [VALID_HAND_UUID, 'not-a-uuid-hand-id'],
          },
        ],
      }),
    },
    '../../../../src/lib/personal-assistant/leakRecord': {
      toUserLeakPersistenceRow: (l) => l,
      generateLeakFix: () => 'Defend wider in BB',
      LEAK_PATTERNS: {},
      PATTERN_STAT_KEYS: {},
      patternIsMeasured: () => false,
      deviationFromRange: () => 10,
      parseHandSummary: () => ({}),
      classifyHandAuditEligibility: () => ({ eligible: true }),
      normalizeAuditHand: (h) => ({ id: h.id, actions: [] }),
      computeStatsFromAuditHands: () => ({ handsPlayed: 120 }),
      classifyLeakStatus: () => 'persistent',
      generateExplanation: () => 'Explanation',
      getCurrentValue: () => 20,
      updateTrendData: () => [],
      toCardCodes: (c) => (Array.isArray(c) ? c : null),
      checkHandForLeak: () => null,
      getWhyLeakingEV: () => 'Why',
    },
    '../../../../src/lib/apiRateLimit': {
      applyRateLimit: () => true,
      applyDurableRateLimit: async () => true,
    },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/auditJobToken.mjs': { openAuditJobToken: () => null },
    '../../../../src/lib/personal-assistant/auditCursor.mjs': {
      fingerprintAuditCursor: () => 'fp',
      openAuditCursor: () => null,
      sealAuditCursor: () => 'cur',
    },
    '../../../../src/lib/personal-assistant/serverTiming.mjs': { attachPersonalAssistantTiming() {} },
  });

  // 1) linkHandExamples filters out non-UUID external IDs before .in('id', batch) and links valid UUID hands
  const queriedInBatches = [];
  const upsertedExamples = [];
  const mockLinkDb = {
    from(table) {
      if (table === 'hand_history') {
        const chain = {
          select() { return chain; },
          contains() { return chain; },
          in(_col, batch) {
            queriedInBatches.push(batch);
            for (const id of batch) {
              if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
                throw new Error(`22P02 invalid input syntax for type uuid: "${id}"`);
              }
            }
            return chain;
          },
          order() { return chain; },
          limit: async () => ({
            data: [{
              id: VALID_HAND_UUID,
              players: [{ userId: USER_ID }],
              hole_cards: { [USER_ID]: ['As', '5s'] },
              community_cards: ['Ks', '7d', '2c'],
              created_at: '2026-11-26T00:00:00Z',
            }],
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'leak_hand_examples') {
        return {
          upsert: async (rows) => {
            upsertedExamples.push(...rows);
            return { error: null };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ in: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
      };
    },
  };

  const linkRes = await detectMod.linkHandExamples(
    USER_ID,
    [{
      id: 'leak-uuid-1',
      leak_type: 'cash_blind_defense_too_tight',
      leak_category: 'preflop',
      avg_ev_loss_bb: 0.18,
      sourceHandExternalIds: [`club-arena:${VALID_HAND_UUID}`, 'club-arena:non-uuid-sample-99'],
    }],
    mockLinkDb,
  );
  assert.equal(linkRes.persisted, true);
  assert.equal(linkRes.linked, 1);
  assert.deepEqual(queriedInBatches[0], [VALID_HAND_UUID], 'Non-UUID must be filtered out before .in("id", batch)');
  assert.equal(upsertedExamples[0].hand_history_id, VALID_HAND_UUID);

  // 2) readCaHandFactsAnalysis surfaces DB errors ({ ok: false, error })
  const failedFactsDb = {
    from() {
      const c = {
        select: () => c,
        eq: () => c,
        order: () => c,
        limit: async () => ({ data: null, error: { code: '57014', message: 'ca_hand_facts timeout' } }),
      };
      return c;
    },
  };
  const factsErrOutcome = await detectMod.readCaHandFactsAnalysis(failedFactsDb, USER_ID);
  assert.equal(factsErrOutcome.ok, false);
  assert.equal(factsErrOutcome.error.code, '57014');

  // 3) Full detect handler with ca_hand_facts error sets partial: true and refuses to auto-resolve existing ca_hand_facts leaks
  let resolveRpcCalled = false;
  const detectOutageDb = createContextSupabase({
    rpcHandler: async (fn) => {
      if (fn === 'resolve_user_leaks_if_unchanged') {
        resolveRpcCalled = true;
        return { data: { success: true, conflicts: 0 }, error: null };
      }
      if (fn === 'ca_player_stats_overview_separated') {
        return { data: { overall: { total_hands: 250, vpip: 0.24, pfr: 0.18 } }, error: null };
      }
      return { data: null, error: null };
    },
    extraTables: {
      ca_hand_facts: () => {
        const c = {
          select: () => c,
          eq: () => c,
          order: () => c,
          limit: async () => ({ data: null, error: { code: '57014', message: 'facts query failed' } }),
        };
        return c;
      },
      user_leaks: () => {
        const c = {
          select: () => c,
          eq: () => c,
          order: () => c,
          range: async () => ({
            data: [{
              id: 'existing-ca-fact-leak',
              user_id: USER_ID,
              leak_type: 'cash_blind_defense_too_tight',
              source_system: 'ca_hand_facts',
              detector_managed: true,
              status: 'persistent',
            }],
            error: null,
          }),
        };
        return c;
      },
      user_assistant_stats: () => {
        const c = {
          select: () => c,
          eq: () => c,
          maybeSingle: async () => ({ data: { total_hands_analyzed: 250 }, error: null }),
          upsert: async () => ({ error: null }),
        };
        return c;
      },
    },
  });

  detectMod._setSupabaseForTesting(detectOutageDb);
  const detectRes = mockRes();
  await detectMod.default({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: {} }, detectRes);
  assert.equal(detectRes.statusCode, 200);
  assert.equal(detectRes.body.partial, true, 'detect.js must mark partial: true when ca_hand_facts query fails');
  assert.equal(detectRes.body.evidencePartial, true);
  assert.equal(resolveRpcCalled, false, 'detect.js must refuse to auto-resolve ca_hand_facts leaks when facts query failed');
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. P2-1 & P2-14: stats.js aggressionFactor & liveSpotHandHistory.mjs unsupportedCount
// ═══════════════════════════════════════════════════════════════════════════

test('[P2-1 & P2-14] stats.js wires computeAggressionFactor into stats.aggressionFactor and summarizeLiveSpotAudit returns unsupportedCount', async () => {
  const statsMod = compileRoute('pages/api/assistant/stats.js', {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: 'u-stats-p7' }, error: null, status: 200 }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../src/lib/personal-assistant/leakStats': {
      readLeakStatsAggregate: async () => ({ data: { activeLeaks: 1, resolvedLeaks: 2, avgEvLoss: 0.45 }, error: null }),
    },
  });

  let factRows = [
    { af_bet_raise_actions: 9, af_call_actions: 3 },
    { af_bet_raise_actions: 6, af_call_actions: 3 },
  ];
  const mockStatsDb = {
    from(table) {
      if (table === 'user_assistant_stats') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { sandbox_sessions_count: 2, total_hands_analyzed: 100 }, error: null }),
            }),
          }),
        };
      }
      if (table === 'sandbox_sessions') {
        return { select: () => ({ eq: async () => ({ count: 2, error: null }) }) };
      }
      if (table === 'ca_hand_facts') {
        let isCountHead = false;
        const chain = {
          select(_cols, opts) {
            if (opts?.count === 'exact' && opts?.head === true) isCountHead = true;
            return chain;
          },
          eq() { return chain; },
          is() { return chain; },
          not() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          then(resolve, reject) {
            if (isCountHead) return Promise.resolve({ count: 100, error: null }).then(resolve, reject);
            return Promise.resolve({ data: factRows, error: null }).then(resolve, reject);
          },
        };
        return chain;
      }
      return { select: () => ({ eq: async () => ({ count: 0, error: null }) }) };
    },
  };

  statsMod._setSupabaseForTesting(mockStatsDb);
  const res = mockRes();
  await statsMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.stats.aggressionFactor, {
    value: 2.5,
    available: true,
    reason: null,
    betsAndRaises: 15,
    calls: 6,
    totalActions: 21,
  });

  // Fail-safe when ca_hand_facts is empty
  factRows = [];
  const emptyRes = mockRes();
  await statsMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, emptyRes);
  assert.equal(emptyRes.statusCode, 200);
  assert.equal(emptyRes.body.stats.aggressionFactor.value, null);
  assert.equal(emptyRes.body.stats.aggressionFactor.available, false);
  assert.equal(emptyRes.body.stats.aggressionFactor.reason, 'unmeasured');

  // P2-14: summarizeLiveSpotAudit returns unsupportedCount
  const summaryWithUnsupported = summarizeLiveSpotAudit({
    handsParsed: 4,
    unsupportedCount: 2,
    analyses: [],
  });
  assert.equal(summaryWithUnsupported.unsupportedCount, 2);

  const summaryDefaultUnsupported = summarizeLiveSpotAudit({
    handsParsed: 1,
    analyses: [],
  });
  assert.equal(summaryDefaultUnsupported.unsupportedCount, 0);
});
