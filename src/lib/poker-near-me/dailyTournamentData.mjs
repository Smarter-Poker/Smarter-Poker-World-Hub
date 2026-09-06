export const DAILY_TOURNAMENT_PAGE_SIZE = 1000;
export const DAILY_TOURNAMENT_MAX_ROWS = 50000;

/**
 * Exhaust a deterministic Supabase query in bounded 1,000-row pages.
 *
 * buildQuery must return a fresh builder with a stable, unique final ordering
 * on every call. Returning partial rows with an error would reintroduce the
 * national sampling bias this helper exists to remove, so callers must treat
 * any error or `truncated` result as degraded/incomplete.
 */
export async function fetchAllDailyTournamentRows(
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
 * healthy. `valid_empty` is the sole zero-output success state.
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

  if (heartbeatStaleMinutes > deadMinutes) {
    return { status: 'dead', reason: `Last persisted metric is ${heartbeatStaleMinutes} minutes old.` };
  }
  if (heartbeatStaleMinutes > healthyMinutes) {
    return { status: 'warning', reason: `Last persisted metric is ${heartbeatStaleMinutes} minutes old.` };
  }

  const runStatus = heartbeat.run_status || 'legacy';
  const saved = Number(heartbeat.records_saved || 0);
  if (runStatus === 'failed') {
    return { status: 'dead', reason: heartbeat.status_reason || 'Latest run failed.' };
  }
  if (runStatus === 'partial' || Number(heartbeat.errors || 0) > 0) {
    return { status: 'warning', reason: heartbeat.status_reason || 'Latest run persisted only partial output.' };
  }
  if (saved <= 0 && runStatus !== 'valid_empty') {
    return { status: 'warning', reason: 'Latest run persisted zero rows without an explicit valid-empty result.' };
  }

  if (runStatus !== 'valid_empty' && dataStaleMinutes != null) {
    if (dataStaleMinutes > dataDeadMinutes) {
      return { status: 'dead', reason: `Latest persisted source row is ${dataStaleMinutes} minutes old.` };
    }
    if (dataStaleMinutes > dataHealthyMinutes) {
      return { status: 'warning', reason: `Latest persisted source row is ${dataStaleMinutes} minutes old.` };
    }
  }

  return {
    status: 'healthy',
    reason: runStatus === 'valid_empty' ? (heartbeat.status_reason || 'Source explicitly confirmed no write was required.') : null,
  };
}

