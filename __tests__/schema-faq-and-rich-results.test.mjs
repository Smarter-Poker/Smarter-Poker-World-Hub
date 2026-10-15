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
