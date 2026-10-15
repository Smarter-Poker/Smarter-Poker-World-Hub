/**
 * CALENDAR EXPORT HELPERS (Phase 3: Calendar & Sharing)
 * Generates standards-compliant .ics (iCalendar) payloads and Google Calendar web intent URLs
 * for poker tournament series and festivals.
 */

function cleanIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
    .trim();
}

function parseYmd(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
  };
}

function formatIcsDay(parsed) {
  const y = String(parsed.year).padStart(4, '0');
  const m = String(parsed.month).padStart(2, '0');
  const d = String(parsed.day).padStart(2, '0');
  return `${y}${m}${d}`;
}

function addDays(parsed, count) {
  // Use UTC Date for deterministic day incrementing
  const dt = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  dt.setUTCDate(dt.getUTCDate() + count);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

/**
 * Builds standard RFC 5545 iCalendar content (.ics file)
 */
export function buildSeriesIcs(series, options = {}) {
  if (!series || !series.name) return null;
  const startParsed = parseYmd(series.startDate || series.start_date);
  if (!startParsed) return null;

  const rawEnd = series.endDate || series.end_date;
  const endParsed = parseYmd(rawEnd) || startParsed;
  // RFC 5545 DATE value for DTEND is non-inclusive, so add 1 day to the end date
  const exclusiveEnd = addDays(endParsed, 1);

  const dtStart = formatIcsDay(startParsed);
  const dtEnd = formatIcsDay(exclusiveEnd);

  const uid = `series-${series.id || 'poker'}@smarter.poker`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const title = cleanIcsText(series.name);
  const location = cleanIcsText([series.venue, series.city, series.state].filter(Boolean).join(', '));
  const url = series.canonicalId || series.id
    ? `https://smarter.poker/hub/series/${encodeURIComponent(series.canonicalId || series.id)}`
    : 'https://smarter.poker/hub/poker-series';

  const descriptionLines = [
    series.name,
    location ? `Location: ${location}` : '',
    series.total_events || series.events_count ? `Events: ${series.total_events || series.events_count}` : '',
    series.main_event_guaranteed ? `Guaranteed: $${Number(series.main_event_guaranteed).toLocaleString('en-US')}` : '',
    `Full Schedule & Live Updates: ${url}`,
  ].filter(Boolean);

  const description = cleanIcsText(descriptionLines.join('\n'));

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarter Software//Smarter.Poker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${title}`,
    description ? `DESCRIPTION:${description}` : '',
    location ? `LOCATION:${location}` : '',
    `URL:${url}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/**
 * Builds Google Calendar web intent URL
 */
export function buildGoogleCalendarUrl(series) {
  if (!series || !series.name) return null;
  const startParsed = parseYmd(series.startDate || series.start_date);
  if (!startParsed) return null;

  const rawEnd = series.endDate || series.end_date;
  const endParsed = parseYmd(rawEnd) || startParsed;
  const exclusiveEnd = addDays(endParsed, 1);

  const dates = `${formatIcsDay(startParsed)}/${formatIcsDay(exclusiveEnd)}`;
  const title = series.name;
  const location = [series.venue, series.city, series.state].filter(Boolean).join(', ');
  const url = series.canonicalId || series.id
    ? `https://smarter.poker/hub/series/${encodeURIComponent(series.canonicalId || series.id)}`
    : 'https://smarter.poker/hub/poker-series';

  const details = [
    `Official tournament schedule on Smarter.Poker: ${url}`,
    location ? `Venue: ${location}` : '',
    series.total_events ? `Total Events: ${series.total_events}` : '',
  ].filter(Boolean).join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details,
  });

  if (location) {
    params.set('location', location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
