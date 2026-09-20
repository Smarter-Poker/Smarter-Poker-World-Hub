/**
 * A SERIES PAGE LISTS ITS EVENTS (AEO phase 3, 2026-09-19).
 *
 * Ten series pages sampled on production as OAI-SearchBot with scripts
 * stripped served between 129 and 150 words, median 139, and every one of
 * them ended with the same sentence: "Loading Series Details...". Above it,
 * in the server rendered summary, the page said:
 *
 *     "The Full Schedule, Buy-Ins, Guarantees And Results For <series>
 *      Are Listed Below."
 *
 * They were not. The schedule is fetched over SWR after mount, so a crawler
 * that does not run JavaScript got the promise and nothing else, on all 225
 * series pages in the sitemap.
 *
 * The events were not missing. getServerSideProps already awaits
 * /api/poker/series, which returns them, filtered to servable quality by the
 * API itself. toSeoSeries was dropping them while building the props.
 *
 * Measured across all 225: 68 series publish an event list, 1,544 events in
 * total, the largest 182 and the median 12.
 *
 * THIS LAW: the events survive the trip from the API into the props; the
 * page renders them rather than counting them; the promise is made only by
 * a page that keeps it; and no event reaches the graph without a date and a
 * place. That last rule is the one the series schema was built on and the
 * one the tour stops follow.
 *
 * Reads source and exercises the pure functions; no install, no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSeoSeries, toSeoEvents, seriesSchema, SEO_EVENT_LIMIT } from '../src/lib/poker-near-me/seriesSeo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** A series shaped like the ones the API actually returns. */
const apiRow = (overrides = {}) => ({
  id: 5000693,
  name: '2026 Wynn April Signature Series',
  city: 'Las Vegas',
  state: 'NV',
  venue_name: 'Wynn Las Vegas',
  start_date: '2026-04-20',
  end_date: '2026-04-30',
  events: [
    { event_name: '$400 NLH 1A $100K GTD', start_date: '2026-04-20', start_time: '11:00:00', buy_in: 400, guarantee: 100000, game_type: 'NL Holdem' },
    { event_name: '$600 NLH Championship', start_date: '2026-04-25', start_time: '12:00:00', buy_in: 600 },
    { event_name: 'Event With No Date', buy_in: 250 },
    { event_name: '', start_date: '2026-04-26' },
  ],
  ...overrides,
});

test('the events survive the trip from the API into the props', () => {
  const series = toSeoSeries(apiRow());
  assert.ok(Array.isArray(series.events), 'toSeoSeries carries the schedule');
  assert.equal(series.events.length, 3, 'an event with no name has nothing to show and is dropped');
  assert.equal(series.events[0].name, '$400 NLH 1A $100K GTD');
  assert.equal(series.events[0].startTime, '11:00', 'seconds are not a start time a reader needs');
  assert.equal(series.events[0].buyin, 400);
});

test('the schedule is ordered, and capped by the page rather than the data', () => {
  const shuffled = toSeoEvents([
    { event_name: 'Third', start_date: '2026-04-25' },
    { event_name: 'First', start_date: '2026-04-20', start_time: '11:00:00' },
    { event_name: 'Second', start_date: '2026-04-20', start_time: '17:00:00' },
  ]);
  assert.deepEqual(shuffled.map((e) => e.name), ['First', 'Second', 'Third']);

  const many = toSeoEvents(Array.from({ length: SEO_EVENT_LIMIT + 50 }, (_, i) => ({
    event_name: `Event ${i}`,
    start_date: '2026-04-20',
  })));
  assert.equal(many.length, SEO_EVENT_LIMIT);
  assert.ok(SEO_EVENT_LIMIT >= 100, 'the largest series in the directory publishes 182 events; '
    + 'a cap under 100 would hide the schedule of a series that has one');
});

test('no event reaches the graph without a date and a place', () => {
  const withPlace = seriesSchema(toSeoSeries(apiRow()));
  const series = withPlace.find((node) => node['@type'] === 'EventSeries');
  assert.ok(series, 'the series itself is published');
  assert.equal(series.subEvent.length, 2, 'only the two events that carry a date');
  for (const event of series.subEvent) {
    assert.ok(event.startDate, `${event.name} has no startDate`);
    assert.ok(event.location?.name, `${event.name} has no location`);
    assert.equal(event.superEvent['@id'], series['@id'], 'and it belongs to this series');
  }

  // A series with nowhere to be is published as a page and nothing more, and
  // its events go with it. This is the rule the series schema was built on.
  const nowhere = seriesSchema(toSeoSeries(apiRow({ city: null, state: null, venue_name: null, venue: null })));
  assert.equal(
    nowhere.some((node) => node['@type'] === 'EventSeries'),
    false,
    'no location means no Event, and therefore no sub events either',
  );
});

test('the page renders the schedule and promises it only when it has one', () => {
  const page = read('pages/hub/series/[id].js');

  assert.match(page, /events\.map\(/, 'the schedule is rendered, not only counted');
  assert.match(page, /const events = Array\.isArray\(series\.events\)/, 'from the server props');

  const promise = page.match(/The Schedule For \{series\.name\} Is Below/);
  assert.ok(promise, 'the copy still says the schedule is below');
  assert.match(
    page.slice(Math.max(0, promise.index - 400), promise.index),
    /events\.length > 0/,
    'and it says so inside a branch that checked there is one',
  );
  assert.match(
    page,
    /Has Not Been Published Yet/,
    'and a series with no schedule says that instead of promising one',
  );
});

test('the trail climbs to the directory that lists every series', () => {
  const lib = read('src/lib/poker-near-me/seriesSeo.mjs');
  const trail = lib.match(/const trail = \[[\s\S]*?\];/);
  assert.ok(trail, 'the breadcrumb trail is still built here');
  assert.match(
    trail[0],
    /'\/hub\/poker-series'/,
    'the parent of a series page is the series directory. It pointed at '
      + '/hub/poker-near-me/series, the Poker Near Me tab, which is the near '
      + 'you view and not the index.',
  );
});
