/**
 * CLUB COMMANDER AND POKER ARENA ARE DISCOVERABLE.
 *
 * Dan, 2026-09-16: update Google discoverability for the World Hub, Club
 * Arena and Club Commander. What the audit found:
 *
 *   - every /hub/commander page was `noindex` with the placeholder site
 *     description, so Club Commander did not exist to Google;
 *   - the homepage JSON-LD was an object with keys "0", "1", "2" because an
 *     array of schemas was spread into an object (SEOHead), so Google
 *     ignored it;
 *   - the sitemap listed the arena root only, and listed account-only pages
 *     (messenger, settings, cart...) that a crawler cannot read.
 *
 * This pins the fixed state. It reads sources, not a rendered page, so it
 * runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const PUBLIC_COMMANDER_PAGES = {
  'pages/hub/commander/index.js': '/hub/commander',
  'pages/hub/commander/faq.js': '/hub/commander/faq',
  'pages/hub/commander/venues/index.js': '/hub/commander/venues',
  'pages/hub/commander/tournaments/index.js': '/hub/commander/tournaments',
  'pages/hub/commander/home-games/index.js': '/hub/commander/home-games',
  'pages/hub/commander/leagues/index.js': '/hub/commander/leagues',
  'pages/hub/commander/responsible-gaming/index.js': '/hub/commander/responsible-gaming',
};

const PRIVATE_COMMANDER_PAGES = [
  'pages/hub/commander/rewards/index.js',
  'pages/hub/commander/services/index.js',
  'pages/hub/commander/profile/index.js',
  'pages/hub/commander/notifications/index.js',
  'pages/hub/commander/history/index.js',
];

const PLACEHOLDER = 'Smarter.Poker - The Future Of The Game.';

test('the public Club Commander pages are indexable, with their own description and canonical', () => {
  for (const [file, canonical] of Object.entries(PUBLIC_COMMANDER_PAGES)) {
    const src = read(file);
    const head = src.slice(src.indexOf('<SEOHead'), src.indexOf('/>', src.indexOf('<SEOHead')));
    assert.ok(!/noindex=\{true\}/.test(head), `${file} is still noindex`);
    assert.ok(!head.includes(PLACEHOLDER), `${file} still carries the placeholder description`);
    assert.ok(head.includes(`canonical="${canonical}"`), `${file} lacks canonical ${canonical}`);
  }
});

test("pages that show one player's own data stay out of the index", () => {
  for (const file of PRIVATE_COMMANDER_PAGES) {
    assert.match(read(file), /noindex=\{true\}/, `${file} must stay noindex`);
  }
});

test('the FAQ ships a FAQPage schema built from the rendered questions', () => {
  const src = read('pages/hub/commander/faq.js');
  assert.match(src, /'@type': 'FAQPage'/);
  assert.match(src, /FAQ_CATEGORIES\.flatMap/);
  assert.ok(src.indexOf('const FAQ_CATEGORIES = [') < src.indexOf('const FAQ_JSON_LD'), 'FAQ_JSON_LD must be declared after FAQ_CATEGORIES');
  assert.match(src, /jsonLd=\{FAQ_JSON_LD\}/);
});

test('the Club Commander hub carries SoftwareApplication schema', () => {
  const src = read('pages/hub/commander/index.js');
  assert.match(src, /'@type': 'SoftwareApplication'/);
  assert.match(src, /name: 'Club Commander'/);
});

test('an array of schemas becomes a @graph, not an object with numeric keys', () => {
  const src = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  const start = src.indexOf('export function toJsonLdDocument');
  const end = src.indexOf('\n}\n', start) + 3;
  const fn = new Function(`${src.slice(start, end).replace('export function', 'function')}; return toJsonLdDocument;`)();
  assert.deepEqual(fn([{ '@type': 'Organization' }, { '@type': 'WebSite' }]), {
    '@context': 'https://schema.org',
    '@graph': [{ '@type': 'Organization' }, { '@type': 'WebSite' }],
  });
  assert.deepEqual(fn({ '@type': 'WebSite' }), { '@context': 'https://schema.org', '@type': 'WebSite' });
  assert.match(src, /toJsonLdDocument\(jsonLd\)/, 'SEOHead must render through toJsonLdDocument');
  assert.ok(!/'@context': 'https:\/\/schema\.org',\s*\.\.\.jsonLd,/.test(src), 'the spread that produced numeric keys is gone');
});

test('the sitemap lists the public arena and commander pages and no account-only pages', () => {
  const src = read('pages/sitemap.xml.js');
  for (const p of ['/hub/club-arena', '/hub/club-arena/help', '/hub/club-arena/legal/fair-gaming', ...Object.values(PUBLIC_COMMANDER_PAGES)]) {
    assert.ok(src.includes(`path: '${p}'`), `sitemap lacks ${p}`);
  }
  for (const p of ['/hub/messenger', '/hub/notifications', '/hub/settings', '/hub/profile-edit', '/hub/diamond-store/cart', '/hub/diamond-store/orders', '/hub/diamond-store/wishlist', '/hub/reels/saved', '/hub/reels/my-reels', '/hub/trivia/settings']) {
    assert.ok(!src.includes(`path: '${p}'`), `sitemap still lists account-only ${p}`);
  }
});

test('robots.txt keeps /hub/commander crawlable and llms.txt names both products with their URLs', () => {
  const robots = read('public/robots.txt');
  assert.ok(!/Disallow:\s*\/hub\/commander/.test(robots));
  const llms = read('public/llms.txt');
  for (const url of ['https://smarter.poker/hub/club-arena', 'https://smarter.poker/hub/commander', 'https://smarter.poker/hub/commander/faq']) {
    assert.ok(llms.includes(url), `llms.txt lacks ${url}`);
  }
});
