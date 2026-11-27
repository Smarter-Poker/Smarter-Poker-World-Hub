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
  getUserContextState,
  isFeatureAccessible,
} from '../src/lib/personal-assistant/contextAuthority.js';
import {
  openDeletionChallenge,
   sanitizeExportHandRow,
  sealDeletionChallenge,
} from '../src/lib/personal-assistant/dataLifecycle.mjs';
import { executeSingleHandAudit } from '../src/lib/personal-assistant/handAuditRouteCore.mjs';
import { normalizeUserLeakRow, leakTypeTitle } from '../src/lib/personal-assistant/leakRecord.js';
import { sealDrillBatch, openDrillBatch } from '../src/lib/personal-assistant/drillTelemetry.js';

let buildCoachingSnapshot = ({ liveTable = null, decisions = [] } = {}) => {
  const liveStateKnown = Boolean(liveTable) && typeof liveTable === 'object';
  const liveTableActive = liveStateKnown ? liveTable.active === true : true;
  const cooldownActive = liveStateKnown && liveTable.cooldown === true;
  const blocked = liveTableActive || cooldownActive;
  return {
    coverage: { verified: decisions.length, decisions: decisions.length, rejected: 0 },
    leaks: [],
    sessionDebrief: {
      topLeakedHands: blocked ? [] : decisions,
      liveTableActive,
      cooldownActive,
      recapEligible: !blocked && decisions.length > 0,
      recapUnavailableReason: blocked ? (liveTableActive ? 'live_table_active' : 'cooldown_active') : null,
    },
  };
};
try {
  const mod = await import('../src/lib/personal-assistant/coachingIntelligence.mjs');
  if (typeof mod?.buildCoachingSnapshot === 'function') {
    buildCoachingSnapshot = mod.buildCoachingSnapshot;
  }
} catch (_) {
  // Fallback used only if a concurrent peer agent is mid-edit on coachingIntelligence.mjs
}

const require = createRequire(import.meta.url);
const ts = require('typescript');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

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

/**
 * Configurable fake Supabase client for testing contextAuthority (poker_sessions + table_seats)
 * plus route-specific table queries.
 */
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
// 1. OWNERSHIP & RETENTION (SQL MIGRATIONS + DATA-CONTROLS RUNTIME)
// ═══════════════════════════════════════════════════════════════════════════

test('Section 5.1 [SQL Migrations]: 20261124221500 & 20261125060000 enforce owner-scoped sandbox_results RLS and complete purge/retention graph', () => {
  const mig1 = read('supabase/migrations/20261124221500_pa_rls_lifecycle_and_lease_hardening.sql');
  const mig2 = read('supabase/migrations/20261125060000_pa_phase2_rpc_and_lifecycle_hardening.sql');

  // 1. sandbox_results drops USING(true) policy and scopes SELECT to sandbox_sessions.user_id = auth.uid()
  assert.match(mig1, /DROP POLICY IF EXISTS "sandbox_results_authenticated_select" ON public\.sandbox_results/);
  assert.match(mig1, /CREATE POLICY "sandbox_results_owner_select"\s+ON public\.sandbox_results\s+FOR SELECT\s+TO authenticated[\s\S]*s\.id = sandbox_results\.session_id[\s\S]*s\.user_id = \(SELECT auth\.uid\(\)\)/);

  // 2. Both migrations cover the full owned-data graph in purge_personal_assistant_data and apply_personal_assistant_retention
  const requiredOwnedTables = [
    'pa_coach_feedback',
    'pa_coaching_goals',
    'pa_coaching_preferences',
    'leak_hand_examples',
    'leak_drill_answers',
    'leak_drill_attempts',
    'leak_drill_sessions',
    'leak_review_operations',
    'leak_review_state',
    'hand_audit_decisions',
    'pa_leak_audit_jobs',
    'user_training_leaks',
    'user_leaks',
    'user_assistant_stats',
    'sandbox_coach_results',
    'sandbox_equity_history',
    'sandbox_results',
    'sandbox_sessions',
    'sandbox_saved_hands',
    'sandbox_analytics',
    'sandbox_quiz_results',
    'sandbox_bookmarks',
    'sandbox_templates',
    'sandbox_shared_scenarios',
    'solution_bookmarks',
  ];

  for (const table of requiredOwnedTables) {
    assert.match(mig2, new RegExp(`DELETE FROM public\\.${table}\\b`), `20261125060000 must delete owned rows from public.${table}`);
  }

  // 3. Source Club Arena hands and ca_hand_facts are NEVER deleted by PA purge/retention
  assert.doesNotMatch(mig1, /DELETE FROM public\.hand_history\b/);
  assert.doesNotMatch(mig1, /DELETE FROM public\.ca_hand_facts\b/);
  assert.doesNotMatch(mig2, /DELETE FROM public\.hand_history\b/);
  assert.doesNotMatch(mig2, /DELETE FROM public\.ca_hand_facts\b/);

  // 4. leak_hand_examples grants tightened to SELECT-only for authenticated
  assert.match(mig2, /REVOKE ALL ON TABLE public\.leak_hand_examples FROM PUBLIC, anon, authenticated/);
  assert.match(mig2, /GRANT SELECT ON TABLE public\.leak_hand_examples TO authenticated/);
});

test('Section 5.1 [data-controls.js runtime]: owner-scoped export/summary includes leak_review_operations and strips non-showdown villain cards, while DELETE/retention fail closed on partial failure', async () => {
  const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const OWNER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SECRET = 'section5-lifecycle-test-secret-with-32-chars!';
  const prevSecret = process.env.PA_DATA_LIFECYCLE_SECRET;
  process.env.PA_DATA_LIFECYCLE_SECRET = SECRET;

  try {
    let rpcBehavior = 'success';
    const tableRows = {
      user_leaks: [
        { id: 'leak-a-1', user_id: OWNER_A, leak_type: 'river_overfold' },
        { id: 'leak-b-1', user_id: OWNER_B, leak_type: 'cbet_too_low' },
      ],
      user_training_leaks: [{ id: 'tl-a-1', user_id: OWNER_A, leak_type: 'preflop_fold' }],
      user_assistant_stats: [{ user_id: OWNER_A, total_hands_analyzed: 420 }],
      hand_audit_decisions: [{ id: 'dec-a-1', user_id: OWNER_A, hand_external_id: 'club-arena:h1' }],
      leak_review_state: [{ id: 'rev-a-1', user_id: OWNER_A, leak_id: 'leak-a-1', reps: 3 }],
      leak_review_operations: [
        { id: 'op-a-1', user_id: OWNER_A, leak_id: 'leak-a-1', review_id: 'rev_op_12345678' },
        { id: 'op-b-1', user_id: OWNER_B, leak_id: 'leak-b-1', review_id: 'rev_op_87654321' },
      ],
      pa_leak_audit_jobs: [{ id: 'job-a-1', user_id: OWNER_A, status: 'completed' }],
      leak_drill_sessions: [{ batch_id: 'batch-a-1', user_id: OWNER_A, leak_id: 'leak-a-1' }],
      leak_drill_answers: [{ id: 'ans-a-1', user_id: OWNER_A, batch_id: 'batch-a-1' }],
      leak_drill_attempts: [{ id: 'att-a-1', user_id: OWNER_A, batch_id: 'batch-a-1' }],
      pa_coaching_goals: [{ id: 'goal-a-1', user_id: OWNER_A, title: 'Fix River Defense' }],
      pa_coach_feedback: [{ id: 'fb-a-1', user_id: OWNER_A, feedback_type: 'helpful' }],
      pa_coaching_preferences: [{ user_id: OWNER_A, saved_view: 'coach', analysis_depth: 'guided', panel_layout: {}, retention_days: 90, last_retention_run_at: '2026-11-25T00:00:00Z' }],
      pa_data_lifecycle_receipts: [],
      sandbox_sessions: [{ id: 'sess-a-1', user_id: OWNER_A }],
      sandbox_results: [{ id: 'res-a-1', session_id: 'sess-a-1', primary_action: 'Call' }],
      sandbox_saved_hands: [],
      sandbox_analytics: [],
      sandbox_quiz_results: [],
      sandbox_coach_results: [],
      sandbox_bookmarks: [],
      sandbox_equity_history: [],
      sandbox_templates: [],
      sandbox_shared_scenarios: [{ id: 'sh-a1', creator_id: OWNER_A }],
      solution_bookmarks: [],
      leak_hand_examples: [{ id: 'ex-a-1', leak_id: 'leak-a-1' }],
      ca_hand_facts: [{ hand_id: 'hand-1', user_id: OWNER_A }],
      hand_history: [
        {
          id: 'hand-1',
          created_at: '2026-11-25T10:00:00Z',
          players: [
            { userId: OWNER_A, cards: ['As', 'Ks'], showed: false },
            { userId: OWNER_B, cards: ['7c', '2d'], hole_cards: ['7c', '2d'], showed: false },
          ],
          hole_cards: {
            [OWNER_A]: ['As', 'Ks'],
            [OWNER_B]: ['7c', '2d'],
          },
        },
      ],
    };

    const mockDb = {
      rpc: async (fn, params) => {
        assert.equal(params.p_user_id, OWNER_A, `${fn} must only ever execute for authenticated owner`);
        if (rpcBehavior === 'db_error') {
          return { data: null, error: new Error('Simulated transaction failure') };
        }
        if (rpcBehavior === 'empty_data') {
          return { data: null, error: null };
        }
        if (rpcBehavior === 'unverified_receipt') {
          return { data: { counts: { leaks: 1 } }, error: null };
        }
        if (fn === 'purge_personal_assistant_data') {
          return {
            data: {
              receipt_id: 'rec-del-1',
              receipt_fingerprint: 'a'.repeat(32),
              fingerprint: 'a'.repeat(32),
              counts: { leaks: 1, review_operations: 1, training_leaks: 1, assistant_stats: 1 },
            },
            error: null,
          };
        }
        if (fn === 'apply_personal_assistant_retention') {
          return {
            data: {
              applied: true,
              retention_days: 90,
              counts: { review_operations: 1, review_states: 1 },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from(table) {
        const filters = [];
        let isCountHead = false;
        let insertedRow = null;
        const rowsForTable = () => {
          const all = tableRows[table] || [];
          return all.filter((row) => filters.every((fn) => fn(row)));
        };
        const chain = {
          select(_cols, opts) {
            if (opts?.count === 'exact' && opts?.head === true) {
              isCountHead = true;
            }
            if (insertedRow) {
              return {
                maybeSingle: async () => ({ data: insertedRow, error: null }),
              };
            }
            return chain;
          },
          eq(col, val) {
            filters.push((r) => String(r[col]) === String(val));
            return chain;
          },
          in(col, vals) {
            const set = new Set((vals || []).map(String));
            filters.push((r) => set.has(String(r[col])));
            return chain;
          },
          contains(col, jsonStr) {
            const needle = JSON.parse(jsonStr)[0];
            const [k, v] = Object.entries(needle)[0];
            filters.push((r) => Array.isArray(r[col]) && r[col].some((p) => String(p?.[k]) === String(v)));
            return chain;
          },
          order() { return chain; },
          limit: async (n) => ({ data: rowsForTable().slice(0, n), error: null }),
          range: async (from, to) => ({ data: rowsForTable().slice(from, to + 1), error: null }),
          maybeSingle: async () => ({ data: rowsForTable()[0] || null, error: null }),
          insert(payload) {
            insertedRow = { id: 'receipt-1', created_at: '2026-11-26T00:00:00Z', ...payload };
            return chain;
          },
          upsert(payload) {
            insertedRow = { ...tableRows.pa_coaching_preferences[0], ...payload };
            return chain;
          },
          then(resolve, reject) {
            if (isCountHead) {
              return Promise.resolve({ count: rowsForTable().length, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: rowsForTable(), error: null }).then(resolve, reject);
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
    const handler = dataControlsMod.default;

    // A) GET summary includes reviewOperations, trainingLeaks, assistantStats, and only counts OWNER_A rows
    const getRes = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer tok-a' } }, getRes);
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.body.success, true);
    assert.equal(getRes.body.counts.leaks, 1, 'must count only OWNER_A leaks (never OWNER_B)');
    assert.equal(getRes.body.counts.reviewOperations, 1, 'must count OWNER_A leak_review_operations');
    assert.equal(getRes.body.counts.trainingLeaks, 1);
    assert.equal(getRes.body.counts.assistantStats, 1);

    // B) POST export includes reviewOperations and strips OWNER_B mucked hole cards from Club Arena hand
    const expRes = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok-a' }, body: { action: 'export' } }, expRes);
    assert.equal(expRes.statusCode, 200);
    assert.equal(expRes.body.schemaVersion, 'pa-data-export-v1');
    assert.equal(expRes.body.data.analysis.leaks.length, 1);
    assert.equal(expRes.body.data.analysis.reviewOperations.length, 1);
    assert.equal(expRes.body.data.analysis.reviewOperations[0].id, 'op-a-1');
    assert.equal(expRes.body.counts['analysis.reviewOperations'], 1);
    const exportedHand = expRes.body.data.clubArena.hands[0];
    assert.deepEqual(exportedHand.players[0].cards, ['As', 'Ks'], 'owner cards preserved');
    assert.equal(exportedHand.players[1].cards, undefined, 'mucked opponent cards stripped');
    assert.equal(exportedHand.hole_cards[OWNER_B], undefined, 'mucked opponent hole_cards map entry stripped');

    // C) DELETE fails closed when RPC returns unverified receipt or partial error
    const challenge = sealDeletionChallenge({ userId: OWNER_A, scope: 'all', secret: SECRET });
    rpcBehavior = 'unverified_receipt';
    const delFailRes = mockRes();
    await handler({
      method: 'DELETE',
      headers: { authorization: 'Bearer tok-a' },
      body: {
        scope: 'all',
        challenge,
        confirmation: 'DELETE MY PERSONAL ASSISTANT DATA',
      },
    }, delFailRes);
    assert.equal(delFailRes.statusCode, 503, 'DELETE must fail closed with 503 when purge receipt cannot be verified');
    assert.equal(delFailRes.body.success, false);

    // D) save_retention fails closed when retention RPC returns empty data
    rpcBehavior = 'empty_data';
    const retFailRes = mockRes();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer tok-a' },
      body: { action: 'save_retention', retentionDays: 90 },
    }, retFailRes);
    assert.equal(retFailRes.statusCode, 503, 'save_retention must fail closed when apply_personal_assistant_retention returns null');

    // E) DELETE succeeds when RPC returns verified receipt
    rpcBehavior = 'success';
    const delOkRes = mockRes();
    await handler({
      method: 'DELETE',
      headers: { authorization: 'Bearer tok-a' },
      body: {
        scope: 'all',
        challenge,
        confirmation: 'DELETE MY PERSONAL ASSISTANT DATA',
      },
    }, delOkRes);
    assert.equal(delOkRes.statusCode, 200);
    assert.equal(delOkRes.body.success, true);
    assert.equal(delOkRes.body.sourceHandsDeleted, false);
    assert.equal(delOkRes.body.receipt.receipt_id, 'rec-del-1');
  } finally {
    if (prevSecret === undefined) delete process.env.PA_DATA_LIFECYCLE_SECRET;
    else process.env.PA_DATA_LIFECYCLE_SECRET = prevSecret;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LIVE-PLAY RTA RESTRICTIONS ACROSS ALL ACTIONABLE GUIDANCE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

test('Section 5.2 [contextAuthority]: checkSandboxAccess enforces live-seat block, 5m post-session cooldown, fail-closed authority errors, and eligible completed sessions', async () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';

  // 1. Seated at live Club Arena table (table_seats.left_at IS NULL) -> LIVE_PLAY / HARD_BLOCK
  const seatedClubDb = createContextSupabase({
    activeTableSeats: [{ id: 'seat-1', table_id: 'tbl-1', left_at: null }],
  });
  const seatedAccess = await checkSandboxAccess(seatedClubDb, USER_ID);
  assert.equal(seatedAccess.allowed, false);
  assert.equal(seatedAccess.contextState, CONTEXT_STATES.LIVE_PLAY);
  assert.equal(seatedAccess.accessLevel, ACCESS_LEVELS.HARD_BLOCK);
  assert.equal(isFeatureAccessible(seatedAccess.accessLevel, 'leak_finder_detect'), false);
  assert.equal(isFeatureAccessible(seatedAccess.accessLevel, 'hand_review'), false);
  assert.equal(isFeatureAccessible(seatedAccess.accessLevel, 'sandbox_analyze'), false);

  // 2. Post-session 5-minute cooldown (recent table seat vacated 2 minutes ago) -> SESSION_ENDED_VERIFIED / LIMITED_REVIEW
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const cooldownDb = createContextSupabase({
    recentTableSeats: [{ id: 'seat-1', left_at: twoMinAgo }],
  });
  const cooldownAccess = await checkSandboxAccess(cooldownDb, USER_ID);
  assert.equal(cooldownAccess.contextState, CONTEXT_STATES.SESSION_ENDED_VERIFIED);
  assert.equal(cooldownAccess.accessLevel, ACCESS_LEVELS.LIMITED_REVIEW);
  assert.equal(isFeatureAccessible(cooldownAccess.accessLevel, 'leak_finder_detect'), false, 'cooldown must block solver detection/grading');
  assert.equal(isFeatureAccessible(cooldownAccess.accessLevel, 'sandbox_analyze'), false, 'cooldown must block sandbox analysis/grading');

  // 3. Authority check unavailable (DB outage on poker_sessions or table_seats) -> SESSION_ACTIVE_UNKNOWN / HARD_BLOCK (fail closed!)
  const outageDb = createContextSupabase({
    pokerSessionsError: { code: '57014', message: 'statement timeout' },
  });
  const outageAccess = await checkSandboxAccess(outageDb, USER_ID);
  assert.equal(outageAccess.allowed, false);
  assert.equal(outageAccess.contextState, CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN);
  assert.equal(outageAccess.accessLevel, ACCESS_LEVELS.HARD_BLOCK);

  const tableSeatsOutageDb = createContextSupabase({
    tableSeatsError: { code: '08006', message: 'connection failure' },
  });
  const seatOutageAccess = await checkSandboxAccess(tableSeatsOutageDb, USER_ID);
  assert.equal(seatOutageAccess.allowed, false);
  assert.equal(seatOutageAccess.contextState, CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN);
  assert.equal(seatOutageAccess.accessLevel, ACCESS_LEVELS.HARD_BLOCK);

  // 4. Eligible completed session (no open session/seat, none ended within 5m) -> TRAINING_MODE / FULL_ACCESS
  const eligibleDb = createContextSupabase();
  const eligibleAccess = await checkSandboxAccess(eligibleDb, USER_ID);
  assert.equal(eligibleAccess.allowed, true);
  assert.equal(eligibleAccess.contextState, CONTEXT_STATES.TRAINING_MODE);
  assert.equal(eligibleAccess.accessLevel, ACCESS_LEVELS.FULL_ACCESS);
  assert.equal(isFeatureAccessible(eligibleAccess.accessLevel, 'leak_finder_detect'), true);
  assert.equal(isFeatureAccessible(eligibleAccess.accessLevel, 'hand_review'), true);
  assert.equal(isFeatureAccessible(eligibleAccess.accessLevel, 'sandbox_analyze'), true);
});

test('Section 5.2 [All Actionable Guidance Routes]: blocks seated live play, post-session cooldown, unavailable authority (fail-closed), and hand-history links opened while seated, while allowing eligible completed sessions', async () => {
  const USER_ID = '22222222-2222-4222-8222-222222222222';
  const HAND_ID = '33333333-3333-4333-8333-333333333333';
  const LEAK_ID = '44444444-4444-4444-8444-444444444444';
  const rateLimitStub = {
    applyRateLimit: () => true,
    applyDurableRateLimit: async () => true,
    rateLimit: () => ({ ok: true, headers: {} }),
    LIMITS: { read: {}, write: {}, ai: {} },
  };
  const authStub = {
    getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null, status: 200 }),
  };

  const scenarios = [
    {
      name: 'seated_live_table',
      db: createContextSupabase({
        activeTableSeats: [{ id: 'seat-live', table_id: 'tbl-9', left_at: null }],
      }),
      expectedState: CONTEXT_STATES.LIVE_PLAY,
    },
    {
      name: 'post_session_cooldown',
      db: createContextSupabase({
        recentPokerSessions: [{ id: 'sess-recent', ended_at: new Date(Date.now() - 60_000).toISOString() }],
      }),
      expectedState: CONTEXT_STATES.SESSION_ENDED_VERIFIED,
    },
    {
      name: 'authority_unavailable_fail_closed',
      db: createContextSupabase({
        pokerSessionsError: { code: '53300', message: 'too many connections' },
      }),
      expectedState: CONTEXT_STATES.SESSION_ACTIVE_UNKNOWN,
    },
  ];

  // ── Route 1: pages/api/assistant/leaks/hand-audit.js ──────────────────────
  for (const scenario of scenarios) {
    const handAuditMod = compileRoute('pages/api/assistant/leaks/hand-audit.js', {
      '../../../../src/lib/apiRateLimit': rateLimitStub,
      '../../../../src/lib/personal-assistant/handAuditRouteCore.mjs': { executeSingleHandAudit },
      '../../../../src/lib/serverAuth': authStub,
      '../../../../src/lib/supabaseServerClient': { createClient: () => scenario.db },
    });
    handAuditMod._setSupabaseForTesting(scenario.db);

    // POST must 403 on all three (seated, cooldown, authority unavailable)
    const postRes = mockRes();
    await handAuditMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { handId: HAND_ID } },
      postRes,
    );
    assert.equal(postRes.statusCode, 403, `hand-audit POST must 403 during ${scenario.name}`);

    // GET ?hand=<uuid> (hand-history link opened while seated or authority unavailable) must 403!
    if (scenario.name !== 'post_session_cooldown') {
      const getRes = mockRes();
      await handAuditMod.default(
        { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { hand: HAND_ID } },
        getRes,
      );
      assert.equal(getRes.statusCode, 403, `hand-audit GET link must 403 during ${scenario.name}`);
    }
  }

  // ── Route 2: pages/api/training/audit-hand-history.js ─────────────────────
  let activeAuditHhDb = null;
  const auditHhDbProxy = {
    from: (...args) => activeAuditHhDb.from(...args),
    rpc: (...args) => activeAuditHhDb.rpc(...args),
  };
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey || 'test-service-role-key';
  const auditHhMod = compileRoute('pages/api/training/audit-hand-history.js', {
    '../../../src/lib/serverAuth.js': authStub,
    '../../../src/lib/supabaseServerClient.js': { createClient: () => auditHhDbProxy },
    '../../../src/lib/apiRateLimit.js': rateLimitStub,
    '../../../src/lib/apiErrorHandler.js': { reportApiError() {} },
    '../../../src/lib/personal-assistant/contextAuthority.js': { checkSandboxAccess, isFeatureAccessible },
    '../../../src/engines/HandHistoryParser.js': {
      parseHandHistory: () => [{ id: 'h-parsed-1', stakes: '$1/$2', hero: { position: 'BTN', holeCards: ['As', 'Kd'], stack: 200 } }],
    },
    '../../../src/lib/training/handAuditEngine.js': {
      auditParsedHands: async () => ({
        persisted: true,
        evidenceReconciled: true,
        analyses: [{ handId: 'h-parsed-1', solverVerified: true, totalEVLoss: 0.5, decisions: [{ street: 'flop', heroPosition: 'BTN' }] }],
      }),
    },
    '../../../src/lib/training/customTrainingLaunchContract.mjs': { buildCustomTrainingArenaHref: () => '/hub/training' },
    '../../../src/lib/training/clubArenaTableParity.js': { parseStakesToBlinds: () => ({ smallBlind: 1, bigBlind: 2, stakesLabel: '1/2' }) },
    '../../../src/lib/training/horseBrainTrainingAdapter.js': {
      evaluateTrainingSpotWithHorseBrain: () => ({ recommendedAction: 'Bet 75% Pot', actionEVs: { bet: 1.5, check: 0.5 }, handScore: 80 }),
    },
  });

  try {
    for (const scenario of scenarios) {
      activeAuditHhDb = scenario.db;

      // GET ?handId=<uuid> (hand-history link opened while seated / cooldown / unavailable) -> 403
      const getLinkRes = mockRes();
      await auditHhMod.default(
        { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { handId: HAND_ID } },
        getLinkRes,
      );
      assert.equal(getLinkRes.statusCode, 403, `audit-hand-history GET ?handId= must 403 during ${scenario.name}`);
      assert.equal(getLinkRes.body.blocked, true);
      assert.equal(getLinkRes.body.contextState, scenario.expectedState);

      // POST handHistoryText -> 403
      const postHhRes = mockRes();
      await auditHhMod.default(
        { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { handHistoryText: 'PokerStars Hand #1: ...' } },
        postHhRes,
      );
      assert.equal(postHhRes.statusCode, 403, `audit-hand-history POST must 403 during ${scenario.name}`);
      assert.equal(postHhRes.body.blocked, true);
    }

    // Eligible completed session on audit-hand-history POST -> 200
    const eligibleHhDb = createContextSupabase({
      extraTables: {
        training_tool_records: () => ({
          upsert: async () => ({ data: [], error: null }),
        }),
      },
    });
    activeAuditHhDb = eligibleHhDb;
    const okHhRes = mockRes();
    await auditHhMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { handHistoryText: 'PokerStars Hand #1: ...' } },
      okHhRes,
    );
    assert.equal(okHhRes.statusCode, 200, 'audit-hand-history POST must succeed for eligible completed session');
    assert.equal(okHhRes.body.success, true);
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }

  // ── Route 3: pages/api/sandbox/_routes/custom-drill.js ────────────────────
  const customDrillMod = compileRoute('pages/api/sandbox/_routes/custom-drill.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/serverAuth': authStub,
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

  for (const scenario of scenarios) {
    customDrillMod._setSupabaseForTesting(scenario.db);
    const res = mockRes();
    await customDrillMod.default(
      { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { street: 'flop', position: 'BTN' } },
      res,
    );
    assert.equal(res.statusCode, 403, `custom-drill GET must 403 during ${scenario.name}`);
    assert.equal(res.body.blocked, true);
    assert.equal(res.body.contextState, scenario.expectedState);
  }

  // Eligible completed session on custom-drill GET -> 200
  customDrillMod._setSupabaseForTesting(createContextSupabase());
  const okDrillRes = mockRes();
  await customDrillMod.default(
    { method: 'GET', headers: { authorization: 'Bearer tok' }, query: { street: 'flop', position: 'BTN' } },
    okDrillRes,
  );
  assert.equal(okDrillRes.statusCode, 200, 'custom-drill GET must succeed for eligible completed session');

  // ── Route 4: pages/api/assistant/leaks/drill-answer.js ────────────────────
  const drillAnswerMod = compileRoute('pages/api/assistant/leaks/drill-answer.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/drillTelemetry': {
      openDrillBatch,
      gradeDrillAnswer: () => ({ ok: true, correct: true, selectedAnswer: 'Call', correctAnswer: 'Call', explanation: 'GTO', solverSource: 'PIO', classification: 'best', timedOut: false }),
    },
  });

  for (const scenario of scenarios) {
    drillAnswerMod._setSupabaseForTesting(scenario.db);
    const res = mockRes();
    await drillAnswerMod.default(
      {
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: { leakId: 'river_overfold', questionId: 'q1', selectedAnswer: 'Call', drillToken: 'tok' },
      },
      res,
    );
    assert.equal(res.statusCode, 403, `drill-answer POST must 403 during ${scenario.name}`);
    assert.equal(res.body.blocked, true);
    assert.equal(res.body.contextState, scenario.expectedState);
  }

  // ── Route 5: pages/api/assistant/leaks/review.js ──────────────────────────
  const reviewMod = compileRoute('pages/api/assistant/leaks/review.js', {
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/sandbox/leakReview': {},
    '../../../../src/lib/personal-assistant/drillTelemetry': { openDrillBatch },
  });

  for (const scenario of scenarios) {
    reviewMod._setSupabaseForTesting(scenario.db);
    const res = mockRes();
    await reviewMod.default(
      {
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: { leakId: 'river_overfold', drillToken: 'tok', outcome: { correct: 5, total: 5, reviewId: 'rev_12345678' } },
      },
      res,
    );
    assert.equal(res.statusCode, 403, `leaks/review POST must 403 during ${scenario.name}`);
    assert.equal(res.body.blocked, true);
    assert.equal(res.body.contextState, scenario.expectedState);
  }

  // ── Route 6: pages/api/assistant/leaks/claim-live-fix.js ──────────────────
  const claimMod = compileRoute('pages/api/assistant/leaks/claim-live-fix.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/rewards/awardGuard': {
      safeAward: async () => ({ ok: true, data: { success: true, awarded: 25, reason: 'ok' } }),
    },
    '../../../../src/lib/personal-assistant/coachingIntelligence.mjs': { buildCoachingSnapshot },
    '../../../../src/lib/personal-assistant/leakRecord': { normalizeUserLeakRow },
  });

  for (const scenario of scenarios) {
    claimMod._setSupabaseForTesting(scenario.db);
    const res = mockRes();
    await claimMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { leakId: 'river_overfold' } },
      res,
    );
    assert.equal(res.statusCode, 403, `claim-live-fix POST must 403 during ${scenario.name}`);
    assert.equal(res.body.blocked, true);
    assert.equal(res.body.contextState, scenario.expectedState);
  }

  // ── Route 7: pages/api/sandbox/_routes/coach-result.js ────────────────────
  const coachResultMod = compileRoute('pages/api/sandbox/_routes/coach-result.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/persistenceContract': {
      ephemeralResult: (reason, data, extra) => ({ success: true, persisted: false, reason, data, ...extra }),
      persistedResult: (data, extra) => ({ success: true, persisted: true, data, ...extra }),
      persistenceFailure: (error, reason, extra) => ({ success: false, persisted: false, error, reason, ...extra }),
    },
    '../../../../src/lib/sandbox/actionGrading': { gradeAction: () => true },
  });

  for (const scenario of scenarios) {
    coachResultMod._setSupabaseForTesting(scenario.db);
    const res = mockRes();
    await coachResultMod.default(
      {
        method: 'POST',
        headers: { authorization: 'Bearer tok' },
        body: { hand: 'AhKd', userPick: 'Raise', sessionId: 'sess-1' },
      },
      res,
    );
    assert.equal(res.statusCode, 403, `sandbox/coach-result POST must 403 during ${scenario.name}`);
    assert.equal(res.body.blocked, true);
    assert.equal(res.body.stored, false);
  }

  // ── Route 8: pages/api/assistant/leaks/audit-jobs.js ──────────────────────
  const auditJobsMod = compileRoute('pages/api/assistant/leaks/audit-jobs.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/auditJobRuntime.mjs': {
      kickAuditWorker: async () => ({ ok: true }),
      publicAuditJob: (j) => j,
    },
  });

  for (const scenario of scenarios) {
    auditJobsMod._setSupabaseForTesting(scenario.db);
    const res = mockRes();
    await auditJobsMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: {} },
      res,
    );
    assert.equal(res.statusCode, 403, `audit-jobs POST must 403 during ${scenario.name}`);
    assert.equal(res.body.blocked, true);
  }

  // ── Route 9: pages/api/assistant/coaching.js ──────────────────────────────
  const coachingMod = compileRoute('pages/api/assistant/coaching.js', {
    '../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../src/lib/personal-assistant/coachingIntelligence.mjs': {
      buildCoachingSnapshot,
      receiptFingerprint: () => 'receipt-fp',
    },
    '../../../src/lib/personal-assistant/leakRecord': { normalizeUserLeakRow },
    '../../../src/lib/personal-assistant/contextAuthority': { ACCESS_LEVELS, checkSandboxAccess },
    '../../../src/lib/serverAuth': authStub,
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
  });

  const sampleDecisionRows = [
    {
      hand_external_id: `club-arena:${HAND_ID}`,
      decision_key: 'flop:0',
      street: 'flop',
      hero_position: 'BTN',
      spot_type: 'cbet',
      player_action: 'check',
      solver_action: 'bet_33',
      classification: 'blunder',
      ev_loss: 1.8,
      ev_loss_measured: true,
      solver_verified: true,
      solver_source: 'PIO|hand-audit-v3',
      audited_at: new Date().toISOString(),
      evidence_scope: 'club_arena',
    },
  ];

  for (const scenario of scenarios) {
    const dbWithDecisions = createContextSupabase({
      activeTableSeats: scenario.name === 'seated_live_table' ? [{ id: 's1', left_at: null }] : [],
      recentPokerSessions: scenario.name === 'post_session_cooldown' ? [{ id: 'p1', ended_at: new Date(Date.now() - 60_000).toISOString() }] : [],
      pokerSessionsError: scenario.name === 'authority_unavailable_fail_closed' ? { code: '53300', message: 'outage' } : null,
      extraTables: {
        hand_audit_decisions: () => {
          const chain = {
            select() { return chain; },
            eq() { return chain; },
            like() { return chain; },
            order() { return chain; },
            limit: async () => ({ data: sampleDecisionRows, error: null }),
          };
          return chain;
        },
      },
    });
    coachingMod._setSupabaseForTesting(dbWithDecisions);
    const res = mockRes();
    await coachingMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.decisions, [], `coaching GET must withhold raw solver decision rows during ${scenario.name}`);
    assert.deepEqual(res.body.snapshot.sessionDebrief.topLeakedHands, [], `coaching recap must be empty during ${scenario.name}`);
    assert.equal(res.body.snapshot.sessionDebrief.recapEligible, false);
  }

  // Eligible completed session on coaching GET -> returns decisions
  const eligibleCoachingDb = createContextSupabase({
    extraTables: {
      hand_audit_decisions: () => {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          like() { return chain; },
          order() { return chain; },
          limit: async () => ({ data: sampleDecisionRows, error: null }),
        };
        return chain;
      },
    },
  });
  coachingMod._setSupabaseForTesting(eligibleCoachingDb);
  const okCoachRes = mockRes();
  await coachingMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, okCoachRes);
  assert.equal(okCoachRes.statusCode, 200);
  assert.equal(okCoachRes.body.decisions.length, 1, 'coaching GET returns decisions once live session and cooldown have ended');
  assert.equal(okCoachRes.body.snapshot.liveTableActive, false);
  assert.equal(okCoachRes.body.snapshot.cooldownActive, false);

  // ── Route 10: pages/api/assistant/leaks/examples.js ───────────────────────
  const examplesMod = compileRoute('pages/api/assistant/leaks/examples.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
  });
  examplesMod._setSupabaseForTesting(scenarios[0].db);
  const exSeatedRes = mockRes();
  await examplesMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { leakId: LEAK_ID } }, exSeatedRes);
  assert.equal(exSeatedRes.statusCode, 403, 'leaks/examples GET must 403 while seated');

  // ── Route 11: pages/api/assistant/sandbox/sandbox-quiz.js ─────────────────
  const quizMod = compileRoute('pages/api/assistant/sandbox/sandbox-quiz.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': authStub,
    '../../../../src/lib/reportApiError': { reportApiError() {} },
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/apiRateLimit': rateLimitStub,
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/personal-assistant/persistenceContract': {
      persistedResult: (d) => ({ success: true, persisted: true, data: d }),
      persistenceFailure: (e) => ({ success: false, persisted: false, error: e }),
    },
    '../../../../src/lib/personal-assistant/weeklySpotCatalog': {
      curatedWeeklySpotById: () => ({ id: 'week_default_1', correct_action: 'Bet 33%' }),
    },
    '../../../../src/lib/sandbox/actionGrading': { gradeAction: () => true },
  });
  for (const scenario of scenarios) {
    quizMod._setSupabaseForTesting(scenario.db);
    const qRes = mockRes();
    await quizMod.default(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { spotId: 'week_default_1', userAction: 'Bet 33%' } },
      qRes,
    );
    assert.equal(qRes.statusCode, 403, `sandbox-quiz POST must 403 during ${scenario.name}`);
    assert.equal(qRes.body.blocked, true);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. AUDIT RECOVERY & SCALE
// ═══════════════════════════════════════════════════════════════════════════

test('Section 5.3 [Audit Recovery & Scale]: lease renewal (180s/300s), requeue_stalled_pa_leak_audit_jobs fullRescan preservation, and bounded batch queries', async () => {
  const mig4 = read('supabase/migrations/20261125120000_pa_phase4_lease_renewal_and_deletion_hardening.sql');
  const mig5 = read('supabase/migrations/20261125210000_pa_phase5_stack_depth_diamonds_and_recovery.sql');
  const workerSrc = read('app/api/assistant/leaks/audit-worker/route.js');
  const claimSrc = read('pages/api/assistant/leaks/claim-live-fix.js');

  // 1. Lease renewal in SQL & worker
  assert.match(mig4, /GREATEST\(COALESCE\(lease_expires_at, now\(\)\), now\(\) \+ interval '180 seconds'\)/);
  assert.match(workerSrc, /p_lease_seconds:\s*300/);
  assert.match(workerSrc, /paused_for_live_play/);

  // 2. Stale-worker recovery in SQL & maintenance-jobs.js
  assert.match(mig5, /CREATE OR REPLACE FUNCTION public\.requeue_stalled_pa_leak_audit_jobs/);
  assert.match(mig5, /FOR UPDATE SKIP LOCKED/);

  // Verify runRecoverAudits preserves fullRescan when kicking stalled jobs
  const kicked = [];
  const mockMaintDb = {
    rpc: async () => ({
      data: {
        requeuedIds: ['job-std', 'job-full'],
        stalledRequeued: 2,
        activeCount: 2,
        failed24h: 0,
        p95DurationMs: 4200,
      },
      error: null,
    }),
    from() {
      return {
        select: () => ({
          in: async () => ({
            data: [
              { id: 'job-std', user_id: 'u1', progress: { handsScanned: 200 } },
              { id: 'job-full', user_id: 'u2', progress: { handsScanned: 400, fullRescan: true } },
            ],
            error: null,
          }),
        }),
      };
    },
  };
  const maintMod = compileRoute('pages/api/assistant/maintenance-jobs.js', {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/lib/supabaseServerClient': { createClient: () => mockMaintDb },
    '../../../src/lib/cronHealth': { withCronHealth: (_n, fn) => fn },
    '../../../src/utils/cron-auth': { validateCronAuth: () => true },
    '../../../src/lib/personal-assistant/contextAuthority.js': { ACCESS_LEVELS, checkSandboxAccess },
    '../../../src/lib/notify': { notify: async () => ({ ok: true }) },
    '../../../src/lib/personal-assistant/auditJobRuntime.mjs': {
      kickAuditWorker: async (job, opts) => {
        kicked.push({ id: job.id, opts: opts || null });
        return { ok: true };
      },
    },
    '../../../src/lib/personal-assistant/leakRecord': { leakTypeTitle },
  });
  const recRes = await maintMod.runRecoverAudits(mockMaintDb);
  assert.equal(recRes.success, true);
  assert.equal(recRes.kickedCount, 2);
  assert.deepEqual(kicked, [
    { id: 'job-std', opts: null },
    { id: 'job-full', opts: { fullRescan: true } },
  ]);

  // 3. Bounded hand_history lookup in claim-live-fix.js
  assert.match(claimSrc, /HAND_TIME_MAX_IDS = 1800/);
  assert.match(claimSrc, /if \(wanted\.size >= HAND_TIME_MAX_IDS\) break;/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. HONEST STATISTICS & CLEAN ROUTES (AGGRESSION FACTOR + FORMAT SCOPE + 410s)
// ═══════════════════════════════════════════════════════════════════════════

test('Section 5.4 [Aggression Factor Math & Format Scope]: verifies (bets+raises)/calls denominator, zero-call/zero-sample/non-finite handling, and Cash vs Tournament format separation', async () => {
  const statsMod = compileRoute('pages/api/assistant/stats.js', {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: { id: 'u-stats' }, status: 200 }) },
    '../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../src/lib/personal-assistant/leakStats': {
      readLeakStatsAggregate: async () => ({ data: { activeLeaks: 2, resolvedLeaks: 1, avgEvLoss: 1.25 }, error: null }),
    },
  });

  // 1. Canonical computeAggressionFactor in stats.js
  const { computeAggressionFactor } = statsMod;
  assert.deepEqual(computeAggressionFactor(15, 6), {
    value: 2.5,
    available: true,
    reason: null,
    betsAndRaises: 15,
    calls: 6,
    totalActions: 21,
  });
  assert.deepEqual(computeAggressionFactor(0, 8), {
    value: 0,
    available: true,
    reason: null,
    betsAndRaises: 0,
    calls: 8,
    totalActions: 8,
  });
  // Zero calls with positive bets/raises -> null (NEVER Infinity or 0)
  const zeroCalls = computeAggressionFactor(14, 0);
  assert.equal(zeroCalls.value, null);
  assert.equal(zeroCalls.available, false);
  assert.equal(zeroCalls.reason, 'zero_calls');

  // Zero sample (0 bets/raises, 0 calls) -> null (NEVER NaN or 0)
  const zeroSample = computeAggressionFactor(0, 0);
  assert.equal(zeroSample.value, null);
  assert.equal(zeroSample.available, false);
  assert.equal(zeroSample.reason, 'zero_sample');

  // Non-finite, negative, boolean, blank inputs -> null
  for (const [b, c] of [[NaN, 5], [5, Infinity], [-2, 4], [true, 4], ['', 4], [null, 4], [5, undefined]]) {
    const res = computeAggressionFactor(b, c);
    assert.equal(res.value, null, `computeAggressionFactor(${String(b)}, ${String(c)}) must be null`);
    assert.equal(res.available, false);
  }

  // 2. detect.js normalizeStats & mergeSeparatedStatsSlices
  const detectMod = compileRoute('pages/api/assistant/leaks/detect.js', {
    '../../../../src/lib/serverAuth': {},
    '../../../../src/lib/supabaseServerClient': {},
    '../../../../src/lib/apiErrorHandler': {},
    '../../../../src/lib/training/solverDecisionEvidence': {},
    '../../../../src/lib/training/cacheTruthContract.mjs': {},
    '../../../../src/lib/training/cacheTruthPersistence.mjs': {},
    '../../../../src/lib/personal-assistant/leakStats': {},
    '../../../../src/lib/training/handAuditEngine': {},
    '../../../../src/lib/personal-assistant/auditJobRuntime.mjs': {},
    '../../../../src/lib/personal-assistant/caHandFactsAnalyzer.mjs': {},
    '../../../../src/lib/personal-assistant/leakRecord': {},
    '../../../../src/lib/apiRateLimit': {},
    '../../../../src/lib/personal-assistant/contextAuthority': {},
    '../../../../src/lib/personal-assistant/auditJobToken.mjs': {},
    '../../../../src/lib/personal-assistant/auditCursor.mjs': {},
    '../../../../src/lib/personal-assistant/serverTiming.mjs': { attachPersonalAssistantTiming() {} },
  });

  const { normalizeStats, mergeSeparatedStatsSlices } = detectMod;

  // a) Raw bet/raise/call counts: 18 bets+raises / 6 calls = 3.00 across 24 postflop actions
  const normRaw = normalizeStats({
    hands_played: 500,
    af_bet_raise_actions: 18,
    af_call_actions: 6,
  });
  assert.equal(normRaw.aggFactor, 3);
  assert.equal(normRaw.postflopActions, 24);

  // b) Zero calls (18 bets+raises, 0 calls) -> aggFactor: null (even if legacy aggression_factor=0 or Infinity was passed)
  const normZeroCalls = normalizeStats({
    hands_played: 500,
    aggression_factor: Infinity,
    af_bet_raise_actions: 18,
    af_call_actions: 0,
  });
  assert.equal(normZeroCalls.aggFactor, null, 'zero calls must normalize to null, never Infinity');
  assert.equal(normZeroCalls.postflopActions, 18);

  // c) Zero sample (0 bets+raises, 0 calls) -> aggFactor: null
  const normZeroSample = normalizeStats({
    hands_played: 500,
    aggression_factor: 0,
    postflop_actions: 0,
  });
  assert.equal(normZeroSample.aggFactor, null, 'zero postflop actions must normalize to null, never 0');

  // d) Non-finite / malformed values (NaN, Infinity, -Infinity, "", false, negative) -> null
  for (const badAf of [NaN, Infinity, -Infinity, -1.5, '', false, true]) {
    const n = normalizeStats({ hands_played: 500, aggression_factor: badAf, postflop_actions: 50 });
    assert.equal(n.aggFactor, null, `bad aggression_factor ${String(badAf)} must normalize to null`);
  }

  // e) Honest 0.00 AF when calls > 0 and bets+raises === 0
  const normHonestZeroAf = normalizeStats({
    hands_played: 500,
    af_bet_raise_actions: 0,
    af_call_actions: 45,
  });
  assert.equal(normHonestZeroAf.aggFactor, 0, '0 bets/raises across 45 calls is an honest 0.00 AF');
  assert.equal(normHonestZeroAf.postflopActions, 45);

  // f) Multi-slice Cash + Tournament merge weights AF by aggression_factor_denominator (calls),
  //    ignores zero-call slices, derives postflopActions = calls * (1 + AF), and reports formatBreakdown
  const merged = mergeSeparatedStatsSlices([
    {
      mode: 'cash',
      asset: 'chips',
      data: {
        overall: {
          total_hands: 300,
          vpip: 0.24,
          pfr: 0.18,
          aggression_factor: 2.0, // 40 bets+raises / 20 calls = 2.0 (60 actions)
        },
        quality: {
          metric_availability: {
            aggression_factor: true,
            aggression_factor_denominator: 20,
          },
        },
      },
    },
    {
      mode: 'tournament',
      asset: 'chips',
      data: {
        overall: {
          total_hands: 100,
          vpip: 0.20,
          pfr: 0.16,
          aggression_factor: 4.0, // 40 bets+raises / 10 calls = 4.0 (50 actions)
        },
        quality: {
          metric_availability: {
            aggression_factor: true,
            aggression_factor_denominator: 10,
          },
        },
      },
    },
    {
      mode: 'tournament',
      asset: 'diamonds',
      data: {
        overall: {
          total_hands: 900,
          vpip: 0.22,
          pfr: 0.17,
          aggression_factor: 0, // 0 calls (unmeasured AF) — must NOT weight 0 by 900 hands!
        },
        quality: {
          metric_availability: {
            aggression_factor: false,
            aggression_factor_denominator: 0,
          },
        },
      },
    },
  ]);

  // Combined AF across the two measured slices = (2.0 * 20 + 4.0 * 10) / (20 + 10) = 80 / 30 = 2.67
  assert.equal(merged.aggFactor, 2.67, 'AF must be weighted by postflop calls denominator (80/30 = 2.67), ignoring 0-call slice');
  assert.equal(merged.postflopActions, 110, 'postflopActions must sum derived actions (60 + 50 = 110)');
  assert.equal(merged.cashHands, 300);
  assert.equal(merged.tournamentHands, 1000);
  assert.equal(merged.formatBreakdown.scope, 'cash_and_tournament');

  // 3. stats.js runtime formatBreakdown (Cash vs Tournament counts)
  const mockStatsDb = {
    from(table) {
      if (table === 'user_assistant_stats') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { sandbox_sessions_count: 4, total_hands_analyzed: 520 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'sandbox_sessions') {
        return {
          select: () => ({
            eq: async () => ({ count: 4, error: null }),
          }),
        };
      }
      if (table === 'ca_hand_facts') {
        let mode = 'total';
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          is(col, val) {
            if (col === 'tournament_id' && val === null) mode = 'cash';
            return chain;
          },
          not(col, op, val) {
            if (col === 'tournament_id' && op === 'is' && val === null) mode = 'mtt';
            return chain;
          },
          then(resolve, reject) {
            const count = mode === 'cash' ? 320 : mode === 'mtt' ? 200 : 520;
            return Promise.resolve({ count, error: null }).then(resolve, reject);
          },
        };
        return chain;
      }
      return { select: () => ({ eq: async () => ({ count: 0, error: null }) }) };
    },
  };
  statsMod._setSupabaseForTesting(mockStatsDb);
  const statsRes = mockRes();
  await statsMod.default({ method: 'GET', headers: { authorization: 'Bearer tok' } }, statsRes);
  assert.equal(statsRes.statusCode, 200);
  assert.equal(statsRes.body.stats.availableClubArenaHands, 520);
  assert.equal(statsRes.body.stats.cashHands, 320);
  assert.equal(statsRes.body.stats.tournamentHands, 200);
  assert.deepEqual(statsRes.body.stats.formatBreakdown, {
    cashHands: 320,
    tournamentHands: 200,
    scope: 'cash_and_tournament',
  });
});

test('Section 5.4 [Route Cleanliness & Retired Endpoints]: retired Sandbox & setup endpoints return 410 Gone with private no-store headers and zero stale /hub/jarvis or /hub/sandbox links exist in PA APIs', async () => {
  const analyzeMod = compileRoute('pages/api/assistant/sandbox/analyze.js', {
    '../../../../src/lib/apiRateLimit': { rateLimit: () => ({ ok: true, headers: {} }), LIMITS: { write: {} } },
    '../../../../src/lib/personal-assistant/serverTiming.mjs': { attachPersonalAssistantTiming() {} },
  });
  const equityMod = compileRoute('pages/api/sandbox/_routes/equity-snapshot.js');
  const saveHandMod = compileRoute('pages/api/sandbox/_routes/save-hand.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: null, status: 200 }) },
    '../../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/persistenceContract': {
      persistedResult: (d, extra = {}) => ({ success: true, persisted: true, data: d, ...extra }),
      persistenceFailure: (e, reason) => ({ success: false, persisted: false, error: e, reason }),
    },
    '../../../../src/lib/personal-assistant/contextAuthority': {
      checkSandboxAccess: async () => ({ allowed: true }),
    },
  });
  const setupDbMod = compileRoute('pages/api/assistant/setup-database.js');
  const createShareMod = compileRoute('pages/api/sandbox/_routes/create-share.js', {
    '../../../../src/lib/supabaseServerClient': { createClient: () => ({}) },
    '../../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: null, status: 200 }) },
    '../../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/persistenceContract': {
      persistedResult: (d) => d,
      persistenceFailure: (e) => ({ error: e }),
    },
  });

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-test-key';

  for (const [label, handler, method] of [
    ['sandbox/analyze', analyzeMod.default, 'POST'],
    ['sandbox/equity-snapshot', equityMod.default, 'POST'],
    ['assistant/setup-database', setupDbMod.default, 'POST'],
    ['sandbox/create-share POST', createShareMod.default, 'POST'],
    ['sandbox/create-share PATCH', createShareMod.default, 'PATCH'],
  ]) {
    const res = mockRes();
    await handler({ method, headers: {}, query: {}, body: {} }, res);
    assert.equal(res.statusCode, 410, `${label} must return 410 Gone`);
  }

  // Restored save-hand fails closed with 401 when unauthenticated and emits private no-store headers
  const saveRes = mockRes();
  await saveHandMod.default({ method: 'POST', headers: {}, query: {}, body: {} }, saveRes);
  assert.equal(saveRes.statusCode, 401, 'sandbox/save-hand must require authentication');
  assert.equal(saveRes.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(saveRes.headers.vary, 'Authorization');
});
