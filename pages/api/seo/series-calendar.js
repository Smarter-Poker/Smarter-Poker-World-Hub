/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/seo/series-calendar
 *  RFC 5545 iCalendar (.ics) Feed For Major Poker Series & Daily Freerolls
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Serves subscribable/downloadable .ics calendar feeds for Apple Calendar,
 * Google Calendar, and Outlook with embedded canonical Smarter.Poker URLs
 * in every VEVENT DESCRIPTION and URL field.
 *
 * Query Parameters:
 *   - slug : Series guide slug (e.g., 'wsop-las-vegas') or 'freerolls'
 */

import {
  SERIES_GUIDES,
  getSeriesGuideBySlug,
} from '../../../src/content/guides/seriesGuides.js';
import { recordSeoTelemetryEvent } from './referral-stats.js';

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildFreerollsIcs() {
  const canonicalUrl = 'https://smarter.poker/freerolls';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smarter.Poker//Daily $2,000 Poker Freerolls Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Smarter.Poker Daily $2,000 Freerolls',
    'X-WR-TIMEZONE:America/Chicago',
    'X-WR-CALDESC:Daily Zero-Entry Poker Freerolls On Smarter.Poker ($2,000 Daily Guaranteed)',
  ];

  const dailySlots = [
    {
      uid: 'freeroll-morning-1000@smarter.poker',
      dtStart: '20261110T160000Z',
      dtEnd: '20261110T180000Z',
      summary: 'Smarter.Poker Morning Opener Freeroll ($250 GTD - $0 Entry)',
      desc: 'No-Limit Hold\'em Standard 10-Minute Levels (10,000 Starting Chips). Register Free At https://smarter.poker/freerolls',
    },
    {
      uid: 'freeroll-afternoon-1400@smarter.poker',
      dtStart: '20261110T200000Z',
      dtEnd: '20261110T223000Z',
      summary: 'Smarter.Poker Afternoon Prime Freeroll ($500 GTD - $0 Entry)',
      desc: 'No-Limit Hold\'em Deepstack 12-Minute Levels (15,000 Starting Chips). Register Free At https://smarter.poker/freerolls',
    },
    {
      uid: 'freeroll-evening-1800@smarter.poker',
      dtStart: '20261111T000000Z',
      dtEnd: '20261111T023000Z',
      summary: 'Smarter.Poker Evening Championship Freeroll ($750 GTD - $0 Entry)',
      desc: 'Featured Daily Main Event With 20,000 Starting Chips And 12-Minute Levels. Register Free At https://smarter.poker/freerolls',
    },
    {
      uid: 'freeroll-nightcap-2100@smarter.poker',
      dtStart: '20261111T030000Z',
      dtEnd: '20261111T043000Z',
      summary: 'Smarter.Poker Nightcap Turbo Freeroll ($500 GTD - $0 Entry)',
      desc: 'Fast 5-Minute Turbo No-Limit Hold\'em / Pot-Limit Omaha Freeroll. Register Free At https://smarter.poker/freerolls',
    },
  ];

  dailySlots.forEach((slot) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${slot.uid}`,
      'DTSTAMP:20261110T120000Z',
      `DTSTART:${slot.dtStart}`,
      `DTEND:${slot.dtEnd}`,
      'RRULE:FREQ=DAILY',
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

export function buildSeriesCalendarIcs(slug = '') {
  const normalized = String(slug || '').trim().toLowerCase();
  if (normalized === 'freerolls' || normalized === 'daily-freerolls') {
    return {
      filename: 'smarter-poker-daily-freerolls.ics',
      ics: buildFreerollsIcs(),
      slug: 'freerolls',
    };
  }

  const guide = getSeriesGuideBySlug(normalized) || SERIES_GUIDES[0];
  const canonicalUrl = `https://smarter.poker/poker-series/guides/${guide.slug}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Smarter.Poker//${guide.shortName} Schedule & Strategy Guide//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${guide.shortName} (${guide.cityState}) - Smarter.Poker`)}`,
    `X-WR-CALDESC:${escapeIcsText(`${guide.name} At ${guide.hostVenue}. Full Guide: ${canonicalUrl}`)}`,
  ];

  const baseDays = ['20270601', '20270605', '20270610', '20270615', '20270620'];

  (guide.keyEvents || []).forEach((ev, idx) => {
    const dayStr = baseDays[idx % baseDays.length];
    const uid = `${guide.slug}-event-${idx + 1}@smarter.poker`;
    const summary = `${guide.shortName}: ${ev.eventName} (${ev.buyIn})`;
    const description = [
      `Series: ${guide.name}`,
      `Venue: ${guide.hostVenue} (${guide.cityState})`,
      `Typical Schedule Window: ${guide.typicalMonths}`,
      `Buy-In: ${ev.buyIn} | Format: ${ev.format}`,
      `Strategy Note: ${ev.notes}`,
      `Late-Reg Strategy: ${guide.registrationStrategy}`,
      `Full Structure & Bankroll Guide: ${canonicalUrl}`,
    ].join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      'DTSTAMP:20261110T120000Z',
      `DTSTART;VALUE=DATE:${dayStr}`,
      `DTEND;VALUE=DATE:${dayStr}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `LOCATION:${escapeIcsText(`${guide.hostVenue}, ${guide.cityState}`)}`,
      `URL:${canonicalUrl}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return {
    filename: `smarter-poker-${guide.slug}.ics`,
    ics: lines.join('\r\n'),
    slug: guide.slug,
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { slug = 'wsop-las-vegas', partner = '' } = req.query || {};
  const built = buildSeriesCalendarIcs(slug);

  recordSeoTelemetryEvent({
    category: 'calendar_subscriptions',
    item: built.slug,
    partner: partner || req.headers?.referer || '',
    source: 'ics-feed',
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${built.filename}"`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  return res.status(200).send(built.ics);
}
