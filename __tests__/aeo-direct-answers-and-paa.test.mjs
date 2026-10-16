import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVenueFactKernel,
  buildVenuePaaQuestions,
  buildVenueFaqJsonLd,
  buildVenueSpeakableJsonLd,
  buildSeriesFactKernel,
  buildSeriesPaaQuestions,
  buildSeriesFaqJsonLd,
  buildSeriesSpeakableJsonLd,
} from '../src/lib/poker-near-me/venueAeo.mjs';
import { seriesSchema } from '../src/lib/poker-near-me/seriesSeo.mjs';

test('buildVenueFactKernel generates concise Title Case extractive direct-answer kernel', () => {
  const venue = {
    id: 1828,
    name: 'The Lodge Card Club',
    city: 'Round Rock',
    state: 'TX',
    venue_type: 'card room',
    poker_tables: 82,
    hours: '24/7',
    has_tournaments: true,
  };

  const kernel = buildVenueFactKernel(venue);
  assert.ok(kernel.length > 50, 'Kernel should be detailed');
  assert.ok(kernel.includes('The Lodge Card Club is a verified card room located in Round Rock, TX featuring 82 poker tables.'));
  assert.ok(kernel.includes('Daily poker tournaments are scheduled.'));
});

test('buildVenuePaaQuestions generates structured conversational Q&A pairs', () => {
  const venue = {
    id: 1828,
    name: 'The Lodge Card Club',
    city: 'Round Rock',
    state: 'TX',
    address: '1401 S IH 35',
    poker_tables: 82,
    hours: 'Open 24 Hours',
    has_tournaments: true,
  };

  const questions = buildVenuePaaQuestions(venue);
  assert.equal(questions.length, 4);
  assert.equal(questions[0].question, 'Where Is The Lodge Card Club Located?');
  assert.ok(questions[0].answer.includes('1401 S IH 35, in Round Rock, TX'));
  assert.equal(questions[1].question, 'What Are The Operating Hours At The Lodge Card Club?');
  assert.ok(questions[1].answer.includes('Open 24 Hours'));
  assert.equal(questions[2].question, 'Does The Lodge Card Club Run Poker Tournaments?');
  assert.ok(questions[2].answer.includes('Yes, The Lodge Card Club hosts scheduled poker tournaments.'));
  assert.equal(questions[3].question, 'How Many Poker Tables Does The Lodge Card Club Have?');
  assert.ok(questions[3].answer.includes('82 dedicated tables'));
});

test('buildVenueFaqJsonLd produces valid Schema.org FAQPage graph node', () => {
  const venue = {
    id: 1828,
    name: 'The Lodge Card Club',
    city: 'Round Rock',
    state: 'TX',
  };
  const faqNode = buildVenueFaqJsonLd(venue, 'https://smarter.poker/hub/venues/1828');
  assert.equal(faqNode['@type'], 'FAQPage');
  assert.equal(faqNode['@id'], 'https://smarter.poker/hub/venues/1828#faq');
  assert.ok(Array.isArray(faqNode.mainEntity));
  assert.ok(faqNode.mainEntity.length >= 3);
  assert.equal(faqNode.mainEntity[0]['@type'], 'Question');
  assert.equal(faqNode.mainEntity[0].acceptedAnswer['@type'], 'Answer');
});

test('buildVenueSpeakableJsonLd targets fact kernel and info grid CSS selectors', () => {
  const speakable = buildVenueSpeakableJsonLd('https://smarter.poker/hub/venues/1828');
  assert.equal(speakable['@type'], 'SpeakableSpecification');
  assert.equal(speakable['@id'], 'https://smarter.poker/hub/venues/1828#speakable');
  assert.deepEqual(speakable.cssSelector, ['.venue-aeo-kernel', '.info-grid']);
});

test('buildSeriesFactKernel and buildSeriesPaaQuestions generate accurate series data', () => {
  const series = {
    id: '468',
    name: 'Lodge Championship Series',
    main_event_buyin: 3000,
    total_guaranteed: 5000000,
  };
  const venueName = 'The Lodge Card Club';
  const dateRange = 'May 1 to May 15, 2026';

  const kernel = buildSeriesFactKernel(series, venueName, dateRange);
  assert.ok(kernel.includes('Lodge Championship Series is an official poker tournament series running at The Lodge Card Club during May 1 to May 15, 2026.'));
  assert.ok(kernel.includes('$3,000 Main Event buy-in'));
  assert.ok(kernel.includes('$5,000,000 in total guarantees'));

  const questions = buildSeriesPaaQuestions(series, venueName, dateRange);
  assert.equal(questions.length, 4);
  assert.equal(questions[0].question, 'When Does Lodge Championship Series Take Place?');
  assert.equal(questions[1].question, 'What Is The Main Event Buy-In For Lodge Championship Series?');
  assert.equal(questions[2].question, 'Where Is Lodge Championship Series Being Hosted?');
  assert.equal(questions[3].question, 'What Are The Guaranteed Prize Pools For Lodge Championship Series?');
});

test('seriesSchema automatically incorporates FAQPage and SpeakableSpecification into schema graph', () => {
  const sample = {
    id: '468',
    name: 'Spring Series',
    venueName: 'The Lodge Card Club',
    venueId: '1828',
    city: 'Round Rock',
    state: 'TX',
    startDate: '2026-04-01',
    endDate: '2026-04-10',
  };
  const nodes = seriesSchema(sample);
  const faqNode = nodes.find((n) => n['@type'] === 'FAQPage');
  const speakableNode = nodes.find((n) => n['@type'] === 'SpeakableSpecification');

  assert.ok(faqNode, 'FAQPage node must be in seriesSchema graph');
  assert.equal(faqNode['@id'], 'https://smarter.poker/hub/series/468#faq');
  assert.ok(faqNode.mainEntity.length >= 3);

  assert.ok(speakableNode, 'SpeakableSpecification node must be in seriesSchema graph');
  assert.deepEqual(speakableNode.cssSelector, ['.series-aeo-kernel', '.stats-grid-dl']);
});
