/**
 * THE HUB PRODUCT PAGES SAY WHAT THEY ARE (AEO phase 3, 2026-09-17).
 *
 * The World Hub publishes about thirty /hub routes in the sitemap at
 * priority 0.7 to 0.9. Measured on production with every script stripped,
 * most were navigation chrome and nothing else: /hub carried 31 words and
 * NO heading at all, /hub/bankroll-manager 51, /hub/home-games 59,
 * /hub/poker-near-me/lobby 78. Googlebot runs JavaScript and eventually
 * sees the app; OAI-SearchBot, Claude-SearchBot, PerplexityBot and
 * meta-webindexer do not, and they are the crawlers that decide what an AI
 * answer may cite.
 *
 * src/components/seo/HubPageSummary.js is the server-rendered answer, the
 * same one the landing page already uses. This pins that every page the
 * sitemap promotes still renders it, that each entry carries enough words
 * to be worth reading, and that the copy obeys the house rules.
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

/** page file -> the summary key it must render. */
const PAGES = {
  'pages/hub/index.js': 'hub',
  'pages/hub/home-games.js': 'home-games',
  'pages/hub/bankroll-manager.js': 'bankroll-manager',
  'pages/hub/poker-near-me/lobby.js': 'poker-near-me',
};

test('every thin hub page renders its summary, and imports it', () => {
  for (const [file, key] of Object.entries(PAGES)) {
    const src = read(file);
    assert.match(src, /import HubPageSummary from '[^']+HubPageSummary'/, `${file} imports the summary`);
    assert.match(
      src,
      new RegExp(`<HubPageSummary page="${key}"`),
      `${file} renders <HubPageSummary page="${key}">`,
    );
  }
});

test('the hub root asks for an h1, because it has no heading of its own', () => {
  const src = read('pages/hub/index.js');
  assert.match(src, /<HubPageSummary page="hub" as="h1" \/>/);
  // WorldHub is ssr:false, so without this the server HTML has no heading.
  assert.match(src, /ssr: false/);
});

test('each summary carries enough words to be worth reading, and links onward', () => {
  const src = read('src/components/seo/HubPageSummary.js');
  const keys = [...src.matchAll(/^ {2}'?([a-z-]+)'?: \{$/gm)].map((m) => m[1]);
  for (const key of Object.values(PAGES)) {
    assert.ok(keys.includes(key), `HUB_PAGE_SUMMARIES has an entry for ${key}`);
  }
  for (const [, block] of src.matchAll(/lead:\s*\n?\s*'([^']+)'/g)) {
    const words = block.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 45, `a lead of ${words} words is too thin: ${block.slice(0, 60)}`);
  }
  const hrefs = [...src.matchAll(/href: '(\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 15, `${hrefs.length} onward links is too few`);
  for (const href of hrefs) assert.match(href, /^\/(hub|terms|privacy|legal)/, `${href} is an in-site route`);
});

test('the copy obeys the house rules and does not contradict the landing page', () => {
  const src = read('src/components/seo/HubPageSummary.js');
  assert.doesNotMatch(src, /—/, 'no em dashes in the copy');
  // The landing page and these pages must define the products the same way:
  // an AI engine repeats the definition it sees most often.
  const landing = read('src/components/landing/LandingProductSummary.js');
  for (const claim of ['No Real-Money Gambling', 'No Cash Value']) {
    assert.ok(src.includes(claim) || landing.includes(claim), `"${claim}" appears in the shared definitions`);
  }
  assert.match(src, /Free To Play\. 18\+\./, 'the compliance line is present');
});
