/**
 * A CITY IS A CITY (AEO phase 3, 2026-09-19).
 *
 * The series scrapers write the venue and the city into the city field, run
 * together, whenever the source page did not separate them. Measured across
 * the 225 series in the sitemap:
 *
 *     carry a city that is a city        99
 *     carry no city at all               62
 *     carry the venue and the city       64
 *
 * Examples, with the venue field beside them:
 *
 *     venue ''          city 'Wynn Las Vegas Las Vegas'
 *     venue 'Unknown'   city 'Thunder Valley Casino Lincoln'
 *     venue 'Unknown'   city 'Playground Poker Club Kahnawake'
 *
 * Where the venue field is also filled, cityWithoutVenue strips it and the
 * result is right. Where it is empty or says "Unknown", nothing can, and the
 * whole string reaches the page title, the meta description, the visible
 * location and schema.org addressLocality. A reader is told a series runs in
 * "Wynn Las Vegas Las Vegas"; an engine is told the same.
 *
 * THE RULE THIS FOLLOWS: only change a value the venue directory can account
 * for. A city the directory has never heard of is returned untouched. Of the
 * 64, that cleans 49 and leaves 15: venues outside the directory (Calgary,
 * Kahnawake, London) and cities the directory has no venue in. Guessing at
 * those would be the same mistake in the other direction.
 *
 * Exercises the resolver against the real venue directory; no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVenueIndex, cleanScrapedCity } from '../src/lib/poker-near-me/cityFromScrape.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const raw = JSON.parse(read('data/all-venues.json'));
const index = buildVenueIndex(Array.isArray(raw) ? raw : raw.venues);

test('the venue directory is still there to resolve against', () => {
  assert.ok(index.names.length > 400, `only ${index.names.length} venue names; `
    + 'this resolver is only safe because the directory is complete enough to '
    + 'recognise what it strips');
  assert.ok(index.cities.size > 150, `only ${index.cities.size} venue cities`);
});

test('a venue name on the front of a city comes off', () => {
  assert.equal(cleanScrapedCity('Wynn Las Vegas Las Vegas', index), 'Las Vegas');
  assert.equal(cleanScrapedCity('Venetian Las Vegas Las Vegas', index), 'Las Vegas');
  assert.equal(cleanScrapedCity('Horseshoe Las Vegas Las Vegas', index), 'Las Vegas');
  assert.equal(cleanScrapedCity('Thunder Valley Casino Lincoln', index), 'Lincoln');
});

test('a city the directory knows is returned exactly as it came', () => {
  for (const city of ['Las Vegas', 'Tampa', 'Atlantic City', 'Lincoln']) {
    assert.equal(cleanScrapedCity(city, index), city);
  }
});

test('a city the directory cannot account for is left alone', () => {
  // Venues outside the directory. Stripping these would need a guess, and a
  // guessed city is worse than a long one.
  for (const city of ['Playground Poker Club Kahnawake', 'Ace Casino Calgary', 'The Royal Social Club London']) {
    assert.equal(cleanScrapedCity(city, index), city);
  }
  // And cities the directory has no venue in.
  for (const city of ['McAllen', 'Elyria', 'Round Rock']) {
    assert.equal(cleanScrapedCity(city, index), city);
  }
});

test('nothing is invented out of nothing', () => {
  assert.equal(cleanScrapedCity('', index), null);
  assert.equal(cleanScrapedCity(null, index), null);
  assert.equal(cleanScrapedCity(undefined, index), null);
  assert.equal(cleanScrapedCity('Las Vegas', null), 'Las Vegas');
});

test('both paths that read a series city resolve it', () => {
  assert.match(
    read('pages/api/poker/series.js'),
    /city: cleanScrapedCity\(/,
    'the detail API, which every series page reads through',
  );
  assert.match(
    read('pages/hub/poker-series.js'),
    /cleanScrapedCity\(row\.city/,
    'and the directory, whose two queries do not go through that API',
  );
});
