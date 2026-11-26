import { randomUUID } from 'node:crypto';
import { getAuditWorkerOrigin, sealAuditJobToken } from './auditJobToken.mjs';

const METRIC_MAP = {
  handsScanned: 'handsFound',
  handsEligible: 'handsEligible',
  privateCardsRecovered: 'privateCardsRecovered',
  handsMissingPrivateCards: 'handsMissingPrivateCards',
  handsRejectedBeforeAudit: 'handsRejectedBeforeAudit',
  handsSkippedNoHeroDecisions: 'handsSkippedNoHeroDecisions',
  handsAudited: 'handsAudited',
  handsAlreadyCurrent: 'handsAlreadyCurrent',
  handsQueuedForRetry: 'handsQueuedForRetry',
  decisionsAnalyzed: 'decisionsAnalyzed',
  solverVerified: 'solverVerified',
  unpriced: 'unpriced',
  obsoleteDecisionsRemoved: 'obsoleteDecisionsRemoved',
};

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

// Job results contain detector rows assembled under service-role access. Keep
// ownership and continuation metadata server-side even when a nested detector
// payload accidentally includes it; the authenticated client needs evidence,
// not database ownership or worker-control fields.
const PRIVATE_JOB_KEYS = new Set([
  'user_id', 'audit_cursor', 'worker_token', 'lease_expires_at',
  'userId', 'auditCursor', 'workerToken', 'leaseExpiresAt', 'cursorFingerprint',
]);

function publicAuditValue(value) {
  if (Array.isArray(value)) return value.map(publicAuditValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_JOB_KEYS.has(key))
    .map(([key, child]) => [key, publicAuditValue(child)]));
}

const PAGE_LEVEL_METRICS = new Set([
  'handsScanned',
  'handsEligible',
  'privateCardsRecovered',
  'handsMissingPrivateCards',
  'handsRejectedBeforeAudit',
  'handsSkippedNoHeroDecisions',
  'handsAlreadyCurrent',
]);

export function mergeAuditJobProgress(previous, detection, batchDurationMs = 0, options = {}) {
  const prior = previous && typeof previous === 'object' ? previous : {};
  const sync = detection?.clubArenaSync || {};
  const next = { ...prior };
  const acceptedBatch = detection?.success === true && options.countAcceptedBatch !== false;
  const pageRetrying = sync.pageRetrying === true
    || (sync.pageRetrying === undefined && sync.truncated === true && sync.hasMorePages !== true);
  for (const [target, source] of Object.entries(METRIC_MAP)) {
    if (target === 'handsScanned' && acceptedBatch && Number.isFinite(Number(sync.cumulativeHandsFound))) {
      next.handsScanned = Math.max(number(prior.handsScanned), number(sync.cumulativeHandsFound));
      continue;
    }
    if (pageRetrying && PAGE_LEVEL_METRICS.has(target)) {
      next[target] = number(prior[target]);
      continue;
    }
    next[target] = number(prior[target]) + (acceptedBatch ? number(sync[source]) : 0);
  }
  const completedBatch = acceptedBatch && detection?.clubArenaSync && typeof detection.clubArenaSync === 'object';
  next.batchesCompleted = number(prior.batchesCompleted) + (completedBatch ? 1 : 0);
  next.workerAttempts = number(prior.workerAttempts) + 1;
  next.lastBatchMs = Math.max(0, Math.round(number(batchDurationMs)));
  next.totalProcessingMs = number(prior.totalProcessingMs) + next.lastBatchMs;
  next.lastUpdatedAt = new Date().toISOString();
  next.complete = !sync.auditCursor && detection?.auditInProgress !== true && detection?.success === true;
  if (sync.incrementalStop === true) next.incrementalStop = true;
  if (typeof sync.incrementalSource === 'string' && sync.incrementalSource) {
    next.incrementalSource = sync.incrementalSource;
  }
  if (typeof sync.incrementalSince === 'string' && sync.incrementalSince) {
    next.incrementalSince = sync.incrementalSince;
  }
  // Every accepted or failed batch stamps a durable heartbeat so the status
  // poll and the lease renewal in checkpoint_pa_leak_audit_job can tell a
  // slow solver page from an abandoned worker.
  next.lastHeartbeatAt = next.lastUpdatedAt;
  next.heartbeatCount = number(prior.heartbeatCount) + 1;
  if (detection?.caHandFactsSummary && typeof detection.caHandFactsSummary === 'object') {
    next.caHandFactsSummary = detection.caHandFactsSummary;
  }
  next.coverage = {
    scanned: next.handsScanned,
    eligible: next.handsEligible,
    privateCardsAvailable: Math.max(0, next.handsScanned - next.handsMissingPrivateCards),
    heroDecisions: next.decisionsAnalyzed,
    exactSolverMatches: next.solverVerified,
    unpriced: next.unpriced,
    leaks: number(detection?.leaksDetected),
  };
  return next;
}

/**
 * True when the caller explicitly demands a complete re-scan. `forceFullRescan`
 * is the documented override; `fullRescan` is the durable job flag already used
 * by audit-jobs.js. Either one disables every incremental boundary.
 */
export function isFullRescanRequested(body) {
  const source = body && typeof body === 'object' ? body : {};
  return Boolean(source.fullRescan) || source.forceFullRescan === true;
}

// Sorts after every real hand id at one timestamp in the engine's descending
// (created_at, id) ordering, so every hand at or before the boundary instant is
// treated as already audited.
const BOUNDARY_ID_CEILING = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

/**
 * Derive an incremental scan boundary from the user's latest COMPLETED audit
 * job. Used only when the per-user hand watermark is unavailable. Fail closed:
 * any doubt (incomplete job, queued retries, unknown/different matcher
 * version, no usable timestamp) returns null so the audit scans everything.
 * The job START time is used rather than completed_at, because a hand created
 * while that job was running may not have been in its signed snapshot.
 */
export function incrementalBoundaryFromCompletedJob(job, matcherVersion) {
  if (!job || typeof job !== 'object' || job.status !== 'completed' || !matcherVersion) return null;
  const progress = job.progress && typeof job.progress === 'object' ? job.progress : {};
  if (progress.complete !== true) return null;
  if (number(progress.handsQueuedForRetry) > 0) return null;
  const jobMatcher = job.result?.clubArenaSync?.latestHandWatermark?.matcherVersion
    ?? job.result?.latestHandWatermark?.matcherVersion
    ?? null;
  if (jobMatcher !== matcherVersion) return null;
  const startedMs = [job.started_at, job.created_at]
    .map(value => (value ? new Date(value).getTime() : NaN))
    .find(value => Number.isFinite(value));
  const completedMs = job.completed_at ? new Date(job.completed_at).getTime() : NaN;
  if (!Number.isFinite(startedMs)) return null;
  if (Number.isFinite(completedMs) && completedMs < startedMs) return null;
  return {
    createdAt: new Date(startedMs).toISOString(),
    id: BOUNDARY_ID_CEILING,
    matcherVersion,
    source: 'completed_job',
  };
}

export function publicAuditJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    progress: publicAuditValue(row.progress || {}),
    result: publicAuditValue(row.result || null),
    reconciliation: publicAuditValue(row.reconciliation || null),
    engineVersion: row.engine_version,
    attemptCount: number(row.attempt_count),
    resumable: Boolean(row.audit_cursor) && ['queued', 'running', 'failed'].includes(row.status),
    error: row.error_message ? { code: row.error_code || 'audit_failed', message: row.error_message } : null,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

export async function kickAuditWorker(job, { origin = getAuditWorkerOrigin(), fetchImpl = fetch, fullRescan = false } = {}) {
  const token = sealAuditJobToken({ jobId: job?.id, userId: job?.user_id, purpose: 'kick' });
  if (!token) return { ok: false, status: 503, error: 'Audit worker signing is unavailable.' };
  try {
    const response = await fetchImpl(`${origin}/api/assistant/leaks/audit-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pa-audit-worker': token },
      body: JSON.stringify({ jobId: job.id, ...(fullRescan ? { fullRescan: true } : {}) }),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 503, error: error?.message || 'Audit worker could not be reached.' };
  }
}

export function newWorkerToken() {
  return randomUUID();
}

export async function reconcileAuditEvidence(db, userId, progress) {
  const [all, verified, unpriced, stats] = await Promise.all([
    db.from('hand_audit_decisions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('hand_audit_decisions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('solver_verified', true),
    db.from('hand_audit_decisions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('solver_verified', false),
    db.from('user_assistant_stats').select('total_hands_analyzed').eq('user_id', userId).maybeSingle(),
  ]);
  const queryFailed = [all, verified, unpriced, stats].some(item => item?.error);
  const snapshotHands = number(progress?.handsScanned);
  const statsHands = number(stats?.data?.total_hands_analyzed);
  return {
    checkedAt: new Date().toISOString(),
    snapshotHands,
    persistedDecisions: number(all?.count),
    verifiedDecisions: number(verified?.count),
    unpricedDecisions: number(unpriced?.count),
    assistantStatsHands: statsHands,
    cursorComplete: progress?.complete === true,
    consistent: !queryFailed && progress?.complete === true && statsHands >= snapshotHands,
    queryFailed,
  };
}
