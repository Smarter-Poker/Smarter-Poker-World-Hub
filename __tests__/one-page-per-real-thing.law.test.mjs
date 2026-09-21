/**
 * ONE PAGE PER REAL THING (AEO phase 3, 2026-09-18).
 *
 * #1897 stopped the sitemap offering two URLs for one series, and left the
 * rest for the owner because the two records disagree on data and picking
 * the wrong one would consolidate onto the worse figures.
 *
 * That was over-cautious: the repository had already decided. The comment on
 * reconcileTournamentSeriesEvidence in seriesRouteIdentity.mjs says it
 * outright, and has for longer than this programme has existed:
 *
 *   "Reconcile duplicate records from the two legacy series tables WITHOUT
 *    CHANGING THE PUBLIC ROUTE IDENTITY. poker_series may replace metadata
 *    only when it is a newer observation of the exact same source URL with a
 *    real source hash."
 *
 * tournament_series owns the route. poker_series supplies fresher metadata
 * and never the identity. The same function also decides the guarantee field
 * that made this look risky: it only takes poker_series' number when that row
 * is a newer observation of the same source URL. So the answer was in the
 * code, and the consolidation is finished here rather than asked about.
 *
 * FIVE DUPLICATE TITLES REMAINED ON PRODUCTION
 *
 *   /hub/tours/ROUGHRIDER, /hub/tours/RRPT       one tour, two codes
 *   /hub/series/479,  /hub/series/5001069        a uid that POINTS
 *   /hub/series/593,  /hub/series/5001068        the same
 *   /hub/series/5001035, /hub/series/5001036     NOT duplicates, see below
 *   /hub/series/5001037, /hub/series/5001039     NOT duplicates, see below
 *
 * Causes, fixed here: the poker_series pass never deduped against itself,
 * tours were never deduped at all, a dropped duplicate still declared
 * itself canonical instead of pointing at the page that was kept, and a
 * poker_series row can carry the bare integer id of the tournament_series
 * row it mirrors instead of a uid, which no uid-to-uid comparison can see.
 *
 * THE TRAILBLAZER PAGES ARE NOT DUPLICATES
 *
 * They were called duplicates when only their titles were compared, and the
 * data says otherwise:
 *
 *   5001035  pa_trailblazer-satellite-leaderboard-texas-card-house-dallas-2026
 *   5001036  pa_trailblazer-satellite-leaderboard-tch-social-las-colinas-irving-2026
 *
 * Different uids, different venues, two real series that share a name. What
 * they share is an EMPTY venue column, so seriesTitle has nothing to
 * distinguish them with and falls back to the name alone. The venue is
 * sitting in the uid slug, and parsing a display name out of a slug is a
 * guess this programme has been burned by often enough. The rows need their
 * venue filled in; that is a data repair, and merging the pages or inventing
 * a venue would hide it.
 *
 * Reads source files and exercises the helpers; no network, no database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registryCodeForTour } from '../src/lib/seo/tourPageSeo.js';
import { seriesPath, seriesSelfPath, toSeoSeries } from '../src/lib/poker-near-me/seriesSeo.mjs';
import { tournamentSeriesIdFromPointerUid } from '../src/lib/poker-near-me/seriesRouteIdentity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const REGISTRY = JSON.parse(read('data/tour-source-registry.json')).tours;

test('the sitemap offers one URL per series, across the tables and within each', () => {
  const src = read('pages/sitemap.xml.js');
  // Both passes must consult AND populate the claimed set: the Trailblazer
  // pairs were both poker_series rows, and only the first pass was adding.
  const pokerPass = src.slice(src.indexOf("results[1].status === 'fulfilled'"), src.indexOf("results[2].status"));
  assert.match(pokerPass, /claimedUids\.has\(uid\)/, 'the poker_series pass checks the claimed uids');
  assert.match(pokerPass, /claimedUids\.add\(uid\)/, 'the poker_series pass also claims its own uids');
});

test('the sitemap offers one URL per tour', () => {
  const src = read('pages/sitemap.xml.js');
  assert.match(src, /claimedTourNames/, 'tours are deduped by name');
  assert.match(src, /select: 'tour_code, tour_name'/, 'the tour query reads the name it dedupes on');
});

test('a tour held under two codes points at the registry code', () => {
  // The live pair: same name, same official website, two codes.
  assert.equal(
    registryCodeForTour(
      { code: 'RRPT', name: 'Roughrider Poker Tour', website: 'https://roughriderpokertour.com' },
      REGISTRY,
    ),
    'ROUGHRIDER',
  );
  // The registry's own code keeps itself.
  assert.equal(registryCodeForTour({ code: 'ROUGHRIDER', name: 'Roughrider Poker Tour' }, REGISTRY), null);
  // A tour the registry does not know keeps itself rather than guessing.
  assert.equal(registryCodeForTour({ code: 'WPTPRIME', name: 'WPT Prime' }, REGISTRY), null);
  // A matching name with a conflicting website is not the same tour.
  assert.equal(
    registryCodeForTour(
      { code: 'FAKE', name: 'Roughrider Poker Tour', website: 'https://not-the-same-tour.example' },
      REGISTRY,
    ),
    null,
  );
});

test('a duplicate series page canonicals to the row that owns the route', () => {
  const duplicate = toSeoSeries({ id: 5000692, name: 'A Series', series_uid: 'pa_x' });
  assert.equal(duplicate.seriesUid, 'pa_x');
  assert.equal(seriesPath(duplicate), '/hub/series/5000692', 'with no primary found it keeps itself');

  duplicate.canonicalId = '470';
  assert.equal(seriesPath(duplicate), '/hub/series/470', 'the canonical points at the primary');
  assert.equal(seriesSelfPath(duplicate), '/hub/series/5000692', 'the page still knows its own URL');
});

test('the series page looks the primary up, and fails open', () => {
  const src = read('pages/hub/series/[id].js');
  assert.match(src, /primarySeriesRouteId/);
  assert.match(src, /from\('tournament_series'\)/, 'it asks the table that owns the route');
  assert.match(src, /isPokerSeriesRouteId/, 'only a poker_series route can be a duplicate');
  assert.match(src, /catch \(e\)/, 'a lookup that cannot run leaves the page canonical to itself');
});

test('the rule this follows is the one the repository already stated', () => {
  // If that comment ever stops saying this, the consolidation above is
  // following a rule that no longer exists and must be revisited.
  const identity = read('src/lib/poker-near-me/seriesRouteIdentity.mjs');
  assert.match(identity, /without\s*\n?\s*\*?\s*changing the public route identity/i);
});

test('a uid that is a bare integer is read as a pointer, not as a uid', () => {
  // The live pair: /hub/series/5001068 carried series_uid "593".
  assert.equal(tournamentSeriesIdFromPointerUid('593'), 593);
  assert.equal(tournamentSeriesIdFromPointerUid('479'), 479);
  assert.equal(tournamentSeriesIdFromPointerUid(' 12 '), 12);
  // A real scraper uid is not a pointer.
  assert.equal(tournamentSeriesIdFromPointerUid('pa_2026-winnin-o-the-green'), null);
  // Nor is anything that is not a positive integer.
  for (const bad of ['', '0', '-3', 'abc', null, undefined, 12]) {
    assert.equal(tournamentSeriesIdFromPointerUid(bad), null, String(bad));
  }
});

test('the sitemap and the page both follow a pointer uid', () => {
  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /tournamentSeriesIdFromPointerUid/);
  assert.match(sitemap, /offeredSeriesIds\.has/, 'a pointer is only honoured when its target was actually offered');

  const page = read('pages/hub/series/[id].js');
  assert.match(page, /tournamentSeriesIdFromPointerUid\(series\.seriesUid\)/);
});
