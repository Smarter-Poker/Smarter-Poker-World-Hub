import { classifyScraperMetricOutcome } from './scraperMetrics.js';

export const DAILY_TOURNAMENT_PAGE_SIZE = 1000;
export const DAILY_TOURNAMENT_MAX_ROWS = 50000;
export const DAILY_RECURRING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DAILY_SCRAPED_TIME_FLOOR_MINUTES = 10 * 60;
export const DAILY_VERIFIED_MORNING_FLOOR_MINUTES = 8 * 60;

const SCRAPE_HASH_RE = /^[0-9a-f]{64}$/i;
const SCRAPE_BATCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POKERATLAS_SCHEDULE_PATH_RE = /^\/poker-room\/[^/]+\/tournaments\/?$/i;

const SAFE_HTML_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  '#39': "'",
  '#039': "'",
  '#x27': "'",
  quot: '"',
  nbsp: ' ',
  lt: '<',
  gt: '>',
  ndash: ' - ',
  mdash: ' - ',
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: '...',
  middot: ' - ',
  bull: ' - ',
  copy: '(c)',
  reg: '(R)',
  trade: '(TM)',
});

const SCRAPED_MARKUP_ARTIFACT_RE = /(?:<\s*\/?\s*[a-z!][^>]*>?|-->|^\s*>|(?:^|\s)(?:class|href|src|style|charset|content|data-[\w-]+)\s*=|[<>])/i;
const UNFINISHED_ENTITY_RE = /(?:&(?:#[xX]?[0-9a-fA-F]+|amp|apos|quot|nbsp|lt|gt|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip|middot|bull|copy|reg|trade)(?=$|[\s<>"'|,.\)\]])|&[a-zA-Z][a-zA-Z0-9]{2,}\s*$)/i;
const UNKNOWN_ENTITY_RE = /&(?:#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/;

function decodeNumericTextEntity(entity) {
  const raw = entity.slice(1);
  const radix = raw[0]?.toLowerCase() === 'x' ? 16 : 10;
  const digits = radix === 16 ? raw.slice(1) : raw;
  if (!digits || !/^[0-9a-f]+$/i.test(digits)) return null;

  const codePoint = Number.parseInt(digits, radix);
  const punctuation = {
    34: '"',
    38: '&',
    39: "'",
    60: '<',
    62: '>',
    160: ' ',
    8211: ' - ',
    8212: ' - ',
    8216: "'",
    8217: "'",
    8220: '"',
    8221: '"',
    8230: '...',
  };
  if (Object.prototype.hasOwnProperty.call(punctuation, codePoint)) {
    return punctuation[codePoint];
  }
  if (codePoint >= 32 && codePoint <= 126) return String.fromCodePoint(codePoint);
  return null;
}

function decodeTextEntitiesOnce(value) {
  return value.replace(
    /&(#(?:[xX][0-9a-fA-F]+|\d+)|[a-zA-Z][a-zA-Z0-9]+);/g,
    (match, entity) => {
      if (entity.startsWith('#')) return decodeNumericTextEntity(entity) ?? match;
      return SAFE_HTML_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/**
 * Decode safe text entities without ever passing scraped markup through.
 * Markup, attribute fragments, unfinished entities, and parser boundaries
 * fail closed to an empty string so callers can omit the contaminated row.
 */
export function decodeScrapedTournamentText(value) {
  if (typeof value !== 'string') return '';
  if (SCRAPED_MARKUP_ARTIFACT_RE.test(value) || UNFINISHED_ENTITY_RE.test(value)) return '';

  // Two bounded passes cover doubly escaped source text such as &amp;rsquo;
  // without allowing entity expansion to recurse indefinitely.
  const decoded = decodeTextEntitiesOnce(decodeTextEntitiesOnce(value))
    .replace(/[\u2012-\u2015]/g, ' - ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!decoded
    || SCRAPED_MARKUP_ARTIFACT_RE.test(decoded)
    || UNFINISHED_ENTITY_RE.test(decoded)
    || UNKNOWN_ENTITY_RE.test(decoded)) {
    return '';
  }
  return decoded;
}

export function isSafeScrapedTournamentText(value) {
  return typeof value === 'string' && decodeScrapedTournamentText(value).length > 0;
}

/**
 * Parse a stored tournament start time without guessing an omitted meridiem.
 * Bare 24-hour values remain supported because older source-owned schedules
 * use them. Malformed values return -1 and must never acquire a plausible time.
 */
export function parseDailyTournamentStartMinutes(value) {
  if (typeof value !== 'string') return -1;
  const raw = value.trim();
  let match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)?$/i.exec(raw);
  if (match) {
    let hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    const period = String(match[3] || '').toUpperCase();
    if (period) {
      if (hour < 1 || hour > 12) return -1;
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
    } else if (hour > 23) {
      return -1;
    }
    return hour * 60 + minute;
  }

  match = /^(\d{1,2})\s*([AP]M)$/i.exec(raw);
  if (!match) return -1;
  let hour = Number.parseInt(match[1], 10);
  if (hour < 1 || hour > 12) return -1;
  const period = match[2].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour * 60;
}

/**
 * Poker rooms do run real morning tournaments. The former blanket 10 AM floor
 * hid those events together with midnight/CSS/promotion parser artifacts.
 *
 * A scraped 8:00-9:59 AM row is servable only when it came from PokerAtlas's
 * room-specific schedule parser and carries every durable evidence field that
 * parser writes. `scraped_inferred`, bare-meridiem, generic venue-page, missing
 * hash/batch, future-dated, and sub-8 AM rows continue to fail closed. This is
 * deliberately narrower than trusting the time or venue name by itself.
 */
export function hasVerifiedMorningScheduleEvidence(row, nowMs = Date.now()) {
  const minutes = parseDailyTournamentStartMinutes(row?.start_time);
  if (minutes < DAILY_VERIFIED_MORNING_FLOOR_MINUTES
    || minutes >= DAILY_SCRAPED_TIME_FLOOR_MINUTES
    || !/AM\s*$/i.test(String(row?.start_time || ''))) {
    return false;
  }
  if (row?.data_quality !== 'scraped_verified') return false;
  if (row?.scrape_source !== 'pokeratlas') return false;
  if (!isSafeScrapedTournamentText(row?.venue_name)
    || !isSafeScrapedTournamentText(row?.tournament_name)) {
    return false;
  }

  let source;
  try {
    source = new URL(String(row?.source_url || ''));
  } catch (_) {
    return false;
  }
  const sourceHost = source.hostname.toLowerCase().replace(/^www\./, '');
  if (source.protocol !== 'https:'
    || sourceHost !== 'pokeratlas.com'
    || source.username
    || source.password
    || source.port
    || !POKERATLAS_SCHEDULE_PATH_RE.test(source.pathname)) {
    return false;
  }

  const hash = String(row?.scrape_html_hash || '');
  if (!SCRAPE_HASH_RE.test(hash) || /^0+$/.test(hash)) return false;
  if (!SCRAPE_BATCH_UUID_RE.test(String(row?.scrape_batch_id || ''))) return false;

  // The source read and its row-level verification must both be real and not
  // future-dated. Checking only `last_scraped || scrape_timestamp` allowed an
  // older last_scraped value to mask a future scrape_timestamp.
  const scrapeTimestampMs = row?.scrape_timestamp
    ? Date.parse(row.scrape_timestamp)
    : Number.NaN;
  const lastScrapedMs = row?.last_scraped
    ? Date.parse(row.last_scraped)
    : scrapeTimestampMs;
  if (!Number.isFinite(scrapeTimestampMs)
    || !Number.isFinite(lastScrapedMs)
    || scrapeTimestampMs > nowMs
    || lastScrapedMs > nowMs) {
    return false;
  }

  const buyIn = Number(row?.buy_in);
  return Number.isInteger(buyIn) && buyIn >= 20 && buyIn <= 100000;
}

/**
 * Apply the source-aware time contract to scraped casino schedule rows.
 * Missing/TBD remains an honest unknown. A non-empty malformed value is not.
 */
export function isServableDailyTournamentStartTime(row, nowMs = Date.now()) {
  const raw = String(row?.start_time || '').trim();
  if (!raw || /^(?:tbd|unknown|to be announced)$/i.test(raw)) return true;
  const minutes = parseDailyTournamentStartMinutes(raw);
  if (minutes < 0) return false;
  if (minutes >= DAILY_SCRAPED_TIME_FLOOR_MINUTES) return true;
  return hasVerifiedMorningScheduleEvidence(row, nowMs);
}

/**
 * Convert a stored 24-hour time to the public display format. Missing,
 * malformed, or out-of-range values remain unknown rather than acquiring a
 * plausible-looking default time.
 */
export function formatStoredTournamentStartTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (!match) return null;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23) return null;

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Public Home Games share the daily endpoint with casino schedules but have a
 * synthetic venue identity. Keep every supplied discovery filter binding the
 * same way it does for casino rows so unrelated games can never leak into a
 * venue-specific response.
 */
export function matchesHomeGameTournamentFilters(homeGame, {
  venueId = null,
  venue = null,
  gameType = null,
  minBuyin = null,
  maxBuyin = null,
  targetDate = null,
} = {}) {
  const group = homeGame?.group || {};
  const syntheticVenueId = `home_game_${group.id || homeGame?.id || ''}`;
  const requestedVenueId = String(venueId || '').trim();
  if (requestedVenueId && syntheticVenueId !== requestedVenueId) return false;

  const requestedVenue = String(venue || '').trim().toLowerCase();
  const groupName = decodeScrapedTournamentText(group.name || '').toLowerCase();
  if (requestedVenue && !groupName.includes(requestedVenue)) return false;

  const requestedGame = String(gameType || '').trim().toLowerCase();
  const homeGameType = String(homeGame?.game_type || '').trim().toLowerCase();
  if (requestedGame && !homeGameType.includes(requestedGame)) return false;

  const minimum = minBuyin === null || minBuyin === '' ? null : Number(minBuyin);
  const maximum = maxBuyin === null || maxBuyin === '' ? null : Number(maxBuyin);
  const hasBuyIn = homeGame?.buyin_min !== null
    && homeGame?.buyin_min !== undefined
    && homeGame?.buyin_min !== ''
    && Number.isFinite(Number(homeGame.buyin_min));
  if ((Number.isFinite(minimum) || Number.isFinite(maximum)) && !hasBuyIn) return false;
  const buyIn = hasBuyIn ? Number(homeGame.buyin_min) : null;
  if (Number.isFinite(minimum) && buyIn < minimum) return false;
  if (Number.isFinite(maximum) && buyIn > maximum) return false;

  if (targetDate && String(homeGame?.scheduled_date || '').slice(0, 10) !== targetDate) {
    return false;
  }
  return true;
}

/**
 * Recurring schedules are only safe to project while their source evidence is
 * recent. A dated one-off remains tied to the date printed by its source, but
 * an old weekly template would otherwise manufacture new future occurrences
 * forever. Unknown or invalid verification timestamps therefore fail closed.
 */
export function isRecurringScheduleRow(row) {
  const eventDate = String(row?.event_date || '').slice(0, 10);
  const flags = Array.isArray(row?.flags) ? row.flags : [];
  return row?.is_recurring === true
    || flags.includes('pnm_recurring_projection')
    || !eventDate
    || eventDate === '1970-01-01';
}

export function isServableDailyTournamentRow(
  row,
  nowMs = Date.now(),
  maxRecurringAgeMs = DAILY_RECURRING_MAX_AGE_MS,
) {
  if (!isRecurringScheduleRow(row)) return true;

  const verifiedAt = row?.last_scraped || row?.scrape_timestamp;
  const verifiedMs = verifiedAt ? Date.parse(verifiedAt) : Number.NaN;
  if (!Number.isFinite(verifiedMs) || verifiedMs > nowMs) return false;
  return nowMs - verifiedMs <= maxRecurringAgeMs;
}

/**
 * Bind an undated recurring template to the date requested by the caller.
 * Both NULL and 1970-01-01 are established storage representations for an
 * undated template. Concrete dated rows keep their source date unchanged.
 */
export function projectDailyTournamentDate(row, targetDate) {
  if (!row || !targetDate) return row;
  const storedDate = String(row.event_date || '').slice(0, 10);
  if (storedDate && storedDate !== '1970-01-01') return row;
  return { ...row, event_date: targetDate, is_recurring: true };
}

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

export function combineDailyTournamentQueryResults(cohorts) {
  const entries = Object.entries(cohorts || {});
  const failedCohorts = entries
    .filter(([_name, result]) => result?.error || result?.truncated)
    .map(([name]) => name);
  return {
    rows: failedCohorts.length > 0
      ? []
      : entries.flatMap(([_name, result]) => result?.rows || []),
    error: entries.find(([_name, result]) => result?.error)?.[1]?.error || null,
    truncated: entries.some(([_name, result]) => result?.truncated),
    pagesFetched: entries.reduce(
      (total, [_name, result]) => total + Number(result?.pagesFetched || 0),
      0,
    ),
    readErrorCount: failedCohorts.length,
    failedCohorts,
  };
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
