import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hubCollectionSchema, faqSchema } from '../src/lib/seo/hubPageSchema.js';
import { buildDailyTournamentSchema, buildSeriesDirectorySchema } from '../src/lib/poker-near-me/structuredData.js';

test('Phase 22: hubCollectionSchema supports faqs array and emits FAQPage + SpeakableSpecification', () => {
  const nodes = hubCollectionSchema({
    path: '/hub/events-calendar',
    name: 'Poker Events Calendar | Smarter.Poker',
    description: 'Live Poker Tournaments Calendar.',
    trail: [['Hub', '/hub'], ['Events Calendar', '/hub/events-calendar']],
    faqs: [
      { question: 'What Is Included?', answer: 'Daily Tournaments, Series, And Tours.' },
    ],
  });

  const collectionNode = nodes.find((n) => n['@type'] === 'CollectionPage');
  const faqNode = nodes.find((n) => n['@type'] === 'FAQPage');
  assert.ok(collectionNode, 'CollectionPage node must exist');
  assert.equal(collectionNode.speakable['@type'], 'SpeakableSpecification');
  assert.ok(faqNode, 'FAQPage node must exist');
  assert.equal(faqNode.mainEntity.length, 1);
});

test('Phase 22: buildDailyTournamentSchema and buildSeriesDirectorySchema include SpeakableSpecification', () => {
  const daily = buildDailyTournamentSchema([], '2026-10-31T00:00:00Z');
  assert.equal(daily.speakable['@type'], 'SpeakableSpecification');

  const series = buildSeriesDirectorySchema([], 0);
  assert.equal(series.speakable['@type'], 'SpeakableSpecification');
});

test('Phase 22: all 4 live discovery hubs wire FAQPage and SpeakableSpecification into their markup', () => {
  const eventsCal = fs.readFileSync(path.resolve('pages/hub/events-calendar.js'), 'utf8');
  assert.ok(eventsCal.includes('faqs: ['), 'events-calendar.js must pass faqs to hubCollectionSchema');

  const daily = fs.readFileSync(path.resolve('pages/hub/daily-tournaments.js'), 'utf8');
  assert.ok(daily.includes('faqSchema(DAILY_TOURNAMENTS_FAQS'), 'daily-tournaments.js must include faqSchema');

  const series = fs.readFileSync(path.resolve('pages/hub/poker-series.js'), 'utf8');
  assert.ok(series.includes('faqSchema(POKER_SERIES_FAQS'), 'poker-series.js must include faqSchema');

  const tours = fs.readFileSync(path.resolve('pages/hub/poker-tours.js'), 'utf8');
  assert.ok(tours.includes('faqSchema(POKER_TOURS_FAQS'), 'poker-tours.js must include faqSchema');
  assert.ok(tours.includes('SpeakableSpecification'), 'poker-tours.js must include SpeakableSpecification');
});
