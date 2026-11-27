import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  CONTEXT_STATES,
  checkSandboxAccess,
  isFeatureAccessible,
} from '../src/lib/personal-assistant/contextAuthority.js';
import * as leakReviewModule from '../src/lib/sandbox/leakReview.js';
import { openDrillBatch, sealDrillBatch } from '../src/lib/personal-assistant/drillTelemetry.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

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

test('Deliverable 1A: Training Arena [gameId].js wires handleComplete to idempotent POST /api/assistant/leaks/review with honest status pill and retry', () => {
  const arenaSrc = read('pages/hub/training/arena/[gameId].js');

  // Imports getFreshAccessToken from authUtils
  assert.match(arenaSrc, /import\s*\{\s*getAuthUser,\s*getFreshAccessToken\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/\.\.\/src\/lib\/authUtils['"]/);

  // Tracks leakReviewSync state and duplicate operationId guard ref
  assert.match(arenaSrc, /const\s*\[leakReviewSync,\s*setLeakReviewSync\]\s*=\s*useState\(\{\s*status:\s*'idle',\s*message:\s*null,\s*lastResults:\s*null,?\s*\}\)/);
  assert.match(arenaSrc, /const\s+submittedLeakOpsRef\s*=\s*useRef\(new Set\(\)\)/);

  // Guard against missing leak, non-positive questionsAnswered, duplicate operationId, or signed-out user
  assert.match(arenaSrc, /const questionsAnswered = Number\(results\.questionsAnswered\)/);
  assert.match(arenaSrc, /!Number\.isFinite\(questionsAnswered\) \|\| questionsAnswered <= 0/);
  assert.match(arenaSrc, /const operationId = `arena:\$\{resolvedSessionId \|\| gameId\}:\$\{results\.level \|\| level\}:\$\{results\.questionsAnswered\}:\$\{results\.questionsCorrect\}`/);
  assert.match(arenaSrc, /if \(submittedLeakOpsRef\.current\.has\(operationId\)\) return null/);
  assert.match(arenaSrc, /const accessToken = await getFreshAccessToken\(\)/);
  assert.match(arenaSrc, /if \(!accessToken\) return null/);

  // Submits exact body contract to POST /api/assistant/leaks/review
  assert.match(arenaSrc, /fetch\('\/api\/assistant\/leaks\/review'/);
  assert.match(arenaSrc, /correct:\s*Number\(results\.questionsCorrect\)/);
  assert.match(arenaSrc, /total:\s*Number\(results\.questionsAnswered\)/);
  assert.match(arenaSrc, /operationId:\s*`arena:\$\{resolvedSessionId \|\| gameId\}:\$\{results\.level \|\| level\}:\$\{results\.questionsAnswered\}:\$\{results\.questionsCorrect\}`/);
  assert.match(arenaSrc, /source:\s*'training_arena'/);
  assert.match(arenaSrc, /gameId,/);
  assert.match(arenaSrc, /sessionId:\s*resolvedSessionId/);

  // Never claims saved unless res.ok && json?.persisted === true
  assert.match(arenaSrc, /if \(res\.ok && json\?\.persisted === true\)/);
  assert.match(arenaSrc, /window\.dispatchEvent\(new Event\('pa-leak-review-updated'\)\)/);
  assert.match(arenaSrc, /window\.dispatchEvent\(new Event\('pa-data-updated'\)\)/);

  // Handles rta_blocked and error states honestly and renders inline status pill + 1-tap Retry Save inside PA return banner
  assert.match(arenaSrc, /status:\s*'rta_blocked'/);
  assert.match(arenaSrc, /status:\s*'error'/);
  assert.match(arenaSrc, /data-testid="pa-leak-review-sync-pill"/);
  assert.match(arenaSrc, /data-testid="pa-leak-review-retry-btn"/);
  assert.match(arenaSrc, /Retry Save/);
});

test('Deliverable 1B: POST /api/assistant/leaks/review persists training_arena completions, enforces idempotency & RTA, and preserves quick_spot_drill drillToken gate', async () => {
  const USER_ID = '33333333-3333-4333-8333-333333333333';
  const LEAK_ID = '44444444-4444-4444-8444-444444444444';

  let persistedRow = null;
  let commitCalls = 0;
  let activeTableSeats = [];

  const createReviewDb = () => ({
    rpc: async (fn, args) => {
      if (fn === 'commit_leak_review_state') {
        commitCalls += 1;
        const cand = args.p_candidate;
        persistedRow = {
          user_id: args.p_user_id,
          leak_id: args.p_leak_id,
          ease: cand.ease,
          interval_days: cand.interval_days,
          due_at: cand.due_at,
          reps: cand.reps,
          lapses: cand.lapses,
          strong_streak: cand.strong_streak,
          retired: cand.retired,
          last_score: cand.last_score,
          history: cand.history,
          last_outcome: cand.last_outcome,
          schema_version: cand.schema_version,
          updated_at: '2026-11-27T00:30:00.000Z',
        };
        return {
          data: {
            success: true,
            idempotent: false,
            row: persistedRow,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    from(table) {
      if (table === 'poker_sessions') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          not: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
        };
        return chain;
      }
      if (table === 'table_seats') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          not: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: async () => ({ data: activeTableSeats, error: null }),
        };
        return chain;
      }
      if (table === 'leak_review_state') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: persistedRow, error: null }),
        };
        return chain;
      }
      if (table === 'user_leaks') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: { id: LEAK_ID, avg_ev_loss_bb: 0.45, ev_loss_measured: true },
            error: null,
          }),
        };
        return chain;
      }
      const fallbackChain = {
        select: () => fallbackChain,
        eq: () => fallbackChain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return fallbackChain;
    },
  });

  const reviewMod = compileRoute('pages/api/assistant/leaks/review.js', {
    '../../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null, status: 200 }),
    },
    '../../../../src/lib/supabaseServerClient': { createClient: () => createReviewDb() },
    '../../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../../src/lib/personal-assistant/contextAuthority': { checkSandboxAccess, isFeatureAccessible },
    '../../../../src/lib/sandbox/leakReview': leakReviewModule,
    '../../../../src/lib/personal-assistant/drillTelemetry': { openDrillBatch, sealDrillBatch },
  });

  reviewMod._setSupabaseForTesting(createReviewDb());

  // 1) Training Arena completion POST persists SM-2 state and echoes source, gameId, sessionId
  const opId = 'arena:session-170000-abc:2:10:9';
  const arenaRes = mockRes();
  await reviewMod.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: {
        leakId: LEAK_ID,
        correct: 9,
        total: 10,
        operationId: opId,
        source: 'training_arena',
        gameId: 'cash-002',
        sessionId: 'session-170000-abc',
      },
    },
    arenaRes,
  );
  assert.equal(arenaRes.statusCode, 200);
  assert.equal(arenaRes.body.success, true);
  assert.equal(arenaRes.body.persisted, true);
  assert.equal(arenaRes.body.source, 'training_arena');
  assert.equal(arenaRes.body.gameId, 'cash-002');
  assert.equal(arenaRes.body.sessionId, 'session-170000-abc');
  assert.equal(arenaRes.body.state.reps, 1);
  assert.equal(arenaRes.body.state.strongStreak, 1);
  assert.equal(arenaRes.body.state.lastOutcome.reviewId, opId);
  assert.equal(arenaRes.body.state.lastOutcome.source, 'training_arena');
  assert.equal(arenaRes.body.state.lastOutcome.gameId, 'cash-002');
  assert.equal(arenaRes.body.state.lastOutcome.sessionId, 'session-170000-abc');
  assert.equal(commitCalls, 1);

  // 2) Sequential replay with identical operationId is idempotent and does not call commit_leak_review_state a second time
  const replayRes = mockRes();
  await reviewMod.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: {
        leakId: LEAK_ID,
        correct: 9,
        total: 10,
        operationId: opId,
        source: 'training_arena',
        gameId: 'cash-002',
        sessionId: 'session-170000-abc',
      },
    },
    replayRes,
  );
  assert.equal(replayRes.statusCode, 200);
  assert.equal(replayRes.body.persisted, true);
  assert.equal(replayRes.body.idempotent, true);
  assert.equal(replayRes.body.source, 'training_arena');
  assert.equal(replayRes.body.state.reps, 1, 'Idempotent replay must not increment reps again');
  assert.equal(commitCalls, 1, 'Idempotent replay must not invoke commit RPC again');

  // 3) Hostile gameId/sessionId values are sanitized out while valid training_arena completion still succeeds
  const sanitizeRes = mockRes();
  await reviewMod.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: {
        leakId: LEAK_ID,
        correct: 8,
        total: 10,
        operationId: 'arena:session-170000-def:2:10:8',
        source: 'training_arena',
        gameId: '<script>alert(1)</script>',
        sessionId: 'bad session id with spaces!',
      },
    },
    sanitizeRes,
  );
  assert.equal(sanitizeRes.statusCode, 200);
  assert.equal(sanitizeRes.body.persisted, true);
  assert.equal(sanitizeRes.body.source, 'training_arena');
  assert.equal('gameId' in sanitizeRes.body, false, 'Malformed gameId must be sanitized out');
  assert.equal('sessionId' in sanitizeRes.body, false, 'Malformed sessionId must be sanitized out');

  // 4) Default / quick_spot_drill source still requires drillToken
  const missingTokenRes = mockRes();
  await reviewMod.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: {
        leakId: LEAK_ID,
        outcome: { correct: 5, total: 5, reviewId: 'rev_12345678' },
      },
    },
    missingTokenRes,
  );
  assert.equal(missingTokenRes.statusCode, 400);
  assert.equal(missingTokenRes.body.reason, 'verified_drill_required');

  // 5) RTA live-table block still returns 403 for training_arena completions
  activeTableSeats = [{ id: 'seat-live-1', table_id: 'tbl-live-1', left_at: null }];
  const rtaRes = mockRes();
  await reviewMod.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: {
        leakId: LEAK_ID,
        correct: 10,
        total: 10,
        operationId: 'arena:session-170000-rta:3:10:10',
        source: 'training_arena',
        gameId: 'cash-002',
        sessionId: 'session-170000-rta',
      },
    },
    rtaRes,
  );
  assert.equal(rtaRes.statusCode, 403);
  assert.equal(rtaRes.body.blocked, true);
  assert.equal(rtaRes.body.contextState, CONTEXT_STATES.LIVE_PLAY);
});

test('Deliverable 2: VideoLearningLoop, Video Library, and Reels point study circuit CTA to /hub/personal-assistant/leaks with "Audit Your Leaks"', () => {
  const loopSrc = read('src/components/video-learning/VideoLearningLoop.jsx');
  const videoLibrarySrc = read('pages/hub/video-library.js');
  const reelsSrc = read('pages/hub/reels.js');

  assert.match(loopSrc, /sandboxHref = '\/hub\/personal-assistant\/leaks'/);
  assert.match(loopSrc, /<Link href=\{sandboxHref\}>Audit Your Leaks<\/Link>/);
  assert.doesNotMatch(loopSrc, /Practice In Sandbox/);
  assert.doesNotMatch(loopSrc, /\/hub\/personal-assistant\/sandbox/);

  assert.match(videoLibrarySrc, /sandboxHref="\/hub\/personal-assistant\/leaks"/);
  assert.doesNotMatch(videoLibrarySrc, /\/hub\/personal-assistant\/sandbox/);

  assert.match(reelsSrc, /sandboxHref="\/hub\/personal-assistant\/leaks"/);
  assert.doesNotMatch(reelsSrc, /\/hub\/personal-assistant\/sandbox/);
});
