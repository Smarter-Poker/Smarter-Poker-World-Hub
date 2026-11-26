import { after } from 'next/server';
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { checkSandboxAccess, isFeatureAccessible } from '../../../../../src/lib/personal-assistant/contextAuthority';
import { openAuditJobToken, sealAuditJobToken } from '../../../../../src/lib/personal-assistant/auditJobToken.mjs';
import {
  isFullRescanRequested,
  mergeAuditJobProgress,
  newWorkerToken,
  reconcileAuditEvidence,
} from '../../../../../src/lib/personal-assistant/auditJobRuntime.mjs';
import { notify } from '../../../../../src/lib/notify';

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization',
};

function jsonResponse(payload, status) {
  return Response.json(payload, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_TRANSIENT_FAILURES = 3;
const MAX_BATCHES_PER_INVOCATION = 50;
const WORKER_BUDGET_MS = 260_000;
let client;

function db() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required');
    }
    client = createClient(url, key);
  }
  return client;
}

const first = data => Array.isArray(data) ? data[0] : data;

async function checkpoint(jobId, workerToken, values) {
  const { data, error } = await db().rpc('checkpoint_pa_leak_audit_job', {
    p_job_id: jobId,
    p_worker_token: workerToken,
    p_status: values.status,
    p_stage: values.stage,
    p_audit_cursor: values.auditCursor || null,
    p_progress: values.progress || {},
    p_result: values.result || null,
    p_reconciliation: values.reconciliation || null,
    p_error_code: values.errorCode || null,
    p_error_message: values.errorMessage || null,
  });
  if (error) throw error;
  return first(data);
}

const AUDIT_COMPLETE_TYPE = 'personal_assistant_audit_complete';

// Completion goes through the master notification gateway (in-app bell + web
// push, honouring the user's push preferences). Idempotent per audit job: a
// retried worker never re-rings the bell or re-pushes, and the partial unique
// index notifications_pa_leak_audit_job_unique backstops the bell row.
// Never throws: a notification failure must not fail a finished audit.
async function notifyCompletion(job, result) {
  try {
    const count = Number(result?.leaksDetected) || 0;
    let alreadyNotified = false;
    let lookupFailed = false;
    try {
      const { data: existing, error: lookupError } = await db().from('notifications')
        .select('id')
        .eq('user_id', job.user_id)
        .eq('type', AUDIT_COMPLETE_TYPE)
        .eq('data->>paAuditJobId', String(job.id))
        .limit(1);
      if (lookupError) lookupFailed = true;
      else alreadyNotified = Array.isArray(existing) && existing.length > 0;
    } catch (lookupThrow) {
      lookupFailed = true;
      console.warn('[PA Audit Worker] Completion notification lookup failed:', lookupThrow?.message || lookupThrow);
    }
    if (alreadyNotified) return { skipped: 'duplicate' };
    return await notify(db(), {
      userId: job.user_id,
      type: AUDIT_COMPLETE_TYPE,
      title: 'Leak Finder Audit Complete',
      body: `${count} Leak${count === 1 ? '' : 's'} Found. Your Deterministic Audit Receipt Is Ready.`,
      url: '/hub/personal-assistant/leaks',
      data: { paAuditJobId: job.id, leaksDetected: count, route: '/hub/personal-assistant/leaks' },
      tag: `pa-audit-${job.id}`,
      // When the duplicate check could not run, ring the bell (the unique index
      // dedupes it) but do not risk a second push.
      withPush: !lookupFailed,
    });
  } catch (error) {
    console.warn('[PA Audit Worker] Completion notification failed:', error?.message || error);
    return null;
  }
}

async function processClaimedJob(job, workerToken, origin, { fullRescan = false } = {}) {
  const startedAt = Date.now();
  const effectiveFullRescan = Boolean(fullRescan || job?.progress?.fullRescan);
  // Enforce anti-RTA live-play/cooldown boundary inside the worker as well.
  const access = await checkSandboxAccess(db(), job.user_id);
  if (!access?.allowed || !isFeatureAccessible(access.accessLevel, 'leak_finder_detect')) {
    await checkpoint(job.id, workerToken, {
      status: 'queued',
      stage: 'queued',
      auditCursor: job.audit_cursor || null,
      progress: { ...(job.progress || {}), ...(effectiveFullRescan ? { fullRescan: true } : {}), pausedForLivePlay: true },
    });
    return null;
  }

  // Heartbeat before the slow detector/solver page so the running lease is
  // renewed (checkpoint_pa_leak_audit_job extends it for status 'running') and
  // a status poll never mistakes a long batch for an abandoned worker. A null
  // answer means another worker owns the lease: stop without writing.
  const heartbeatAt = new Date().toISOString();
  const heartbeat = await checkpoint(job.id, workerToken, {
    status: 'running',
    stage: job.stage || 'importing_hands',
    auditCursor: job.audit_cursor || null,
    progress: {
      ...(job.progress || {}),
      ...(effectiveFullRescan ? { fullRescan: true } : {}),
      lastHeartbeatAt: heartbeatAt,
      // The live-play pause (if any) ended: this worker is now processing.
      pausedForLivePlay: undefined,
    },
  });
  if (!heartbeat) return null;
  job = { ...job, progress: heartbeat.progress || job.progress, audit_cursor: heartbeat.audit_cursor ?? job.audit_cursor };

  let response;
  let body = {};
  try {
    const detectToken = sealAuditJobToken({ jobId: job.id, userId: job.user_id, purpose: 'detect', ttlMs: 2 * 60_000 });
    response = await fetch(`${origin}/api/assistant/leaks/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pa-audit-worker': detectToken },
      body: JSON.stringify({
        jobId: job.id,
        auditCursor: job.audit_cursor || null,
        ...(effectiveFullRescan ? { fullRescan: true } : {}),
      }),
    });
    body = await response.json().catch(() => ({}));
  } catch (error) {
    body = { success: false, retryable: true, code: 'worker_transport_failed', error: error?.message || 'Detection worker transport failed.' };
    response = { ok: false, status: 503 };
  }

  const batchMs = Date.now() - startedAt;
  // A final detector page can finish analysis before persistence or
  // reconciliation fails. Its metrics are already present in the durable
  // checkpoint, so a resume must retry finalization without counting that
  // same page a second time.
  const retryingFinalization = job.progress?.finalBatchAwaitingPersistence === true;
  let progress = mergeAuditJobProgress(job.progress, body, batchMs, {
    countAcceptedBatch: !retryingFinalization,
  });
  const transient = (response.status === 508)
    || ([429, 502, 503, 504].includes(response.status) && body?.retryable === true);
  if (!response.ok || body?.success === false) {
    if (response.status === 403 && (body?.code === 'paused_for_live_play' || body?.blocked === true)) {
      await checkpoint(job.id, workerToken, {
        status: 'queued',
        stage: 'queued',
        auditCursor: job.audit_cursor || null,
        progress: { ...(job.progress || {}), ...(effectiveFullRescan ? { fullRescan: true } : {}), pausedForLivePlay: true },
      });
      return null;
    }
    const failures = Number(job.progress?.consecutiveFailures || 0) + 1;
    progress = { ...progress, consecutiveFailures: failures, complete: false };
    const retry = transient && failures < MAX_TRANSIENT_FAILURES;
    // A cursor signed by a rotated secret can never become valid by retrying.
    // Clear that checkpoint so the next user start creates a fresh audit rather
    // than resurrecting the same permanently invalid cursor forever.
    const invalidCursor = body?.code === 'invalid_audit_cursor';
    await checkpoint(job.id, workerToken, {
      status: retry ? 'queued' : 'failed',
      stage: retry ? 'retrying' : 'failed',
      auditCursor: invalidCursor ? null : (body?.clubArenaSync?.auditCursor || job.audit_cursor),
      progress,
      errorCode: body?.code || `http_${response.status || 500}`,
      errorMessage: body?.error || 'The deterministic audit could not continue.',
    });
    // A browser status poll or a later device reclaims retryable checkpoints.
    // Do not recursively invoke the worker: Vercel rejects a serverless
    // request chain after several hops with HTTP 508.
    return null;
  }

  progress = { ...progress, consecutiveFailures: 0 };
  const nextCursor = body?.clubArenaSync?.auditCursor || null;
  const nextCursorFingerprint = body?.clubArenaSync?.cursorFingerprint || null;
  if (body?.auditInProgress === true && nextCursor) {
    // Every invocation is already bounded to one database/solver page, so the
    // job can safely cover accounts of any size. Stop only if the continuation
    // fails to advance; a fixed total-page ceiling strands large accounts.
    const cursorDidNotAdvance = nextCursorFingerprint
      ? nextCursorFingerprint === job.progress?.cursorFingerprint
      : nextCursor === job.audit_cursor;
    const durableWorkRecorded = Number(body?.clubArenaSync?.handsAudited) > 0
      || Number(body?.clubArenaSync?.decisionsAnalyzed) > 0
      || Number(body?.clubArenaSync?.obsoleteDecisionsRemoved) > 0;
    if (cursorDidNotAdvance && !durableWorkRecorded) {
      await checkpoint(job.id, workerToken, {
        status: 'failed', stage: 'failed', auditCursor: null, progress,
        errorCode: 'audit_cursor_stalled',
        errorMessage: 'The audit continuation did not advance. Restarting will begin a fresh audit.',
      });
      return;
    }
    const saved = await checkpoint(job.id, workerToken, {
      status: 'running', stage: 'importing_hands', auditCursor: nextCursor,
      progress: { ...progress, cursorFingerprint: nextCursorFingerprint || undefined },
    });
    return saved ? { continueJob: saved } : null;
  }

  const sync = body?.sync;
  const persistenceComplete = body?.persisted === true
    && body?.partial !== true
    && (!sync || (sync.handExamples?.persisted !== false
      && sync.suggestionsPersisted !== false
      && sync.resolutionsPersisted !== false
      && sync.statsPersisted !== false));
  if (!persistenceComplete) {
    await checkpoint(job.id, workerToken, {
      status: 'failed', stage: 'failed', auditCursor: job.audit_cursor,
      progress: { ...progress, complete: false, finalBatchAwaitingPersistence: true },
      errorCode: 'audit_persistence_incomplete',
      errorMessage: 'The audit evidence was analyzed, but every result could not be durably reconciled. Restarting will retry the saved checkpoint.',
    });
    return;
  }

  progress = {
    ...progress,
    complete: true,
    cursorFingerprint: null,
    finalBatchAwaitingPersistence: undefined,
  };
  const reconciliation = await reconcileAuditEvidence(db(), job.user_id, progress);
  const result = {
    ...body,
    auditJobId: job.id,
    auditProgress: progress,
    evidenceCoverage: {
      ...(body.evidenceCoverage || {}),
      auditedThisRun: progress.decisionsAnalyzed,
      verifiedThisRun: progress.solverVerified,
      unpricedThisRun: progress.unpriced,
    },
    reconciliation,
  };
  if (reconciliation?.consistent !== true) {
    await checkpoint(job.id, workerToken, {
      status: 'failed', stage: 'failed', auditCursor: job.audit_cursor,
      progress: { ...progress, complete: false, finalBatchAwaitingPersistence: true }, reconciliation,
      errorCode: 'audit_reconciliation_failed',
      errorMessage: 'The deterministic audit finished, but its stored evidence did not reconcile. Restarting will verify the saved checkpoint again.',
    });
    return;
  }
  const saved = await checkpoint(job.id, workerToken, {
    status: 'completed', stage: 'completed', auditCursor: null, progress, result, reconciliation,
  });
  if (saved) await notifyCompletion(saved, result);
  return null;
}

async function handlePost(request) {
  const token = openAuditJobToken(request.headers.get('x-pa-audit-worker'), 'kick');
  if (!token) return jsonResponse({ success: false, error: 'Invalid worker token' }, 401);
  const requestBody = await request.json().catch(() => ({}));
  const fullRescan = isFullRescanRequested(requestBody);
  const workerToken = newWorkerToken();
  const { data, error } = await db().rpc('claim_pa_leak_audit_job', {
    p_job_id: token.jobId,
    p_worker_token: workerToken,
    // Match the route's maximum runtime. A shorter lease lets a status poll
    // reclaim a legitimately slow solver batch while its first worker is still
    // writing, creating duplicate analysis and stale-token checkpoint races.
    p_lease_seconds: 300,
  });
  const job = first(data);
  if (error) return jsonResponse({ success: false, retryable: true, error: 'Audit claim failed' }, 503);
  if (!job || job.user_id !== token.userId) {
    return jsonResponse({ success: true, accepted: false, reason: 'already_claimed_or_finished' }, 202);
  }
  const origin = new URL(request.url).origin;
  after(async () => {
    let activeJob = job;
    let batchesProcessed = 0;
    const deadline = Date.now() + WORKER_BUDGET_MS;
    try {
      // Continue bounded detector pages inside one serverless invocation. The
      // former worker -> detector -> worker HTTP chain hit Vercel's recursive
      // invocation guard after four pages and failed valid audits with 508.
      while (activeJob && batchesProcessed < MAX_BATCHES_PER_INVOCATION && Date.now() < deadline) {
        const outcome = await processClaimedJob(activeJob, workerToken, origin, {
          fullRescan: Boolean(fullRescan || activeJob?.progress?.fullRescan),
        });
        activeJob = outcome?.continueJob || null;
        batchesProcessed += 1;
      }
      if (activeJob) {
        await checkpoint(activeJob.id, workerToken, {
          status: 'queued', stage: 'importing_hands', auditCursor: activeJob.audit_cursor,
          progress: activeJob.progress || {},
        });
      }
    } catch (error) {
      console.warn('[PA Audit Worker] Unhandled job failure:', error?.message || error);
      try {
        await checkpoint(activeJob?.id || job.id, workerToken, {
          status: 'failed', stage: 'failed', auditCursor: activeJob?.audit_cursor || job.audit_cursor,
          progress: { ...(activeJob?.progress || job.progress || {}), complete: false },
          errorCode: 'worker_unhandled_error',
          errorMessage: 'The worker stopped unexpectedly. Restarting will resume from the saved checkpoint.',
        });
      } catch (checkpointError) {
        console.warn('[PA Audit Worker] Failure checkpoint failed:', checkpointError?.message || checkpointError);
      }
    }
  });
  return jsonResponse({ success: true, accepted: true, jobId: job.id }, 202);
}

export async function POST(request) {
  try {
    return await handlePost(request);
  } catch (error) {
    console.warn('[PA Audit Worker] Request failed:', error?.message || error);
    return jsonResponse({
      success: false,
      retryable: true,
      error: 'The Audit Worker Could Not Accept This Checkpoint.',
    }, 503);
  }
}
