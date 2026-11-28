// Toke Tracker standalone pages (pages/hub/toke-tracker/**): Venue Intel,
// Dealer Vault, Annual Tax Summary, Event Calendar and shared preferences.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rankVenues, gameTypeStats, tournamentBrackets, buyInBracket, careerTotals, venueKey,
} from '../src/lib/bankroll/tokeVenueStats.mjs';
import {
  form1099NecThreshold, venue1099Alerts, taxYearOptions, defaultTaxYear, taxYearSummary,
  formatMileageRates, vaultFileType, vaultCanPreview, licenseExpiry,
} from '../src/lib/bankroll/dealerTax.mjs';
import { computeTotalHours } from '../src/lib/bankroll/tokeReport.mjs';
import {
  DEFAULT_TOKE_PREFS, mergePrefs, readStoredPrefs, writeStoredPrefs, withTokePrefs, TOKE_PREFS_KEY,
} from '../src/lib/bankroll/tokePrefs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const at = (h, m = 0) => new Date(2026, 5, 10, h, m).toISOString();
const down = (type, start, end, toke, extra = {}) => ({ down_type: type, started_at: start, ended_at: end, toke_amount: toke, ...extra });

const gigA = {
  venue_name: 'Bellagio', start_date: '2026-06-10', status: 'completed',
  downs: [
    down('cash', at(10), at(10, 30), 40, { game_type: 'PLO' }),
    down('break', at(10, 30), at(10, 50), 0),
    down('tournament', at(11), at(11, 30), 25, { down_multiplier: 2, tournament_buyin: '250' }),
  ],
};
const gigB = { venue_name: ' bellagio  ', start_date: '2026-06-11', downs: [down('cash', at(12), at(13), 60)] };

test('venue hours are paid hours, the same figure Analytics uses', () => {
  const [row] = rankVenues([gigA, gigB]);
  const expected = computeTotalHours(gigA.downs) + computeTotalHours(gigB.downs);
  assert.equal(row.paidHours, Math.round(expected * 100) / 100);
  // 30m cash + 20m break + 30m x2 tournament + 60m cash = 170 minutes = 2.83 paid hours.
  assert.equal(row.paidHours, 2.83);
  assert.equal(row.totalTokes, 125);
  assert.equal(row.tokePerHr, Math.round((125 / expected) * 100) / 100);
  const career = careerTotals([gigA, gigB]);
  assert.equal(career.tokesPerHour, row.tokePerHr);
});

test('one venue typed two ways is one venue', () => {
  const rows = rankVenues([gigA, gigB]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].events, 2);
  assert.equal(venueKey('').display, 'Unknown Venue');
});

test('venues rank by the chosen measure', () => {
  const small = { venue_name: 'Aria', downs: [down('cash', at(9), at(9, 6), 30)] };
  assert.equal(rankVenues([gigA, gigB, small], 'toke_hr')[0].venue, 'Aria');
  assert.equal(rankVenues([gigA, gigB, small], 'total')[0].venue, 'Bellagio');
  assert.equal(rankVenues([gigA, gigB, small], 'events')[0].venue, 'Bellagio');
});

test('a break is not a game type', () => {
  const rows = gameTypeStats([gigA, gigB]);
  assert.deepEqual(rows.map((r) => r.gameType).sort(), ['Holdem', 'PLO', 'tournament']);
  assert.equal(rows.find((r) => r.gameType === 'PLO').avgTokePerDown, 40);
});

test('buy-ins bracket by lower bound and accept text', () => {
  assert.equal(buyInBracket('250').label, '$250-$499');
  assert.equal(buyInBracket(99.995).label, '<$100');
  assert.equal(buyInBracket('$1,100').label, '$1k+');
  assert.equal(buyInBracket(''), null);
  assert.equal(tournamentBrackets([gigB]), null);
  assert.deepEqual(tournamentBrackets([gigA]).map((b) => [b.label, b.totalDowns, b.avgTokePerDown]), [['$250-$499', 1, 25]]);
});

test('the 1099-NEC threshold is $600 through 2025 and $2,000 from 2026', () => {
  assert.equal(form1099NecThreshold(2025), 600);
  assert.equal(form1099NecThreshold(2026), 2000);
  assert.equal(form1099NecThreshold(2027), 2000);
  const gigs = [
    { venue_name: 'Wynn', start_date: '2026-03-01', totalTokes: 900 },
    { venue_name: 'Wynn', start_date: '2025-03-01', totalTokes: 900 },
    { venue_name: 'Venetian', start_date: '2026-04-01', totalTokes: 1500 },
    { venue_name: 'venetian', start_date: '2026-05-01', totalTokes: 600 },
  ];
  assert.deepEqual(venue1099Alerts(gigs, 2026), [{ venue: 'Venetian', total: 2100, threshold: 2000 }]);
  assert.deepEqual(venue1099Alerts(gigs, 2025), [{ venue: 'Wynn', total: 900, threshold: 600 }]);
});

test('the tax summary values mileage at each event date and never has an empty year list', () => {
  const gigs = [
    { venue_name: 'Wynn', start_date: '2026-03-01', totalTokes: 1000, mileage: 100, expenses: [{ category: 'food', amount: '20.50' }] },
    { venue_name: 'Wynn', start_date: '2026-08-01', totalTokes: 1200, mileage: 100, expenses: [] },
  ];
  const sum = taxYearSummary(gigs, 2026);
  assert.equal(sum.mileageDeduction, 72.5 + 76);
  assert.equal(formatMileageRates(sum.mileageRates), '$0.725-$0.76');
  assert.equal(sum.totalExpenses, 20.5);
  assert.equal(sum.netTaxable, Math.round((2200 - 20.5 - 148.5) * 100) / 100);
  assert.equal(sum.venues[0].meets1099, true);
  assert.deepEqual(taxYearOptions([], 2026), [2026]);
  assert.deepEqual(taxYearOptions(gigs, 2027), [2027, 2026]);
  assert.equal(defaultTaxYear(gigs, 2027), 2026);
  assert.equal(defaultTaxYear([], 2027), 2027);
});

test('a fallback toke total counts dealing downs only', () => {
  const sum = taxYearSummary([{ venue_name: 'X', start_date: '2026-01-02', days: [{ downs: [down('cash', at(1), at(2), 10), down('break', at(2), at(3), 5)] }] }], 2026);
  assert.equal(sum.totalTokes, 10);
});

test('vault files are typed by name when the picker leaves the type empty', () => {
  assert.equal(vaultFileType({ type: '', name: 'W2.PDF' }), 'application/pdf');
  assert.equal(vaultFileType({ type: '', name: 'card.jpg' }), 'image/jpeg');
  assert.equal(vaultFileType({ type: 'image/jpg', name: 'x' }), 'image/jpeg');
  assert.equal(vaultFileType({ type: 'video/mp4', name: 'x.jpg' }), null);
  assert.equal(vaultFileType({ type: '', name: 'notes.txt' }), null);
  assert.equal(vaultCanPreview('image/heic'), false);
  assert.equal(vaultCanPreview('image/png'), true);
});

test('license expiry counts calendar days', () => {
  assert.equal(licenseExpiry('2026-11-27', '2026-11-27').label, 'Expires Today');
  assert.equal(licenseExpiry('2026-11-28', '2026-11-27').label, 'Expires Tomorrow');
  assert.equal(licenseExpiry('2026-12-07', '2026-11-27').label, 'Expires In 10 Days');
  assert.equal(licenseExpiry('2026-11-26', '2026-11-27').state, 'expired');
  assert.equal(licenseExpiry('2027-06-01', '2026-11-27').state, 'active');
  assert.equal(licenseExpiry(null).label, 'No Expiry');
});

test('preferences merge known booleans only and keep other profile settings', () => {
  assert.deepEqual(mergePrefs({ downTimerAlerts: false }, { junk: 1, shiftNotifications: 'no' }), { ...DEFAULT_TOKE_PREFS, downTimerAlerts: false });
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readStoredPrefs(storage), null);
  writeStoredPrefs(storage, { autoSaveShifts: false });
  assert.equal(readStoredPrefs(storage).autoSaveShifts, false);
  store.set(TOKE_PREFS_KEY, '{bad');
  assert.equal(readStoredPrefs(storage), null);
  assert.deepEqual(withTokePrefs({ theme: 'dark' }, { downTimerAlerts: false }), { theme: 'dark', tokeTracker: { ...DEFAULT_TOKE_PREFS, downTimerAlerts: false } });
});

test('every Toke Tracker page reads preferences through the shared hook', () => {
  for (const page of ['index', 'shift', 'analytics', 'vault', 'venues']) {
    const src = read(`pages/hub/toke-tracker/${page}.js`);
    assert.match(src, /useTokePrefs\(userId\)/, page);
    assert.doesNotMatch(src, /localStorage\.getItem\('toke-tracker-prefs'\)/, page);
  }
  assert.match(read('src/components/bankroll/toke/useTokePrefs.js'), /from\('profiles'\)\.select\('settings'\)/);
});

test('the vault page does not pass a failed gig read off as no events', () => {
  const page = read('pages/hub/toke-tracker/vault.js');
  assert.match(page, /status=\{gigStatus\}/);
  const modal = read('src/components/bankroll/TaxSummaryModal.jsx');
  assert.match(modal, /Your Completed Events Could Not Be Loaded\./);
  assert.doesNotMatch(modal, /IRS_MILEAGE_RATES/);
});

test('a vault upload whose record fails takes its file back out', () => {
  const vault = read('src/components/bankroll/DealerVault.jsx');
  assert.match(vault, /if \(dbError\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*await removeBankrollObject\(supabase, fileUrl\);/);
  assert.doesNotMatch(vault, /\{doc\.amount && /, 'an amount of 0 rendered a stray 0');
});

test('a calendar delete that removed nothing is not reported as deleted', () => {
  const sel = read('src/lib/bankroll/calendarSelectors.ts');
  assert.match(sel, /\.delete\(\)\s*\.eq\('id', eventId\)\s*\.select\('id'\)/);
  assert.match(sel, /if \(!data \|\| data\.length === 0\) throw/);
});
