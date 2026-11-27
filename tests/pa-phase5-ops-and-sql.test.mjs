import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

import { PUSH_TYPES, PUSH_TYPE_KEYS } from '../src/lib/push/push-prefs.js';
import equitySnapshotHandler from '../pages/api/sandbox/_routes/equity-snapshot.js';
import { auditMigration } from '../scripts/ci/check-explicit-table-access.mjs';
import { normalizeUserLeakRow, leakTypeTitle } from '../src/lib/personal-assistant/leakRecord.js';
import { ACCESS_LEVELS } from '../src/lib/personal-assistant/contextAuthority.js';

import { buildCoachingSnapshot } from '../src/lib/personal-assistant/coachingIntelligence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function compile(relPath, deps = {}) {
  const fullPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const module = { exports: {} };
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (deps[name]) return deps[name];
    for (const [key, val] of Object.entries(deps)) {
      if (name.endsWith(key) || key.endsWith(name)) return val;
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
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SQL MIGRATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Migration pa_phase5_stack_depth_diamonds_and_recovery.sql structure & security', () => {
  const relPath = 'supabase/migrations/20261125210000_pa_phase5_stack_depth_diamonds_and_recovery.sql';
  assert.ok(fs.existsSync(path.join(ROOT, relPath)), 'Migration file must exist');

  const sql = read(relPath);

  // Must not create any new tables (explicit-table-access compliance)
  assert.doesNotMatch(sql, /\bCREATE\s+(?:(TEMP(?:ORARY)?|UNLOGGED)\s+)?TABLE\b/i);
  const auditIssues = auditMigration(sql);
  assert.deepEqual(auditIssues, [], `Explicit table access audit must find 0 issues, got: ${auditIssues.join(', ')}`);

  // Zero XP columns anywhere in migration (xp_ban_guard trigger safety)
  assert.doesNotMatch(sql, /\bADD\s+COLUMN\s+[^;]*\bxp/i);
  assert.doesNotMatch(sql, /\bCREATE\s+TABLE\s+[^;]*\bxp/i);

  // Alter hand_audit_decisions: stack_depth_bb numeric(6,1), evidence_scope text
  assert.match(sql, /ALTER\s+TABLE\s+public\.hand_audit_decisions[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+stack_depth_bb\s+numeric\(6,1\)/i);
  assert.match(sql, /ALTER\s+TABLE\s+public\.hand_audit_decisions[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+evidence_scope\s+text/i);

  // No default 0 on stack_depth_bb (NULL = unknown)
  assert.doesNotMatch(sql, /stack_depth_bb[^\n]*DEFAULT\s+0/i);

  // Check constraint on evidence_scope
  assert.match(sql, /CHECK\s*\(\s*evidence_scope\s+IS\s+NULL\s+OR\s+evidence_scope\s+IN\s*\(\s*'club_arena',\s*'external_upload',\s*'self_reported_live',\s*'training_solver'\s*\)\s*\)/i);

  // Alter pa_coaching_preferences: weekly_digest_opt_in
  assert.match(sql, /ALTER\s+TABLE\s+public\.pa_coaching_preferences[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+weekly_digest_opt_in\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i);

  // replace_hand_audit_decisions preserves exact existing signature and SET search_path = ''
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.replace_hand_audit_decisions\s*\(\s*p_user_id\s+uuid,\s*p_hand_ids\s+text\[\],\s*p_rows\s+jsonb\s*\)\s*RETURNS\s+jsonb/i);
  assert.match(sql, /FUNCTION\s+public\.replace_hand_audit_decisions[\s\S]*?SECURITY\s+DEFINER[\s\S]*?SET\s+search_path\s*=\s*''/i);
  assert.match(sql, /stack_depth_bb\s+numeric/);
  assert.match(sql, /evidence_scope\s+text/);
  assert.match(sql, /stack_depth_bb\s*=\s*EXCLUDED\.stack_depth_bb/);
  assert.match(sql, /evidence_scope\s*=\s*EXCLUDED\.evidence_scope/);

  // replace_hand_audit_decisions service_role only
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.replace_hand_audit_decisions\(uuid,\s*text\[\],\s*jsonb\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i);
  assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.replace_hand_audit_decisions\(uuid,\s*text\[\],\s*jsonb\)\s+TO\s+service_role;/i);

  // Diamond catalog insert for pa_leak_verified_fixed
  assert.match(sql, /INSERT\s+INTO\s+public\.diamond_reward_catalog[\s\S]*?'pa_leak_verified_fixed'[\s\S]*?25[\s\S]*?2[\s\S]*?true[\s\S]*?false[\s\S]*?'training'[\s\S]*?true/i);

  // requeue_stalled_pa_leak_audit_jobs RPC
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.requeue_stalled_pa_leak_audit_jobs\s*\(\s*p_limit\s+integer\s+DEFAULT\s+25\s*\)\s*RETURNS\s+jsonb/i);
  assert.match(sql, /FUNCTION\s+public\.requeue_stalled_pa_leak_audit_jobs[\s\S]*?SECURITY\s+DEFINER[\s\S]*?SET\s+search_path\s*=\s*''/i);
  assert.match(sql, /requeuedIds/);
  assert.match(sql, /stalledRequeued/);
  assert.match(sql, /activeCount/);
  assert.match(sql, /failed24h/);
  assert.match(sql, /p95DurationMs/);

  // requeue_stalled_pa_leak_audit_jobs service_role only
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.requeue_stalled_pa_leak_audit_jobs\(integer\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i);
  assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.requeue_stalled_pa_leak_audit_jobs\(integer\)\s+TO\s+service_role;/i);

  // DO block checks
  assert.match(sql, /replace_hand_audit_decisions must have exactly 1 overload/);
  assert.match(sql, /requeue_stalled_pa_leak_audit_jobs must have exactly 1 overload/);
  assert.match(sql, /has_function_privilege\('anon',\s*'public\.replace_hand_audit_decisions/);
  assert.match(sql, /has_function_privilege\('anon',\s*'public\.requeue_stalled_pa_leak_audit_jobs/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DEAD ROUTE RETIREMENT TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Retired sandbox route: equity-snapshot returns HTTP 410 Gone with private headers', async () => {
  const req = { method: 'POST', body: {} };
  const res = mockRes();

  await equitySnapshotHandler(req, res);

  assert.equal(res.statusCode, 410);
  assert.equal(res.getHeader('cache-control'), 'private, no-store, max-age=0');
  assert.equal(res.getHeader('vary'), 'Authorization');
  assert.equal(res.body?.code, 'SANDBOX_ENDPOINT_RETIRED');
  assert.equal(res.body?.success, false);
});

test('Restored sandbox route: save-hand enforces private headers, auth, active-play gate, and persistence contract', () => {
  const src = read('pages/api/sandbox/_routes/save-hand.js');
  assert.match(src, /private, no-store, max-age=0/);
  assert.match(src, /Vary['"],\s*['"]Authorization/);
  assert.match(src, /getServerUserWithFallback/);
  assert.match(src, /checkSandboxAccess/);
  assert.match(src, /SANDBOX_BLOCKED_LIVE_PLAY/);
  assert.match(src, /persistedResult/);
  assert.match(src, /persistenceFailure/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PUSH PREFS REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

test('Push preferences registers personal_assistant_weekly_digest', () => {
  const item = PUSH_TYPES.find(t => t.key === 'personal_assistant_weekly_digest');
  assert.ok(item, 'personal_assistant_weekly_digest must be in PUSH_TYPES');
  assert.equal(item.group, 'Poker and Clubs');
  assert.ok(PUSH_TYPE_KEYS.has('personal_assistant_weekly_digest'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONSOLIDATED MAINTENANCE CRON TESTS
// ─────────────────────────────────────────────────────────────────────────────

function getMaintenanceModule(deps = {}) {
  const defaultDeps = {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/lib/supabaseServerClient': { createClient: () => deps.supabase },
    '../../../src/lib/cronHealth': { withCronHealth: (_name, fn) => fn },
    '../../../src/utils/cron-auth': {
      validateCronAuth: req => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) throw new Error('Cron authentication is not configured');
        return req.headers?.['x-cron-secret'] === cronSecret || req.headers?.authorization === `Bearer ${cronSecret}`;
      },
    },
    '../../../src/lib/personal-assistant/contextAuthority.js': {
      ACCESS_LEVELS,
      checkSandboxAccess: deps.checkSandboxAccess || (async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS })),
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
  };
  return compile('pages/api/assistant/maintenance-jobs.js', { ...defaultDeps, ...deps });
}

test('Maintenance cron: validates cron auth and rejects invalid or missing secret', async () => {
  const oldSecret = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = 'test-cron-secret-12345';
    const maintenanceModule = getMaintenanceModule();
    const handler = maintenanceModule.default;

    // Unauthenticated GET
    const req1 = { method: 'GET', headers: {}, query: {} };
    const res1 = mockRes();
    await handler(req1, res1);
    assert.equal(res1.statusCode, 401);

    // Wrong secret GET
    const req2 = { method: 'GET', headers: { 'x-cron-secret': 'wrong' }, query: {} };
    const res2 = mockRes();
    await handler(req2, res2);
    assert.equal(res2.statusCode, 401);

    // Method not allowed (DELETE)
    const req3 = { method: 'DELETE', headers: { 'x-cron-secret': 'test-cron-secret-12345' }, query: {} };
    const res3 = mockRes();
    await handler(req3, res3);
    assert.equal(res3.statusCode, 405);
  } finally {
    process.env.CRON_SECRET = oldSecret;
  }
});

test('Maintenance cron: runRecoverAudits calls RPC and kicks worker for requeued IDs', async () => {
  const testJobId = '77777777-7777-4777-8777-777777777777';
  let rpcCalled = false;
  let kickedJobs = [];

  const mockSupabase = {
    rpc: async (fn, params) => {
      if (fn === 'requeue_stalled_pa_leak_audit_jobs') {
        rpcCalled = true;
        assert.equal(params.p_limit, 25);
        return {
          data: {
            requeuedIds: [testJobId],
            stalledRequeued: 1,
            activeCount: 3,
            failed24h: 0,
            p95DurationMs: 12000,
          },
          error: null,
        };
      }
      return { data: null, error: new Error('Unknown RPC') };
    },
    from: table => {
      assert.equal(table, 'pa_leak_audit_jobs');
      return {
        select: () => ({
          in: async (col, vals) => {
            assert.equal(col, 'id');
            assert.deepEqual(vals, [testJobId]);
            return {
              data: [{ id: testJobId, user_id: '11111111-1111-4111-8111-111111111111' }],
              error: null,
            };
          },
        }),
      };
    },
  };

  const maintenanceModule = getMaintenanceModule({
    supabase: mockSupabase,
    kickAuditWorker: async job => {
      kickedJobs.push(job);
      return { ok: true, status: 200 };
    },
  });

  const result = await maintenanceModule.runRecoverAudits(mockSupabase, { p_limit: 25 });
  assert.equal(rpcCalled, true);
  assert.equal(result.success, true);
  assert.equal(result.stalledRequeued, 1);
  assert.deepEqual(result.requeuedIds, [testJobId]);
  assert.equal(result.activeCount, 3);
  assert.equal(result.p95DurationMs, 12000);
  assert.equal(kickedJobs.length, 1);
  assert.equal(kickedJobs[0].id, testJobId);
});

test('Maintenance cron: runDueNudges respects 72h throttle and seated RTA guard', async () => {
  const userIdSeated = '22222222-2222-4222-8222-222222222222';
  const userIdThrottled = '33333333-3333-4333-8333-333333333333';
  const userIdEligible = '44444444-4444-4444-8444-444444444444';
  const notifiedUsers = [];

  const mockSupabase = {
    from: table => {
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [
                      { user_id: userIdSeated, leak_id: 'leak_1', due_at: '2026-11-20T00:00:00Z' },
                      { user_id: userIdThrottled, leak_id: 'leak_2', due_at: '2026-11-20T00:00:00Z' },
                      { user_id: userIdEligible, leak_id: 'leak_3', due_at: '2026-11-20T00:00:00Z' },
                    ],
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
            eq: (_c1, uid) => ({
              eq: () => ({
                gte: () => ({
                  limit: async () => {
                    // userIdThrottled has recent notification
                    if (uid === userIdThrottled) {
                      return { data: [{ id: 'notif-1' }], error: null };
                    }
                    return { data: [], error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const maintenanceModule = getMaintenanceModule({
    supabase: mockSupabase,
    checkSandboxAccess: async (_sb, uid) => {
      if (uid === userIdSeated) {
        return { allowed: false, accessLevel: ACCESS_LEVELS.HARD_BLOCK };
      }
      return { allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS };
    },
    notify: async (_sb, args) => {
      notifiedUsers.push(args.userId);
      return { ok: true, notificationId: 'notif-due' };
    },
  });

  const res = await maintenanceModule.runDueNudges(mockSupabase, { limit: 10 });
  assert.equal(res.success, true);
  assert.equal(res.dueFound, 3);
  assert.equal(res.uniqueUsers, 3);
  assert.equal(res.skippedSeated, 1, 'userIdSeated must be skipped');
  assert.equal(res.skippedThrottled, 1, 'userIdThrottled must be skipped due to 72h throttle');
  assert.equal(res.sentCount, 1);
  assert.deepEqual(notifiedUsers, [userIdEligible]);
});

test('Maintenance cron: runWeeklyDigest respects 7-day throttle and builds 3-line summary', async () => {
  const userOptedIn = '55555555-5555-4555-8555-555555555555';
  let notificationSent = null;

  const mockSupabase = {
    from: table => {
      if (table === 'pa_coaching_preferences') {
        return {
          select: () => ({
            eq: (col, val) => ({
              limit: async () => {
                assert.equal(col, 'weekly_digest_opt_in');
                assert.equal(val, true);
                return { data: [{ user_id: userOptedIn }], error: null };
              },
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
                  limit: async () => ({ data: [], error: null }), // No recent digest
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'user_leaks') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    { id: 'leak-bb-defend', leak_type: 'overfolding_big_blind', status: 'emerging', avg_ev_loss_bb: 4.2, is_active: true },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [
                  { leak_id: 'leak-bb-defend', reps: 5, remediation_baseline_at: '2026-11-20T10:00:00Z', retired: false },
                  { leak_id: 'leak-cbet', reps: 3, remediation_baseline_at: null, retired: false },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const maintenanceModule = getMaintenanceModule({
    supabase: mockSupabase,
    checkSandboxAccess: async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS }),
    notify: async (_sb, args) => {
      notificationSent = args;
      return { ok: true, notificationId: 'notif-digest' };
    },
  });

  const res = await maintenanceModule.runWeeklyDigest(mockSupabase, { limit: 10 });
  assert.equal(res.success, true);
  assert.equal(res.optedInFound, 1);
  assert.equal(res.sentCount, 1);
  assert.ok(notificationSent, 'Notification must be dispatched');
  assert.match(notificationSent.body, /Top Leak:\s*Overfolding Big Blind/);
  assert.match(notificationSent.body, /Drills Completed:\s*8/);
  assert.match(notificationSent.body, /Drills Mastered \(Live Tracking\):\s*1/);
  assert.doesNotMatch(notificationSent.body, /Verified Live Fixes/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SERVER-VERIFIED DIAMOND SETTLEMENT TESTS
// ─────────────────────────────────────────────────────────────────────────────

function getClaimModule(deps = {}) {
  const defaultDeps = {
    '../../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../../src/lib/supabaseServerClient': { createClient: () => deps.supabase },
    '../../../../src/lib/serverAuth': {
      getServerUserWithFallback: deps.getServerUserWithFallback || (async () => ({ user: { id: deps.userId || 'test-user' }, status: 200 })),
    },
    '../../../../src/lib/rewards/awardGuard': {
      safeAward: deps.safeAward || (async () => ({ ok: true, data: { success: true, awarded: 25, reason: 'ok' } })),
    },
    '../../../../src/lib/personal-assistant/coachingIntelligence.mjs': {
      buildCoachingSnapshot,
    },
    '../../../../src/lib/personal-assistant/leakRecord': {
      normalizeUserLeakRow,
    },
  };
  const mod = compile('pages/api/assistant/leaks/claim-live-fix.js', { ...defaultDeps, ...deps });
  if (deps.supabase && typeof mod._setSupabaseForTesting === 'function') {
    mod._setSupabaseForTesting(deps.supabase);
  }
  return mod;
}

test('claim-live-fix: rejects unconfirmed leaks with 409 LEAK_NOT_VERIFIED_LIVE', async () => {
  const userId = '66666666-6666-4666-8666-666666666666';

  const mockSupabase = {
    from: table => {
      if (table === 'user_leaks') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [
                  { id: 'cbet_leak', leak_type: 'cbet_flop', situation_class: 'cbet', status: 'active' },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [
                  { leak_id: 'cbet_leak', reps: 1, interval_days: 1, remediation_baseline_at: '2026-11-20T00:00:00Z' },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'hand_audit_decisions') {
        const chain = {
          like: () => chain,
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
        };
        return {
          select: () => ({
            eq: () => chain,
          }),
        };
      }
      if (table === 'hand_history') {
        return {
          select: () => ({ in: async () => ({ data: [], error: null }) }),
        };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const claimModule = getClaimModule({ supabase: mockSupabase, userId });
  const handler = claimModule.default;

  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt' },
    body: { leakId: 'cbet_leak' },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.code, 'LEAK_NOT_VERIFIED_LIVE');
  assert.equal(res.body?.success, false);
});

test('claim-live-fix: awards diamonds when leak is confirmed fixed at live tables', async () => {
  const userId = '88888888-8888-4888-8888-888888888888';
  const leakId = 'river_fold_leak';
  const baselineIso = '2026-11-20T00:00:00Z';
  const baselineMs = new Date(baselineIso).getTime();

  // 8 post-baseline solver-verified correct decisions
  const decisions = [];
  for (let i = 1; i <= 8; i++) {
    decisions.push({
      hand_external_id: `club-arena:10000000-0000-0000-0000-00000000000${i}`,
      decision_key: `river_fold_leak:${i}`,
      question_id: `q_${i}`,
      game_id: `g_${i}`,
      street: 'river',
      hero_position: 'BTN',
      villain_position: 'BB',
      spot_type: 'river_fold_leak',
      hero_hand: 'AhKh',
      classification: 'correct',
      ev_loss: 0,
      ev_loss_measured: true,
      solver_verified: true,
      solver_source: 'pio|hand-audit-v3',
      audited_at: new Date(baselineMs + i * 3600 * 1000).toISOString(),
    });
  }

  let safeAwardCalled = false;
  let safeAwardParams = null;

  const mockSupabase = {
    from: table => {
      if (table === 'user_leaks') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [
                  { id: leakId, leak_type: 'river_fold_leak', situation_class: 'river_fold_leak', status: 'active' },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [
                  {
                    leak_id: leakId,
                    reps: 5,
                    interval_days: 28,
                    retired: true,
                    remediation_baseline_at: baselineIso,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'hand_audit_decisions') {
        const chain = {
          like: () => chain,
          order: () => chain,
          limit: async () => ({ data: decisions, error: null }),
        };
        return {
          select: () => ({
            eq: () => chain,
          }),
        };
      }
      if (table === 'hand_history') {
        return {
          select: () => ({
            in: async (col, ids) => ({
              data: ids.map((id, idx) => ({ id, created_at: new Date(baselineMs + (idx + 1) * 3600 * 1000).toISOString() })),
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const claimModule = getClaimModule({
    supabase: mockSupabase,
    userId,
    safeAward: async (_sb, params) => {
      safeAwardCalled = true;
      safeAwardParams = params;
      return {
        ok: true,
        data: {
          success: true,
          awarded: 25,
          requested: 25,
          reason: 'ok',
        },
      };
    },
  });

  const handler = claimModule.default;
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt' },
    body: { leakId },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.awarded, true);
  assert.equal(res.body?.alreadyAwarded, false);
  assert.equal(res.body?.diamonds, 25);
  assert.ok(safeAwardCalled, 'safeAward must be called');
  assert.equal(safeAwardParams.p_user_id, userId);
  assert.equal(safeAwardParams.p_action_key, 'pa_leak_verified_fixed');
  assert.ok(safeAwardParams.p_reference_id.startsWith(`pa-verified-live:${leakId}:`));
  assert.equal(safeAwardParams.p_metadata.leakId, leakId);
  assert.equal(safeAwardParams.p_metadata.postSampleCount, 8);
  assert.equal(safeAwardParams.p_metadata.postMistakeRate, 0);
});

test('claim-live-fix: handles duplicate claims idempotently without error', async () => {
  const userId = '99999999-9999-4999-9999-999999999999';
  const leakId = 'river_fold_leak';
  const baselineIso = '2026-11-20T00:00:00Z';
  const baselineMs = new Date(baselineIso).getTime();

  const decisions = [];
  for (let i = 1; i <= 8; i++) {
    decisions.push({
      hand_external_id: `club-arena:10000000-0000-0000-0000-00000000000${i}`,
      decision_key: `river_fold_leak:${i}`,
      street: 'river',
      spot_type: 'river_fold_leak',
      classification: 'correct',
      solver_verified: true,
      solver_source: 'pio|hand-audit-v3',
      audited_at: new Date(baselineMs + i * 3600 * 1000).toISOString(),
    });
  }

  const mockSupabase = {
    from: table => {
      if (table === 'user_leaks') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [{ id: leakId, leak_type: 'river_fold_leak', status: 'active' }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [{ leak_id: leakId, reps: 5, interval_days: 28, retired: true, remediation_baseline_at: baselineIso }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'hand_audit_decisions') {
        const chain = {
          like: () => chain,
          order: () => chain,
          limit: async () => ({ data: decisions, error: null }),
        };
        return { select: () => ({ eq: () => chain }) };
      }
      if (table === 'hand_history') {
        return { select: () => ({ in: async (col, ids) => ({ data: ids.map(id => ({ id, created_at: baselineIso })), error: null }) }) };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const claimModule = getClaimModule({
    supabase: mockSupabase,
    userId,
    safeAward: async () => ({
      ok: true,
      data: {
        success: false,
        awarded: 0,
        requested: 0,
        reason: 'duplicate',
      },
    }),
  });

  const handler = claimModule.default;
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt' },
    body: { leakId },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.awarded, false);
  assert.equal(res.body?.alreadyAwarded, true);
  assert.equal(res.body?.diamonds, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PHASE 5 FORTRESS REGRESSION TESTS (OPS, CLAIMS, COACHING, DETECT, AUDIT)
// ─────────────────────────────────────────────────────────────────────────────

test('claim-live-fix: cap-rejected award returns success: false and REWARD_LIMIT_REACHED', async () => {
  const userId = '99999999-9999-4999-9999-999999999998';
  const leakId = 'river_fold_leak';
  const baselineIso = '2026-11-20T00:00:00Z';
  const baselineMs = new Date(baselineIso).getTime();

  const decisions = [];
  for (let i = 1; i <= 8; i++) {
    decisions.push({
      hand_external_id: `club-arena:10000000-0000-0000-0000-00000000000${i}`,
      decision_key: `river_fold_leak:${i}`,
      street: 'river',
      spot_type: 'river_fold_leak',
      classification: 'correct',
      solver_verified: true,
      solver_source: 'pio|hand-audit-v3',
      audited_at: new Date(baselineMs + i * 3600 * 1000).toISOString(),
    });
  }

  let queriedSolverSource = null;
  let queriedOrderCol = null;
  let queriedLimit = null;

  const mockSupabase = {
    from: table => {
      if (table === 'user_leaks') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [{ id: leakId, leak_type: 'river_fold_leak', status: 'active' }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [{ leak_id: leakId, reps: 5, interval_days: 28, retired: true, remediation_baseline_at: baselineIso }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'hand_audit_decisions') {
        const chain = {
          like: (_col, pat) => {
            queriedSolverSource = pat;
            return chain;
          },
          order: (col) => {
            queriedOrderCol = col;
            return chain;
          },
          limit: async (lim) => {
            queriedLimit = lim;
            return { data: decisions, error: null };
          },
        };
        return { select: () => ({ eq: () => chain }) };
      }
      if (table === 'hand_history') {
        return {
          select: () => ({
            in: async (_col, ids) => ({
              data: ids.map((id, idx) => ({ id, created_at: new Date(baselineMs + (idx + 1) * 3600 * 1000).toISOString() })),
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  for (const capReason of ['action_limit', 'daily_cap', 'monthly_cap', 'budget_exhausted']) {
    const claimModule = getClaimModule({
      supabase: mockSupabase,
      userId,
      safeAward: async () => ({
        ok: true,
        data: {
          success: false,
          awarded: 0,
          requested: 25,
          reason: capReason,
        },
      }),
    });

    const handler = claimModule.default;
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-jwt' },
      body: { leakId },
    };
    const res = mockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.success, false, `cap reason ${capReason} must return success: false`);
    assert.equal(res.body?.awarded, false);
    assert.equal(res.body?.alreadyAwarded, false);
    assert.equal(res.body?.diamonds, 0);
    assert.equal(res.body?.code, 'REWARD_LIMIT_REACHED');
    assert.equal(res.body?.reason, capReason);
    assert.equal(res.body?.error, 'Daily or monthly Diamond reward limit reached.');
    assert.ok(res.body?.milestone?.idempotencyKey);
  }

  assert.equal(queriedSolverSource, '%hand-audit-v3%');
  assert.equal(queriedOrderCol, 'audited_at');
  assert.equal(queriedLimit, 5000);
});

test('openclaw-cron-dispatcher schedules /api/assistant/maintenance-jobs and runDueNudges orders due_at DESC with 500 limit', async () => {
  const dispatcher = read('scripts/openclaw-cron-dispatcher.py');
  assert.match(dispatcher, /\('\/api\/assistant\/retention-maintenance',\s*dict\(/);
  assert.match(dispatcher, /\('\/api\/assistant\/maintenance-jobs',\s*dict\(/);

  let observedOrder = null;
  let observedLimit = null;
  const mockSupabase = {
    from: table => {
      if (table === 'leak_review_state') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: (col, opts) => {
                  observedOrder = { col, opts };
                  return {
                    limit: async lim => {
                      observedLimit = lim;
                      return { data: [], error: null };
                    },
                  };
                },
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const maintenanceModule = getMaintenanceModule({ supabase: mockSupabase });
  const res = await maintenanceModule.runDueNudges(mockSupabase);
  assert.equal(res.success, true);
  assert.deepEqual(observedOrder, { col: 'due_at', opts: { ascending: false } });
  assert.equal(observedLimit, 500);
});

function getCoachingModule(deps = {}) {
  const defaultDeps = {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../src/lib/personal-assistant/coachingIntelligence.mjs': {
      buildCoachingSnapshot: deps.buildCoachingSnapshot || buildCoachingSnapshot,
      receiptFingerprint: () => 'pa7-test-receipt',
    },
    '../../../src/lib/personal-assistant/leakRecord': {
      normalizeUserLeakRow,
    },
    '../../../src/lib/personal-assistant/contextAuthority': {
      ACCESS_LEVELS,
      checkSandboxAccess: async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS }),
    },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: deps.userId || '11111111-1111-4111-8111-111111111111' }, status: 200 }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => deps.supabase },
  };
  const mod = compile('pages/api/assistant/coaching.js', { ...defaultDeps, ...deps });
  if (deps.supabase && typeof mod._setSupabaseForTesting === 'function') {
    mod._setSupabaseForTesting(deps.supabase);
  }
  return mod;
}

test('coaching.js: queries %hand-audit-v3%, preserves partial preferences on writePreferences, and hydrates claimed live-fix references', async () => {
  const coachingSrc = read('pages/api/assistant/coaching.js');
  assert.match(coachingSrc, /\.like\('solver_source',\s*'%hand-audit-v3%'\)/);
  assert.doesNotMatch(coachingSrc, /\.like\('solver_source',\s*'%\|\s*hand-audit-v3'\)/);

  const userId = '12121212-1212-4212-8212-121212121212';
  let upsertedPayload = null;
  let simulateMissingSchemaOnUpsert = false;

  const existingRow = {
    saved_view: 'timeline',
    analysis_depth: 'expert',
    panel_layout: { railCollapsed: true, pinnedTab: 'report' },
    weekly_digest_opt_in: false,
    updated_at: '2026-11-24T00:00:00.000Z',
  };

  const mockSupabase = {
    from: table => {
      if (table === 'pa_coaching_preferences') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingRow, error: null }),
            }),
          }),
          upsert: payload => {
            upsertedPayload = { ...payload };
            return {
              select: () => ({
                maybeSingle: async () => {
                  if (simulateMissingSchemaOnUpsert) {
                    return { data: null, error: { code: '42703', message: 'column "weekly_digest_opt_in" does not exist' } };
                  }
                  return { data: { ...existingRow, ...payload }, error: null };
                },
              }),
            };
          },
        };
      }
      if (table === 'diamond_transactions') {
        return {
          select: () => ({
            eq: (_c1, uid) => ({
              eq: (_c2, txType) => ({
                limit: async () => {
                  assert.equal(uid, userId);
                  assert.equal(txType, 'pa_leak_verified_fixed');
                  return {
                    data: [
                      { reference_id: 'pa-verified-live:river_overfold:2026-11-20T00:00:00.000Z', transaction_type: 'pa_leak_verified_fixed' },
                    ],
                    error: null,
                  };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'hand_audit_decisions') {
        const chain = {
          like: (_col, pat) => {
            assert.equal(pat, '%hand-audit-v3%');
            return chain;
          },
          order: () => chain,
          limit: async () => ({
            data: [
              { hand_external_id: 'h1', decision_key: 'flop:0', solver_verified: false, solver_source: 'hand-audit-v3:unpriced', classification: 'unpriced', audited_at: '2026-11-25T00:00:00Z' },
              { hand_external_id: 'h2', decision_key: 'turn:0', solver_verified: false, solver_source: 'hand-audit-v3:lookup-failed', classification: 'unpriced', audited_at: '2026-11-25T00:00:00Z' },
            ],
            error: null,
          }),
        };
        return { select: () => ({ eq: () => chain }) };
      }
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  };

  const coachingMod = getCoachingModule({ supabase: mockSupabase, userId });

  // 1. readHandAuditDecisions loads unpriced & lookup-failed v3 rows
  const loadedDecisions = await coachingMod.readHandAuditDecisions(mockSupabase, userId);
  assert.equal(loadedDecisions.length, 2);

  // 2. readClaimedLiveFixReferenceIds returns Set of claimed reference IDs
  const claimedSet = await coachingMod.readClaimedLiveFixReferenceIds(mockSupabase, userId);
  assert.ok(claimedSet instanceof Set);
  assert.equal(claimedSet.has('pa-verified-live:river_overfold:2026-11-20T00:00:00.000Z'), true);

  // 3. Partial writePreferences preserves saved_view, analysis_depth, and panel_layout
  const saved = await coachingMod.writePreferences(mockSupabase, userId, { weeklyDigestOptIn: true });
  assert.equal(upsertedPayload.saved_view, 'timeline');
  assert.equal(upsertedPayload.analysis_depth, 'expert');
  assert.deepEqual(upsertedPayload.panel_layout, { railCollapsed: true, pinnedTab: 'report' });
  assert.equal(upsertedPayload.weekly_digest_opt_in, true);
  assert.equal(saved.weeklyDigestOptIn, true);

  // 4. Explicit weeklyDigestOptIn throws when DB column is missing instead of faking success
  simulateMissingSchemaOnUpsert = true;
  await assert.rejects(
    () => coachingMod.writePreferences(mockSupabase, userId, { weeklyDigestOptIn: true }),
    /Weekly digest preference column is not available/,
  );
});

test('detect.js filters non-club_arena evidence_scope and audit-hand-history.js enriches bigBlind/effectiveStackBb with LIMITS.write', () => {
  const detectSrc = read('pages/api/assistant/leaks/detect.js');
  assert.match(detectSrc, /ev_loss_measured,\s*evidence_scope/);
  assert.match(detectSrc, /if\s*\(row\.evidence_scope\s*&&\s*row\.evidence_scope\s*!==\s*'club_arena'\)\s*continue;/);

  const auditSrc = read('pages/api/training/audit-hand-history.js');
  assert.match(auditSrc, /applyRateLimit\(req,\s*res,\s*LIMITS\.write\)/);
  assert.doesNotMatch(auditSrc, /applyRateLimit\(req,\s*res,\s*LIMITS\.ai\)/);
  assert.match(auditSrc, /analysis\?\.decisions\?\.\[0\]\?\.heroPosition\s*\|\|\s*analysis\?\.decisions\?\.\[0\]\?\.position\s*\|\|\s*'BTN'/);
  assert.match(auditSrc, /effectiveStackBb:\s*derivedEffBb/);
});

