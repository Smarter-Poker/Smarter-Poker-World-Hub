import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderVenueMarkdown } from '../src/lib/seo/markdownIngestion.mjs';

test('Phase 25: renderVenueMarkdown includes Executive Fact Summary, GPS Coordinates, and State/City Directory links', () => {
  const md = renderVenueMarkdown({
    id: 1832,
    name: 'The Lodge Card Club',
    venue_type: 'card_room',
    address: '1000 E Main St',
    city: 'Round Rock',
    state: 'TX',
    latitude: 30.50825,
    longitude: -97.67889,
    poker_tables: 70,
    hours: '24/7',
    games_offered: 'NLH, PLO, Mixed',
    stakes_cash: '$1/$2, $1/$3, $2/$5',
    has_tournaments: true,
  });

  assert.ok(md.includes('## Executive Fact Summary'));
  assert.ok(md.includes('**GPS Coordinates**: 30.50825, -97.67889'));
  assert.ok(md.includes('https://smarter.poker/hub/poker-near-me/in/tx'));
  assert.ok(md.includes('https://smarter.poker/hub/poker-near-me/in/tx/round-rock'));
  assert.ok(!md.includes('—'));
});

test('Phase 25: SEOHead auto-resolves /hub/venues/[id].md and /hub/series/[id].md', () => {
  const seoHead = fs.readFileSync(path.resolve('src/components/seo/SEOHead.js'), 'utf8');
  assert.ok(seoHead.includes("pathname === '/hub/venues/[id]'"));
  assert.ok(seoHead.includes("pathname === '/hub/series/[id]'"));
});
