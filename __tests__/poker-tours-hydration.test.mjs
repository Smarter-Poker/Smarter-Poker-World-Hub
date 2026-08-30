import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getPokerCalendarDateKey,
  parseCalendarDate,
  parseStopDates,
  pokerCalendarStart,
} from '../src/utils/tourGeoUtils.js';

test('tour calendar dates use one site day across server and browser time zones', () => {
  const auditInstant = new Date('2026-08-30T06:00:00.000Z');
  assert.equal(getPokerCalendarDateKey(auditInstant), '2026-08-30');
  assert.equal(pokerCalendarStart(auditInstant).toISOString(), '2026-08-30T00:00:00.000Z');
  assert.equal(parseCalendarDate('2026-08-30').toISOString(), '2026-08-30T00:00:00.000Z');
  assert.equal(parseCalendarDate('2026-08-30T19:00:00Z').toISOString(), '2026-08-30T00:00:00.000Z');
  assert.equal(parseStopDates('Aug 27 - Aug 30').end.toISOString(), '2026-08-30T00:00:00.000Z');
});

test('Poker Tours does not compare date-only API values as local UTC instants', async () => {
  const page = await readFile(new URL('../pages/hub/poker-tours.js', import.meta.url), 'utf8');
  const card = await readFile(new URL('../src/components/poker-series/TourCard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /new Date\(s\.(?:start_date|end_date)\)/);
  assert.match(page, /parseCalendarDate\(s\.start_date\)/);
  assert.match(page, /pokerCalendarStart\(\)/);
  assert.match(card, /timeZone: 'UTC'/);
});
