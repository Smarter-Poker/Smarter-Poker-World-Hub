/**
 * THE LIVE SEO CONTRACT IS CHECKED AGAINST PRODUCTION AFTER EVERY DEPLOYMENT.
 *
 * Discoverability phase 3 (2026-09-17). The other SEO tests here read source
 * files; scripts/ci/check-live-seo-contract.mjs reads the deployed site from
 * .github/workflows/live-seo-contract.yml on every successful Production
 * deployment_status. These pin the parsers it relies on and the wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hasNumericKeys,
  indexability,
  inspectHead,
  ldTypes,
  parseRobots,
  parseSitemapLocs,
} from '../scripts/ci/check-live-seo-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const HEAD = `<head><title data-next-head="">Club Commander | Smarter.Poker</title>
<meta name="description" content="Find Live Poker Rooms Near You, Join Waitlists Remotely." data-next-head=""/>
<meta name="robots" content="index, follow, max-image-preview:large" data-next-head=""/>
<link rel="canonical" href="https://smarter.poker/hub/commander" data-next-head=""/>
<meta property="og:image" content="https://smarter.poker/images/og-card.jpg" data-next-head=""/>
<script type="application/ld+json" data-next-head="">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication"},{"@type":"BreadcrumbList"}]}</script></head>`;

test('inspectHead reads a Next.js head with data-next-head attributes', () => {
  const h = inspectHead(HEAD);
  assert.equal(h.title, 'Club Commander | Smarter.Poker');
  assert.match(h.robots, /^index, follow/);
  assert.equal(h.canonical, 'https://smarter.poker/hub/commander');
  assert.equal(h.ogImage, 'https://smarter.poker/images/og-card.jpg');
  assert.deepEqual(ldTypes(h.ld), ['SoftwareApplication', 'BreadcrumbList']);
  assert.equal(hasNumericKeys(h.ld), false);
});

test('the numeric-keys JSON-LD of the #1822 bug is detected', () => {
  assert.equal(hasNumericKeys({ '@context': 'https://schema.org', 0: { '@type': 'Organization' } }), true);
});

test('parseRobots collects sitemaps and disallows; parseSitemapLocs lists every loc', () => {
  const r = parseRobots('User-agent: *\nDisallow: /api/\n# c\nSitemap: https://a/sitemap.xml\nSitemap: https://a/b/sitemap.xml\n');
  assert.deepEqual(r.sitemaps, ['https://a/sitemap.xml', 'https://a/b/sitemap.xml']);
  assert.ok(r.disallow.has('/api/'));
  assert.deepEqual(parseSitemapLocs('<urlset><url><loc> https://a/ </loc></url></urlset>'), ['https://a/']);
});

test('the workflow runs on a successful Production deployment and checks out the deployed commit', () => {
  const wf = read('.github/workflows/live-seo-contract.yml');
  assert.match(wf, /deployment_status:/);
  assert.match(wf, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(wf, /contains\(github\.event\.deployment_status\.environment, 'Production'\)/);
  assert.match(wf, /ref: \$\{\{ github\.event\.deployment\.sha \|\| github\.sha \}\}/);
  assert.match(wf, /node scripts\/ci\/check-live-seo-contract\.mjs --sha/);
  assert.ok(!/schedule:/.test(wf), 'no cron: cron governance');
});

// A SITEMAP URL MUST BE INDEXABLE, NOT MERELY REACHABLE (2026-09-18).
// The sample loop used to assert HTTP 200 only, so a page that loaded and
// then told crawlers not to index it passed this gate — the defect #1885
// fixed in production, caught there by a source test and not by this live
// one. These pin the live rule and the failure text that names the cause.

test('indexability refuses a sitemap page that loads and then says noindex', () => {
  assert.deepEqual(
    indexability({ status: 200, headerRobots: null, html: '<meta name="robots" content="index, follow, max-image-preview:large"/>' }),
    { indexable: true, reason: null }
  );
  // The header wins even when the body never parses: Googlebot reads it first.
  assert.deepEqual(indexability({ status: 200, headerRobots: 'noindex, nofollow', html: '' }), {
    indexable: false,
    reason: 'X-Robots-Tag: noindex, nofollow',
  });
  assert.deepEqual(
    indexability({ status: 200, headerRobots: null, html: '<meta name="robots" content="noindex, nofollow"/>' }),
    { indexable: false, reason: 'robots meta: noindex, nofollow' }
  );
  // A page with no robots directive at all is indexable by default.
  assert.deepEqual(indexability({ status: 200, headerRobots: null, html: '<html><body>words</body></html>' }), {
    indexable: true,
    reason: null,
  });
  // A non-200 keeps its own reason rather than being reported as a robots problem.
  assert.deepEqual(indexability({ status: 404, headerRobots: null, html: '' }), {
    indexable: false,
    reason: 'HTTP 404',
  });
  assert.deepEqual(indexability({ status: 308, headerRobots: null, html: '' }), {
    indexable: false,
    reason: 'HTTP 308',
  });
});

test('the sitemap sample applies indexability, not just HTTP 200', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/ci/check-live-seo-contract.mjs'), 'utf8');
  const sample = src.slice(src.indexOf('const sample ='));
  assert.match(sample, /indexability\(\{/, 'the sample loop must run the indexability check');
  assert.match(sample, /headerRobots: r\.headers\.get\('x-robots-tag'\)/);
  assert.match(sample, /listed in the sitemap but not indexable/, 'the failure must name the cause');
  // Intent, not punctuation: the summary counts the unindexable URLs.
  assert.match(sample, /\$\{unindexable\} not indexable/, 'the summary line must report how many were not indexable');
});
