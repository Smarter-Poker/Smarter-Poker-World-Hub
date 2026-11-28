import test from 'node:test';
import assert from 'node:assert/strict';
import { localDay, localDayOffset, parseLedgerDay } from '../src/lib/bankroll/localDates.mjs';
process.env.TZ = 'America/Chicago';

// Run under TZ=America/Chicago (set below) so the UTC/local split is real.
test('evening in Chicago is still today, not tomorrow', () => {
  const evening = new Date('2026-11-28T02:24:00Z'); // 8:24 PM Nov 27 CST
  assert.equal(evening.toISOString().slice(0, 10), '2026-11-28');
  assert.equal(localDay(evening), '2026-11-27');
  assert.equal(localDayOffset(6, evening), '2026-11-21');
  assert.equal(localDayOffset(0, evening), '2026-11-27');
});

test('a stored day parses as that calendar day, including Jan 1 for tax years', () => {
  const d = parseLedgerDay('2026-01-01');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 0);
  assert.equal(d.getDate(), 1);
  assert.equal(new Date('2026-01-01').getFullYear(), 2025); // the old parse
  assert.ok(Number.isNaN(parseLedgerDay(null).getTime()));
});
