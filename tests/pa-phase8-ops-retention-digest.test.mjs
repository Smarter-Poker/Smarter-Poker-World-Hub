import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { ACCESS_LEVELS } from '../src/lib/personal-assistant/contextAuthority.js';
import { leakTypeTitle } from '../src/lib/personal-assistant/leakRecord.js';
import solverCoverageExportMod, {
  bucketHarvestStackDepth,
  buildSolverHarvestQueueExport,
  formatHarvestQueueMarkdown,
} from '../src/lib/personal-assistant/solverCoverageExport.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function compile(relPath, deps = {}) {
  const fullPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const module = { exports: {} };
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    if (deps[name]) return deps[name];
    for (const [key, val] of Object.entries(deps)) {
      if (name === key || name.endsWith(key) || key.endsWith(name)) return val;
    }
    throw new Error(`Unexpected dependency in compile(${relPath}): ${name}`);
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
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

function getRetentionModule(deps = {}) {
  const defaultDeps = {
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: deps.applyRateLimit || (() => true),
      LIMITS: { write: {} },
    },
    '../../../src/lib/supabaseServerClient': {
      createClient: () => deps.supabase,
    },
    '../../../src/lib/cronHealth': {
      withCronHealth: (_name, fn) => fn,
    },
    '../../../src/utils/cron-auth': {
      validateCronAuth: deps.validateCronAuth || ((req) => req.headers?.['x-cron-secret'] === 'valid-secret'),
    },
  };
  const mod = compile('pages/api/assistant/retention-maintenance.js', { ...defaultDeps, ...deps });
  if (deps.supabase && typeof mod._setAdminClientForTesting === 'function') {
    mod._setAdminClientForTesting(deps.supabase);
  }
  return mod;
}

function getMaintenanceModule(deps = {}) {
  const defaultDeps = {
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: deps.applyRateLimit || (() => true),
      LIMITS: { write: {} },
    },
    '../../../src/lib/supabaseServerClient': {
      createClient: () => deps.supabase,
    },
    '../../../src/lib/cronHealth': {
      withCronHealth: (_name, fn) => fn,
    },
    '../../../src/utils/cron-auth': {
      validateCronAuth: deps.validateCronAuth || ((req) => req.headers?.['x-cron-secret'] === 'valid-secret'),
    },
    '../../../src/lib/personal-assistant/contextAuthority.js': {
      ACCESS_LEVELS,
      checkSandboxAccess:
        deps.checkSandboxAccess
        || (async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS })),
    },
    '../../../src/lib/notify': {
      notify: deps.notify || (async () => ({ ok: true, notificationId: 'mock-notif' })),
    },
    '../../../src/lib/personal-assistant/auditJobRuntime.mjs': {
      kickAuditWorker: deps.kickAuditWorker || (async () => ({ ok: true, status: 200 })),
    },
    '../../../src/lib/personal-assistant/leakRecord': {
      leakTypeTitle,
    },
    '../../../src/lib/personal-assistant/solverCoverageExport.mjs': solverCoverageExportMod,
  };
  const mod = compile('pages/api/assistant/maintenance-jobs.js', { ...defaultDeps, ...deps });
  if (deps.supabase && typeof mod._setAdminClientForTesting === 'function') {
    mod._setAdminClientForTesting(deps.supabase);
  }
  return mod;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. RETENTION MAINTENANCE: 405 BEFORE RATE LIMIT & SYNCED HAND HISTORY SWEEP
// ─────────────────────────────────────────────────────────────────────────────

test('retention-maintenance: rejects non-GET with 405 before burning rate-limit budget', async () => {
  let rateLimitCalled = false;
  const mod = getRetentionModule({
    applyRateLimit: () => {
      rateLimitCalled = true;
      return true;
    },
  });

  const res = mockRes();
  await mod.default({ method: 'POST', headers: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader('allow'), 'GET');
  assert.equal(res.getHeader('cache-control'), 'private, no-store, max-age=0');
  assert.equal(res.getHeader('vary'), 'Authorization');
  assert.equal(rateLimitCalled, false, 'applyRateLimit must not execute on disallowed HTTP methods');
});

test('retention-maintenance: runSyncedHandHistoryRetentionSweep clamps retention_days and deletes expired synced-hand-history rows', async () => {
  const deleteCalls = [];
  const mockAdmin = {
    from: (table) => {
      if (table === 'pa_coaching_preferences') {
        return {
          select: (cols) => {
            assert.match(cols, /user_id/);
            assert.match(cols, /retention_days/);
            return {
              not: (col, op, val) => {
                assert.equal(col, 'retention_days');
                assert.equal(op, 'is');
                assert.equal(val, null);
                return {
                  limit: async (lim) => {
                    assert.equal(lim, 250);
                    return {
                      data: [
                        { user_id: 'u-90', retention_days: 90 },
                        { user_id: 'u-max', retention_days: 99999 }, // clamped to 3650
                        { user_id: 'u-invalid', retention_days: 0 }, // ignored
                      ],
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'training_tool_records') {
        const call = {};
        const chain = {
          delete: () => chain,
          eq: (col, val) => {
            call[col] = val;
            return chain;
          },
          lt: (col, val) => {
            call.ltCol = col;
            call.cutoffIso = val;
            return chain;
          },
          select: async (col) => {
            call.selectCol = col;
            deleteCalls.push(call);
            return {
              data: call.user_id === 'u-90' ? [{ id: 'r1' }, { id: 'r2' }] : [{ id: 'r3' }],
              error: null,
            };
          },
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const mod = getRetentionModule({ supabase: mockAdmin });
  const beforeMs = Date.now();
  const result = await mod.runSyncedHandHistoryRetentionSweep(mockAdmin, { limit: 250 });
  const afterMs = Date.now();

  assert.equal(result.success, true);
  assert.equal(result.error, null);
  assert.equal(result.usersChecked, 2);
  assert.equal(result.syncedHandsDeleted, 3);
  assert.deepEqual(result.errors, []);
  assert.equal(deleteCalls.length, 2);

  // Verify 90-day cutoff for u-90
  assert.equal(deleteCalls[0].user_id, 'u-90');
  assert.equal(deleteCalls[0].tool_id, 'synced-hand-history');
  assert.equal(deleteCalls[0].ltCol, 'updated_at');
  const cutoff90Ms = new Date(deleteCalls[0].cutoffIso).getTime();
  assert.ok(cutoff90Ms >= beforeMs - 90 * 86400 * 1000 - 1000 && cutoff90Ms <= afterMs - 90 * 86400 * 1000 + 1000);

  // Verify 3650-day clamped cutoff for u-max
  assert.equal(deleteCalls[1].user_id, 'u-max');
  assert.equal(deleteCalls[1].tool_id, 'synced-hand-history');
  const cutoff3650Ms = new Date(deleteCalls[1].cutoffIso).getTime();
  assert.ok(cutoff3650Ms >= beforeMs - 3650 * 86400 * 1000 - 1000 && cutoff3650Ms <= afterMs - 3650 * 86400 * 1000 + 1000);
});

test('retention-maintenance: fails closed with HTTP 500 when preferences read, delete, or RPC fails, and returns 200 when both succeed', async () => {
  let rpcShouldFail = false;
  let deleteShouldFail = false;

  const mockAdmin = {
    rpc: async (fn, params) => {
      assert.equal(fn, 'apply_personal_assistant_retention_batch');
      assert.equal(params.p_limit, 250);
      if (rpcShouldFail) {
        return { data: null, error: new Error('RPC batch failure') };
      }
      return { data: { processed: 4, applied: 3 }, error: null };
    },
    from: (table) => {
      if (table === 'pa_coaching_preferences') {
        return {
          select: () => ({
            not: () => ({
              limit: async () => ({
                data: [{ user_id: 'u-1', retention_days: 30 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'training_tool_records') {
        const chain = {
          delete: () => chain,
          eq: () => chain,
          lt: () => chain,
          select: async () => (
            deleteShouldFail
              ? { data: null, error: new Error('training_tool_records delete timeout') }
              : { data: [{ id: 'del-1' }, { id: 'del-2' }], error: null }
          ),
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const mod = getRetentionModule({ supabase: mockAdmin });
  const req = { method: 'GET', headers: { 'x-cron-secret': 'valid-secret' } };

  // 1. Both RPC and syncedHandsRetention succeed -> 200
  const okRes = mockRes();
  await mod.default(req, okRes);
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.body.status, 'ok');
  assert.equal(okRes.body.processed, 4);
  assert.equal(okRes.body.syncedHandsDeleted, 2);
  assert.equal(okRes.body.syncedHandsRetention?.success, true);
  assert.equal(okRes.body.syncedHandsRetention?.syncedHandsDeleted, 2);
  assert.equal(okRes.body.syncedHandsRetention?.usersChecked, 1);

  // 2. Synced hands sweep fails -> 500 fail-closed
  deleteShouldFail = true;
  const delFailRes = mockRes();
  await mod.default(req, delFailRes);
  assert.equal(delFailRes.statusCode, 500);
  assert.equal(delFailRes.body.status, 'error');
  assert.equal(delFailRes.body.syncedHandsRetention?.success, false);

  // 3. RPC fails -> 500 fail-closed
  deleteShouldFail = false;
  rpcShouldFail = true;
  const rpcFailRes = mockRes();
  await mod.default(req, rpcFailRes);
  assert.equal(rpcFailRes.statusCode, 500);
  assert.equal(rpcFailRes.body.status, 'error');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MAINTENANCE JOBS: FAIL-CLOSED WEEKLY DIGEST & DETERMINISTIC DEDUPE KEYS
// ─────────────────────────────────────────────────────────────────────────────

test('maintenance-jobs: runDueNudges passes deterministic UTC-day dedupe key and preserves 72h throttle + RTA guard', async () => {
  const userId = '44444444-4444-4444-8444-444444444444';
  const fixedNow = new Date('2026-11-26T15:30:00.000Z');
  const notifyPayloads = [];

  const mockSupabase = {
    from: (table) => {
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [{ user_id: userId, leak_id: 'leak-1', due_at: '2026-11-25T00:00:00Z' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const mod = getMaintenanceModule({
    supabase: mockSupabase,
    notify: async (_sb, payload) => {
      notifyPayloads.push(payload);
      return { ok: true, notificationId: 'n-1' };
    },
  });

  const result = await mod.runDueNudges(mockSupabase, { limit: 50, now: fixedNow });
  assert.equal(result.success, true);
  assert.equal(result.sentCount, 1);
  assert.equal(notifyPayloads.length, 1);

  const expectedKey = `pa_review_due:${userId}:2026-11-26`;
  assert.equal(notifyPayloads[0].dedupeKey, expectedKey);
  assert.equal(notifyPayloads[0].idempotencyKey, expectedKey);
  assert.equal(notifyPayloads[0].tag, expectedKey);
  assert.equal(notifyPayloads[0].data?.dedupeKey, expectedKey);
  assert.equal(notifyPayloads[0].data?.utcDayKey, '2026-11-26');
});

test('maintenance-jobs: runWeeklyDigest fails closed when leaksRes or reviewsRes errors (never sending false None Detected digest) and passes ISO-week dedupe key', async () => {
  const userLeaksErr = '11111111-1111-4111-8111-111111111111';
  const userReviewsErr = '22222222-2222-4222-8222-222222222222';
  const userHealthy = '33333333-3333-4333-8333-333333333333';
  const fixedNow = new Date('2026-11-26T12:00:00.000Z'); // 2026-W48
  const sentNotifications = [];

  const mockSupabase = {
    from: (table) => {
      if (table === 'pa_coaching_preferences') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [
                  { user_id: userLeaksErr },
                  { user_id: userReviewsErr },
                  { user_id: userHealthy },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'user_leaks') {
        return {
          select: () => ({
            eq: (_col, uid) => ({
              order: () => ({
                limit: async () => {
                  if (uid === userLeaksErr) {
                    return { data: null, error: new Error('user_leaks query timeout') };
                  }
                  return {
                    data: [
                      {
                        id: 'leak-1',
                        leak_type: 'river_overfold',
                        status: 'persistent',
                        avg_ev_loss_bb: 3.5,
                        is_active: true,
                      },
                    ],
                    error: null,
                  };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: (_col, uid) => ({
              limit: async () => {
                if (uid === userReviewsErr) {
                  return { data: null, error: new Error('leak_review_state read failure') };
                }
                return {
                  data: [
                    { leak_id: 'leak-1', reps: 6, remediation_baseline_at: '2026-11-20T00:00:00Z', retired: true },
                  ],
                  error: null,
                };
              },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const mod = getMaintenanceModule({
    supabase: mockSupabase,
    notify: async (_sb, payload) => {
      sentNotifications.push(payload);
      return { ok: true, notificationId: 'n-digest' };
    },
  });

  const result = await mod.runWeeklyDigest(mockSupabase, { limit: 50, now: fixedNow });
  assert.equal(result.success, true);
  assert.equal(result.optedInFound, 3);
  assert.equal(result.skippedReadError, 2, 'both DB read errors must fail closed and increment skippedReadError');
  assert.equal(result.sentCount, 1, 'only the healthy user may receive a digest');
  assert.equal(sentNotifications.length, 1);

  const sent = sentNotifications[0];
  assert.equal(sent.userId, userHealthy);
  const expectedKey = `pa_weekly_digest:${userHealthy}:2026-W48`;
  assert.equal(sent.dedupeKey, expectedKey);
  assert.equal(sent.idempotencyKey, expectedKey);
  assert.equal(sent.tag, expectedKey);
  assert.equal(sent.data?.dedupeKey, expectedKey);
  assert.equal(sent.data?.isoWeekKey, '2026-W48');
  assert.match(sent.body, /Top Leak:\s*River Overfold/);
  assert.doesNotMatch(sent.body, /None Detected/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SOLVER COVERAGE EXPORT & MAINTENANCE COVERAGE GAPS ACTION
// ─────────────────────────────────────────────────────────────────────────────

test('solverCoverageExport: buildSolverHarvestQueueExport and formatHarvestQueueMarkdown produce ranked read-only harvest targets', () => {
  assert.equal(bucketHarvestStackDepth(15), '<=20bb');
  assert.equal(bucketHarvestStackDepth(35), '20-50bb');
  assert.equal(bucketHarvestStackDepth(100), '50-100bb');
  assert.equal(bucketHarvestStackDepth(150), '100bb+');
  assert.equal(bucketHarvestStackDepth(null), 'unknown');

  const decisions = [
    // 4 unmeasured Cash Flop BTN cbet @ 100bb
    { game_id: 'cash-002', street: 'flop', hero_position: 'BTN', spot_type: 'cbet', stack_depth_bb: 100, solver_verified: false },
    { game_id: 'cash-002', street: 'flop', hero_position: 'BTN', spot_type: 'cbet', stack_depth_bb: 95, solver_verified: false },
    { game_id: 'cash-002', street: 'flop', hero_position: 'BTN', spot_type: 'cbet', stack_depth_bb: 80, solver_verified: false },
    { game_id: 'cash-002', street: 'flop', hero_position: 'BTN', spot_type: 'cbet', stack_depth_bb: 100, solver_verified: false },
    // 2 unmeasured Tournament Turn BB check_raise @ 25bb
    { game_id: 'mtt-021', street: 'turn', hero_position: 'BB', spot_type: 'check_raise', stack_depth_bb: 25, solver_verified: false },
    { game_id: 'mtt-021', street: 'turn', hero_position: 'BB', spot_type: 'check_raise', stack_depth_bb: 30, solver_verified: false },
    // 2 solver_verified rows (must be excluded from unmeasured counts)
    { game_id: 'cash-001', street: 'preflop', hero_position: 'CO', spot_type: 'rfi', stack_depth_bb: 100, solver_verified: true },
    { game_id: 'mtt-001', street: 'preflop', hero_position: 'SB', spot_type: 'push_fold', stack_depth_bb: 12, solver_verified: true },
  ];

  const report = buildSolverHarvestQueueExport(decisions, {
    maxBuckets: 15,
    generatedAt: '2026-11-26T18:00:00.000Z',
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.generatedAt, '2026-11-26T18:00:00.000Z');
  assert.equal(report.totalUnmeasuredDecisions, 6);
  assert.equal(report.buckets.length, 2);

  assert.deepEqual(report.buckets[0], {
    rank: 1,
    format: 'Cash NLH',
    street: 'flop',
    stackBucket: '50-100bb',
    spot: 'BTN:cbet',
    heroPosition: 'BTN',
    spotType: 'cbet',
    unmeasuredCount: 4,
    count: 4,
    sharePct: 66.7,
    sharePercent: 66.7,
    priority: 'high',
  });

  assert.deepEqual(report.buckets[1], {
    rank: 2,
    format: 'Tournament NLH',
    street: 'turn',
    stackBucket: '20-50bb',
    spot: 'BB:check_raise',
    heroPosition: 'BB',
    spotType: 'check_raise',
    unmeasuredCount: 2,
    count: 2,
    sharePct: 33.3,
    sharePercent: 33.3,
    priority: 'high',
  });

  const md = formatHarvestQueueMarkdown(report);
  assert.match(md, /# Solver Coverage Harvest Queue/);
  assert.match(md, /Total Unmeasured Decisions: 6/);
  assert.match(md, /\| 1 \| HIGH \| Cash NLH \| flop \| 50-100bb \| BTN:cbet \| 4 \| 66\.7% \|/);
  assert.match(md, /\| 2 \| HIGH \| Tournament NLH \| turn \| 20-50bb \| BB:check_raise \| 2 \| 33\.3% \|/);
  assert.doesNotMatch(md, /[\u2014\u2013]/, 'Markdown output must never contain em or en dashes');
});

test('maintenance-jobs: wires action=coverage_gaps and degrades gracefully on action=all if coverage gaps query fails', async () => {
  let failCoverageQuery = false;
  let observedLimit = null;

  const mockAdmin = {
    rpc: async () => ({
      data: { requeuedIds: [], stalledRequeued: 0, activeCount: 0, failed24h: 0, p95DurationMs: 0 },
      error: null,
    }),
    from: (table) => {
      if (table === 'hand_audit_decisions') {
        const chain = {
          select: () => chain,
          eq: (col, val) => {
            assert.equal(col, 'solver_verified');
            assert.equal(val, false);
            return chain;
          },
          order: () => chain,
          limit: async (lim) => {
            observedLimit = lim;
            if (failCoverageQuery) {
              return { data: null, error: new Error('hand_audit_decisions read replica unavailable') };
            }
            return {
              data: [
                { game_id: 'cash-004', street: 'river', hero_position: 'BB', spot_type: 'bluff_catch', stack_depth_bb: 100, solver_verified: false },
                { game_id: 'cash-004', street: 'river', hero_position: 'BB', spot_type: 'bluff_catch', stack_depth_bb: 100, solver_verified: false },
              ],
              error: null,
            };
          },
        };
        return chain;
      }
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'pa_coaching_preferences') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const mod = getMaintenanceModule({ supabase: mockAdmin });

  // 1. Direct action=coverage_gaps
  const covRes = mockRes();
  await mod.default(
    { method: 'GET', headers: { 'x-cron-secret': 'valid-secret' }, query: { action: 'coverage_gaps' } },
    covRes,
  );
  assert.equal(covRes.statusCode, 200);
  assert.equal(observedLimit, 1000);
  assert.equal(covRes.body.results.coverageGaps?.success, true);
  assert.equal(covRes.body.results.coverageGaps?.totalUnmeasuredDecisions, 2);
  assert.equal(covRes.body.results.coverageGaps?.buckets?.[0]?.spot, 'BB:bluff_catch');
  assert.match(covRes.body.results.coverageGaps?.markdown, /BB:bluff_catch/);

  // 2. action=all when coverage_gaps query fails -> degrades gracefully without failing other jobs
  failCoverageQuery = true;
  const allRes = mockRes();
  await mod.default(
    { method: 'GET', headers: { 'x-cron-secret': 'valid-secret' }, query: { action: 'all' } },
    allRes,
  );
  assert.equal(allRes.statusCode, 200);
  assert.equal(allRes.body.results.recoverAudits?.success, true);
  assert.equal(allRes.body.results.dueNudges?.success, true);
  assert.equal(allRes.body.results.weeklyDigest?.success, true);
  assert.equal(allRes.body.results.coverageGaps?.success, false);
  assert.match(allRes.body.results.coverageGaps?.error, /hand_audit_decisions read replica unavailable/);
});
