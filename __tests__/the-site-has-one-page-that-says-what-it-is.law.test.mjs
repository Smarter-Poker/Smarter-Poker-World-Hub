/**
 * THE SITE HAS ONE PAGE THAT SAYS WHAT IT IS (AEO phase 2, 2026-09-17).
 *
 * An AI engine answering "what is Smarter Poker" or "who makes Club
 * Commander" looks for a single page that states the entity: the legal
 * name, what the platform is, what it is not, what it makes and how to
 * reach it. The site had none, so an engine had to assemble the answer
 * from a landing page and six product surfaces, and the trading name
 * collides with an unrelated consultancy that shares it.
 *
 * /about is that anchor. This pins the four things that make it work:
 * the page exists and is a real document, its AboutPage schema is wired
 * into the same entity graph as the Organization and the WebSite, the
 * sitemap promotes it so a crawler can find it without a referring link,
 * and it is linked from a page that is already crawled. If any one of
 * those is dropped, the anchor stops anchoring and the test says so.
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

test('the about page exists and states the entity in server-rendered words', () => {
  const src = read('pages/about.js');
  assert.match(src, /<h1[^>]*>About Smarter\.Poker<\/h1>/, 'one h1 naming the entity');
  assert.ok(!/ssr: false/.test(src), 'the page is not behind a client-only shell');

  // The legal name and the platform definition are the two facts an engine
  // needs to answer "who makes this". Both must be in the markup, not in a
  // component that only mounts in the browser.
  assert.ok(src.includes('Smarter Software Inc'), 'the legal entity is named');
  assert.match(src, /Free Online Poker Platform/i, 'the platform definition is stated');

  // What it is NOT matters as much: the trading name collides with
  // real-money gambling sites, and an engine repeats what it reads.
  assert.ok(src.includes('No Real-Money Gambling') || /There Is No Real-Money Gambling/.test(src),
    'the page says there is no real-money gambling');
  assert.match(src, /Free To Play\. 18\+\./, 'the compliance line is present');

  // Enough prose to be worth citing. Strip tags and style objects first.
  const prose = src
    .slice(src.indexOf('<main'), src.indexOf('const styles'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ');
  const words = prose.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
  assert.ok(words >= 120, `the about page carries only ${words} words of prose`);
});

test('the about page joins the entity graph instead of starting a second one', () => {
  const src = read('pages/about.js');
  assert.match(src, /'@type':\s*'AboutPage'/, 'the page declares an AboutPage node');
  assert.match(src, /'@id':\s*'https:\/\/smarter\.poker\/about#page'/, 'the node has a stable @id');
  assert.match(
    src,
    /mainEntity:\s*\{\s*'@id':\s*'https:\/\/smarter\.poker\/#organization'\s*\}/,
    'the page points at the Organization node, it does not redeclare it',
  );
  assert.match(
    src,
    /isPartOf:\s*\{\s*'@id':\s*'https:\/\/smarter\.poker\/#website'\s*\}/,
    'the page points at the WebSite node',
  );
  assert.match(src, /jsonLd=\{\[schemas\.organization, ABOUT_PAGE_SCHEMA\]\}/, 'both nodes ship together');

  // The ids it references have to be the ids SEOHead actually publishes.
  const head = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.ok(head.includes("'https://smarter.poker/#organization'"), 'SEOHead publishes the Organization @id');
  assert.ok(head.includes("'https://smarter.poker/#website'"), 'SEOHead publishes the WebSite @id');
});

test('a crawler can reach the about page without guessing the URL', () => {
  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /path:\s*'\/about'/, 'the sitemap lists /about');

  const landing = read('src/components/landing/LandingProductSummary.js');
  assert.match(landing, /href="\/about"|href='\/about'/, 'the landing summary links to /about');
});

test('the about copy obeys the house rules', () => {
  const src = read('pages/about.js');
  const copy = src.slice(src.indexOf('<main'), src.indexOf('const styles'));
  assert.doesNotMatch(copy, /—/, 'no em dashes in the copy');
});
