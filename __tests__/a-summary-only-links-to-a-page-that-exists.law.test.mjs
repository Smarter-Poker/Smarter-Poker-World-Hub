/**
 * A SUMMARY ONLY LINKS TO A PAGE THAT EXISTS (AEO phase 3, 2026-09-18).
 *
 * HubPageSummary is the server rendered block that tells an engine what each
 * hub page is, and the cross links in it are the map an engine follows to
 * find the rest of the site. Four of those links pointed at
 * /hub/trivia/pvp and /hub/trivia/tournaments.
 *
 * Both of those pages sit behind a server side release gate
 * (TRIVIA_PVP_ENABLED, TRIVIA_TOURNAMENTS_ENABLED) and, while it is closed,
 * redirect to /hub/trivia. Measured on production both answered 307. So the
 * summary was advertising two modes that do not currently exist, a reader
 * clicking either was bounced back where they started, and a crawler spent
 * budget on a redirect to a page it already had.
 *
 * The sitemap had the same two routes listed unconditionally. It now asks
 * the release gate, using the same functions the pages use, so there is one
 * source of truth for whether a gated feature exists. This law closes the
 * loop from the other side: a summary may only link somewhere the sitemap is
 * willing to list.
 *
 * This is not a style rule. A link from the summary is a claim about the
 * site, made to something that cannot click it to check.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/**
 * Pages the sitemap never lists but which are unarguably real, linked from
 * every summary's compliance line, and deliberately low priority. They are
 * named here rather than inferred because each one is a decision.
 */
const ALWAYS_REAL = new Set([
  '/terms',
  '/privacy',
  '/about',
]);

/**
 * Every `path: '...'` the sitemap offers, gated or not.
 *
 * The sitemap does not hold them all itself. The Poker Near Me discovery
 * surfaces live in their own module and are imported in; reading only
 * pages/sitemap.xml.js made this law believe /hub/poker-near-me/venues was
 * unlisted, which it never was. Every module the sitemap imports a route
 * table from is read, so a table moved or added later is still seen.
 */
const ROUTE_SOURCES = [
  'pages/sitemap.xml.js',
  'src/lib/poker-near-me/sitemapRoutes.js',
];

function sitemapRoutes() {
  const out = new Set();
  for (const file of ROUTE_SOURCES) {
    const src = read(file);
    for (const m of src.matchAll(/\bpath:\s*'([^']+)'/g)) out.add(m[1]);
  }
  return out;
}

/**
 * This site has more than one sitemap, and robots.txt says so. Poker Arena
 * is a separate application proxied in under /hub/club-arena; it publishes
 * its own sitemap from its own repo, and robots.txt declares it alongside
 * this one.
 *
 * The first version of this law did not know that and accused
 * /hub/club-arena, a page serving 375 words, a title and schema, and listed
 * in the sitemap that actually owns it. The prefixes are read out of
 * robots.txt rather than written down here, so a third application added
 * later is covered the day its sitemap is declared.
 */
function prefixesOwnedByAnotherSitemap() {
  const robots = read('public/robots.txt');
  const out = [];
  for (const m of robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gm)) {
    const pathname = m[1].replace(/^https?:\/\/[^/]+/, '');
    if (pathname === '/sitemap.xml') continue; // this repo's own
    const dir = pathname.replace(/\/sitemap\.xml$/, '');
    if (dir) out.push(dir);
  }
  return out;
}

/** Every href in HubPageSummary's entries, with the entry it belongs to. */
function summaryLinks() {
  const src = read('src/components/seo/HubPageSummary.js');
  const out = [];
  let current = '(unknown)';
  for (const line of src.split('\n')) {
    const key = line.match(/^\s{2}'?([a-z0-9-]+)'?:\s*\{\s*$/);
    if (key) current = key[1];
    const href = line.match(/href:\s*'([^']+)'/);
    // A commented out line is a note, not a link.
    if (href && !line.trim().startsWith('//')) out.push({ entry: current, href: href[1] });
  }
  return out;
}

test('every summary link points at a page the sitemap is willing to list', () => {
  const listed = sitemapRoutes();
  const elsewhere = prefixesOwnedByAnotherSitemap();
  const ownedElsewhere = (href) => elsewhere.some((p) => href === p || href.startsWith(`${p}/`));
  const dangling = summaryLinks()
    .filter(({ href }) => href.startsWith('/'))
    .filter(({ href }) => !listed.has(href) && !ALWAYS_REAL.has(href) && !ownedElsewhere(href))
    .map(({ entry, href }) => `${href}   (linked from the "${entry}" summary)`);

  assert.deepEqual(
    [...new Set(dangling)],
    [],
    'These summary links point somewhere the sitemap does not list. Either '
    + 'the page is worth indexing, in which case add it to the sitemap, or it '
    + 'is not, in which case the summary should not be telling an engine to '
    + 'go there. A route behind a closed release gate redirects, so linking '
    + 'it sends a reader and a crawler into a 307.\n\nDangling:\n  '
    + [...new Set(dangling)].join('\n  '),
  );
});

test('the sitemap asks the release gate instead of assuming a gated page exists', () => {
  const src = read('pages/sitemap.xml.js');
  assert.match(src, /isTriviaPvpReleased/);
  assert.match(src, /areTriviaTournamentsReleased/);
  // The unconditional list must not carry them: that is the bug this fixes.
  const staticBlock = src.slice(src.indexOf('const staticPages = ['), src.indexOf('export async function getServerSideProps'));
  assert.doesNotMatch(staticBlock, /path:\s*'\/hub\/trivia\/pvp'/);
  assert.doesNotMatch(staticBlock, /path:\s*'\/hub\/trivia\/tournaments'/);
});
