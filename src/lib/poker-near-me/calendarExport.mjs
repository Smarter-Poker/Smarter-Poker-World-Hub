/**
 * CALENDAR EXPORT HELPERS (Phase 3: Calendar & Sharing)
 * Generates standards-compliant .ics (iCalendar) payloads and Google Calendar web intent URLs
 * for poker tournament series and festivals.
 */
import { parseStopDates } from '../../utils/tourGeoUtils.js';
import { freeBuyIcsEvents, retiredFreerollIcsEvents, FREE_BUY_SUMMARY } from '../freerolls/freeBuySchedule.mjs';

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
 * Builds standard RFC 5545 iCalendar feed for Smarter.Poker daily Free Buy freerolls.
 * Generates recurring daily tournament calendar events.
 */
export function buildFreerollsIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const events = [...freeBuyIcsEvents(), ...retiredFreerollIcsEvents('calendar-export')];

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
    `SEQUENCE:${ev.sequence || 1}`,
    `STATUS:${ev.status || 'CONFIRMED'}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ]);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarter Software//Smarter.Poker Freerolls//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Smarter.Poker Daily Freerolls',
    'X-WR-TIMEZONE:America/Chicago',
    `X-WR-CALDESC:${FREE_BUY_SUMMARY}`,
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
  const title = event.title || 'Smarter.Poker Daily Freerolls';
  const details = event.description || 'Five free No-Limit Hold\'em tournaments every day, zero buy-in. Play live at https://smarter.poker/hub/club-arena?mode=tournament';
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

/**
 * Builds standard RFC 5545 iCalendar feed (.ics) for a Poker Tour and all of its scheduled stops.
 */
export function buildTourIcs({ seo = {}, stops = [], events = [] } = {}) {
  const code = String(seo?.code || 'TOUR').trim().toUpperCase();
  const tourName = String(seo?.name || `${code} Poker Tour`).trim();
  const canonicalPath = seo?.canonical || `/hub/tours/${encodeURIComponent(code)}`;
  const tourUrl = canonicalPath.startsWith('http')
    ? canonicalPath
    : `https://smarter.poker${canonicalPath}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const dateToYmdObj = (dt) => {
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return null;
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
    };
  };

  const vevents = [];

  for (let i = 0; i < (stops || []).length; i += 1) {
    const stop = stops[i];
    if (!stop || !stop.name) continue;
    let range = null;
    try {
      range = parseStopDates(stop.dates);
    } catch {
      range = null;
    }
    const startObj = dateToYmdObj(range?.start);
    if (!startObj) continue;
    const endObj = dateToYmdObj(range?.end) || startObj;
    const exclusiveEnd = addDays(endObj, 1);

    const dtStart = formatIcsDay(startObj);
    const dtEnd = formatIcsDay(exclusiveEnd);
    const uid = `tour-${code.toLowerCase()}-stop-${i + 1}@smarter.poker`;
    const location = cleanIcsText([stop.venue, stop.location].filter(Boolean).join(', '));
    const descParts = [
      `${tourName} (${code}) - ${stop.name}`,
      location ? `Venue: ${[stop.venue, stop.location].filter(Boolean).join(', ')}` : '',
      stop.buyin_range ? `Buy-In Range: ${stop.buyin_range}` : stop.buyin ? `Buy-In: $${Number(stop.buyin).toLocaleString('en-US')}` : '',
      stop.flagship ? `Flagship Main Event: ${stop.flagship}` : '',
      `Full Tour Schedule & Live Updates: ${tourUrl}`,
    ].filter(Boolean);

    vevents.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${cleanIcsText(`${stop.name} (${code})`)}`,
      `DESCRIPTION:${cleanIcsText(descParts.join('\n'))}`,
      location ? `LOCATION:${location}` : '',
      `URL:${tourUrl}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }

  if (vevents.length === 0 && Array.isArray(events)) {
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (!ev || !ev.name) continue;
      let range = null;
      try {
        range = parseStopDates(ev.dates);
      } catch {
        range = null;
      }
      const startObj = dateToYmdObj(range?.start);
      if (!startObj) continue;
      const endObj = dateToYmdObj(range?.end) || startObj;
      const exclusiveEnd = addDays(endObj, 1);
      vevents.push(
        'BEGIN:VEVENT',
        `UID:tour-${code.toLowerCase()}-event-${i + 1}@smarter.poker`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${formatIcsDay(startObj)}`,
        `DTEND;VALUE=DATE:${formatIcsDay(exclusiveEnd)}`,
        `SUMMARY:${cleanIcsText(`${ev.name} (${code})`)}`,
        `DESCRIPTION:${cleanIcsText(`${tourName} Event: ${ev.name}${ev.buyin ? ` ($${Number(ev.buyin).toLocaleString('en-US')} Buy-In)` : ''}. Schedule: ${tourUrl}`)}`,
        `URL:${tourUrl}`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      );
    }
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarter Software//Smarter.Poker Tours//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${cleanIcsText(`${tourName} (${code}) Schedule | Smarter.Poker`)}`,
    'X-WR-TIMEZONE:America/Chicago',
    `X-WR-CALDESC:${cleanIcsText(`Official ${tourName} (${code}) Stop Schedule And Series Dates Tracked On Smarter.Poker.`)}`,
    ...vevents.filter(Boolean),
    'END:VCALENDAR',
  ].join('\r\n');
}


