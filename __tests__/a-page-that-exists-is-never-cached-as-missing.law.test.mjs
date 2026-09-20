/**
 * A PAGE THAT EXISTS IS NEVER CACHED AS MISSING (AEO phase 3, 2026-09-19).
 *
 * Measured on production while checking the series work:
 *
 *     /hub/series/5001217   404, x-vercel-cache: HIT, age 249
 *     /hub/series/5001220   404, x-vercel-cache: HIT, age 249
 *     /hub/series/5001228   404, x-vercel-cache: HIT, age 250
 *     /hub/series/5001254   404, x-vercel-cache: HIT, age 247
 *
 * The same four URLs with a cache busting parameter answered 200, and
 * /api/poker/series answered 200 for every one of them. The pages existed.
 * The edge was serving a 404 anyway, and kept serving it.
 *
 * Two mistakes, one on top of the other.
 *
 * The first: fetchSeries treated any `success: false` body as a missing
 * series, whatever status carried it. The rate limiter answers 429 with
 * `{ success: false, error: 'Too many requests' }` and every 5xx in that API
 * does the same, so a response that said "ask again" was read as "this does
 * not exist".
 *
 * The second: the page then set `s-maxage=300, stale-while-revalidate=600`
 * and the 404 status together, so that one wrong answer was published as
 * fact for five minutes and re-served stale for ten more.
 *
 * A 404 is a statement made to something that will believe it and cache it.
 * It has to be earned, and it has to expire.
 *
 * Reads source and exercises fetchSeries against a stubbed API; no install
 * and no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSeries } from '../src/lib/poker-near-me/seriesSeo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** Pages that turn a lookup failure into an HTTP status. */
const PAGES = [
  'pages/hub/series/[id].js',
  'pages/hub/commander/venues/[id].js',
];

function withStubbedFetch(status, body, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    status,
    json: async () => body,
  });
  try {
    return run();
  } finally {
    globalThis.fetch = original;
  }
}

test('only the API saying so means the series is missing', async () => {
  const rateLimited = await withStubbedFetch(
    429,
    { success: false, error: 'Too many requests', retryAfter: 60 },
    () => fetchSeries('593', 'https://smarter.poker'),
  );
  assert.equal(
    rateLimited.status,
    'unavailable',
    'a 429 says ask again, not that the page does not exist',
  );

  const serverError = await withStubbedFetch(
    503,
    { success: false, error: 'Service unavailable' },
    () => fetchSeries('593', 'https://smarter.poker'),
  );
  assert.equal(serverError.status, 'unavailable', 'and neither does a 503');

  const genuinelyMissing = await withStubbedFetch(
    404,
    { success: false, error: 'Series not found' },
    () => fetchSeries('593', 'https://smarter.poker'),
  );
  assert.equal(genuinelyMissing.status, 'not-found', 'a 404 does');

  const badId = await withStubbedFetch(
    400,
    { success: false, error: 'Invalid id parameter' },
    () => fetchSeries('593', 'https://smarter.poker'),
  );
  assert.equal(badId.status, 'not-found', 'and so does a 400');
});

test('a 404 is not cached the way a page is', () => {
  const offenders = [];
  for (const file of PAGES) {
    const src = read(file);
    const branch = src.match(/\} else if \(status === 'not-found'\) \{[\s\S]*?\n {2}\}/);
    if (!branch) {
      offenders.push(`${file}: no branch of its own for a missing page, so the 404 `
        + 'takes whatever Cache-Control the found path sets');
      continue;
    }
    const cache = branch[0].match(/Cache-Control',\s*'([^']+)'/);
    if (!cache) {
      offenders.push(`${file}: sends a 404 without saying how long it may be cached`);
      continue;
    }
    const value = cache[1];
    if (/stale-while-revalidate/.test(value)) {
      offenders.push(`${file}: a 404 with a stale window keeps being re-served after `
        + `it expires (${value})`);
    }
    const maxAge = Number((value.match(/s-maxage=(\d+)/) || [])[1] ?? Infinity);
    if (maxAge > 120) {
      offenders.push(`${file}: caches a 404 for ${maxAge}s. A wrong one outlives its cause.`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'A 404 is a statement that a page does not exist, made to something that '
      + 'will believe it and cache it:\n  ' + offenders.join('\n  '),
  );
});
