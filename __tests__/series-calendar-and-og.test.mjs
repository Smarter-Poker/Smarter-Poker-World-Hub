import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeriesIcs, buildGoogleCalendarUrl } from '../src/lib/poker-near-me/calendarExport.mjs';

test('buildSeriesIcs creates a compliant RFC 5545 iCalendar string', () => {
  const series = {
    id: 500100,
    name: 'World Poker Open',
    startDate: '2026-06-10',
    endDate: '2026-06-25',
    venue: 'Borgata Hotel Casino',
    city: 'Atlantic City',
    state: 'NJ',
    total_events: 42,
    main_event_guaranteed: 1000000,
  };

  const ics = buildSeriesIcs(series);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('\r\nEND:VCALENDAR'));
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /SUMMARY:World Poker Open/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260610/);
  // Non-inclusive end date for full day event should be +1 day
  assert.match(ics, /DTEND;VALUE=DATE:20260626/);
  assert.match(ics, /LOCATION:Borgata Hotel Casino\\, Atlantic City\\, NJ/);
  assert.match(ics, /URL:https:\/\/smarter\.poker\/hub\/series\/500100/);
});

test('buildSeriesIcs handles single-day or missing end date', () => {
  const series = {
    id: 999,
    name: 'One Day Poker Special',
    startDate: '2026-08-15',
    endDate: null,
  };

  const ics = buildSeriesIcs(series);
  assert.match(ics, /DTSTART;VALUE=DATE:20260815/);
  assert.match(ics, /DTEND;VALUE=DATE:20260816/);
});

test('buildSeriesIcs returns null when series has no name or start date', () => {
  assert.equal(buildSeriesIcs(null), null);
  assert.equal(buildSeriesIcs({ name: 'No Date' }), null);
  assert.equal(buildSeriesIcs({ startDate: '2026-08-15' }), null);
});

test('buildGoogleCalendarUrl generates a valid web intent URL', () => {
  const series = {
    id: 468,
    name: 'DeepStack Showdown',
    startDate: '2026-02-25',
    endDate: '2026-03-31',
    venue: 'Venetian',
    city: 'Las Vegas',
    state: 'NV',
  };

  const urlStr = buildGoogleCalendarUrl(series);
  assert.ok(urlStr.startsWith('https://calendar.google.com/calendar/render?'));
  const url = new URL(urlStr);
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'DeepStack Showdown');
  assert.equal(url.searchParams.get('dates'), '20260225/20260401');
  assert.equal(url.searchParams.get('location'), 'Venetian, Las Vegas, NV');
  assert.match(url.searchParams.get('details'), /https:\/\/smarter\.poker\/hub\/series\/468/);
});
