/**
 * How current a venue's tournament schedule is, and how the public venue page
 * must say so.
 *
 * Why this exists (2026-11-28): /hub/venues/1828 (Lodge Austin) showed
 * "Data Last Updated: Aug 14, 2026" above "Tournament Schedule Data Is Being
 * Collected For This Venue". Both were untrue. The badge read the legacy
 * `poker_venues.last_scraped` column, which the current collector
 * (scripts/tournament-schedule-daemon.py) never writes; and the empty state
 * implied a collection in progress while PokerAtlas had been saying every day
 * that the room "does not currently run any poker tournaments".
 *
 * The collector's own record of a successful read is
 * `schedule_last_scraped_at`, with `scrape_status = 'no_tournaments'` when the
 * source explicitly listed nothing. This module turns those, plus the
 * qualified schedule rows, into one public-safe summary so the server render
 * and the API (which the page revalidates against) say the same thing.
 */

export const SCHEDULE_STALE_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function validPastMs(value, nowMs) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms) || ms > nowMs + 5 * 60 * 1000) return null;
  return ms;
}

/**
 * @param {object} venue    poker_venues row (schedule_last_scraped_at, scrape_status)
 * @param {object[]} qualifiedRows rows already passed through qualifyVenueTournamentRows
 * @returns {{status: 'current'|'stale'|'verified_empty'|'stale_empty'|'not_current'|'unknown',
 *            verified_at: string|null, stale_after_days: number}}
 */
export function describeVenueScheduleFreshness(venue, qualifiedRows, nowMs = Date.now()) {
  const rows = Array.isArray(qualifiedRows) ? qualifiedRows : [];
  const venueReadMs = validPastMs(venue?.schedule_last_scraped_at, nowMs);
  let verifiedMs = venueReadMs;
  for (const row of rows) {
    const rowMs = validPastMs(row?.last_scraped || row?.scrape_timestamp, nowMs);
    if (rowMs !== null && (verifiedMs === null || rowMs > verifiedMs)) verifiedMs = rowMs;
  }
  const verified_at = verifiedMs === null ? null : new Date(verifiedMs).toISOString();
  const fresh = verifiedMs !== null && nowMs - verifiedMs <= SCHEDULE_STALE_AFTER_DAYS * DAY_MS;
  const base = { verified_at, stale_after_days: SCHEDULE_STALE_AFTER_DAYS };

  if (rows.length > 0) return { ...base, status: fresh ? 'current' : 'stale' };
  if (verifiedMs === null) return { ...base, status: 'unknown' };
  if (venue?.scrape_status === 'no_tournaments') {
    return { ...base, status: fresh ? 'verified_empty' : 'stale_empty' };
  }
  // The last good read had rows; none of them qualify any more and no newer
  // read has confirmed anything.
  return { ...base, status: 'not_current' };
}

function formatVerifiedDate(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  // A fixed zone keeps the server and browser renders identical.
  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/**
 * Title Case copy for the badge and the empty state. `badge` is null when
 * there is no verified read to cite.
 */
export function venueScheduleFreshnessCopy(freshness, { readError = false } = {}) {
  const status = freshness?.status || 'unknown';
  const date = formatVerifiedDate(freshness?.verified_at);
  const isStale = status === 'stale' || status === 'stale_empty' || status === 'not_current';

  let badge = null;
  if (date) {
    badge = isStale
      ? `Schedule Last Verified ${date} · May Be Out Of Date`
      : `Schedule Last Verified ${date}`;
  }

  let emptyMessage;
  if (readError) emptyMessage = 'Tournament Schedule Could Not Be Loaded. Please Try Again.';
  else if (status === 'verified_empty') emptyMessage = 'No Tournaments Are Currently Listed For This Venue.';
  else if (status === 'stale_empty' || status === 'not_current') emptyMessage = 'No Current Tournament Schedule Is Available For This Venue.';
  else emptyMessage = 'No Tournament Schedule Is Available For This Venue Yet.';

  return { badge, emptyMessage, isStale };
}
