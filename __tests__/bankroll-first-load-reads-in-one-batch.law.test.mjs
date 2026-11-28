// The Bankroll Manager's first load: one parallel batch, and no empty flash.
//
// Measured on production 2026-11-28 (bankroll-live phone speed, Lighthouse
// mobile: 4x CPU, Slow 4G): every request pays ~562ms before its first byte.
// fetchSeries was awaited AFTER the stats / ledger / trips / venues batch, and
// isLoading only clears once loadData finishes, so the stat tiles and the
// trend chart waited one extra round trip on every load for a read that has
// no dependency on the others. It is now part of the batch, and a failed
// series read still degrades to [] (rows stay grouped, never shown loose).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../pages/hub/bankroll-manager.js', import.meta.url), 'utf8');
const start = page.indexOf('const loadData = useCallback(async () => {');
const body = page.slice(start, page.indexOf('}, [userId, authInitializing, locationFilter, timeFilter, reportScope]);', start));

test('loadData reads series inside the first Promise.all, never after it', () => {
  assert.ok(start > 0 && body.length > 0, 'loadData not found');
  const batch = body.match(/await Promise\.all\(\[([\s\S]*?)\n\s*\]\);/);
  assert.ok(batch, 'loadData has no Promise.all batch');
  for (const read of ['getBankrollStats(', 'fetchReportLedger(', 'fetchTrips(', 'getUserLocations(', 'fetchSeries(']) {
    assert.ok(batch[1].includes(read), `${read} is in the first-load batch`);
  }
  assert.equal((body.match(/\bawait\b/g) || []).length, 1, 'loadData awaits exactly once: one batch, no waterfall');
});

test('a failed series read still degrades to an empty list, not a failed load', () => {
  assert.match(body, /fetchSeries\(userId\)\.catch\(\(e\) => \{\s*console\.warn\('Could not load series:', e\);\s*return \[\];\s*\}\)/);
});

// The same measurement showed the trend region reporting "No Data For This
// Period" about two seconds BEFORE the stat tiles had values: with no user yet
// (the session still restoring), loadData took its signed-out branch and
// cleared the skeleton, so every signed-in load flashed an empty dashboard.
test('no user while the session is restoring keeps the skeleton; signed out still clears it', () => {
  assert.match(page, /const \{ user, initializing: authInitializing \} = useAvatar\(\);/);
  const guard = body.indexOf('if (!userId && authInitializing) return;');
  const signedOut = body.indexOf('if (!userId) {');
  assert.ok(guard > 0 && guard < signedOut, 'the restoring-session guard runs before the signed-out branch');
  assert.match(body.slice(signedOut, signedOut + 300), /setIsLoading\(false\)/, 'a signed-out visitor still leaves the skeleton');
});
