import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAndNormalizeScenario, ScenarioValidationError } from '../src/lib/sandbox/scenarioContract.mjs';
import { openAuditCursor, sealAuditCursor } from '../src/lib/personal-assistant/auditCursor.mjs';
import { runLeakAuditBatches } from '../src/lib/personal-assistant/leakAuditRunner.js';
import { boundedMap, percentile, protectedReadRoutes } from '../scripts/verify-pa-production-hardening.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

function hostileScenario(next, index) {
  const junk = [null, undefined, '', Number.NaN, Number.POSITIVE_INFINITY, {}, [], 'x'.repeat(index % 257)];
  const pick = () => junk[Math.floor(next() * junk.length)];
  const validBase = index % 7 === 0;
  return {
    heroHand: validBase ? { card1: 'As', card2: 'Kd' } : pick(),
    board: validBase ? { flop: ['Qc', '7h', '2s'], turn: null, river: null }
      : { flop: next() > 0.5 ? ['As', 'Kd', 'Qc'] : pick(), turn: pick(), river: pick() },
    potSize: validBase ? 6.5 : (next() > 0.5 ? next() * 1e12 : pick()),
    heroStack: validBase ? 100 : pick(),
    heroPosition: validBase ? 'BTN' : pick(),
    gameType: validBase ? 'cash' : pick(),
    actionHistory: validBase ? []
      : Array.from({ length: index % 40 }, () => ({ actor: pick(), action: pick(), amount: pick() })),
    villains: validBase ? [{ position: 'BB', stack: 100, archetype: 'gto_neutral' }]
      : Array.from({ length: index % 12 }, () => ({ position: pick(), archetype: pick(), nodeLocks: pick() })),
  };
}

test('deterministic scenario fuzzing either normalizes safely or fails with the owned validation error', () => {
  const next = random(0x5a17c0de);
  for (let index = 0; index < 1500; index += 1) {
    try {
      const normalized = validateAndNormalizeScenario(hostileScenario(next, index));
      const heroCards = [normalized.heroHand.card1, normalized.heroHand.card2];
      assert.equal(new Set(heroCards).size, heroCards.length);
      assert.equal(Number.isFinite(normalized.potSize), true);
    } catch (error) {
      assert.equal(error instanceof ScenarioValidationError, true, `unexpected fuzz failure: ${error?.stack}`);
    }
  }
});

test('signed audit cursor parser rejects a deterministic hostile corpus without leaking another owner', () => {
  const previous = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = 'phase-six-hostile-cursor-secret';
  try {
    const now = Date.parse('2026-09-01T16:00:00.000Z');
    const token = sealAuditCursor({ snapshotAt: new Date(now).toISOString(), cumulativeHandsFound: 9 }, 'owner-a', now);
    assert.equal(openAuditCursor(token, 'owner-a', now).cumulativeHandsFound, 9);
    assert.throws(() => openAuditCursor(token, 'owner-b', now), /invalid_cursor/);
    const next = random(0xc0ffee);
    for (let index = 0; index < 1500; index += 1) {
      const noise = Array.from({ length: 1 + Math.floor(next() * 5000) }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-'[Math.floor(next() * 65)]
      ).join('');
      assert.throws(() => openAuditCursor(noise, 'owner-a', now), /invalid_cursor/);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previous;
  }
});

test('outage storms remain bounded, resumable, and never report false persistence', async () => {
  for (const status of [429, 502, 503, 504]) {
    let calls = 0;
    const result = await runLeakAuditBatches(async cursor => {
      calls += 1;
      return calls === 1
        ? { ok: false, status, retryAfter: 0, data: { success: false, retryable: status !== 429 } }
        : { ok: false, status: 503, data: { success: false, retryable: false, error: 'Synthetic outage' } };
    }, { initialCursor: 'signed-checkpoint', waitFor: async () => {} });
    assert.equal(calls, 2);
    assert.equal(result.success, false);
    assert.equal(result.auditCursor, 'signed-checkpoint');
    assert.equal(result.auditProgress.complete, false);
    assert.notEqual(result.persisted, true);
  }
});

test('production load helper enforces its concurrency ceiling and exact result count', async () => {
  let active = 0;
  let observed = 0;
  const tasks = Array.from({ length: 41 }, (_, index) => index);
  const result = await boundedMap(tasks, 5, async value => {
    active += 1;
    observed = Math.max(observed, active);
    await new Promise(resolve => setTimeout(resolve, value % 3));
    active -= 1;
    return value * 2;
  });
  assert.equal(observed, 5);
  assert.equal(result.peak, 5);
  assert.equal(result.output.length, tasks.length);
  assert.equal(percentile([1, 2, 3, 4, 100], 0.95), 100);
});

test('Personal Assistant RLS evidence is owner-scoped or service-role-only', () => {
  const jobs = read('supabase/migrations/20260831143000_pa_durable_leak_audit_jobs.sql');
  const audits = read('supabase/migrations/20260827191000_hand_audit_solver_decisions.sql');
  const drills = read('supabase/migrations/20260830193000_verified_leak_drill_telemetry.sql');
  assert.match(jobs, /FORCE ROW LEVEL SECURITY/);
  assert.match(jobs, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(jobs, /REVOKE ALL ON TABLE public\.pa_leak_audit_jobs FROM public, anon, authenticated/);
  assert.match(jobs, /REVOKE ALL ON FUNCTION public\.start_or_resume_pa_leak_audit_job\(uuid\) FROM public, anon, authenticated/);
  assert.match(audits, /ALTER TABLE public\.hand_audit_decisions ENABLE ROW LEVEL SECURITY/);
  assert.match(audits, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(drills, /REVOKE ALL ON public\.leak_drill_sessions, public\.leak_drill_answers, public\.leak_drill_attempts FROM PUBLIC, anon, authenticated/);
  assert.match(drills, /REVOKE SELECT ON public\.training_question_cache FROM PUBLIC, anon, authenticated/);
});

test('private Club Arena hand facts cascade with their account and source hand', () => {
  const migration = read('supabase/migrations/20260906021000_cascade_private_hand_facts.sql');
  assert.match(migration, /FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\)\s+ON DELETE CASCADE NOT VALID/);
  assert.match(migration, /FOREIGN KEY \(hand_id\) REFERENCES public\.hand_history\(id\)\s+ON DELETE CASCADE NOT VALID/);
  assert.match(migration, /VALIDATE CONSTRAINT ca_hand_facts_user_id_fkey/);
  assert.match(migration, /VALIDATE CONSTRAINT ca_hand_facts_hand_id_fkey/);
  assert.match(migration, /orphaned users/);
  assert.match(migration, /orphaned hands/);
});

test('Phase 6 is a permanent build, browser, and post-deployment gate', () => {
  const pkg = JSON.parse(read('package.json'));
  const playwright = read('playwright.config.ts');
  const workflow = read('.github/workflows/personal-assistant-production-watchdog.yml');
  assert.match(pkg.scripts['test:leak-engine'], /personal-assistant-production-hardening\.test\.mjs/);
  assert.equal(pkg.scripts['verify:pa-hardening'], 'node scripts/verify-pa-production-hardening.mjs --require-auth');
  assert.match(playwright, /name: 'pa-webkit'/);
  assert.match(playwright, /name: 'pa-mobile-webkit'/);
  assert.equal((playwright.match(/fullyParallel: false/g) || []).length >= 2, true);
  assert.match(workflow, /deployment_status:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /verify-pa-production-hardening\.mjs --require-auth/);
  assert.equal(protectedReadRoutes.includes('/api/assistant/sandbox/sandbox-quiz'), true);
  assert.equal(protectedReadRoutes.includes('/api/sandbox/sessions'), true);
  assert.equal(protectedReadRoutes.includes('/api/sandbox/create-share'), true);
});

test('all Personal Assistant data routes share resilient auth and the durable worker owns a JSON failure boundary', () => {
  const apiRoots = [
    'pages/api/assistant',
    'pages/api/sandbox/_routes',
    'app/api/assistant',
  ];
  const files = apiRoots.flatMap(root => fs.readdirSync(path.join(ROOT, root), { recursive: true })
    .filter(name => String(name).endsWith('.js'))
    .map(name => path.join(root, String(name))));
  const directAuth = files.filter(file => /\.auth\.getUser\s*\(/.test(read(file)));
  assert.deepEqual(directAuth, []);

  const worker = read('app/api/assistant/leaks/audit-worker/route.js');
  assert.match(worker, /export async function POST\(request\) \{\s*try \{/);
  assert.match(worker, /status: 503/);
});
