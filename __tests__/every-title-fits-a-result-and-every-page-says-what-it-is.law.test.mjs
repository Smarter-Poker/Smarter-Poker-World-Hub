/**
 * EVERY TITLE FITS A RESULT, AND A LOADING PAGE STILL SAYS WHAT IT IS
 * (AEO phase 3, 2026-09-17).
 *
 * Two laws already held titles to 60 characters, and both were lists of
 * files. A list only covers the files someone remembered. Measured on
 * production after both laws were passing, three pages still shipped over
 * 60 because no list named them:
 *
 *   65  Poker Glossary: 49 GTO And Strategy Terms Defined | Smarter.Poker
 *   62  Poker Social Hub: Feed, Friends And Discussion | Smarter.Poker
 *   62  Scenario Analysis · Verified Evidence Required | Smarter.Poker
 *
 * The glossary's own law even checked the length, of the raw string,
 * before SEOHead appends " | Smarter.Poker". This one is a scanner: every
 * page, every literal title, measured as it ships and HTML escaped,
 * because "&" becomes "&amp;" and costs four characters nobody counts.
 *
 * The second half is the loading trap, met three times in one evening.
 * /hub/commander/responsible-gaming, /hub/social-media and /hub/reels each
 * returned early while data loaded, and everything below that early return
 * was absent from the server HTML. A page that is loading is exactly the
 * page a crawler sees, so whatever says what the page is has to render in
 * that branch too.
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

function pageFiles(dir = 'pages', out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'api' || entry.name === 'node_modules') continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) pageFiles(rel, out);
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** The page files behind the routes the sitemap offers. */
function sitemapPageFiles() {
  const routes = [...read('pages/sitemap.xml.js').matchAll(/\{ path: '([^']+)'/g)].map((m) => m[1]);
  const files = [];
  for (const route of routes) {
    const candidates =
      route === '/' ? ['pages/index.js'] : [`pages${route}.js`, `pages${route}/index.js`];
    const file = candidates.find((f) => fs.existsSync(path.join(ROOT, f)));
    if (!file) continue;
    // A re-export serves its target's head, so follow it.
    const src = read(file);
    const reexport = src.match(/export \{ default \} from '(\.[^']+)'/);
    if (reexport) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), reexport[1]));
      for (const f of [`${target}.js`, `${target}/index.js`]) {
        if (fs.existsSync(path.join(ROOT, f))) { files.push(f); break; }
      }
      continue;
    }
    files.push(file);
  }
  return [...new Set(files)];
}

/** The route a page file serves, as robots.txt would name it. */
function routeOf(file) {
  return file.replace(/^pages/, '').replace(/\/index\.js$/, '').replace(/\.js$/, '') || '/';
}

/** Every Disallow in the served robots.txt, matched as a prefix. */
const DISALLOWED = [
  ...new Set(
    [...fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8').matchAll(/^Disallow:\s*(\S+)$/gm)].map(
      (m) => m[1],
    ),
  ),
];
const disallowed = (route) => DISALLOWED.some((rule) => route === rule || route.startsWith(rule));

/** What the browser actually renders in the tab, escaped as HTML. */
const shippedTitle = (raw) =>
  (raw.includes('Smarter.Poker') ? raw : `${raw} | Smarter.Poker`).replace(/&/g, '&amp;');

test('every literal page title fits a search result', () => {
  const offenders = [];
  for (const file of pageFiles()) {
    const src = read(file);
    // A page that tells crawlers not to index it has no search result to
    // fit into. pages/USRobots.js is a noindex pitch deck, not a product.
    const declaresNoindex =
      /content="noindex/.test(src) || /<SEOHead[\s\S]{0,600}?\bnoindex\b/.test(src);
    if (declaresNoindex) continue;
    const titles = [
      ...[...src.matchAll(/<SEOHead[\s\S]{0,600}?title="([^"]+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/<title>([^<{]+)<\/title>/g)].map((m) => m[1]),
    ];
    for (const raw of titles) {
      const shipped = shippedTitle(raw);
      if (shipped.length > 60) offenders.push(`${file}: ${shipped.length} characters: ${shipped}`);
      if (/—/.test(shipped)) offenders.push(`${file}: em dash in the title: ${shipped}`);
      if ((shipped.match(/Smarter\.Poker/g) || []).length > 1) {
        offenders.push(`${file}: names the site twice: ${shipped}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `titles that do not fit a result:\n${offenders.join('\n')}`);
});

test('every literal description is long enough to be worth reading', () => {
  // The title had a scanner; the description had two laws, each naming one
  // page. Measured on production with both of those passing, /hub/merch-store
  // shipped 69 characters and four of the five store tabs said one short
  // sentence each. A description is what a result shows under the title and
  // what an engine quotes when it paraphrases rather than cites, so a
  // fragment is a wasted slot (AEO phase 3, 2026-09-18).
  //
  // 110 is the floor, not the target: below it a description cannot say what
  // the page is AND what it is not, and on this site the second half is the
  // part that stops an engine filing a free poker platform as a casino.
  //
  // SCOPED TO THE PAGES THE SITEMAP OFFERS. Running it over every file in
  // pages/ flags 44, nearly all of them viewer-only tools nobody can reach
  // from a result: the toke tracker, saved posts, a poker table by id. A
  // description only matters where a result exists, and rewriting the rest
  // would be an audit expanding because more code exists. It stays a scanner,
  // not a list: a route added to the sitemap tomorrow is covered the same day.
  const offenders = [];
  for (const file of sitemapPageFiles()) {
    const src = read(file);
    const declaresNoindex =
      /content="noindex/.test(src) || /<SEOHead[\s\S]{0,600}?\bnoindex\b/.test(src);
    if (declaresNoindex) continue;
    // A path robots.txt disallows has no search result either. Read the real
    // file rather than keeping a second list of exceptions beside it.
    if (disallowed(routeOf(file))) continue;
    // ONLY WHAT REACHES THE HEAD. An earlier version also read every
    // `description:` in the file and flagged "Endless Trivia skip lifeline",
    // a tooltip. A law that reports tooltips is a law someone switches off.
    // A description built from a variable (the store's TAB_META) is not a
    // literal and is not measured here; the live audit reads the served page.
    const found = [
      ...[...src.matchAll(/<SEOHead[\s\S]{0,900}?\bdescription="([^"]+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/<meta\s+name="description"\s+content="([^"]+)"/g)].map((m) => m[1]),
    ];
    for (const description of found) {
      if (description.length < 110) {
        offenders.push(`${file}: ${description.length} characters: ${description}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `descriptions too short to say anything:\n${offenders.join('\n')}`);
});

test('a page that is still loading says what it is', () => {
  // The summary is the only body copy a crawler gets on these pages, and a
  // crawler always arrives at the loading branch. An early return is fine
  // as long as that branch renders the summary too.
  const offenders = [];
  for (const file of pageFiles()) {
    const src = read(file);
    if (!src.includes('<HubPageSummary')) continue;
    const lines = src.split('\n');
    const componentAt = lines.findIndex((l) => l.startsWith('export default function'));
    if (componentAt === -1) continue;
    const lastSummary = lines.map((l, i) => (l.includes('<HubPageSummary') ? i : -1)).filter((i) => i >= 0).pop();
    for (let i = componentAt; i < lastSummary; i += 1) {
      const isJsxReturn = /^\s{2,6}return \(\s*$/.test(lines[i]) || /^\s{2,6}return </.test(lines[i]);
      if (!isJsxReturn) continue;
      let j = i - 1;
      while (j > componentAt && !lines[j].trim()) j -= 1;
      const guarded = /\bif\s*\(/.test(lines[j]) || /\bif\s*\(/.test(lines[i - 1] || '');
      if (!guarded) continue;
      // Walk to the end of this returned expression and look inside it.
      let end = i;
      while (end < lines.length && !/^\s{2,6}\);\s*$/.test(lines[end])) end += 1;
      const branch = lines.slice(i, end + 1).join('\n');
      if (!branch.includes('<HubPageSummary')) {
        offenders.push(`${file}: the branch returning at line ${i + 1} renders no summary`);
      }
    }
  }
  assert.deepEqual(offenders, [], `a crawler meets the early return, not the copy:\n${offenders.join('\n')}`);
});

test('the reels page says what it is in every branch it can return from', () => {
  // It has three: loading, load error, and an empty feed. A crawler gets
  // the first one, every time.
  const src = read('pages/hub/reels.js');
  assert.ok(
    (src.match(/<HubPageSummary page="reels"[^>]*\/>/g) || []).length >= 4,
    'the summary renders in the loading, error, empty and loaded branches',
  );
});
