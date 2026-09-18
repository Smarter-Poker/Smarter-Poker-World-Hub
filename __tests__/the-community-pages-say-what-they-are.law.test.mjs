/**
 * THE COMMUNITY PAGES SAY WHAT THEY ARE (AEO phase 3, 2026-09-17).
 *
 * Measured on production as OAI-SearchBot with scripts and styles
 * stripped, the nine community routes returned between 0 and 127 words:
 *
 *   /hub/social-media    0 words, and no <title> either
 *   /hub/reels           0 words
 *   /hub/lives           9 words
 *   /hub/news/sources   10 words
 *   /hub/social-pages   28 words
 *   /hub/pages          37 words
 *   /hub/promotions     40 words
 *   /hub/leaderboards   47 words
 *   /hub/help          127 words
 *
 * /hub/social-media is the one that mattered most and the one that was
 * worst: its <SEOHead> sat below the loading skeleton's early return, so
 * the server HTML carried the app's default head and nothing else. Same
 * shape as the responsible gaming page, same fix: the head is built once
 * and rendered in both branches.
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

const PAGES = {
  'pages/hub/social-media/index.js': 'social-media',
  'pages/hub/reels.js': 'reels',
  'pages/hub/lives.js': 'lives',
  'pages/hub/social-pages/index.js': 'social-pages',
  'pages/hub/pages.js': 'pages',
  'pages/hub/leaderboards.js': 'leaderboards',
  'pages/hub/promotions.js': 'promotions',
  'pages/hub/help.js': 'help',
  'pages/hub/news/sources.js': 'news-sources',
};

test('every community page renders its summary, and imports it', () => {
  for (const [file, key] of Object.entries(PAGES)) {
    const src = read(file);
    assert.match(src, /import HubPageSummary from '[^']+HubPageSummary'/, `${file} imports the summary`);
    assert.ok(
      src.includes(`<HubPageSummary page="${key}" />`) || src.includes(`<HubPageSummary page="${key}" as="h1" />`),
      `${file} renders the ${key} summary`,
    );
  }
});

test('the social hub head survives its own loading branch', () => {
  // It shipped no title at all, because SEOHead sat below the skeleton's
  // early return. The head is built once and rendered in both branches.
  const src = read('pages/hub/social-media/index.js');
  assert.match(src, /const head = \(\s*\n\s*<SEOHead/, 'the head is built once');
  assert.ok((src.match(/\{head\}/g) || []).length >= 2, 'and rendered in both branches');
  const loading = src.slice(src.indexOf('if (loading )'), src.indexOf('  return (\n    <PageTransition>'));
  assert.ok(loading.includes('{head}'), 'the loading branch carries the head');
  assert.ok(loading.includes('<HubPageSummary page="social-media" as="h1" />'), 'and the words');
  assert.match(src, /jsonLd=\{SOCIAL_SCHEMA\}/, 'and structured data');
});

test('each community page has its own words', () => {
  const src = read('src/components/seo/HubPageSummary.js');
  const leads = [];
  for (const key of Object.values(PAGES)) {
    const quoted = key.includes('-') ? `'${key}'` : key;
    const start = src.indexOf(`  ${quoted}: {`);
    assert.ok(start !== -1, `HUB_PAGE_SUMMARIES has an entry for ${key}`);
    const lead = src.slice(start).match(/lead:\s*\n?\s*'([^']+)'/)?.[1];
    assert.ok(lead && lead.split(/\s+/).length >= 45, `${key} has a thin lead`);
    leads.push(lead);
  }
  assert.equal(new Set(leads).size, leads.length, 'every lead is distinct');
});

test('nothing here is described as gambling, because none of it is', () => {
  const src = read('src/components/seo/HubPageSummary.js');
  const flat = src.replace(/\s+/g, ' ');
  // The promotions page is the one that could read as a casino offer.
  const promotions = src.slice(src.indexOf('  promotions: {'), src.indexOf('  help: {'));
  assert.match(promotions, /Nothing Here Pays Cash/, 'promotions says what the rewards are not');
  assert.match(promotions, /promotional rewards currency/i, 'and what they are');
  assert.ok(flat.includes('Free To Read And Free To Post'), 'the social hub says it is free');
});
