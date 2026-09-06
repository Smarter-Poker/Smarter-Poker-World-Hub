const KNOWN_RUN_STATUSES = new Set([
  'success',
  'valid_empty',
  'progress',
  'maintenance',
  'partial',
  'failed',
  'legacy',
]);

const HEALTHY_RUN_STATUSES = new Set([
  'success',
  'valid_empty',
  'progress',
  'maintenance',
]);

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function timestamp(row) {
  const value = Date.parse(String(row?.cycle_start || ''));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reconcile a metric's claimed status with its persisted output. The database
 * constraint protects new writes, but this keeps legacy or pre-migration rows
 * from rendering a green SUCCESS badge when their counts contradict it.
 */
export function classifyScraperMetricOutcome(row) {
  const runStatus = normalizeScraperRunStatus(row?.run_status);
  const attemptedPresent = row?.records_attempted != null;
  const rejectedPresent = row?.records_rejected != null;
  const attempted = Number(row?.records_attempted);
  const saved = Number(row?.records_saved);
  const rejected = Number(row?.records_rejected);
  const errors = Number(row?.errors);
  const validCounts = [saved, errors].every((value) => Number.isFinite(value) && value >= 0)
    && (!attemptedPresent || (Number.isFinite(attempted) && attempted >= 0))
    && (!rejectedPresent || (Number.isFinite(rejected) && rejected >= 0));
  const invalid = (reason) => ({
    status: runStatus === 'failed' ? 'failed' : 'partial',
    consistent: false,
    reason,
  });

  if (runStatus === 'legacy') {
    return { status: 'legacy', consistent: validCounts, reason: validCounts ? null : 'Invalid legacy metric counts.' };
  }
  if (!validCounts) return invalid('Metric contains an invalid record or error count.');
  if (!attemptedPresent || !rejectedPresent) {
    return invalid('Metric is missing attempted or rejected record counts.');
  }
  if (attempted !== saved + rejected) {
    return invalid('Attempted records do not equal saved plus rejected records.');
  }
  if (runStatus === 'success' && (saved <= 0 || saved !== attempted || rejected !== 0 || errors !== 0)) {
    return invalid('Success did not persist every attempted record without errors.');
  }
  if (['valid_empty', 'progress', 'maintenance'].includes(runStatus)
    && (attempted !== 0 || saved !== 0 || rejected !== 0 || errors !== 0)) {
    return invalid(`${runStatus} must be a zero-write, zero-error checkpoint.`);
  }
  if (runStatus === 'partial' && (saved <= 0 || (rejected <= 0 && errors <= 0))) {
    return invalid('Partial output must save records and report a rejection or error.');
  }
  if (runStatus === 'failed' && (saved !== 0 || errors <= 0)) {
    return invalid('Failed output must save no records and report at least one error.');
  }
  return { status: runStatus, consistent: true, reason: null };
}

export function normalizeScraperRunStatus(value) {
  const status = String(value || 'legacy').trim().toLowerCase();
  return KNOWN_RUN_STATUSES.has(status) ? status : 'legacy';
}

function chronologically(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row: row || {}, index }))
    .sort((a, b) => timestamp(a.row) - timestamp(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

export function scraperMetricHistory(rows) {
  return chronologically(rows).map((row) => {
    const outcome = classifyScraperMetricOutcome(row);
    return {
      time: row.cycle_start || null,
      duration: nonNegativeNumber(row.duration_seconds),
      records: nonNegativeNumber(row.records_saved),
      venues: nonNegativeNumber(row.venues_scraped),
      errors: nonNegativeNumber(row.errors),
      run_status: normalizeScraperRunStatus(row.run_status),
      effective_status: outcome.status,
      outcome_consistent: outcome.consistent,
      records_attempted: row.records_attempted == null
        ? null
        : nonNegativeNumber(row.records_attempted),
      records_rejected: row.records_rejected == null
        ? null
        : nonNegativeNumber(row.records_rejected),
      status_reason: row.status_reason || outcome.reason || null,
    };
  });
}

export function summarizeScraperMetrics(rows) {
  const ordered = chronologically(rows);
  const statuses = ordered.map((row) => normalizeScraperRunStatus(row.run_status));
  const statusCount = (status) => statuses.filter((value) => value === status).length;
  const cycles = ordered.length;
  const lastCycle = cycles > 0 ? ordered[cycles - 1] : null;
  const lastOutcome = lastCycle ? classifyScraperMetricOutcome(lastCycle) : null;
  const currentStatus = lastCycle
    ? normalizeScraperRunStatus(lastCycle.run_status)
    : 'unknown';
  const lastByStatus = (status) => {
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (normalizeScraperRunStatus(ordered[index].run_status) === status) return ordered[index];
    }
    return null;
  };

  return {
    cycles,
    avg_duration: cycles > 0
      ? Math.round(ordered.reduce((sum, row) => sum + nonNegativeNumber(row.duration_seconds), 0) / cycles)
      : 0,
    total_errors: ordered.reduce((sum, row) => sum + nonNegativeNumber(row.errors), 0),
    avg_records: cycles > 0
      ? Math.round(ordered.reduce((sum, row) => sum + nonNegativeNumber(row.records_saved), 0) / cycles)
      : 0,
    successful_cycles: statusCount('success'),
    partial_cycles: statusCount('partial'),
    failed_cycles: statusCount('failed'),
    valid_empty_cycles: statusCount('valid_empty'),
    progress_cycles: statusCount('progress'),
    maintenance_cycles: statusCount('maintenance'),
    legacy_cycles: statusCount('legacy'),
    healthy_checkpoint_cycles: statusCount('progress') + statusCount('maintenance'),
    current_status: currentStatus,
    current_effective_status: lastOutcome?.status || 'unknown',
    current_status_reason: lastCycle?.status_reason || null,
    current_effective_reason: lastCycle?.status_reason || lastOutcome?.reason || null,
    current_status_healthy: HEALTHY_RUN_STATUSES.has(lastOutcome?.status),
    requires_attention: lastOutcome?.status === 'partial' || lastOutcome?.status === 'failed',
    inconsistent_cycles: ordered.filter((row) => !classifyScraperMetricOutcome(row).consistent).length,
    last_cycle: lastCycle,
    latest_progress: lastByStatus('progress'),
    latest_maintenance: lastByStatus('maintenance'),
  };
}

export function buildScraperMetricBucket(rows) {
  return {
    summary: summarizeScraperMetrics(rows),
    history: scraperMetricHistory(rows),
  };
}
