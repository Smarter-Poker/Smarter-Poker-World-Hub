import test from 'node:test';
import assert from 'node:assert/strict';
import { hubProductSchema, faqSchema } from '../src/lib/seo/hubPageSchema.js';
import { seriesSchema } from '../src/lib/poker-near-me/seriesSeo.mjs';

test('faqSchema builds valid Schema.org FAQPage graph node', () => {
  const faqs = [
    { question: 'What is bankroll management?', answer: 'Managing funds to absorb poker variance.' },
    { question: 'Is it free?', answer: 'Yes, 100% free.' },
  ];
  const node = faqSchema(faqs, '/hub/bankroll-manager');
  assert.equal(node['@type'], 'FAQPage');
  assert.equal(node['@id'], 'https://smarter.poker/hub/bankroll-manager#faq');
  assert.equal(node.mainEntity.length, 2);
  assert.equal(node.mainEntity[0]['@type'], 'Question');
  assert.equal(node.mainEntity[0].name, 'What is bankroll management?');
  assert.equal(node.mainEntity[0].acceptedAnswer['@type'], 'Answer');
  assert.equal(node.mainEntity[0].acceptedAnswer.text, 'Managing funds to absorb poker variance.');
});

test('hubProductSchema appends FAQPage when faqs are provided', () => {
  const nodes = hubProductSchema({
    path: '/hub/test-product',
    name: 'Test Product',
    description: 'Description',
    trail: [['Hub', '/hub'], ['Test', '/hub/test-product']],
    faqs: [
      { question: 'Question 1?', answer: 'Answer 1' },
    ],
  });
  const faqNode = nodes.find((n) => n['@type'] === 'FAQPage');
  assert.ok(faqNode, 'FAQPage node should be present in graph');
  assert.equal(faqNode.mainEntity.length, 1);
});

test('seriesSchema includes organizer in EventSeries and subEvents', () => {
  const sample = {
    id: '123',
    name: 'WPT Championship',
    venueName: 'Bellagio',
    city: 'Las Vegas',
    state: 'NV',
    startDate: '2026-12-01',
    endDate: '2026-12-15',
    events: [
      { name: 'Event #1 Opener', startDate: '2026-12-01', startTime: '11:00', buyin: 1100 },
    ],
  };
  const nodes = seriesSchema(sample);
  const eventNode = nodes.find((n) => n['@type'] === 'EventSeries');
  assert.ok(eventNode, 'EventSeries node should be present');
  assert.equal(eventNode.organizer?.name, 'Smarter.Poker');
  assert.equal(eventNode.organizer?.['@type'], 'Organization');

  const subEvent = eventNode.subEvent?.[0];
  assert.ok(subEvent, 'subEvent should be present');
  assert.equal(subEvent.organizer?.name, 'Smarter.Poker');
});

test('hubProductSchema emits both SoftwareApplication and WebApplication in @type', () => {
  const nodes = hubProductSchema({
    path: '/hub/test-app',
    name: 'Test App',
    description: 'An interactive poker app',
    trail: [['Hub', '/hub'], ['App', '/hub/test-app']],
  });
  const appNode = nodes.find((n) => Array.isArray(n['@type']) && n['@type'].includes('WebApplication'));
  assert.ok(appNode, 'WebApplication should be included in app types');
  assert.ok(appNode['@type'].includes('SoftwareApplication'));
  assert.equal(appNode.isAccessibleForFree, true);
  assert.equal(appNode.offers?.price, '0');
});

test('seriesSchema emits hierarchical BreadcrumbList including state and venue when available', () => {
  const sample = {
    id: '468',
    name: 'Spring Series',
    venueName: 'The Lodge Card Club',
    venueId: '1828',
    city: 'Round Rock',
    state: 'TX',
    startDate: '2026-04-01',
  };
  const nodes = seriesSchema(sample);
  const breadcrumbNode = nodes.find((n) => n['@type'] === 'BreadcrumbList');
  assert.ok(breadcrumbNode, 'BreadcrumbList must be emitted in series schema');
  const items = breadcrumbNode.itemListElement;
  assert.ok(items.length >= 5, 'Should have root, hub, poker series, state, venue, and series');
  assert.equal(items[0].name, 'Smarter.Poker');
  assert.equal(items[1].name, 'Hub');
  assert.equal(items[2].name, 'Poker Series');
  assert.equal(items[3].name, 'TX');
  assert.ok(items[3].item.includes('/hub/poker-near-me/in/tx'));
  assert.equal(items[4].name, 'The Lodge Card Club');
  assert.ok(items[4].item.includes('/hub/venues/1828'));
});

