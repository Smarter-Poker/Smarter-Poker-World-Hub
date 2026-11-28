import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SCHEDULE_STALE_AFTER_DAYS,
  describeVenueScheduleFreshness,
  venueScheduleFreshnessCopy,
} from '../src/lib/poker-near-me/venueScheduleFreshness.mjs';

// Regression for /hub/venues/1828 (Lodge Austin), seen live 2026-11-28:
// "Data Last Updated: Aug 14, 2026" above "Tournament Schedule Data Is Being
// Collected For This Venue", while PokerAtlas said every day that the room
// lists no tournaments.

const NOW = Date.parse('2026-11-28T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

test('the Lodge as stored today reads as out of date, not as being collected', () => {
  const lodge = {
    last_scraped: '2026-08-14T07:41:15.237Z',
    schedule_last_scraped_at: '2026-09-06T10:59:54.099Z',
    scrape_status: 'complete',
  };
  const freshness = describeVenueScheduleFreshness(lodge, [], NOW);
  assert.equal(freshness.status, 'not_current');
  // The collector's read, not the legacy last_scraped column.
  assert.equal(freshness.verified_at, '2026-09-06T10:59:54.099Z');
  const copy = venueScheduleFreshnessCopy(freshness);
  assert.equal(copy.badge, 'Schedule Last Verified Sep 6, 2026 · May Be Out Of Date');
  assert.equal(copy.emptyMessage, 'No Current Tournament Schedule Is Available For This Venue.');
  assert.equal(copy.isStale, true);
});

test('a source-confirmed empty read is current and says no tournaments are listed', () => {
  const venue = { schedule_last_scraped_at: iso(NOW - day), scrape_status: 'no_tournaments' };
  const freshness = describeVenueScheduleFreshness(venue, [], NOW);
  assert.equal(freshness.status, 'verified_empty');
  const copy = venueScheduleFreshnessCopy(freshness);
  assert.equal(copy.badge, 'Schedule Last Verified Nov 27, 2026');
  assert.equal(copy.emptyMessage, 'No Tournaments Are Currently Listed For This Venue.');
  assert.equal(copy.isStale, false);
});

test('a confirmed empty read older than the threshold is called out', () => {
  const venue = {
    schedule_last_scraped_at: iso(NOW - (SCHEDULE_STALE_AFTER_DAYS + 1) * day),
    scrape_status: 'no_tournaments',
  };
  const freshness = describeVenueScheduleFreshness(venue, [], NOW);
  assert.equal(freshness.status, 'stale_empty');
  assert.match(venueScheduleFreshnessCopy(freshness).badge, /May Be Out Of Date$/);
});

test('rows verify the schedule at their newest read', () => {
  const rows = [
    { last_scraped: iso(NOW - 3 * day) },
    { last_scraped: iso(NOW - 2 * day) },
  ];
  const venue = { schedule_last_scraped_at: iso(NOW - 40 * day) };
  const freshness = describeVenueScheduleFreshness(venue, rows, NOW);
  assert.equal(freshness.status, 'current');
  assert.equal(freshness.verified_at, iso(NOW - 2 * day));
  assert.equal(describeVenueScheduleFreshness(venue, [{ last_scraped: iso(NOW - 9 * day) }], NOW).status, 'stale');
});

test('a never-read venue gets no badge and never claims collection is in progress', () => {
  const freshness = describeVenueScheduleFreshness({ last_scraped: '2026-08-14T00:00:00Z' }, [], NOW);
  assert.equal(freshness.status, 'unknown');
  assert.equal(freshness.verified_at, null);
  const copy = venueScheduleFreshnessCopy(freshness);
  assert.equal(copy.badge, null);
  assert.equal(copy.emptyMessage, 'No Tournament Schedule Is Available For This Venue Yet.');
  assert.equal(copy.emptyMessage.includes('Being Collected'), false);
});

test('future or invalid timestamps never count as a verified read', () => {
  const venue = { schedule_last_scraped_at: iso(NOW + 2 * day), scrape_status: 'no_tournaments' };
  // Rows without a usable read time are shown but never called current.
  assert.equal(describeVenueScheduleFreshness(venue, [{ last_scraped: 'not a date' }], NOW).status, 'stale');
  assert.equal(describeVenueScheduleFreshness(venue, [], NOW).status, 'unknown');
});

test('read errors keep their own message', () => {
  const copy = venueScheduleFreshnessCopy({ status: 'unknown', verified_at: null }, { readError: true });
  assert.equal(copy.emptyMessage, 'Tournament Schedule Could Not Be Loaded. Please Try Again.');
});

test('all copy is Title Case without em dashes', () => {
  const states = ['current', 'stale', 'verified_empty', 'stale_empty', 'not_current', 'unknown'];
  for (const status of states) {
    const copy = venueScheduleFreshnessCopy({ status, verified_at: iso(NOW) });
    for (const text of [copy.badge, copy.emptyMessage].filter(Boolean)) {
      assert.equal(text.includes('—'), false, text);
      for (const word of text.replace(/[.,·]/g, ' ').split(/\s+/).filter(Boolean)) {
        if (/^\d/.test(word)) continue;
        assert.match(word, /^[A-Z]/, `${status}: "${word}" in "${text}"`);
      }
    }
  }
});

test('the venue page and API read the shared freshness, not the legacy column', () => {
  const page = fs.readFileSync(new URL('../pages/hub/venues/[id].js', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../pages/api/poker/venues.js', import.meta.url), 'utf8');
  assert.equal(page.includes('Being Collected For This Venue'), false);
  assert.equal(page.includes('Data Last Updated'), false);
  assert.match(page, /overrides\.schedule_freshness = describeVenueScheduleFreshness\(data, qualifiedRows\)/);
  assert.match(page, /venueScheduleFreshnessCopy\(venue\.schedule_freshness/);
  assert.match(api, /venue\.schedule_freshness = describeVenueScheduleFreshness\(venue, freshnessRows\)/);
});
