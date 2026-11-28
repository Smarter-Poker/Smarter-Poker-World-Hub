import test from 'node:test';
import assert from 'node:assert/strict';
import { localDay, localDayOffset, parseLedgerDay } from '../src/lib/bankroll/localDates.mjs';

// Written to hold in any process time zone: this file is also imported by
// __tests__/_test-guards-exist.test.mjs, so it must never change process.env.TZ.

test('late evening is still today in the viewer time zone', () => {
  const lateEvening = new Date(2026, 10, 27, 23, 30); // 11:30 PM Nov 27, local
  assert.equal(localDay(lateEvening), '2026-11-27');
  assert.equal(localDayOffset(0, lateEvening), '2026-11-27');
  assert.equal(localDayOffset(6, lateEvening), '2026-11-21');
  assert.equal(localDayOffset(29, lateEvening), '2026-10-29');
  // West of UTC this is exactly the case the old toISOString() date got wrong.
  if (lateEvening.getTimezoneOffset() > 30) assert.equal(lateEvening.toISOString().slice(0, 10), '2026-11-28');
});

test('offsets cross month, year and daylight-saving boundaries by calendar day', () => {
  assert.equal(localDayOffset(1, new Date(2026, 0, 1, 0, 5)), '2025-12-31');
  assert.equal(localDayOffset(1, new Date(2026, 2, 9, 0, 30)), '2026-03-08');
  assert.equal(localDayOffset(1, new Date(2026, 10, 2, 0, 30)), '2026-11-01');
});

test('a stored day parses as that calendar day, including Jan 1 for tax years', () => {
  const d = parseLedgerDay('2026-01-01');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 0);
  assert.equal(d.getDate(), 1);
  assert.equal(parseLedgerDay('2026-03-08').getDate(), 8);
  assert.equal(parseLedgerDay('2026-11-28T02:24:00Z').toISOString(), '2026-11-28T02:24:00.000Z');
  assert.ok(Number.isNaN(parseLedgerDay(null).getTime()));
  assert.ok(Number.isNaN(parseLedgerDay('').getTime()));
});
