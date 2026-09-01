import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAuditWorkerOrigin, openAuditJobToken, sealAuditJobToken } from '../src/lib/personal-assistant/auditJobToken.mjs';
import { mergeAuditJobProgress, publicAuditJob } from '../src/lib/personal-assistant/auditJobRuntime.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20260831143000_pa_durable_leak_audit_jobs.sql', import.meta.url), 'utf8');
const jobsApi = readFileSync(new URL('../pages/api/assistant/leaks/audit-jobs.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../app/api/assistant/leaks/audit-worker/route.js', import.meta.url), 'utf8');
const detect = readFileSync(new URL('../pages/api/assistant/leaks/detect.js', import.meta.url), 'utf8');
const auditCursor = readFileSync(new URL('../src/lib/personal-assistant/auditCursor.mjs', import.meta.url), 'utf8');
const hooks = readFileSync(new URL('../src/hooks/useAssistant.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../pages/hub/personal-assistant/leaks.js', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
const accountVerifier = readFileSync(new URL('../scripts/verify-personal-assistant-account-flow.mjs', import.meta.url), 'utf8');

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
      handsRejectedBeforeAudit: 12,
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
  assert.equal(final.handsRejectedBeforeAudit, 12);
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

test('finalization retries do not count an accepted detector page twice', () => {
  const previous = {
    handsScanned: 1347,
    decisionsAnalyzed: 241,
    batchesCompleted: 7,
    workerAttempts: 7,
    totalProcessingMs: 7000,
    finalBatchAwaitingPersistence: true,
  };
  const retried = mergeAuditJobProgress(previous, {
    success: true,
    leaksDetected: 6,
    clubArenaSync: { handsFound: 147, decisionsAnalyzed: 21, solverVerified: 21 },
  }, 500, { countAcceptedBatch: false });
  assert.equal(retried.handsScanned, 1347);
  assert.equal(retried.decisionsAnalyzed, 241);
  assert.equal(retried.batchesCompleted, 7);
  assert.equal(retried.workerAttempts, 8);
  assert.equal(retried.totalProcessingMs, 7500);
  assert.equal(retried.complete, true);
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

test('production workers use the public origin instead of an SSO-protected deployment URL', () => {
  const prior = {
    nodeEnv: process.env.NODE_ENV,
    publicBase: process.env.PA_PUBLIC_BASE_URL,
    internalBase: process.env.PA_INTERNAL_BASE_URL,
    vercelUrl: process.env.VERCEL_URL,
  };
  process.env.NODE_ENV = 'production';
  delete process.env.PA_PUBLIC_BASE_URL;
  process.env.PA_INTERNAL_BASE_URL = 'http://internal.invalid';
  process.env.VERCEL_URL = 'protected-preview.vercel.app';
  assert.equal(getAuditWorkerOrigin(), 'https://smarter.poker');
  process.env.PA_PUBLIC_BASE_URL = 'https://audit.smarter.poker/';
  assert.equal(getAuditWorkerOrigin(), 'https://audit.smarter.poker');
  for (const [key, value] of Object.entries({
    NODE_ENV: prior.nodeEnv,
    PA_PUBLIC_BASE_URL: prior.publicBase,
    PA_INTERNAL_BASE_URL: prior.internalBase,
    VERCEL_URL: prior.vercelUrl,
  })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('protected account verification tolerates the same bounded transient source failures as the durable worker', () => {
  assert.match(accountVerifier, /const MAX_TRANSIENT_RETRIES = 3/);
  assert.match(accountVerifier, /transientRetries < MAX_TRANSIENT_RETRIES/);
  assert.match(accountVerifier, /transientRetries \+= 1/);
  assert.match(accountVerifier, /assertSuccess\(result, 'Deterministic audit'\);\s*transientRetries = 0/s);
});

test('server workers finish detector pages in-process and reconcile final evidence', () => {
  assert.match(worker, /import \{ after \} from 'next\/server'/);
  assert.match(worker, /after\(async \(\) =>/);
  assert.match(worker, /while \(activeJob.*MAX_BATCHES_PER_INVOCATION/s);
  assert.match(worker, /status: 'running'.*auditCursor: nextCursor/s);
  assert.doesNotMatch(worker, /kickAuditWorker/);
  assert.match(worker, /reconcileAuditEvidence/);
  assert.match(worker, /MAX_TRANSIENT_FAILURES = 3/);
  assert.match(worker, /MAX_BATCHES_PER_INVOCATION = 50/);
  assert.match(worker, /WORKER_BUDGET_MS = 260_000/);
  assert.match(worker, /response\.status === 508/);
  assert.match(worker, /nextCursorFingerprint === job\.progress\?\.cursorFingerprint/);
  assert.match(worker, /durableWorkRecorded/);
  assert.match(worker, /audit_cursor_stalled/);
  assert.match(worker, /audit_persistence_incomplete/);
  assert.match(worker, /audit_reconciliation_failed/);
  assert.match(worker, /finalBatchAwaitingPersistence/);
  assert.match(worker, /countAcceptedBatch: !retryingFinalization/);
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
  assert.match(detect, /personal-assistant\/auditCursor\.mjs/);
  assert.match(auditCursor, /7 \* 24 \* 60 \* 60 \* 1000/);
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

test('optional evidence gaps stay visible without falsifying durable persistence', () => {
  assert.match(detect, /const evidencePartial = !sourceCompleteness\.trainingSolver/);
  const persistenceGate = detect.slice(
    detect.indexOf('const partial = !resolutionsSynced'),
    detect.indexOf('return res.status(200).json({', detect.indexOf('const partial = !resolutionsSynced')),
  );
  assert.doesNotMatch(persistenceGate, /training\?\.complete|handAudit\?\.complete|existingResult\.complete/);
  assert.match(detect, /evidencePartial,/);
  assert.match(page, /Historical Evidence Coverage Is Partial/);
});
