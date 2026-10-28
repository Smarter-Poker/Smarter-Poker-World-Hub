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

/**
 * Builds standard RFC 5545 iCalendar feed for Smarter.Poker Daily $2,000 Freerolls.
 * Generates recurring daily and weekly tournament calendar events.
 */
export function buildFreerollsIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const events = [
    {
      uid: 'freeroll-morning-opener@smarter.poker',
      summary: 'Morning Opener Freeroll ($250 GTD) | Smarter.Poker',
      description: 'Free-To-Enter Daily Texas Hold\'em Tournament With $250 Guaranteed Prize Pool. Zero Deposit Required. Play Live At https://smarter.poker/freerolls',
      rrule: 'FREQ=DAILY',
      dtstart: '20260101T100000',
      dtend: '20260101T120000',
    },
    {
      uid: 'freeroll-afternoon-prime@smarter.poker',
      summary: 'Afternoon Prime Freeroll ($500 GTD) | Smarter.Poker',
      description: 'Free-To-Enter Daily Deepstack Texas Hold\'em Tournament With $500 Guaranteed Prize Pool. Zero Deposit Required. Play Live At https://smarter.poker/freerolls',
      rrule: 'FREQ=DAILY',
      dtstart: '20260101T140000',
      dtend: '20260101T160000',
    },
    {
      uid: 'freeroll-evening-championship@smarter.poker',
      summary: 'Evening Championship Freeroll ($750 GTD) | Smarter.Poker',
      description: 'Free-To-Enter Featured Daily Texas Hold\'em Championship Tournament With $750 Guaranteed Prize Pool. Zero Deposit Required. Play Live At https://smarter.poker/freerolls',
      rrule: 'FREQ=DAILY',
      dtstart: '20260101T180000',
      dtend: '20260101T210000',
    },
    {
      uid: 'freeroll-nightcap-turbo@smarter.poker',
      summary: 'Nightcap Turbo Freeroll ($500 GTD) | Smarter.Poker',
      description: 'Fast-Paced Daily Turbo Freeroll Featuring Pot-Limit Omaha And No-Limit Hold\'em With $500 Guaranteed Prize Pool. Zero Deposit Required. Play Live At https://smarter.poker/freerolls',
      rrule: 'FREQ=DAILY',
      dtstart: '20260101T210000',
      dtend: '20260101T223000',
    },
    {
      uid: 'freeroll-sunday-diamond-championship@smarter.poker',
      summary: 'Sunday Diamond Championship Freeroll ($5,000 GTD) | Smarter.Poker',
      description: 'Weekly Flagship Championship Freeroll For Diamond Members And Qualifying Tournament Ticket Holders With $5,000 Guaranteed Prize Pool. Zero Entry Fee. Play Live At https://smarter.poker/freerolls',
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      dtstart: '20260104T160000',
      dtend: '20260104T200000',
    },
  ];

  const vevents = events.flatMap((ev) => [
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Chicago:${ev.dtstart}`,
    `DTEND;TZID=America/Chicago:${ev.dtend}`,
    `RRULE:${ev.rrule}`,
    `SUMMARY:${cleanIcsText(ev.summary)}`,
    `DESCRIPTION:${cleanIcsText(ev.description)}`,
    'LOCATION:https://smarter.poker/freerolls',
    'URL:https://smarter.poker/freerolls',
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ]);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarter Software//Smarter.Poker Freerolls//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Smarter.Poker Daily $2,000 Freerolls',
    'X-WR-TIMEZONE:America/Chicago',
    'X-WR-CALDESC:Daily Free-To-Play Poker Tournaments With $2,000+ In Guaranteed Daily Prizes Plus Weekly Diamond Freerolls On Smarter.Poker.',
    'BEGIN:VTIMEZONE',
    'TZID:America/Chicago',
    'BEGIN:STANDARD',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Builds Google Calendar web intent URL for recurring Freerolls
 */
export function buildFreerollGoogleCalendarUrl(event = {}) {
  const title = event.title || 'Smarter.Poker Daily $2,000 Freerolls';
  const details = event.description || 'Compete in 100% free daily poker tournaments with $2,000 guaranteed daily prizes and Diamond Freerolls. Play live at https://smarter.poker/hub/club-arena?mode=tournament';
  const location = 'https://smarter.poker/freerolls';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details,
    location,
    recur: 'RRULE:FREQ=DAILY',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

