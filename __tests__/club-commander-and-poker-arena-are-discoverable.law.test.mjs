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
  assert.match(src, /jsonLd=\{\[FAQ_JSON_LD, commanderBreadcrumbs\(/);
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

test('the sitemap lists the public commander pages, no account-only pages, and no arena pages (the arena publishes its own)', () => {
  const src = read('pages/sitemap.xml.js');
  for (const p of Object.values(PUBLIC_COMMANDER_PAGES)) {
    assert.ok(src.includes(`path: '${p}'`), `sitemap lacks ${p}`);
  }
  assert.ok(!/path: '\/hub\/club-arena/.test(src), 'arena URLs belong to the arena sitemap now');
  assert.match(read('public/robots.txt'), /Sitemap: https:\/\/smarter\.poker\/hub\/club-arena\/sitemap\.xml/);
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

test('every public Club Commander sub-page carries a BreadcrumbList that hangs off /hub/commander', () => {
  const helper = read('src/lib/seo/commanderBreadcrumbs.js');
  assert.match(helper, /'@type': 'BreadcrumbList'/);
  assert.match(helper, /item: `\$\{SITE_URL\}\/hub\/commander`/);
  for (const [file, canonical] of Object.entries(PUBLIC_COMMANDER_PAGES)) {
    if (canonical === '/hub/commander') continue;
    const src = read(file);
    assert.match(src, /import \{ commanderBreadcrumbs \} from '[./]+\/src\/lib\/seo\/commanderBreadcrumbs'/, `${file} imports the helper`);
    assert.ok(src.includes(`commanderBreadcrumbs('`) && src.includes(`', '${canonical}')`), `${file} passes its own canonical path`);
  }
});

/** JPEG SOF0/SOF2 marker carries height then width, big-endian. */
function jpegDimensions(file) {
  const jpg = fs.readFileSync(path.join(ROOT, file));
  let i = 2;
  while (i < jpg.length) {
    if (jpg[i] !== 0xff) break;
    const marker = jpg[i + 1];
    const len = jpg.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: jpg.readUInt16BE(i + 5), width: jpg.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

test('the default Open Graph image is a real 1200x630 card, declared as such', () => {
  assert.deepEqual(jpegDimensions('public/images/og-card.jpg'), { width: 1200, height: 630 });
  const app = read('pages/_app.js');
  assert.match(app, /property="og:image" content="https:\/\/smarter\.poker\/images\/og-card\.jpg"/);
  assert.match(app, /property="og:image:height" content="630"/);
  assert.match(read('vendor/commander-shared/src/components/seo/SEOHead.js'), /DEFAULT_OG_IMAGE = 'https:\/\/smarter\.poker\/images\/og-card\.jpg'/);
});

test('the responsible gaming page renders its head before its loading return', () => {
  const src = read('pages/hub/commander/responsible-gaming/index.js');
  const head = src.indexOf('const head = (');
  const loading = src.indexOf('if (loading) {');
  assert.ok(head > -1 && loading > -1 && head < loading, 'SEOHead must be built before the loading branch');
  assert.ok(src.indexOf('{head}', loading) > -1, 'the loading branch must render the head');
});

test('the arena sitemap is not served with the origin noindex header', () => {
  // ca-static.smarter.poker sends X-Robots-Tag: noindex, nofollow on every
  // response so the bare origin host is never indexed. vercel.json overrides
  // it for extension-less arena paths (the pages); the sitemap has an
  // extension and needs its own rule, or the leaked header rides along.
  const cfg = JSON.parse(read('vercel.json'));
  const rule = cfg.headers.find((h) => h.source === '/hub/club-arena/sitemap.xml');
  assert.ok(rule, 'vercel.json has no header rule for the arena sitemap');
  const xr = rule.headers.find((h) => h.key === 'X-Robots-Tag');
  assert.ok(xr && !/noindex/.test(xr.value), 'the arena sitemap must not be noindex');
});


// DISCOVERABILITY PHASE 4 (2026-09-17): the venue directory and the venue
// page render their words on the server, link to each other with real links,
// and the venue page canonicalizes to the indexed entity page for the same
// venue instead of hiding behind a placeholder noindex.

test('the venue directory renders its first page of venues on the server and links each one', () => {
  const src = read('pages/hub/commander/venues/index.js');
  assert.match(src, /export async function getServerSideProps\(/, 'the directory must be server rendered');
  assert.match(src, /fetchVenueList\(50\)/, 'the directory must ask the Commander API for its first page');
  assert.match(src, /useState\(initialVenues\)/, 'the server list must seed the rendered list');
  assert.ok(src.includes('href={`/hub/commander/venues/${venue.id}`}'), 'every card must be a real link to its venue page');
  assert.match(src, /<Link\s+href=\{`\/hub\/commander\/venues\/\$\{venue\.id\}`\}/, 'the card must be a Link, not a button');
  assert.match(src, /'@type': 'ItemList'/, 'the directory must describe its venues as an ItemList');
  assert.match(src, /res\.statusCode = 503/, 'an unreachable API must answer 503, not an empty indexable directory');
});

test('the venue page renders the venue on the server with its own title, description and canonical to the entity page', () => {
  const src = read('pages/hub/commander/venues/[id].js');
  assert.match(src, /export async function getServerSideProps\(\{ params, res \}\)/, 'the venue page must be server rendered');
  assert.match(src, /fetchVenue\(params\.id\)/);
  assert.ok(!src.includes('title="Venue Details"'), 'the placeholder title is gone');
  assert.ok(!src.includes(PLACEHOLDER), 'the placeholder description is gone');
  assert.match(src, /title=\{venueTitle\(venue\)\}/);
  assert.match(src, /description=\{venueDescription\(venue\)\}/);
  assert.match(src, /canonical=\{venueEntityPath\(venue\)\}/, 'the canonical must be the entity page');
  assert.match(src, /res\.statusCode = 404/, 'a venue that does not exist must be a real 404');
  assert.match(src, /res\.statusCode = 503/, 'an unreachable API must answer 503');
  // Every branch renders the head: loading, not found, and the venue itself.
  const loading = src.indexOf('if (loading) {');
  const notFound = src.indexOf('if (!venue) {');
  assert.ok(loading > -1 && notFound > -1, 'the page keeps its loading and not-found branches');
  assert.ok(src.indexOf('<VenueHead venue={venue} />', loading) > -1 && src.indexOf('<VenueHead venue={venue} />', loading) < notFound, 'the loading branch renders the head');
  assert.ok(src.indexOf('<VenueHead venue={null} />', notFound) > -1, 'the not-found branch renders a noindex head');
  assert.match(src, /noindex=\{true\}/, 'a venue with no public entity page stays out of the index');
});

test('the venue SEO helpers canonicalize to /hub/venues/[id], keep home games out of the index and return JSON-safe venues', async () => {
  const mod = await import(path.join(ROOT, 'src/lib/commander/venueSeo.js'));
  const v = mod.toSeoVenue({ id: '3109', name: ' Grand Victoria Casino ', city: 'Elgin', state: 'IL', venue_type: 'casino', rating: 70, poker_tables: null, hours_weekday: '24/7', stakes_spread: ['$1/$2', 7], active_games: 2 });
  assert.equal(v.id, 3109);
  assert.equal(v.name, 'Grand Victoria Casino');
  assert.deepEqual(v.stakes_spread, ['$1/$2']);
  assert.equal(v.hours, '24/7');
  assert.equal(v.active_games, 2);
  for (const [k, val] of Object.entries(v)) assert.notEqual(val, undefined, `${k} must be JSON-safe (null, not undefined)`);
  assert.equal(mod.venueEntityPath(v), '/hub/venues/3109');
  assert.equal(mod.venueTitle(v), 'Grand Victoria Casino Poker Room In Elgin, IL');
  assert.ok(mod.venueDescription(v).length >= 60 && mod.venueDescription(v).length <= 200);
  assert.equal(mod.isPublicVenue(v), true);
  assert.equal(mod.isPublicVenue({ ...v, venue_type: 'home_game' }), false);
  assert.equal(mod.isPublicVenue(null), false);
  assert.equal(mod.toSeoVenue(null), null);
  assert.deepEqual(await mod.fetchVenue('not-a-venue'), { venue: null, status: 'not-found' });
});

// DISCOVERABILITY PHASE 6 (2026-09-17): each product has its own share card.

test('Club Commander and Poker Arena each have a real 1200x630 share card', () => {
  for (const file of ['public/images/og-club-commander.jpg', 'public/images/og-poker-arena.jpg']) {
    assert.deepEqual(jpegDimensions(file), { width: 1200, height: 630 }, file);
    assert.ok(fs.statSync(path.join(ROOT, file)).size < 300_000, `${file} must stay under 300 kB`);
  }
});

test('every page under /hub/commander shares the Club Commander card unless it names its own', async () => {
  const src = read('src/components/seo/SEOHead.js');
  assert.match(src, /export default function SEOHead\(props\)/, 'the wrapper is a component, not a bare re-export');
  assert.match(src, /props\.ogImage \|\| productOgImage\(pathname\)/, 'a page that names its own image keeps it');
  assert.match(read('src/lib/seo/productOgImage.js'), /\{ prefix: '\/hub\/commander', image: 'https:\/\/smarter\.poker\/images\/og-club-commander\.jpg' \}/);
  // Every commander page goes through the wrapper, not the shared component directly.
  const pages = fs.readdirSync(path.join(ROOT, 'pages/hub/commander'), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join('pages/hub/commander', f));
  assert.ok(pages.length > 30);
  for (const page of pages) {
    const body = read(page);
    if (!body.includes('<SEOHead')) continue;
    assert.ok(!body.includes('commander-shared/components/seo/SEOHead'), `${page} must import the World Hub SEOHead wrapper`);
  }
  // The prefix match itself, on the pages-router pathname (dynamic segments unexpanded).
  const mod = await import(path.join(ROOT, 'src/lib/seo/productOgImage.js'));
  assert.equal(mod.productOgImage('/hub/commander'), 'https://smarter.poker/images/og-club-commander.jpg');
  assert.equal(mod.productOgImage('/hub/commander/venues/[id]'), 'https://smarter.poker/images/og-club-commander.jpg');
  assert.equal(mod.productOgImage('/hub/commanders'), undefined);
  assert.equal(mod.productOgImage('/hub/venues/[id]'), undefined);
  assert.equal(mod.productOgImage(undefined), undefined);
});
