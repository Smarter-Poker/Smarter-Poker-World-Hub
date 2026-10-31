import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderLocationDirectoryMarkdown } from '../src/lib/seo/markdownIngestion.mjs';

test('Phase 24: renderLocationDirectoryMarkdown emits clean Title Case Markdown for national, state, and city geo hubs', () => {
  const nationalMd = renderLocationDirectoryMarkdown({
    title: 'Live Poker Rooms By State And City',
    description: 'Browse Verified Casino Poker Rooms And Cardrooms By State.',
    canonicalUrl: 'https://smarter.poker/hub/poker-near-me/in',
    states: [{ name: 'Texas', href: '/hub/poker-near-me/in/tx', count: 86 }],
    resultCount: 324,
  });
  assert.ok(nationalMd.includes('# Live Poker Rooms By State And City'));
  assert.ok(nationalMd.includes('https://smarter.poker/hub/poker-near-me/in/tx.md'));
  assert.ok(!nationalMd.includes('—'));

  const stateMd = renderLocationDirectoryMarkdown({
    title: 'Poker Rooms In Texas',
    description: 'Explore Casino Poker Rooms Across Texas.',
    canonicalUrl: 'https://smarter.poker/hub/poker-near-me/in/tx',
    stateCode: 'TX',
    stateName: 'Texas',
    cities: [{ name: 'Austin', href: '/hub/poker-near-me/in/tx/austin', count: 12 }],
    venues: [{ id: 1832, name: 'The Lodge Card Club', city: 'Austin', state: 'TX', poker_tables: 70 }],
    resultCount: 86,
  });
  assert.ok(stateMd.includes('# Poker Rooms In Texas'));
  assert.ok(stateMd.includes('https://smarter.poker/hub/poker-near-me/in/tx/austin.md'));
  assert.ok(stateMd.includes('https://smarter.poker/hub/venues/1832.md'));
  assert.ok(!stateMd.includes('—'));
});

test('Phase 24: next.config.js rewrites geo location .md routes and location SSR handlers serve text/markdown', () => {
  const nextConfig = fs.readFileSync(path.resolve('next.config.js'), 'utf8');
  assert.ok(nextConfig.includes("source: '/hub/poker-near-me/in.md'"));
  assert.ok(nextConfig.includes("source: '/hub/poker-near-me/in/:state.md'"));
  assert.ok(nextConfig.includes("source: '/hub/poker-near-me/in/:state/:city.md'"));

  for (const rel of [
    'pages/hub/poker-near-me/in/index.js',
    'pages/hub/poker-near-me/in/[state]/index.js',
    'pages/hub/poker-near-me/in/[state]/[city].js',
  ]) {
    const src = fs.readFileSync(path.resolve(rel), 'utf8');
    assert.ok(src.includes('renderLocationDirectoryMarkdown'), `${rel} must call renderLocationDirectoryMarkdown`);
  }
});
