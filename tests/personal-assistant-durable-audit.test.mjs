import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openAuditJobToken, sealAuditJobToken } from '../src/lib/personal-assistant/auditJobToken.mjs';
import { mergeAuditJobProgress, publicAuditJob } from '../src/lib/personal-assistant/auditJobRuntime.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20260831143000_pa_durable_leak_audit_jobs.sql', import.meta.url), 'utf8');
const jobsApi = readFileSync(new URL('../pages/api/assistant/leaks/audit-jobs.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../app/api/assistant/leaks/audit-worker/route.js', import.meta.url), 'utf8');
const detect = readFileSync(new URL('../pages/api/assistant/leaks/detect.js', import.meta.url), 'utf8');
const hooks = readFileSync(new URL('../src/hooks/useAssistant.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../pages/hub/personal-assistant/leaks.js', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');

test('worker tokens are owner, purpose and expiry bound', () => {
  const prior = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = 'phase-two-test-secret';
  const token = sealAuditJobToken({ jobId: 'job-1', userId: 'user-1', purpose: 'detect' });
  assert.deepEqual(openAuditJobToken(token, 'detect')?.jobId, 'job-1');
  assert.equal(openAuditJobToken(token, 'kick'), null);
  assert.equal(openAuditJobToken(`${token}x`, 'detect'), null);
  const expired = sealAuditJobToken({ jobId: 'job-1', userId: 'user-1', purpose: 'detect', ttlMs: -60_000 });
  // The signer enforces a minimum safe lifetime instead of producing an
  // already-expired token that races the worker claim.
  assert.equal(openAuditJobToken(expired, 'detect')?.userId, 'user-1');
  if (prior === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = prior;
});

test('audit progress is cumulative and exposes the complete coverage funnel', () => {
  const first = mergeAuditJobProgress({}, {
    success: true,
    auditInProgress: true,
    clubArenaSync: {
      auditCursor: 'next', handsFound: 200, handsEligible: 170,
      privateCardsRecovered: 80, handsMissingPrivateCards: 30,
      handsSkippedNoHeroDecisions: 10, handsAudited: 120,
      handsAlreadyCurrent: 40, handsQueuedForRetry: 5,
      decisionsAnalyzed: 240, solverVerified: 180, unpriced: 60,
    },
  }, 1200);
  const final = mergeAuditJobProgress(first, {
    success: true, leaksDetected: 6,
    clubArenaSync: { handsFound: 50, handsEligible: 45, decisionsAnalyzed: 60, solverVerified: 45, unpriced: 15 },
  }, 800);
  assert.equal(final.batchesCompleted, 2);
  assert.equal(final.handsScanned, 250);
  assert.equal(final.decisionsAnalyzed, 300);
  assert.equal(final.totalProcessingMs, 2000);
  assert.equal(final.coverage.exactSolverMatches, 225);
  assert.equal(final.coverage.leaks, 6);
  assert.equal(final.complete, true);
});

test('failed retries record attempts without double-counting unpersisted evidence', () => {
  const progress = mergeAuditJobProgress({ handsScanned: 200, batchesCompleted: 1 }, {
    success: false,
    retryable: true,
    clubArenaSync: { handsFound: 200, handsAudited: 20, decisionsAnalyzed: 30 },
  }, 500);
  assert.equal(progress.handsScanned, 200);
  assert.equal(progress.handsAudited, 0);
  assert.equal(progress.batchesCompleted, 1);
  assert.equal(progress.workerAttempts, 1);
});

test('public job projection never exposes cursors, leases or worker tokens', () => {
  const projected = publicAuditJob({
    id: 'job', status: 'running', stage: 'importing_hands', audit_cursor: 'private-cursor',
    worker_token: 'private-worker', lease_expires_at: 'tomorrow', attempt_count: 1,
    progress: { auditCursor: 'nested-cursor', safe: 1 },
    result: { leaks: [{ id: 'leak', user_id: 'private-owner', title: 'Safe Evidence' }] },
    reconciliation: { consistent: true, workerToken: 'nested-worker' },
  });
  assert.equal(projected.id, 'job');
  assert.equal(projected.resumable, true);
  assert.equal('audit_cursor' in projected, false);
  assert.equal('worker_token' in projected, false);
  assert.equal('lease_expires_at' in projected, false);
  assert.deepEqual(projected.progress, { safe: 1 });
  assert.deepEqual(projected.result, { leaks: [{ id: 'leak', title: 'Safe Evidence' }] });
  assert.deepEqual(projected.reconciliation, { consistent: true });
});

test('durable jobs are owner-private, atomically claimed and restartable', () => {
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /pa_leak_audit_jobs_owner_read/);
  assert.match(migration, /one_active_per_user/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /claim_pa_leak_audit_job/);
  assert.match(migration, /status = 'running'.*lease_expires_at/s);
  assert.match(migration, /status = 'failed'.*audit_cursor IS NOT NULL/s);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_pa_leak_audit_job.*authenticated/s);
  assert.match(migration, /REVOKE ALL ON TABLE public\.pa_leak_audit_jobs FROM public, anon, authenticated/);
  assert.doesNotMatch(migration, /GRANT SELECT ON TABLE public\.pa_leak_audit_jobs TO authenticated/);
});

test('server workers self-chain after the response and reconcile final evidence', () => {
  assert.match(worker, /import \{ after \} from 'next\/server'/);
  assert.match(worker, /after\(async \(\) =>/);
  assert.match(worker, /kickAuditWorker\(saved, \{ origin \}\)/);
  assert.match(worker, /reconcileAuditEvidence/);
  assert.match(worker, /MAX_TRANSIENT_FAILURES = 3/);
  assert.doesNotMatch(worker, /MAX_BATCHES/);
  assert.match(worker, /nextCursorFingerprint === job\.progress\?\.cursorFingerprint/);
  assert.match(worker, /durableWorkRecorded/);
  assert.match(worker, /audit_cursor_stalled/);
  assert.match(worker, /audit_persistence_incomplete/);
  assert.match(worker, /audit_reconciliation_failed/);
  assert.match(worker, /p_lease_seconds: 300/);
  assert.match(worker, /body\?\.code === 'invalid_audit_cursor'/);
  assert.match(worker, /invalidCursor \? null/);
  assert.match(worker, /personal_assistant_audit_complete/);
  assert.match(jobsApi, /start_or_resume_pa_leak_audit_job/);
  assert.match(jobsApi, /publicAuditJob/);
});

test('internal detection is job-bound and the UI restores server checkpoints', () => {
  assert.match(detect, /openAuditJobToken\(req\.headers\['x-pa-audit-worker'\], 'detect'\)/);
  assert.match(detect, /pa_leak_audit_jobs.*status.*running/s);
  assert.match(detect, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(detect, /cursorFingerprint = fingerprintAuditCursor/);
  assert.match(detect, /club_arena_audit_partial/);
  assert.match(middleware, /pathname === '\/api\/assistant\/leaks\/audit-worker'/);
  assert.match(middleware, /pathname === '\/api\/assistant\/leaks\/detect'/);
  assert.match(middleware, /auditWorkerHeader\.length > 20/);
  assert.match(middleware, /!hasInternalAuditCredential/);
  assert.match(hooks, /\/api\/assistant\/leaks\/audit-jobs/);
  assert.match(hooks, /Restore failed/);
  assert.match(hooks, /setInterval\(poll, 2000\)/);
  assert.doesNotMatch(hooks, /auditCursorRef/);
  assert.match(page, /You Can Safely Leave This Page And Return Later/);
  assert.match(page, /Resume Saved Audit/);
  assert.match(page, /Reconciliation/);
});
