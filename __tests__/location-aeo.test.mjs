import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocationPaaQuestions, buildLocationFaqJsonLd } from '../src/lib/seo/locationAeo.mjs';

test('buildLocationPaaQuestions generates valid Q&A for state landing pages', () => {
  const questions = buildLocationPaaQuestions({
    stateName: 'Nevada',
    stateCode: 'NV',
    venueCount: 35,
    topVenues: [{ name: 'Bellagio Poker Room' }, { name: 'Aria Poker Room' }],
  });

  assert.ok(Array.isArray(questions));
  assert.equal(questions.length, 3);
  assert.equal(questions[0].question, 'How Many Poker Rooms Are In Nevada?');
  assert.ok(questions[0].answer.includes('35 verified poker venues'));
  assert.ok(questions[0].answer.includes('Bellagio Poker Room'));
});

test('buildLocationPaaQuestions generates valid Q&A for city landing pages', () => {
  const questions = buildLocationPaaQuestions({
    stateName: 'Nevada',
    stateCode: 'NV',
    city: 'Las Vegas',
    venueCount: 20,
    topVenues: [{ name: 'Bellagio Poker Room' }],
  });

  assert.ok(Array.isArray(questions));
  assert.equal(questions.length, 3);
  assert.equal(questions[0].question, 'Are There Poker Rooms In Las Vegas, Nevada?');
  assert.ok(questions[0].answer.includes('20 verified poker rooms'));
  assert.ok(questions[1].question, 'Where Can I Play Poker In Las Vegas?');
});

test('buildLocationFaqJsonLd creates Schema.org compliant FAQPage structured data', () => {
  const schema = buildLocationFaqJsonLd({
    stateName: 'Texas',
    stateCode: 'TX',
    city: 'Austin',
    venueCount: 5,
    topVenues: [{ name: 'The Lodge Card Club' }],
    canonicalUrl: 'https://smarter.poker/hub/poker-near-me/in/tx/austin',
  });

  assert.ok(schema);
  assert.equal(schema['@type'], 'FAQPage');
  assert.equal(schema['@id'], 'https://smarter.poker/hub/poker-near-me/in/tx/austin#faq');
  assert.equal(schema.mainEntity.length, 3);
  assert.equal(schema.mainEntity[0]['@type'], 'Question');
  assert.equal(schema.mainEntity[0].acceptedAnswer['@type'], 'Answer');
});
