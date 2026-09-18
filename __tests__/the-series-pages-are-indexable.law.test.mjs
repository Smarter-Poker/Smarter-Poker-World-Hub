/**
 * THE SERIES PAGES THE SITEMAP OFFERS ARE INDEXABLE (2026-09-18).
 *
 * The sitemap lists 246 /hub/series/[id] URLs — a fifth of every URL it
 * offers. Measured live on 2026-09-18, each of them served the LOADING
 * branch to a crawler: title "Poker Series Details", the placeholder site
 * description, `noindex, nofollow`, and about 75 words of chrome, because
 * the page fetched its series in the browser. A sitemap is a list of pages
 * worth indexing; a fifth of the crawl budget was being spent to tell
 * crawlers to go away.
 *
 * The head is now rendered on the server from the same public API the
 * browser uses. This pins that, and the description/title helpers, so the
 * placeholder cannot come back.
 *
 * Reads source files and a pure module; runs in the Build Safety Gate with
 * no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESCRIPTION_MAX,
  formatRange,
  isPublicSeries,
  originFrom,
  seriesDescription,
  seriesPath,
  seriesTitle,
  toSeoSeries,
  fetchSeries,
} from '../src/lib/poker-near-me/seriesSeo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PLACEHOLDER = 'Smarter.Poker - The Future Of The Game.';

const RAW = {
  id: 468,
  name: 'DeepStack Showdown (March) 2026',
  venue_name: 'Venetian Las Vegas',
  city: 'Las Vegas',
  state: 'NV',
  start_date: '2026-02-25',
  end_date: '2026-03-31',
  main_event_buyin: 1600,
  main_event_guaranteed: 500000,
  total_events: 0,
  events_count: 12,
};

test('the series page renders its head on the server, in every branch, with no placeholder', () => {
  const src = read('pages/hub/series/[id].js');
  assert.match(src, /export async function getServerSideProps\(\{ params, req, res \}\)/);
  assert.match(src, /fetchSeries\(params\?\.id, originFrom\(req\)\)/);
  assert.ok(!src.includes('title="Poker Series Details"'), 'the placeholder title is gone');
  assert.ok(!src.includes(PLACEHOLDER), 'the placeholder description is gone');
  // The loading branch and the not-found branch both render the shared head.
  const loading = src.indexOf('if (loading || !id) {');
  const notFound = src.indexOf('if (error || !series) {');
  assert.ok(loading > -1 && notFound > -1, 'the page keeps its loading and not-found branches');
  assert.ok(
    src.indexOf('<SeriesHead series={seoSeries} />', loading) > -1 &&
      src.indexOf('<SeriesHead series={seoSeries} />', loading) < notFound,
    'the loading branch renders the head'
  );
  assert.ok(src.indexOf('<SeriesHead series={seoSeries} />', notFound) > -1, 'the not-found branch renders the head');
  // Real 404 and 503, so a missing series leaves the index and an outage is retried.
  assert.match(src, /res\.statusCode = 404/);
  assert.match(src, /res\.statusCode = 503/);
  assert.match(src, /'Retry-After', '120'/);
  assert.match(src, /noindex=\{true\}/, 'a series with nothing to index stays out of the index');
});

test('a served series gets its own title, fitting description and self canonical', () => {
  const v = toSeoSeries(RAW);
  assert.equal(seriesTitle(v), 'DeepStack Showdown (March) 2026 At Venetian Las Vegas');
  const d = seriesDescription(v);
  assert.ok(d.length >= 60, `description is ${d.length} characters, the live contract needs 60+`);
  assert.ok(d.length <= DESCRIPTION_MAX, `description is ${d.length}, over ${DESCRIPTION_MAX}`);
  assert.match(d, /Venetian Las Vegas/);
  assert.match(d, /February 25 to March 31, 2026/);
  assert.match(d, /12 events/, 'a zero total_events must not hide a real events_count');
  assert.equal(seriesPath(v), '/hub/series/468');
  assert.equal(isPublicSeries(v), true);
});

test('the description keeps the series name when the name alone is long', () => {
  const long = toSeoSeries({ ...RAW, name: 'The Exceptionally Long Championship Festival Of Poker Series Presented By Somebody 2026' });
  const d = seriesDescription(long);
  assert.match(d, /^The Exceptionally Long Championship Festival Of Poker Series Presented By Somebody 2026/);
  assert.ok(d.length <= DESCRIPTION_MAX, `degraded description is ${d.length}, over ${DESCRIPTION_MAX}`);
  // Degrading drops the dates before it drops the venue or the name.
  assert.match(d, /Venetian Las Vegas/);
});

test('props are JSON-safe and a series with nothing to index is refused', () => {
  const v = toSeoSeries(RAW);
  for (const [k, val] of Object.entries(v)) assert.notEqual(val, undefined, `${k} must be null, never undefined`);
  assert.equal(toSeoSeries(null), null);
  assert.equal(toSeoSeries({ name: 'no id' }), null);
  assert.equal(isPublicSeries(toSeoSeries({ id: 9, name: '   ' })), false);
  assert.equal(isPublicSeries(null), false);
});

test('formatRange reads the API date shapes and refuses anything else', () => {
  assert.equal(formatRange('2026-02-25', '2026-03-31'), 'February 25 to March 31, 2026');
  assert.equal(formatRange('2026-07-04', '2026-07-04'), 'July 4, 2026');
  assert.equal(formatRange('2026-12-28', '2027-01-03'), 'December 28, 2026 to January 3, 2027');
  assert.equal(formatRange('2026-02-25', null), 'February 25, 2026');
  assert.equal(formatRange(null, null), null);
  assert.equal(formatRange('not-a-date', 'nope'), null);
});

test('the origin comes from the request, and a bad id never reaches the API', async () => {
  assert.equal(originFrom({ headers: { host: 'smarter.poker' } }), 'https://smarter.poker');
  assert.equal(originFrom({ headers: { host: 'localhost:3000' } }), 'http://localhost:3000');
  assert.equal(
    originFrom({ headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'smarter.poker' } }),
    'https://smarter.poker'
  );
  assert.equal(originFrom(undefined), 'https://smarter.poker');
  // An id that cannot be a series id is not-found without a network call.
  assert.deepEqual(await fetchSeries('../../etc/passwd', 'https://example.invalid'), {
    series: null,
    status: 'not-found',
  });
  assert.deepEqual(await fetchSeries('', 'https://example.invalid'), { series: null, status: 'not-found' });
});
