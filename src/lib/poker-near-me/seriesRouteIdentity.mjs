// `tournament_series` and `poker_series` use independent integer sequences.
// Public route IDs for poker_series rows live in this numeric namespace so a
// card can never resolve to a tournament_series row with the same primary key.
export const POKER_SERIES_ROUTE_ID_OFFSET = 5_000_000;

function asPositiveSafeInteger(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function toPokerSeriesRouteId(sourceId) {
  const id = asPositiveSafeInteger(sourceId);
  if (id === null) return null;

  const routeId = id + POKER_SERIES_ROUTE_ID_OFFSET;
  return Number.isSafeInteger(routeId) ? routeId : null;
}

export function fromPokerSeriesRouteId(routeId) {
  const id = asPositiveSafeInteger(routeId);
  if (id === null || id <= POKER_SERIES_ROUTE_ID_OFFSET) return null;

  const sourceId = id - POKER_SERIES_ROUTE_ID_OFFSET;
  return sourceId > 0 ? sourceId : null;
}

export function isPokerSeriesRouteId(routeId) {
  return fromPokerSeriesRouteId(routeId) !== null;
}

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const ZERO_SHA256 = /^0{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizedHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function sourceEvidence(row) {
  const url = normalizedHttpUrl(row?.source_url || row?.scrape_url);
  const hash = String(row?.scrape_html_hash || '');
  const observedAt = Date.parse(row?.scrape_timestamp || row?.last_scraped_at || '');
  if (!url || !SHA256_HEX.test(hash) || ZERO_SHA256.test(hash)
    || !Number.isFinite(observedAt)) return null;
  return { url, observedAt };
}

function usefulText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || /^(?:unknown|various)$/i.test(text)) return null;
  return text;
}

function validIsoDate(value) {
  if (!ISO_DATE.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

const SERVABLE_SERIES_QUALITIES = new Set([
  'scraped_verified',
  'scraped_inferred',
  'manual_research',
]);

/**
 * A public parent must carry real source identity, not only a quality label.
 * Manual research uses an audit-note proof rather than an HTML SHA/batch; rows
 * written by automated scrapers require both of those machine provenance
 * fields. Future-dated observations fail closed.
 */
export function isServableSeriesParentEvidence(row, nowMs = Date.now()) {
  if (!row || row.is_suppressed === true
    || !SERVABLE_SERIES_QUALITIES.has(row.data_quality)) return false;
  if (!normalizedHttpUrl(row.source_url || row.scrape_url)) return false;

  const observedAt = Date.parse(row.scrape_timestamp || row.last_scraped_at || '');
  if (!Number.isFinite(observedAt) || observedAt > nowMs + 5 * 60 * 1000) return false;
  if (row.data_quality === 'manual_research') return true;

  const hash = String(row.scrape_html_hash || '');
  return SHA256_HEX.test(hash) && !ZERO_SHA256.test(hash)
    && Boolean(row.scrape_batch_id);
}

/**
 * Reconcile duplicate records from the two legacy series tables without
 * changing the public route identity. poker_series may replace metadata only
 * when it is a newer observation of the exact same source URL with a real
 * source hash. Missing/placeholder fields never erase the primary record.
 */
export function reconcileTournamentSeriesEvidence(tournamentSeries, pokerSeries) {
  if (!tournamentSeries || !pokerSeries
    || !tournamentSeries.series_uid
    || tournamentSeries.series_uid !== pokerSeries.series_uid) {
    return tournamentSeries;
  }

  const primaryEvidence = sourceEvidence(tournamentSeries);
  const candidateEvidence = sourceEvidence(pokerSeries);
  if (!candidateEvidence
    || candidateEvidence.url !== primaryEvidence?.url
    || candidateEvidence.observedAt <= primaryEvidence.observedAt) {
    return tournamentSeries;
  }

  const reconciled = { ...tournamentSeries };
  const candidateName = usefulText(pokerSeries.series_name || pokerSeries.name);
  const candidateVenue = usefulText(pokerSeries.venue_name || pokerSeries.venue);
  const candidateCity = usefulText(pokerSeries.city);
  const candidateState = usefulText(pokerSeries.state);

  if (candidateName) {
    reconciled.name = candidateName;
    reconciled.series_name = candidateName;
  }
  if (candidateVenue) {
    reconciled.venue_name = candidateVenue;
    reconciled.venue = candidateVenue;
  }
  if (candidateCity) reconciled.city = candidateCity;
  if (candidateState) reconciled.state = candidateState;
  if (candidateCity && candidateState) {
    reconciled.location = `${candidateCity}, ${candidateState}`;
  }
  if (pokerSeries.venue_id != null) reconciled.venue_id = pokerSeries.venue_id;
  if (usefulText(pokerSeries.logo_url)) reconciled.logo_url = pokerSeries.logo_url;

  const candidateStart = validIsoDate(pokerSeries.start_date)
    ? pokerSeries.start_date : null;
  const candidateEnd = validIsoDate(pokerSeries.end_date)
    ? pokerSeries.end_date : null;
  const nextStart = candidateStart || reconciled.start_date;
  const nextEnd = candidateEnd || reconciled.end_date;
  if (!nextStart || !nextEnd || nextStart <= nextEnd) {
    if (candidateStart) reconciled.start_date = candidateStart;
    if (candidateEnd) reconciled.end_date = candidateEnd;
  }

  const candidateBuyIn = Number(pokerSeries.main_event_buyin);
  if (Number.isFinite(candidateBuyIn) && candidateBuyIn > 0) {
    reconciled.main_event_buyin = candidateBuyIn;
  }
  const candidateGuarantee = Number(
    pokerSeries.main_event_guaranteed ?? pokerSeries.total_guaranteed,
  );
  if (Number.isFinite(candidateGuarantee) && candidateGuarantee > 0) {
    reconciled.main_event_guaranteed = candidateGuarantee;
  }

  reconciled.source_url = pokerSeries.source_url || pokerSeries.scrape_url;
  reconciled.scrape_url = pokerSeries.scrape_url || pokerSeries.source_url;
  reconciled.scrape_html_hash = pokerSeries.scrape_html_hash;
  reconciled.scrape_timestamp = pokerSeries.scrape_timestamp;
  reconciled.scrape_confidence = pokerSeries.scrape_confidence;
  reconciled.scrape_batch_id = pokerSeries.scrape_batch_id;
  reconciled.metadata_source_table = 'poker_series';
  reconciled.metadata_source_id = pokerSeries.id;
  return reconciled;
}
