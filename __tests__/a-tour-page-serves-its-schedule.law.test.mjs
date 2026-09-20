/**
 * A TOUR PAGE SERVES ITS SCHEDULE (AEO phase 3, 2026-09-19).
 *
 * Twelve tour pages were sampled on production as OAI-SearchBot with
 * scripts stripped. They produced seven distinct bodies:
 *
 *     WPT and NAPT                   byte identical below title and h1
 *     EASTERNPT and WTP              byte identical
 *     RGPS and MSPT                  byte identical
 *     LODGE, VENETIAN and SEMINOLE   byte identical
 *
 * Every tour page served the same 190 words: the summary block with the
 * name substituted, and "Loading Tour Details...". The schedule, the stops,
 * the venues, the buy ins and the results are all fetched over SWR after
 * mount, so none of it reached a crawler.
 *
 * The copy said, in every one of those 190 words: "This Page Lists Every
 * Stop On The Schedule". It did not. That is a claim made to something that
 * cannot click to check, which is the worst kind to get wrong.
 *
 * data/tour-source-registry.json is bundled, holds 82 stops, and was already
 * imported by the page to resolve the tour's name. It is now rendered.
 *
 * THIS LAW: the stops the bundle holds reach both the page and the graph,
 * and the graph never publishes an event without a date and a place. The
 * second half is the rule set when the series pages got their schema: an
 * Event without a startDate or a location is worse than no Event, and a
 * guessed one is worse still.
 *
 * Reads source and the bundled registry; runs in the Build Safety Gate with
 * no install and no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tourStopSchema } from '../src/lib/seo/tourPageSeo.js';
import { parseStopDates } from '../src/utils/tourGeoUtils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const registry = JSON.parse(read('data/tour-source-registry.json'));

/** Every stop the bundle holds, with the tour it belongs to. */
function bundledStops() {
  const out = [];
  for (const [code, tour] of Object.entries(registry?.tours || {})) {
    for (const stop of tour?.stops_2026 || []) out.push({ code, stop });
  }
  return out;
}

test('the bundle still holds a schedule worth serving', () => {
  const stops = bundledStops();
  assert.ok(
    stops.length >= 60,
    `the registry holds ${stops.length} stops; it held 82 when this was measured. `
      + 'If the schedule moved somewhere else, this law has to follow it rather '
      + 'than be deleted.',
  );
});

test('a stop with a date and a place becomes an event, and one without does not', () => {
  const missed = [];
  const unfounded = [];

  for (const [code, tour] of Object.entries(registry?.tours || {})) {
    const stops = tour?.stops_2026 || [];
    const nodes = tourStopSchema(stops);

    for (const stop of stops) {
      const parsed = parseStopDates(stop?.dates);
      const hasDate = parsed?.start instanceof Date && !Number.isNaN(parsed.start.getTime());
      const hasPlace = Boolean(String(stop?.location || '').trim());
      const hasName = Boolean(String(stop?.name || '').trim());
      const shouldPublish = hasDate && hasPlace && hasName;
      const published = nodes.some((node) => node.name === String(stop?.name || '').trim());
      if (shouldPublish && !published) missed.push(`${code}: ${stop?.name} (${stop?.dates})`);
    }

    for (const node of nodes) {
      if (!node.startDate) unfounded.push(`${code}: ${node.name} has no startDate`);
      if (!node.location?.address?.addressLocality && !node.location?.name) {
        unfounded.push(`${code}: ${node.name} has no location`);
      }
      if (node.endDate && node.endDate < node.startDate) {
        unfounded.push(`${code}: ${node.name} ends before it starts`);
      }
    }
  }

  assert.deepEqual(
    missed,
    [],
    'These stops have a name, a date and a place and are still missing from '
      + 'the graph:\n  ' + missed.join('\n  '),
  );
  assert.deepEqual(
    unfounded,
    [],
    'These events were published without the facts an event needs:\n  '
      + unfounded.join('\n  '),
  );
});

test('the schedule reaches the server rendered page, not only the graph', () => {
  const page = read('pages/hub/tours/[code].js');
  const summary = read('src/components/seo/TourPageSummary.js');

  assert.match(
    page,
    /stops_2026/,
    'getServerSideProps reads the bundled schedule',
  );
  assert.match(
    page,
    /<TourPageSummary[\s\S]{0,400}?stops=\{/,
    'and hands it to the block that renders on the server',
  );
  assert.match(
    page,
    /tourSchema\(\{[^}]*stops[^}]*\}\)/,
    'and to the graph',
  );
  assert.match(
    summary,
    /stopList\.map\(/,
    'TourPageSummary renders the stops rather than only counting them',
  );
});

/**
 * Comments are stripped line by line, never with a block regex: a block
 * regex over a file this size ate 33,000 of USRobots.js's 37,000 characters
 * earlier in this programme and hid the very thing the law was scanning for.
 */
function stripComments(src) {
  const kept = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

test('the page promises a schedule only when it has one', () => {
  const summary = stripComments(read('src/components/seo/TourPageSummary.js'));
  // The old copy said "This Page Lists Every Stop On The Schedule"
  // unconditionally, on 28 pages that listed none. Whatever the wording
  // becomes, a claim about the schedule has to sit inside a branch that
  // knows whether there is one.
  const promise = /Listed\s*\n?\s*Below|Lists Every Stop/;
  const match = summary.match(promise);
  assert.ok(match, 'the copy still says what the page shows');
  const before = summary.slice(0, match.index);
  assert.match(
    before.slice(-600),
    /stopList\.length|eventList\.length/,
    'the promise is made inside a branch that checked there is a schedule',
  );
});
