/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/seo/series-calendar
 *  RFC 5545 iCalendar (.ics) Feed For Major Poker Series & Daily Freerolls
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serves subscribable/downloadable .ics calendar feeds for Apple Calendar,
 * Google Calendar, and Outlook with RFC 5545 VTIMEZONE definitions, stable
 * deterministic UIDs, SEQUENCE/STATUS update & cancellation semantics, and
 * verified series festival windows and free-to-play freeroll chip schedules.
 *
 * Query Parameters:
 *   - slug     : Series guide slug (e.g., 'wsop-las-vegas') or 'freerolls'
 *   - status   : 'confirmed' (default) or 'cancelled' for RFC 5545 cancellation feeds
 *   - sequence : Optional integer revision number (default: 1)
 */

import {
  SERIES_GUIDES,
  getSeriesGuideBySlug,
} from '../../../src/content/guides/seriesGuides.js';
import { recordSeoTelemetryEvent } from './referral-stats.js';
import { freeBuyIcsEvents, retiredFreerollIcsEvents } from '../../../src/lib/freerolls/freeBuySchedule.mjs';

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const VTIMEZONE_BLOCKS = {
  'America/Chicago': [
    'BEGIN:VTIMEZONE',
    'TZID:America/Chicago',
    'X-LIC-LOCATION:America/Chicago',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ],
  'America/Los_Angeles': [
    'BEGIN:VTIMEZONE',
    'TZID:America/Los_Angeles',
    'X-LIC-LOCATION:America/Los_Angeles',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0800',
    'TZOFFSETTO:-0700',
    'TZNAME:PDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0700',
    'TZOFFSETTO:-0800',
    'TZNAME:PST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ],
  'America/New_York': [
    'BEGIN:VTIMEZONE',
    'TZID:America/New_York',
    'X-LIC-LOCATION:America/New_York',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0400',
    'TZNAME:EDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0400',
    'TZOFFSETTO:-0500',
    'TZNAME:EST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ],
};

export const VERIFIED_SERIES_WINDOWS = {
  'wsop-las-vegas': {
    tzid: 'America/Los_Angeles',
    windows: [
      {
        uidSuffix: 'summer-festival',
        startDate: '20270525',
        endDate: '20270716',
        title: 'World Series Of Poker (WSOP) Las Vegas Annual Festival Window',
        note: 'Annual Late-May Through Mid-July Festival Window At Horseshoe & Paris Las Vegas. Individual Bracelet Event Numbers Confirm Upon Official WSOP Schedule Release.',
      },
      {
        uidSuffix: 'main-event-window',
        startDate: '20270702',
        endDate: '20270715',
        title: 'WSOP $10,000 No-Limit Hold\'em World Championship (Main Event Window)',
        note: 'Traditional Early-July Main Event Championship Window (60,000 Starting Stack, 120-Minute Levels).',
      },
    ],
  },
  'wpt-world-championship': {
    tzid: 'America/Los_Angeles',
    windows: [
      {
        uidSuffix: 'december-festival',
        startDate: '20261201',
        endDate: '20261222',
        title: 'WPT World Championship Festival At Wynn Las Vegas',
        note: 'Annual December Championship Festival Window At Wynn Las Vegas ($10,400 WPT World Championship & $1,100 WPT Prime Championship).',
      },
    ],
  },
  'wsop-circuit': {
    tzid: 'America/Chicago',
    windows: [
      {
        uidSuffix: 'season-window',
        startDate: '20260801',
        endDate: '20270531',
        title: 'WSOP Circuit (WSOPC) Regional Gold Ring Tour Season ($1,700 Main Events)',
        note: 'August Through May Regional Tour Season Across 25+ US & International Stops (40,000 Starting Stack, 40-60 Minute Levels). Check Host Property For Specific 12-Day Stop Dates.',
      },
    ],
  },
  'mspt-mid-states-poker-tour': {
    tzid: 'America/Chicago',
    windows: [
      {
        uidSuffix: 'season-window',
        startDate: '20261115',
        endDate: '20271115',
        title: 'Mid-States Poker Tour (MSPT) $1,110 Main Event Regional Season',
        note: 'Year-Round Regional Tour Across 20+ Midwest, West Coast & East Coast Stops (30,000 Starting Stack, 40-Minute Levels).',
      },
    ],
  },
  'rgps-rungood-poker-series': {
    tzid: 'America/Chicago',
    windows: [
      {
        uidSuffix: 'season-window',
        startDate: '20261115',
        endDate: '20271115',
        title: 'RunGood Poker Series (RGPS) Regional Ring Tour Season',
        note: 'Year-Round Regional Mid-Major Tour Across 16+ US Stops ($600-$1,100 Main Events, 30,000 Starting Stack).',
      },
    ],
  },
  'seminole-hard-rock-poker-open': {
    tzid: 'America/New_York',
    windows: [
      {
        uidSuffix: 'rrpo-november',
        startDate: '20261118',
        endDate: '20261203',
        title: 'Seminole Hard Rock Rock \'N\' Roll Poker Open (RRPO) Window',
        note: 'Late-November WPT Rock \'N\' Roll Poker Open Festival Window At Seminole Hard Rock Hollywood, FL.',
      },
      {
        uidSuffix: 'showdown-april',
        startDate: '20270407',
        endDate: '20270428',
        title: 'Seminole Hard Rock Poker Showdown (April Festival Window)',
        note: 'Annual April WPT Poker Showdown Festival Window At Seminole Hard Rock Hollywood, FL.',
      },
      {
        uidSuffix: 'shrpo-august',
        startDate: '20270729',
        endDate: '20270813',
        title: 'Seminole Hard Rock Poker Open (SHRPO) August Championship Window',
        note: 'Annual August SHRPO Championship Window ($5,300 Championship, $3M+ Guaranteed) In Hollywood, FL.',
      },
    ],
  },
  'borgata-poker-open': {
    tzid: 'America/New_York',
    windows: [
      {
        uidSuffix: 'bwpo-january',
        startDate: '20270104',
        endDate: '20270127',
        title: 'Borgata Winter Poker Open (BWPO) January Festival Window',
        note: 'Annual January Borgata Winter Poker Open Window At Borgata Hotel Casino & Spa (Atlantic City, NJ).',
      },
      {
        uidSuffix: 'bspo-may',
        startDate: '20270503',
        endDate: '20270519',
        title: 'Borgata Spring Poker Open (BSPO) May Festival Window',
        note: 'Annual May Borgata Spring Poker Open Window In Atlantic City, NJ.',
      },
      {
        uidSuffix: 'bpo-september',
        startDate: '20270906',
        endDate: '20270923',
        title: 'Borgata Poker Open (BPO) September Championship Window',
        note: 'Annual September Flagship Borgata Poker Open Window In Atlantic City, NJ.',
      },
    ],
  },
  'wynn-millions-classic': {
    tzid: 'America/Los_Angeles',
    windows: [
      {
        uidSuffix: 'wynn-millions-march',
        startDate: '20270218',
        endDate: '20270323',
        title: 'Wynn Millions Poker Series (February-March Window)',
        note: 'Annual Spring Wynn Millions Championship Window At Wynn Las Vegas.',
      },
      {
        uidSuffix: 'wynn-summer-classic',
        startDate: '20270521',
        endDate: '20270720',
        title: 'Wynn Summer Classic (Late May Through Mid-July Window)',
        note: 'Annual Summer Classic Tournament Series At Wynn Las Vegas.',
      },
    ],
  },
  'venetian-deepstack-championship': {
    tzid: 'America/Los_Angeles',
    windows: [
      {
        uidSuffix: 'dse-nye',
        startDate: '20261201',
        endDate: '20270105',
        title: 'Venetian DeepStack Extravaganza NYE Series Window',
        note: 'December Through New Year DeepStack Extravaganza Window At Venetian Poker Room Las Vegas.',
      },
      {
        uidSuffix: 'dcps-summer',
        startDate: '20270518',
        endDate: '20270727',
        title: 'Venetian DeepStack Championship Poker Series (Summer Window)',
        note: 'May Through July DeepStack Championship Series At Venetian Las Vegas.',
      },
    ],
  },
  'texas-card-house-lodge-championship': {
    tzid: 'America/Chicago',
    windows: [
      {
        uidSuffix: 'winter-major',
        startDate: '20270112',
        endDate: '20270126',
        title: 'Texas Major Card Club Winter Series Window (Austin / Dallas / Houston)',
        note: 'January Texas Card Club Major Series Window (Time-Collection Tournament Structure).',
      },
      {
        uidSuffix: 'may-millions',
        startDate: '20270504',
        endDate: '20270526',
        title: 'Lodge Championship Series / Texas May Millions Window',
        note: 'Annual May Championship Series Window In Round Rock / Austin & Dallas-Fort Worth, TX.',
      },
    ],
  },
};

function buildFreerollsIcs({ status = 'CONFIRMED', sequence = 1 } = {}) {
  const canonicalUrl = 'https://smarter.poker/freerolls';
  const webcalUrl = 'webcal://smarter.poker/api/seo/series-calendar?slug=freerolls';
  const safeStatus = String(status).toUpperCase() === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED';
  const safeSeq = Math.max(1, Math.round(Number(sequence) || 1));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarter.Poker//Daily Poker Freerolls Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Smarter.Poker Daily Freerolls (Free-To-Play)',
    'X-WR-TIMEZONE:America/Chicago',
    `X-WR-CALDESC:${escapeIcsText(`Daily Free-To-Play Poker Freerolls On Smarter.Poker (Five Free Buy Tournaments Daily; Zero Entry Fee; Club Chips And Diamonds Have No Cash Value). Subscribe: ${webcalUrl}`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...VTIMEZONE_BLOCKS['America/Chicago'],
  ];

  const dailySlots = [...freeBuyIcsEvents(), ...retiredFreerollIcsEvents('series-calendar')].map((ev) => ({
    uid: ev.uid,
    dtStartLocal: ev.dtstart,
    dtEndLocal: ev.dtend,
    rrule: ev.rrule,
    summary: ev.summary,
    desc: ev.description,
    status: ev.status,
    sequence: ev.sequence ? Math.max(ev.sequence, safeSeq + 1) : undefined,
  }));

  dailySlots.forEach((slot) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${slot.uid}`,
      'DTSTAMP:20261110T120000Z',
      `SEQUENCE:${slot.sequence || safeSeq}`,
      `STATUS:${slot.status || safeStatus}`,
      `DTSTART;TZID=America/Chicago:${slot.dtStartLocal}`,
      `DTEND;TZID=America/Chicago:${slot.dtEndLocal}`,
      `RRULE:${slot.rrule}`,
      `SUMMARY:${escapeIcsText(slot.summary)}`,
      `DESCRIPTION:${escapeIcsText(slot.desc)}`,
      `LOCATION:${escapeIcsText('Smarter.Poker Club Arena (https://smarter.poker/freerolls)')}`,
      `URL:${canonicalUrl}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function buildSeriesCalendarIcs(slug = '', options = {}) {
  const normalized = String(slug || '').trim().toLowerCase();
  const safeStatus = String(options.status || 'CONFIRMED').toUpperCase() === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED';
  const safeSeq = Math.max(1, Math.round(Number(options.sequence) || 1));

  if (normalized === 'freerolls' || normalized === 'daily-freerolls') {
    return {
      filename: 'smarter-poker-daily-freerolls.ics',
      ics: buildFreerollsIcs({ status: safeStatus, sequence: safeSeq }),
      slug: 'freerolls',
    };
  }

  const guide = getSeriesGuideBySlug(normalized) || SERIES_GUIDES[0];
  const canonicalUrl = `https://smarter.poker/poker-series/guides/${guide.slug}`;
  const webcalUrl = `webcal://smarter.poker/api/seo/series-calendar?slug=${encodeURIComponent(guide.slug)}`;
  const scheduleMeta = VERIFIED_SERIES_WINDOWS[guide.slug] || VERIFIED_SERIES_WINDOWS['wsop-las-vegas'];
  const tzid = scheduleMeta.tzid || 'America/Los_Angeles';
  const tzBlock = VTIMEZONE_BLOCKS[tzid] || VTIMEZONE_BLOCKS['America/Los_Angeles'];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Smarter.Poker//${guide.shortName} Schedule & Strategy Guide//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${guide.shortName} (${guide.cityState}) - Smarter.Poker`)}`,
    `X-WR-TIMEZONE:${tzid}`,
    `X-WR-CALDESC:${escapeIcsText(`${guide.name} At ${guide.hostVenue} (${guide.typicalMonths}). Subscribe via ${webcalUrl} or view full guide at ${canonicalUrl}`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...tzBlock,
  ];

  const keyEventsSummary = (guide.keyEvents || [])
    .map((ev) => `${ev.eventName} (${ev.buyIn}, ${ev.startingChips} Chips, ${ev.levels} Levels)`)
    .join('; ');

  (scheduleMeta.windows || []).forEach((win) => {
    const uid = `${guide.slug}-${win.uidSuffix}@smarter.poker`;
    const desc = `${win.note} Host Venue: ${guide.hostVenue} (${guide.cityState}). Typical Window: ${guide.typicalMonths}. Buy-In Range: ${guide.buyInRange} (Main Event: ${guide.mainEventBuyIn}). Signature Events: ${keyEventsSummary}. Structure & Bankroll Guide: ${canonicalUrl}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      'DTSTAMP:20261110T120000Z',
      `SEQUENCE:${safeSeq}`,
      `STATUS:${safeStatus}`,
      `DTSTART;VALUE=DATE:${win.startDate}`,
      `DTEND;VALUE=DATE:${win.endDate}`,
      `SUMMARY:${escapeIcsText(win.title)}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      `LOCATION:${escapeIcsText(`${guide.hostVenue}, ${guide.cityState}`)}`,
      `URL:${canonicalUrl}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');

  return {
    filename: `smarter-poker-${guide.slug}-schedule.ics`,
    ics: lines.join('\r\n'),
    slug: guide.slug,
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { slug = 'wsop-las-vegas', partner = '', status = 'CONFIRMED', sequence = '1' } = req.query || {};
  const result = buildSeriesCalendarIcs(slug, { status, sequence });

  recordSeoTelemetryEvent({
    category: 'calendar_subscriptions',
    item: result.slug,
    partner: partner || req.headers?.referer || '',
    source: 'ics-feed',
    req,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${result.filename}"`
  );
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  return res.status(200).send(result.ics);
}
