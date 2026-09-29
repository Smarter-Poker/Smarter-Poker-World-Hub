/**
 * LAW: a feed page shows its feed on the server.
 *
 * A FEED PAGE SHOWS ITS FEED (2026-09-22). A Googlebot crawl measured five
 * hub feed pages at 93 to 147 words of server-rendered text: each one fetched
 * its list in the browser, so the HTML carried a heading and a skeleton.
 *
 * Three of them have a real public catalogue a signed-out visitor already
 * sees, and now render its first screen on the server:
 *
 *   /hub/news/sources        every outlet the news feed reads, and its latest headline
 *   /hub/social-pages        the first Discover batch of public pages
 *   /hub/home-games/near-me  the cities that have public home games, each
 *                            linking to its /hub/home-games/in/[state]/[city] page
 *
 * The browser still owns refresh, filters, search, geolocation and infinite
 * scroll. Two were left alone on purpose: /hub/lives and /hub/reels, whose
 * signed-out catalogues were test broadcasts and a handful of duplicated
 * clips, which is not content worth serving a crawler.
 *
 * Privacy is part of the law: only fields a card shows leave the server.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const SOURCES = 'pages/hub/news/sources.js';
const SOCIAL = 'pages/hub/social-pages/index.js';
const NEAR_ME = 'pages/hub/home-games/near-me.js';

const h1Count = (src) => (src.match(/<h1[\s>]/g) || []).length;

test('/hub/news/sources renders its outlet list on the server', () => {
  const src = read(SOURCES);
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /swrFallback\(originFrom\(req\), SOURCE_BOXES_PATH\)/);
  assert.match(src, /useState\(initialSources\)/, 'the list starts from the server data');
  assert.match(src, /useState\(initialSources\.length === 0\)/, 'no skeleton when the server had the list');
  assert.match(src, /<PageTransition disableInitialAnimation>/, 'server text is not served at opacity 0');
  assert.match(src, /timeZone: 'UTC'/, 'the server date and the hydrated date agree');
  assert.equal(h1Count(src), 1);
  assert.doesNotMatch(src, /HubPageSummary page="news-sources" as="h1"/);
});

test('/hub/social-pages renders its first public batch on the server', () => {
  const src = read(SOCIAL);
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /const FIRST_BATCH_PATH = '\/api\/social\/pages\?limit=20&offset=0'/);
  assert.match(src, /useState\(initialPages\)/);
  assert.match(src, /useState\(initialPages\.length === 0\)/);
  assert.match(src, /<AnimatePresence initial=\{false\}>/, 'seeded cards are not served at opacity 0');
  assert.match(src, /<Link\s+href=\{`\/hub\/social-pages\/\$\{page\.slug \|\| page\.id\}`\}/, 'each card names a crawlable link');
  assert.equal(h1Count(src), 1);
});

test('/hub/social-pages never serialises owner or contact fields', () => {
  const src = read(SOCIAL);
  const body = src.slice(src.indexOf('function toPublicCard'), src.indexOf('export async function getServerSideProps'));
  assert.ok(body.length > 0, 'toPublicCard exists above getServerSideProps');
  for (const field of ['owner_id', 'contact_email', 'phone', 'linked_entity_id', 'website']) {
    assert.doesNotMatch(body, new RegExp(`\\b${field}\\b`), `${field} must not reach the HTML`);
  }
  assert.match(src, /p\.is_public !== false/);
});

test('/hub/home-games/near-me lists the public cities on the server', () => {
  const src = read(NEAR_ME);
  assert.match(src, /export async function getServerSideProps/);
  assert.match(src, /isGroupPubliclyVisible\(groupMap\[/, 'same visibility rule as the city directory');
  assert.match(src, /\.eq\('is_public', true\)/);
  assert.match(src, /buildGeoUrl\(code, city\)/, 'links go to the existing city pages');
  assert.match(src, /Browse Home Games By City/);
  assert.equal(h1Count(src), 1);
  const gssp = src.slice(src.indexOf('export async function getServerSideProps'), src.indexOf('export default function'));
  for (const field of ['latitude', 'longitude', 'address', 'owner_id', 'name,', 'slug']) {
    assert.ok(!gssp.includes(field), `near-me server props must not select ${field}`);
  }
});
