/**
 * A SERIES PAGE CARRIES ITS SCHEMA (AEO phase 3, 2026-09-18).
 *
 * The 246 series pages the sitemap offers are a fifth of every URL on it.
 * After #1889 made them render on the server they are good pages: a median
 * of 141 words, a title, a description, a canonical and an h1 on every one.
 *
 * Measured live on 2026-09-18, all 246 still had three problems:
 *
 *   no structured data at all        246 of 246
 *   title cut in a result            162 of 246, the worst at 111
 *   "At Unknown" in the title         12
 *
 * The third is the one worth dwelling on. The scrapers write the literal
 * string "Unknown" into the venue and city columns when the source page did
 * not say, and the title template pasted it in, so twelve pages told a
 * search engine the series was held At Unknown. A page that says nothing
 * about the venue is honest; a page that says "Unknown" is not.
 *
 * Reads source files and exercises the helpers; no network, no database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  seriesTitle,
  seriesSchema,
  seriesPlace,
  realPlace,
} from '../src/lib/poker-near-me/seriesSeo.mjs';
import { fitsInAResult, renderedLength, BRAND_SUFFIX } from '../src/lib/seo/titleFit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** Real rows, including the ones that were broken on production. */
const SERIES = [
  {
    id: '5000998',
    name: 'MSPT Illinois Poker State Championship (Main Event #320)',
    venueName: 'Rivers Casino Des Plaines', city: 'Des Plaines', state: 'IL',
    startDate: '2026-08-01', endDate: '2026-08-10', mainEventBuyin: 1100, totalEvents: 12,
  },
  {
    id: '5000979',
    name: '2026 Seminole Hard Rock Poker Open (SHRPO)',
    venueName: 'Seminole Hard Rock Hollywood', city: 'Hollywood', state: 'FL',
    startDate: '2026-07-01', endDate: '2026-07-20',
  },
  // The twelve that said "At Unknown".
  { id: '485', name: 'WSOP-Circuit Playground 2026', venueName: 'Unknown', city: 'Unknown', state: null, startDate: null },
  { id: '486', name: 'A Series', venueName: 'N/A', city: 'TBD', state: 'NV', startDate: '2026-01-01' },
  // Short names that should gain the venue.
  { id: '5001052', name: '$10K GTD', venueName: null, city: 'Houston', state: 'TX', startDate: '2026-03-01' },
  { id: '5001031', name: 'CSOP 2026', venueName: 'The Venetian Resort', city: 'Las Vegas', state: 'NV', startDate: '2026-05-05' },
  // Nothing but a name.
  { id: '999', name: 'Nameless Place Series', venueName: null, city: null, state: null, startDate: null },
  // Adversarial.
  { id: '998', name: 'X'.repeat(200), venueName: 'A Venue', city: 'A City', state: 'CA', startDate: '2026-02-02' },
  { id: '997', name: 'Cash & Carry Classic', venueName: 'Smith & Sons Casino', city: 'Reno', state: 'NV', startDate: '2026-04-04' },
];

test('no series title is cut short in a result', () => {
  const over = [];
  for (const v of SERIES) {
    const title = seriesTitle(v);
    if (!fitsInAResult(title)) over.push(`${renderedLength(title + BRAND_SUFFIX)}  ${title}`);
  }
  assert.deepEqual(over, [], `series titles that do not fit:\n  ${over.join('\n  ')}`);
});

test('a placeholder is never presented as a place', () => {
  for (const word of ['Unknown', 'unknown', 'N/A', 'n/a', 'TBD', 'TBA', 'None', 'null', 'undefined', '-', '  ']) {
    assert.equal(realPlace(word), null, `"${word}" was treated as a real place`);
  }
  assert.equal(realPlace('Unknown Casino'), 'Unknown Casino', 'a real name containing the word is still a real name');

  for (const v of SERIES) {
    const title = seriesTitle(v);
    assert.doesNotMatch(title, /\bAt (Unknown|N\/A|TBD|TBA|None|null|undefined)\b/i, title);
    const place = seriesPlace(v);
    if (place) assert.doesNotMatch(place, /^(Unknown|N\/A|TBD)/i, place);
  }
});

test('every series page describes itself, and claims an Event only when it can', () => {
  for (const v of SERIES) {
    const nodes = seriesSchema(v);
    const types = nodes.map((n) => n['@type']);
    assert.ok(types.includes('WebPage'), `${v.id} has no WebPage node`);
    assert.ok(types.includes('BreadcrumbList'), `${v.id} has no BreadcrumbList`);

    // schema.org needs a start date and a location. Claiming an Event
    // without them, or inventing either, is worse than claiming none.
    const hasEvent = types.includes('EventSeries');
    const couldEvent = Boolean(v.startDate) && Boolean(seriesPlace(v));
    assert.equal(hasEvent, couldEvent, `${v.id}: Event claimed=${hasEvent} but possible=${couldEvent}`);
    if (hasEvent) {
      const event = nodes.find((n) => n['@type'] === 'EventSeries');
      assert.ok(event.startDate, `${v.id}: Event with no startDate`);
      assert.ok(event.location?.name, `${v.id}: Event with no location name`);
      assert.doesNotMatch(event.location.name, /^(Unknown|N\/A|TBD)$/i);
    }

    // Two nodes must never claim the same @id.
    const ids = nodes.map((n) => n['@id']).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${v.id}: duplicate @id in the graph`);
  }
});

test('the series page hands that schema to SEOHead', () => {
  const src = read('pages/hub/series/[id].js');
  assert.match(src, /jsonLd=\{seriesSchema\(series\)\}/);
  assert.match(src, /seriesSchema,/);
});

test('the title is measured by the one shared helper', () => {
  const src = read('src/lib/poker-near-me/seriesSeo.mjs');
  assert.match(src, /from '\.\.\/seo\/titleFit\.js'/);
  assert.match(src, /firstThatFits\(/);
});
