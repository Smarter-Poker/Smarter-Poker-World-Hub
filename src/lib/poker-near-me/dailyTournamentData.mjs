import { classifyScraperMetricOutcome } from './scraperMetrics.js';

export const DAILY_TOURNAMENT_PAGE_SIZE = 1000;
export const DAILY_TOURNAMENT_MAX_ROWS = 50000;

export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidIsoMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return false;
  return isValidIsoDate(`${value}-01`);
}

/**
 * Exhaust a deterministic Supabase query in bounded 1,000-row pages.
 *
 * buildQuery must return a fresh builder with a stable, unique final ordering
 * on every call. Returning partial rows with an error would reintroduce the
 * national sampling bias this helper exists to remove, so callers must treat
 * any error or `truncated` result as degraded/incomplete.
 */
export async function fetchAllRows(
  buildQuery,
  { pageSize = DAILY_TOURNAMENT_PAGE_SIZE, maxRows = DAILY_TOURNAMENT_MAX_ROWS } = {},
) {
  if (typeof buildQuery !== 'function') throw new TypeError('buildQuery must be a function');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError('pageSize must be an integer between 1 and 1000');
  }
  if (!Number.isInteger(maxRows) || maxRows < pageSize) {
    throw new RangeError('maxRows must be an integer at least as large as pageSize');
  }

  const rows = [];
  let pagesFetched = 0;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const upper = Math.min(offset + pageSize, maxRows) - 1;
    const { data, error } = await buildQuery().range(offset, upper);
    pagesFetched += 1;
    if (error) return { rows: [], error, truncated: false, pagesFetched };

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < upper - offset + 1) {
      return { rows, error: null, truncated: false, pagesFetched };
    }
  }

  return { rows, error: null, truncated: true, pagesFetched };
}

// Kept as a named compatibility wrapper for the daily-tournaments endpoint and
// its contract tests. The calendar also uses the generic helper for venues,
// series, tours, and public Home Games so none of its sources silently sample.
export function fetchAllDailyTournamentRows(buildQuery, options) {
  return fetchAllRows(buildQuery, options);
}

export function normalizeTournamentGame(value) {
  const game = String(value || 'nlh').toLowerCase().trim();
  if (/\b(nlh|no\s*limit|hold[ '\u2019]?em)\b/.test(game)) return 'nlh';
  if (/\b(plo|omaha)\b/.test(game)) return 'omaha';
  if (/\b(mixed|horse)\b/.test(game)) return 'mixed';
  return game.replace(/\s+/g, ' ');
}

/** A recurring row and a one-off row on another day are not duplicates. */
export function dailyTournamentDedupKey(tournament) {
  const venue = tournament?.venue_id != null
    ? String(tournament.venue_id)
    : String(tournament?.venue_name || '').toLowerCase().trim();
  const dateIdentity = tournament?.event_date
    ? String(tournament.event_date).slice(0, 10)
    : String(tournament?.day_of_week || '').toLowerCase().trim();
  const name = String(tournament?.tournament_name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const start = String(tournament?.start_time || '').toLowerCase().trim();
  const buyIn = Number(tournament?.buy_in || 0);
  return [venue, dateIdentity, start, normalizeTournamentGame(tournament?.game_type || name), buyIn, name].join('|');
}

/**
 * Health is output-aware: a fresh heartbeat cannot make a failed/empty write
 * healthy. `valid_empty`, `progress`, and `maintenance` are the explicit
 * zero-output success states. Progress means a durable sweep checkpoint moved
 * forward; maintenance means a durable cleanup/coverage check completed.
 */
export function classifyScraperHealth({
  heartbeat,
  heartbeatStaleMinutes,
  dataStaleMinutes,
  healthyMinutes,
  deadMinutes,
  dataHealthyMinutes = healthyMinutes,
  dataDeadMinutes = deadMinutes,
}) {
  if (!heartbeat || heartbeatStaleMinutes == null) {
    return { status: 'unknown', reason: 'No readable persisted scraper metric.' };
  }
  if (!Number.isFinite(Number(heartbeatStaleMinutes)) || Number(heartbeatStaleMinutes) < 0) {
    return { status: 'warning', reason: 'Latest persisted scraper metric has an invalid or future timestamp.' };
  }
  if (dataStaleMinutes != null
    && (!Number.isFinite(Number(dataStaleMinutes)) || Number(dataStaleMinutes) < 0)) {
    return { status: 'warning', reason: 'Latest persisted source row has an invalid or future timestamp.' };
  }

  if (heartbeatStaleMinutes > deadMinutes) {
    return { status: 'dead', reason: `Last persisted metric is ${heartbeatStaleMinutes} minutes old.` };
  }
  if (heartbeatStaleMinutes > healthyMinutes) {
    return { status: 'warning', reason: `Last persisted metric is ${heartbeatStaleMinutes} minutes old.` };
  }

  const runStatus = heartbeat.run_status || 'legacy';
  const metricOutcome = classifyScraperMetricOutcome(heartbeat);
  const saved = Number(heartbeat.records_saved || 0);
  const attempted = Number(heartbeat.records_attempted || 0);
  const rejected = Number(heartbeat.records_rejected || 0);
  const isHealthyZeroWrite = ['valid_empty', 'progress', 'maintenance'].includes(runStatus);
  if (runStatus !== 'legacy' && (!metricOutcome.consistent || metricOutcome.status === 'legacy')) {
    return {
      status: metricOutcome.status === 'failed' ? 'dead' : 'warning',
      reason: metricOutcome.reason || 'Latest metric has an unsupported run status.',
    };
  }
  if (metricOutcome.status === 'failed') {
    return { status: 'dead', reason: heartbeat.status_reason || metricOutcome.reason || 'Latest run failed.' };
  }
  if (metricOutcome.status === 'partial' || Number(heartbeat.errors || 0) > 0) {
    return { status: 'warning', reason: heartbeat.status_reason || 'Latest run persisted only partial output.' };
  }
  if (runStatus === 'success' && (rejected > 0
    || (heartbeat.records_attempted != null && attempted !== saved))) {
    return {
      status: 'warning',
      reason: heartbeat.status_reason || 'Latest run did not confirm every attempted row.',
    };
  }
  if (isHealthyZeroWrite && (saved > 0 || attempted > 0 || rejected > 0)) {
    return {
      status: 'warning',
      reason: `Invalid ${runStatus} metric reported write activity.`,
    };
  }
  if (saved <= 0 && !isHealthyZeroWrite) {
    return { status: 'warning', reason: 'Latest run persisted zero rows without an explicit valid-empty result.' };
  }

  if (!isHealthyZeroWrite && dataStaleMinutes != null) {
    if (dataStaleMinutes > dataDeadMinutes) {
      return { status: 'dead', reason: `Latest persisted source row is ${dataStaleMinutes} minutes old.` };
    }
    if (dataStaleMinutes > dataHealthyMinutes) {
      return { status: 'warning', reason: `Latest persisted source row is ${dataStaleMinutes} minutes old.` };
    }
  }

  return {
    status: 'healthy',
    reason: isHealthyZeroWrite
      ? (heartbeat.status_reason || 'Source explicitly confirmed healthy zero-write progress.')
      : null,
  };
}
