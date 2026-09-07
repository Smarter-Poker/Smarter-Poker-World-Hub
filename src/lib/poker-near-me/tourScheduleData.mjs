import { decodeScrapedTournamentText } from './dailyTournamentData.mjs';

export const SERVABLE_TOUR_DETAIL_QUALITIES = Object.freeze([
  'pdf_extracted',
]);

export const SERVABLE_TOUR_EVENT_QUALITIES = Object.freeze([
  'scraped_verified',
  'scraped_inferred',
  'manual_research',
]);

const ISO_DATE_RE = /^20\d{2}-\d{2}-\d{2}$/;
const CLOCK_24_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const CLOCK_12_RE = /^(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:AM|PM)$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

const normalizedIdentityText = (value) => decodeScrapedTournamentText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isRealIsoDate = (value) => {
  if (!ISO_DATE_RE.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value;
};

const isSafeHttpsUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
};

const normalizedEventNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? String(number) : '';
};

const isValidClock = (value) => {
  const clock = String(value || '').trim();
  return CLOCK_24_RE.test(clock) || CLOCK_12_RE.test(clock);
};

/**
 * Public contract for primary tour-stop rows. A row without either an event
 * date or a stop start date is not schedulable evidence and must not be shown
 * as a current/upcoming event. Supplied dates must be real and mutually
 * coherent; source provenance remains visible on the returned row.
 */
export const isServableTourStopEventRow = (row, expectedTourCode) => {
  if (!row || typeof row !== 'object') return false;
  if (!SERVABLE_TOUR_EVENT_QUALITIES.includes(row.data_quality)) return false;
  if (String(row.tour_code || '').toUpperCase() !== String(expectedTourCode || '').toUpperCase()) {
    return false;
  }
  if (!normalizedIdentityText(row.event_name) || !normalizedIdentityText(row.stop_name)) {
    return false;
  }

  const eventDate = String(row.start_date || '');
  const stopStart = String(row.stop_start_date || '');
  const stopEnd = String(row.stop_end_date || '');
  if (!eventDate && !stopStart) return false;
  if (eventDate && !isRealIsoDate(eventDate)) return false;
  if (stopStart && !isRealIsoDate(stopStart)) return false;
  if (stopEnd && !isRealIsoDate(stopEnd)) return false;
  if (stopStart && stopEnd && stopEnd < stopStart) return false;
  if (eventDate && stopStart && eventDate < stopStart) return false;
  if (eventDate && stopEnd && eventDate > stopEnd) return false;
  return true;
};

/**
 * The source-owned PDF detail contract. Schedule-summary placeholders and
 * stale/unknown rows must never be promoted as event-level details.
 */
export const isServableTourDetailRow = (row, expectedTourCode) => {
  if (!row || typeof row !== 'object') return false;
  if (!SERVABLE_TOUR_DETAIL_QUALITIES.includes(row.data_quality)) return false;
  if (String(row.tour_code || '').toUpperCase() !== String(expectedTourCode || '').toUpperCase()) {
    return false;
  }
  if (!normalizedIdentityText(row.series_name)
    || !normalizedIdentityText(row.event_name)
    || !normalizedEventNumber(row.event_number)) return false;
  if (!isRealIsoDate(row.start_date)) return false;
  if (row.event_date && row.event_date !== row.start_date) return false;
  if (!isValidClock(row.start_time)) return false;
  if (!Number.isInteger(row.buy_in) || row.buy_in < 50 || row.buy_in > 1_000_000) return false;
  if (!isSafeHttpsUrl(row.pdf_source_url) || !isSafeHttpsUrl(row.source_url)) return false;
  if (String(row.pdf_source_url) !== String(row.source_url)) return false;
  if (!SHA256_RE.test(String(row.scrape_html_hash || ''))) return false;
  const scrapedAt = Date.parse(row.scrape_timestamp || row.scraped_at || '');
  return Number.isFinite(scrapedAt);
};

/**
 * Exact semantic identity used by the live audit: normalized series name,
 * event number, concrete start date, and normalized event name.
 */
export const tourScheduleSemanticKey = (event) => {
  if (!event || typeof event !== 'object') return '';
  const series = normalizedIdentityText(event.series_name ?? event.stop_name);
  const number = normalizedEventNumber(event.event_number);
  const date = String(event.start_date || '').slice(0, 10);
  const name = normalizedIdentityText(event.event_name);
  if (!series || !number || !isRealIsoDate(date) || !name) return '';
  return `${series}|${number}|${date}|${name}`;
};

const completenessScore = (row) => [
  row.start_time,
  row.buy_in,
  row.guaranteed ?? row.guarantee,
  row.starting_chips ?? row.starting_stack,
  row.levels ?? row.blind_levels_min,
  row.reg_open_time,
  row.pdf_source_url ?? row.source_url,
].reduce((score, value) => score + (value === null || value === undefined || value === '' ? 0 : 1), 0);

const shouldReplaceDetail = (current, candidate) => {
  const currentScore = completenessScore(current);
  const candidateScore = completenessScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  const currentAt = Date.parse(current.scrape_timestamp || current.scraped_at || '') || 0;
  const candidateAt = Date.parse(candidate.scrape_timestamp || candidate.scraped_at || '') || 0;
  if (candidateAt !== currentAt) return candidateAt > currentAt;
  return String(candidate.id || '') < String(current.id || '');
};

export const dedupeTourDetailRows = (rows) => {
  const byIdentity = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = tourScheduleSemanticKey(row);
    if (!key) continue;
    const current = byIdentity.get(key);
    if (!current || shouldReplaceDetail(current, row)) byIdentity.set(key, row);
  }
  return [...byIdentity.values()];
};

/**
 * Merge only exact semantic matches. Primary provenance remains authoritative;
 * detail provenance is disclosed separately and every appended key is added to
 * the seen set immediately so physical duplicates cannot leak into the API.
 */
export const mergeTourScheduleEvents = (primaryEvents, detailEvents) => {
  const details = dedupeTourDetailRows(detailEvents);
  const detailByKey = new Map(details.map((row) => [tourScheduleSemanticKey(row), row]));
  const seen = new Set();
  const merged = [];

  for (const event of Array.isArray(primaryEvents) ? primaryEvents : []) {
    const key = tourScheduleSemanticKey(event);
    if (key && seen.has(key)) continue;
    const detail = key ? detailByKey.get(key) : null;
    merged.push(detail ? {
      ...event,
      start_time: event.start_time || detail.start_time || null,
      reg_open_time: event.reg_open_time || detail.reg_open_time || null,
      starting_chips: event.starting_chips || detail.starting_chips || null,
      starting_chips_display: event.starting_chips_display !== 'TBD'
        ? event.starting_chips_display
        : detail.starting_chips_display,
      blind_levels_min: event.blind_levels_min || detail.blind_levels_min || null,
      guarantee: event.guarantee || detail.guarantee || null,
      guarantee_display: event.guarantee
        ? event.guarantee_display
        : detail.guarantee_display,
      detail_source_url: detail.source_url || null,
      detail_scrape_timestamp: detail.scrape_timestamp || null,
      detail_data_quality: detail.data_quality,
    } : event);
    if (key) seen.add(key);
  }

  for (const detail of details) {
    const key = tourScheduleSemanticKey(detail);
    if (!key || seen.has(key)) continue;
    merged.push(detail);
    seen.add(key);
  }
  return merged;
};
