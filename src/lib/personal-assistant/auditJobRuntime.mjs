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

export function mergeAuditJobProgress(previous, detection, batchDurationMs = 0, options = {}) {
  const prior = previous && typeof previous === 'object' ? previous : {};
  const sync = detection?.clubArenaSync || {};
  const next = { ...prior };
  const acceptedBatch = detection?.success === true && options.countAcceptedBatch !== false;
  for (const [target, source] of Object.entries(METRIC_MAP)) {
    next[target] = number(prior[target]) + (acceptedBatch ? number(sync[source]) : 0);
  }
  const completedBatch = acceptedBatch && detection?.clubArenaSync && typeof detection.clubArenaSync === 'object';
  next.batchesCompleted = number(prior.batchesCompleted) + (completedBatch ? 1 : 0);
  next.workerAttempts = number(prior.workerAttempts) + 1;
  next.lastBatchMs = Math.max(0, Math.round(number(batchDurationMs)));
  next.totalProcessingMs = number(prior.totalProcessingMs) + next.lastBatchMs;
  next.lastUpdatedAt = new Date().toISOString();
  next.complete = !sync.auditCursor && detection?.auditInProgress !== true && detection?.success === true;
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

export async function kickAuditWorker(job, { origin = getAuditWorkerOrigin(), fetchImpl = fetch } = {}) {
  const token = sealAuditJobToken({ jobId: job?.id, userId: job?.user_id, purpose: 'kick' });
  if (!token) return { ok: false, status: 503, error: 'Audit worker signing is unavailable.' };
  try {
    const response = await fetchImpl(`${origin}/api/assistant/leaks/audit-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pa-audit-worker': token },
      body: JSON.stringify({ jobId: job.id }),
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
