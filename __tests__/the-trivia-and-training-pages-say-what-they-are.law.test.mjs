/**
 * THE TRIVIA AND TRAINING PAGES SAY WHAT THEY ARE (AEO phase 3,
 * 2026-09-17).
 *
 * Measured on production as OAI-SearchBot with scripts and styles
 * stripped, the eight trivia routes and the training sub-pages returned
 * between 0 and 77 words each. /hub/trivia/endless returned nothing at
 * all, /hub/trivia/mixed two words, /hub/training/jarvis ten. Everything
 * they render arrives after a data load, so a crawler saw the chrome and
 * left.
 *
 * Two of the routes in that list were not pages at all:
 * /hub/training/analyzer is getServerSideProps returning a redirect, and
 * /hub/training/play-mode renders a redirect shim into the arena. They
 * left the sitemap instead of gaining copy, and the sitemap law gained a
 * scanner so a third one cannot arrive.
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
  'pages/hub/trivia/index.js': 'trivia',
  'pages/hub/trivia/endless.js': 'trivia-endless',
  'pages/hub/trivia/survival.js': 'trivia-survival',
  'pages/hub/trivia/time-attack.js': 'trivia-time-attack',
  'pages/hub/trivia/mixed.js': 'trivia-mixed',
  'pages/hub/trivia/pvp.js': 'trivia-pvp',
  'pages/hub/trivia/tournaments.js': 'trivia-tournaments',
  'pages/hub/trivia/leaderboard.js': 'trivia-leaderboard',
  'pages/hub/training/challenges.js': 'training-challenges',
  'pages/hub/training/leaderboard.js': 'training-leaderboard',
  'pages/hub/training/tournaments.js': 'training-tournaments',
  'pages/hub/training/jarvis.js': 'training-jarvis',
  'pages/hub/training/solutions.js': 'training-solutions',
};

test('every trivia and training page renders its summary, and imports it', () => {
  for (const [file, key] of Object.entries(PAGES)) {
    const src = read(file);
    assert.match(src, /import HubPageSummary from '[^']+HubPageSummary'/, `${file} imports the summary`);
    assert.ok(src.includes(`<HubPageSummary page="${key}" />`), `${file} renders the ${key} summary`);
  }
});

test('no summary is hidden behind a wrapper that never renders on the server', () => {
  for (const file of Object.keys(PAGES)) {
    const src = read(file)
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const clientOnly = [...src.matchAll(/const (\w+) = dynamic\([\s\S]{0,300}?ssr:\s*false/g)].map((m) => m[1]);
    for (const component of clientOnly) {
      for (const open of src.matchAll(new RegExp(`<${component}[\\s>]`, 'g'))) {
        const close = src.indexOf(`</${component}>`, open.index);
        if (close === -1) continue;
        assert.ok(
          !src.slice(open.index, close).includes('<HubPageSummary'),
          `${file}: the summary sits inside <${component}>, which is dynamic(ssr:false)`,
        );
      }
    }
  }
});

test('each mode has its own words, not one blurb repeated', () => {
  // Thirteen near-identical paragraphs would be worse than none: an engine
  // reading the same sentence on eight routes learns the site has one page.
  const src = read('src/components/seo/HubPageSummary.js');
  const leads = [];
  for (const key of Object.values(PAGES)) {
    const quoted = key.includes('-') ? `'${key}'` : key;
    const start = src.indexOf(`  ${quoted}: {`);
    assert.ok(start !== -1, `HUB_PAGE_SUMMARIES has an entry for ${key}`);
    const lead = src.slice(start).match(/lead:\s*\n?\s*'([^']+)'/)?.[1];
    assert.ok(lead, `${key} has a lead`);
    assert.ok(lead.split(/\s+/).length >= 45, `${key} has a lead of only ${lead.split(/\s+/).length} words`);
    leads.push(lead);
  }
  assert.equal(new Set(leads).size, leads.length, 'every lead is distinct');

  // A quiz and a drill are not gambling, and the copy has to say so.
  const triviaLeads = leads.filter((l) => /trivia|quiz|question/i.test(l));
  assert.ok(triviaLeads.length >= 4, 'the trivia entries describe the quiz');
  for (const lead of triviaLeads) {
    assert.match(lead, /free to play|free to enter|free to appear/i, `a trivia lead must say it is free: ${lead.slice(0, 50)}`);
  }
});

test('a route that only redirects is not offered as a page', () => {
  const sitemap = read('pages/sitemap.xml.js');
  for (const route of ['/hub/training/analyzer', '/hub/training/play-mode']) {
    assert.ok(!sitemap.includes(`path: '${route}'`), `${route} is a redirect, not a page`);
  }
  // And nothing links a reader at one from the summaries either.
  const summaries = read('src/components/seo/HubPageSummary.js');
  for (const route of ['/hub/training/analyzer', '/hub/training/play-mode']) {
    assert.ok(!summaries.includes(`href: '${route}'`), `the summaries must not point at ${route}`);
  }
});
