/**
 * SITEMAP LASTMOD IS EVIDENCE, NOT A TIMESTAMP OF GENERATION (AEO phase 1,
 * 2026-09-17).
 *
 * Every one of the 1,018 sitemap entries used to carry today's date, so the
 * file told Bing, Google and every AI search index that the whole site changed
 * every day. Bing's sitemap guidance for AI-powered search says a lastmod set
 * to generation time is ignored and the sitemap discounted, and AI engines
 * weight freshness heavily, so a fake date is worse than none.
 *
 * Pinned here:
 *   - generateSitemapXml never stamps the current time into <lastmod>;
 *   - an entry without change evidence emits no <lastmod> element at all;
 *   - venue entries carry the newest verification or scrape time the directory
 *     holds, and a state or city entry carries the newest of its venues.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPokerVenueSitemapUrls, venueLastmod } from '../src/lib/poker-near-me/sitemapRoutes.js';

const source = fs.readFileSync(new URL('../pages/sitemap.xml.js', import.meta.url), 'utf8');

test('generateSitemapXml does not stamp the generation time into lastmod', () => {
  const xmlBuilder = source.slice(
    source.indexOf('function generateSitemapXml'),
    source.indexOf('export async function getServerSideProps'),
  );
  assert.doesNotMatch(xmlBuilder, /new Date\(\)/, 'lastmod must not be the current time');
  assert.match(xmlBuilder, /sitemapLastmodLine\(url\.lastmod\)/);
  const helper = source.slice(source.indexOf('function sitemapLastmodLine'));
  assert.match(helper, /if \(!lastmod\) return '';/, 'an entry without evidence emits no lastmod');
});

test('venueLastmod prefers verification, then scrape, then update time, and rejects garbage', () => {
  assert.equal(
    venueLastmod({ last_verified_at: '2026-09-01T10:00:00Z', last_scraped_at: '2026-09-10T10:00:00Z' }),
    '2026-09-01T10:00:00.000Z',
  );
  assert.equal(venueLastmod({ last_scraped_at: '2026-09-10T10:00:00Z' }), '2026-09-10T10:00:00.000Z');
  assert.equal(venueLastmod({ updated_at: '2026-08-01' }), '2026-08-01T00:00:00.000Z');
  assert.equal(venueLastmod({ last_verified_at: 'not a date' }), null);
  assert.equal(venueLastmod({}), null);
  assert.equal(venueLastmod(null), null);
});

test('venue entries carry their own lastmod and state and city entries carry the newest venue', () => {
  const urls = buildPokerVenueSitemapUrls([
    { id: 'a', name: 'Lodge', state: 'TX', city: 'Austin', last_verified_at: '2026-09-02T00:00:00Z' },
    { id: 'b', name: 'Bullets', state: 'TX', city: 'Austin', last_scraped_at: '2026-09-05T00:00:00Z' },
    { id: 'c', name: 'Quiet Room', state: 'TX', city: 'Dallas' },
  ]);
  const byPath = Object.fromEntries(urls.map((u) => [u.path, u]));
  assert.equal(byPath['/hub/venues/a'].lastmod, '2026-09-02T00:00:00.000Z');
  assert.equal(byPath['/hub/venues/b'].lastmod, '2026-09-05T00:00:00.000Z');
  assert.ok(!('lastmod' in byPath['/hub/venues/c']), 'a venue with no evidence has no lastmod key');
  assert.equal(byPath['/hub/poker-near-me/in/tx'].lastmod, '2026-09-05T00:00:00.000Z');
  assert.equal(byPath['/hub/poker-near-me/in/tx/austin'].lastmod, '2026-09-05T00:00:00.000Z');
  assert.ok(!('lastmod' in byPath['/hub/poker-near-me/in/tx/dallas']));
});

test('the route set is unchanged by the lastmod work', () => {
  const urls = buildPokerVenueSitemapUrls([
    { id: 'a', name: 'Lodge', state: 'TX', city: 'Austin' },
    { id: 'a', name: 'Lodge', state: 'TX', city: 'Austin' },
  ]);
  assert.deepEqual(
    urls.map((u) => u.path),
    ['/hub/venues/a', '/hub/poker-near-me/in/tx', '/hub/poker-near-me/in/tx/austin'],
  );
});
