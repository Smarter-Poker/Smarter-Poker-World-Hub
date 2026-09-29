#!/usr/bin/env node
/**
 * REACHABILITY: how much of the sitemap can be found by following links.
 * (AEO phase 3, 2026-09-19.)
 *
 * A sitemap is an invitation. A link is the road. Every earlier measurement
 * in this programme read one page at a time and asked whether it said enough;
 * none of them asked whether anything pointed at it. When that question was
 * finally asked, the answer was that 276 of 1,191 routes, 23 percent of the
 * site, were listed in the sitemap and linked from nowhere:
 *
 *     family                       in sitemap   reachable
 *     /hub/venues/<id>                    478    476  100%
 *     /hub/poker-near-me/in/...           389    389  100%
 *     /hub/series/<id>                    225      0    0%
 *     /hub/tours/<code>                    28      0    0%
 *     /hub/home-games/in/...                4      0    0%
 *     curated /hub routes                  67     50   75%
 *
 * The cause was the same everywhere: the directory card navigated through
 * its wrapper's onClick with router.push, so the server HTML carried no
 * href at all. A reader with a mouse never noticed. A crawler saw divs.
 *
 * WHY THIS IS A SCRIPT AND NOT A LAW. Reachability is a property of what the
 * server actually returns, so it cannot be decided by reading source. Two
 * attempts at a static law for it passed with the links deleted, which is
 * the one result a law must never give. The law that ships alongside this
 * (__tests__/a-directory-lists-what-it-contains.law.test.mjs) pins the
 * narrow, checkable part: the directory for each family renders an href into
 * it. This script measures the rest, against the real site, after a deploy.
 *
 * Usage:
 *   node scripts/aeo/crawl-reachability.mjs [--origin https://smarter.poker]
 *                                           [--depth 3] [--max 400]
 *
 * Reads only. Fetches server HTML with a non-JavaScript crawler's user
 * agent, because that is the audience this measures for.
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ORIGIN = flag('origin', 'https://smarter.poker').replace(/\/+$/, '');
const DEPTH = Number(flag('depth', '4'));
const MAX_PAGES = Number(flag('max', '600'));
// --all prints every unreachable route instead of the first eight.
const SHOW_ALL = args.includes('--all');

// The crawlers that decide what ChatGPT, Claude and Perplexity may cite do
// not run JavaScript. This is one of them, so what it sees is the measurement.
const UA = 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)';

/** The families the sitemap fills in, for reporting. A route matches the first. */
const FAMILIES = [
  ['/hub/venues/', 'venue pages'],
  ['/hub/series/', 'series pages'],
  ['/hub/tours/', 'tour pages'],
  ['/hub/poker-near-me/in/', 'location pages'],
  ['/hub/home-games/in/', 'home game locations'],
  ['/glossary', 'glossary pages'],
  ['/learn', 'lessons'],
  ['/compare', 'comparisons'],
];

const familyOf = (route) => (FAMILIES.find(([prefix]) => route.startsWith(prefix)) || [null, 'curated routes'])[1];

async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!response.ok) return null;
  return response.text();
}

async function sitemapRoutes() {
  const xml = await get(`${ORIGIN}/sitemap.xml`);
  if (!xml) throw new Error('could not read the sitemap');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(ORIGIN, '').trim())
    .map((route) => (route === '' ? '/' : route));
}

/**
 * Internal links in the server HTML, before any script runs. Query strings
 * and fragments are dropped: they lead to the same document.
 */
function linksIn(html) {
  const out = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const raw = m[1];
    if (!raw.startsWith('/') || raw.startsWith('//')) continue;
    const route = raw.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
    out.add(route);
  }
  return out;
}

async function main() {
  const listed = await sitemapRoutes();
  const inSitemap = new Set(listed);

  const seen = new Set(['/']);
  const found = new Set(['/']);
  let frontier = ['/'];
  let fetched = 0;

  for (let level = 0; level < DEPTH && frontier.length && fetched < MAX_PAGES; level += 1) {
    const next = [];
    for (const route of frontier) {
      if (fetched >= MAX_PAGES) break;
      let html;
      try {
        html = await get(ORIGIN + route);
      } catch {
        html = null;
      }
      fetched += 1;
      if (!html) continue;
      for (const link of linksIn(html)) {
        found.add(link);
        if (!seen.has(link)) {
          seen.add(link);
          // A page the sitemap does not list can still be the road to one
          // that it does, so every internal link is worth a fetch. Restricting
          // the frontier to sitemap routes was the first version of this and
          // it reported 11 percent reachable on a site that measures far
          // better, because a hub page that is not itself listed was never
          // followed.
          next.push(link);
        }
      }
    }
    frontier = next;
    process.stderr.write(
      `depth ${level + 1}: ${fetched} fetched, ${found.size} routes seen, `
      + `${next.length} queued\n`,
    );
  }

  const byFamily = new Map();
  for (const route of listed) {
    const family = familyOf(route);
    const row = byFamily.get(family) || { listed: 0, reachable: 0, missing: [] };
    row.listed += 1;
    if (found.has(route)) row.reachable += 1;
    else row.missing.push(route);
    byFamily.set(family, row);
  }

  let totalListed = 0;
  let totalReachable = 0;
  console.log(`\nreachability from / at depth ${DEPTH}, ${fetched} pages fetched as a non-JavaScript crawler\n`);
  console.log(`${'family'.padEnd(22)}${'in sitemap'.padStart(12)}${'reachable'.padStart(12)}${'  '}`);
  for (const [family, row] of byFamily) {
    totalListed += row.listed;
    totalReachable += row.reachable;
    const pct = row.listed ? Math.round((row.reachable / row.listed) * 100) : 0;
    console.log(`${family.padEnd(22)}${String(row.listed).padStart(12)}${String(row.reachable).padStart(12)}  ${pct}%`);
  }
  const pct = totalListed ? Math.round((totalReachable / totalListed) * 100) : 0;
  console.log(`${'TOTAL'.padEnd(22)}${String(totalListed).padStart(12)}${String(totalReachable).padStart(12)}  ${pct}%\n`);

  for (const [family, row] of byFamily) {
    if (!row.missing.length) continue;
    console.log(`${family}: ${row.missing.length} unreachable, first few:`);
    for (const route of (SHOW_ALL ? row.missing : row.missing.slice(0, 8))) console.log(`   ${route}`);
  }

  // A crawl that cannot reach most of the site is a finding, not a pass.
  process.exitCode = pct >= 95 ? 0 : 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 2;
});
