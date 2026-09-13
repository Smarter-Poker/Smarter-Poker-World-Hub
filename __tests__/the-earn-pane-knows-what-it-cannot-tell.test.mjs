/**
 * /api/rewards/progress reports whether today's daily login is already
 * claimed, and what the next claim pays - and says "could not tell" rather
 * than "not claimed" when the read fails.
 *
 * Before 2026-09-13 the route computed `days.has(today)` and threw it away,
 * so the Club Arena wallet's Earn pane enabled "Claim Daily Diamonds" for a
 * player who had already claimed, and only the click told them. The
 * arithmetic now lives in src/lib/rewards/loginStreak.mjs, where a plain
 * `node --test` can reach it; the route only does the read.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { streakFromRows, nextLoginReward } from '../src/lib/rewards/loginStreak.mjs';
import { REWARDS } from '../src/config/diamondRewards.js';

/** Chicago-anchored YYYY-MM-DD for a Date, the same way the route does it. */
function chicago(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const NOW = new Date('2026-09-13T20:00:00Z'); // 15:00 Chicago
const day = (offset) => new Date(NOW.getTime() + offset * 86400000);
const rowsOn = (...offsets) => offsets.map((o) => ({ created_at: day(o).toISOString() }));

test('today claimed: streak counts today and claimedToday is true', () => {
  const r = streakFromRows(rowsOn(0, -1, -2), NOW);
  assert.deepEqual(r, { streak: 3, claimedToday: true });
});

test('today not yet claimed: the run ending yesterday is alive, claimedToday false', () => {
  const r = streakFromRows(rowsOn(-1, -2), NOW);
  assert.deepEqual(r, { streak: 2, claimedToday: false });
});

test('a broken run reports streak 0, and still knows today is unclaimed', () => {
  const r = streakFromRows(rowsOn(-3, -4), NOW);
  assert.deepEqual(r, { streak: 0, claimedToday: false });
});

test('no rows at all is streak 0, unclaimed', () => {
  const r = streakFromRows([], NOW);
  assert.deepEqual(r, { streak: 0, claimedToday: false });
});

test('the route returns null on a failed read, never a confident "not claimed" (10.86)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../pages/api/rewards/progress.js', import.meta.url), 'utf8');
  // The read failure branch returns null, the handler turns null into `partial`
  // and leaves loginClaimedToday null rather than false.
  assert.match(src, /Streak read failed[\s\S]*?return null;/);
  assert.match(src, /let loginClaimedToday = null;/);
  assert.match(src, /loginClaimedToday,\s*\n\s*nextLoginReward: nextLoginReward\(loginStreak\)/);
  assert.match(src, /import \{ streakFromRows, nextLoginReward \} from '..\/..\/..\/src\/lib\/rewards\/loginStreak.mjs'/);
});

test('the day boundary is Chicago, not UTC', async () => {
  // 03:00 UTC on the 14th is still the 13th in Chicago.
  const late = new Date('2026-09-14T03:00:00Z');
  assert.equal(chicago(late), chicago(NOW));
  const r = streakFromRows(rowsOn(0), late);
  assert.equal(r.claimedToday, true);
});

test('nextLoginReward follows the catalog: base, +increment per day, capped at max', () => {
  const { base, increment, max } = REWARDS.daily_login.scaling;
  assert.equal(nextLoginReward(0), base); // broken run: day 1 pays base
  assert.equal(nextLoginReward(1), base + increment); // day 2
  assert.equal(nextLoginReward(4), base + 4 * increment); // day 5
  assert.equal(nextLoginReward(10), max); // day 11 is the ceiling
  assert.equal(nextLoginReward(400), max);
  // And it is the same formula the claim route documents.
  assert.equal(REWARDS.daily_login.scaling.formula, 'min(5 + (streak - 1) * 2, 25)');
});

test('Escape backs out one layer of the wallet, not all of them', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(
    new URL('../src/components/store/DiamondWalletModal.jsx', import.meta.url),
    'utf8'
  );
  const handler = src.slice(src.indexOf('const handleKeyDown = (e) => {'), src.indexOf('window.addEventListener(\'keydown\', handleKeyDown);'));
  assert.match(handler, /if \(popupData\) \{\s*setPopupData\(null\);\s*return;/);
  assert.match(handler, /if \(confirmTransfer\) \{\s*setConfirmTransfer\(null\);\s*return;/);
  assert.ok(handler.indexOf('setConfirmTransfer(null)') < handler.indexOf('onClose();'));
  assert.match(src, /\}, \[isOpen, onClose, popupData, confirmTransfer\]\);/);
});

test('the transactions API takes the headline from the whole-ledger RPC', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(
    new URL('../pages/api/store/diamond-transactions.js', import.meta.url),
    'utf8'
  );
  assert.match(src, /rpc\('fn_diamond_lifetime_totals', \{ p_user_id: userId \}\)/);
  assert.match(src, /earned = e;\s*spent = sp;\s*exact = true;/);
  assert.match(src, /lifetime = \{\s*earned,\s*spent,[\s\S]*?exact,/);
});
