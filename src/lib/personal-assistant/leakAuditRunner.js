const DEFAULT_MAX_BATCHES = 12;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

function abortError() {
  const error = new Error('Leak audit cancelled');
  error.name = 'AbortError';
  return error;
}

function assertActive(signal) {
  if (signal?.aborted) throw abortError();
}

function wait(ms, signal) {
  assertActive(signal);
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => signal?.removeEventListener?.('abort', onAbort);
    const finish = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    timer = setTimeout(finish, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function addMetric(total, value) {
  return total + (Number.isFinite(Number(value)) ? Number(value) : 0);
}

/**
 * Runs every signed Leak Finder continuation page from one user action.
 * `requestBatch` owns authentication/fetch and returns
 * `{ ok, status, data, retryAfter }` so this remains deterministic in tests.
 */
export async function runLeakAuditBatches(requestBatch, {
  initialCursor = null,
  maxBatches = DEFAULT_MAX_BATCHES,
  onProgress = () => {},
  signal = null,
  waitFor = wait,
} = {}) {
  let cursor = initialCursor;
  let batchesCompleted = 0;
  let handsScanned = 0;
  let handsAudited = 0;
  let decisionsAnalyzed = 0;
  let rateLimitRetries = 0;
  let transientRetries = 0;

  while (batchesCompleted < maxBatches) {
    assertActive(signal);
    const result = await requestBatch(cursor, signal);
    const data = result?.data || {};

    if (result?.status === 429 && rateLimitRetries < 1) {
      rateLimitRetries += 1;
      const retrySeconds = Math.max(1, Number(result.retryAfter || data.retryAfter || 1));
      await waitFor(Math.min(MAX_RATE_LIMIT_WAIT_MS, retrySeconds * 1000), signal);
      continue;
    }
    rateLimitRetries = 0;

    if ([502, 503, 504].includes(result?.status)
      && data.retryable === true
      && transientRetries < 1) {
      transientRetries += 1;
      const retrySeconds = Math.max(1, Number(result.retryAfter || data.retryAfter || 1));
      await waitFor(Math.min(MAX_RATE_LIMIT_WAIT_MS, retrySeconds * 1000), signal);
      continue;
    }
    transientRetries = 0;

    if (!result?.ok || data.success === false) {
      return {
        success: false,
        status: result?.status || 500,
        code: data.code,
        error: data.error || `Detection failed (${result?.status || 500})`,
        auditCursor: cursor,
        clubArenaSync: cursor ? { auditCursor: cursor } : data.clubArenaSync,
        auditProgress: {
          batchesCompleted,
          handsScanned,
          handsAudited,
          decisionsAnalyzed,
          complete: false,
        },
      };
    }

    batchesCompleted += 1;
    const sync = data.clubArenaSync || {};
    handsScanned = addMetric(handsScanned, sync.handsFound);
    handsAudited = addMetric(handsAudited, sync.handsAudited);
    decisionsAnalyzed = addMetric(decisionsAnalyzed, sync.decisionsAnalyzed);
    cursor = sync.auditCursor || null;

    const auditProgress = {
      batchesCompleted,
      handsScanned,
      handsAudited,
      decisionsAnalyzed,
      complete: !cursor,
    };
    onProgress({ ...auditProgress, latest: data });

    if (!cursor) return { ...data, auditProgress };
  }

  return {
    success: false,
    code: 'audit_batch_limit',
    error: 'The audit reached its safe batch limit. Continue the audit to process the remaining hands.',
    auditCursor: cursor,
    auditProgress: { batchesCompleted, handsScanned, handsAudited, decisionsAnalyzed, complete: false },
  };
}
