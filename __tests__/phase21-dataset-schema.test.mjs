import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { datasetSchema } from '../src/lib/seo/hubPageSchema.js';

test('Phase 21: datasetSchema builds valid Schema.org Dataset nodes for all 4 national directories', () => {
  const routes = [
    {
      path: '/hub/poker-near-me/venues',
      name: 'Smarter.Poker Live Poker Rooms & Venues Directory Dataset',
      description: 'Verified North American Live Poker Venues, Casino Cardrooms, Active Cash Game Stakes, And Weekly Tournament Schedules.',
    },
    {
      path: '/hub/daily-tournaments',
      name: 'Smarter.Poker Daily Live Poker Tournaments Directory Dataset',
      description: 'Recurring Weekly Live Poker Tournament Schedules Across 324+ North American Cardrooms.',
    },
    {
      path: '/hub/poker-series',
      name: 'Smarter.Poker Live Poker Tournament Series Directory Dataset',
      description: 'Live And Upcoming Multi-Event Poker Tournament Series, Casino Festivals, And Regional Circuit Stops.',
    },
    {
      path: '/hub/poker-tours',
      name: 'Smarter.Poker Major Traveling Poker Tours & Circuits Dataset',
      description: 'National Directory Of Major Traveling Poker Tours, Circuit Stops, And Championship Festivals.',
    },
  ];

  for (const r of routes) {
    const node = datasetSchema(r);
    assert.equal(node['@type'], 'Dataset');
    assert.equal(node['@id'], `https://smarter.poker${r.path}#dataset`);
    assert.equal(node.url, `https://smarter.poker${r.path}`);
    assert.equal(node.isAccessibleForFree, true);
    assert.equal(node.license, 'https://smarter.poker/terms');
    assert.equal(node.creator.name, 'Smarter.Poker');
  }
});

test('Phase 21: all 4 national poker directories wire datasetSchema into their JSON-LD output', () => {
  const files = [
    'pages/hub/poker-near-me/[pnmTab].js',
    'pages/hub/daily-tournaments.js',
    'pages/hub/poker-series.js',
    'pages/hub/poker-tours.js',
  ];

  for (const rel of files) {
    const src = fs.readFileSync(path.resolve(rel), 'utf8');
    assert.ok(src.includes('datasetSchema('), `${rel} must invoke datasetSchema()`);
  }
});
