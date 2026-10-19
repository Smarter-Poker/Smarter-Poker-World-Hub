/**
 * GSC & AEO SERIES 4 PHASE 1: ROBOTS.TXT SITEMAP INDEX & DYNAMIC QUERY PARAMETER POLLUTION DEFENSE
 *
 * Verifies:
 *   1. public/robots.txt declares the master sitemap index (sitemap_index.xml)
 *      first, alongside all category sub-sitemaps (sitemap-core.xml,
 *      sitemap-venues.xml, sitemap-tournaments.xml, sitemap-series.xml,
 *      sitemap-compare.xml, sitemap-learn.xml, sitemap-videos.xml) and
 *      the Club Arena sitemap.
 *   2. Every User-agent group in public/robots.txt disallows dynamic query
 *      parameter pollution (/*?*sort=, /*?*filter=, /*?*tab=, /*?*page=).
 *   3. disallowedFor() in scripts/ci/check-live-seo-contract.mjs blocks
 *      faceted query URLs while keeping clean canonical paths crawlable.
 *   4. check-live-seo-contract.mjs handles both <sitemapindex> and <urlset>.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disallowedFor, parseRobots } from '../scripts/ci/check-live-seo-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('robots.txt declares sitemap_index.xml first and lists all specialized sub-sitemaps', () => {
  const txt = read('public/robots.txt');
  const parsed = parseRobots(txt);
  assert.equal(
    parsed.sitemaps[0],
    'https://smarter.poker/sitemap_index.xml',
    'sitemap_index.xml must be the first Sitemap declaration in robots.txt',
  );
  const expected = [
    'https://smarter.poker/sitemap_index.xml',
    'https://smarter.poker/sitemap.xml',
    'https://smarter.poker/sitemap-core.xml',
    'https://smarter.poker/sitemap-venues.xml',
    'https://smarter.poker/sitemap-tournaments.xml',
    'https://smarter.poker/sitemap-series.xml',
    'https://smarter.poker/sitemap-compare.xml',
    'https://smarter.poker/sitemap-learn.xml',
    'https://smarter.poker/sitemap-videos.xml',
    'https://smarter.poker/hub/club-arena/sitemap.xml',
  ];
  assert.deepEqual(parsed.sitemaps, expected);
});

test('robots.txt disallows faceted query parameter crawl loops across all crawler groups', () => {
  const txt = read('public/robots.txt');
  const parsed = parseRobots(txt);
  const queryRules = ['/*?*sort=', '/*?*filter=', '/*?*tab=', '/*?*page='];
  for (const rule of queryRules) {
    assert.ok(parsed.disallow.has(rule), `robots.txt must disallow ${rule}`);
  }

  // Verify Googlebot wildcard matching blocks faceted URLs and allows clean canonicals
  assert.equal(disallowedFor('/hub/venues?sort=distance&state=NV', parsed.disallow), true);
  assert.equal(disallowedFor('/hub/video-library?filter=strategy', parsed.disallow), true);
  assert.equal(disallowedFor('/hub/diamond-store?tab=vip', parsed.disallow), true);
  assert.equal(disallowedFor('/learn?page=2', parsed.disallow), true);
  assert.equal(disallowedFor('/hub/venues', parsed.disallow), false);
  assert.equal(disallowedFor('/hub/video-library', parsed.disallow), false);
  assert.equal(disallowedFor('/tools/poker-odds-calculator', parsed.disallow), false);
});

test('check-live-seo-contract.mjs supports <sitemapindex> as well as <urlset>', () => {
  const contractCode = read('scripts/ci/check-live-seo-contract.mjs');
  assert.match(contractCode, /const isSitemapIndex = \/<sitemapindex\/\.test\(r\.text\)/);
  assert.match(contractCode, /not a urlset or sitemapindex/);
});
