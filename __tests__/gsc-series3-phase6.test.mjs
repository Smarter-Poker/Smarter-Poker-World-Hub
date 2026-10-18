import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIKIDATA_ENTITIES,
  resolveVenueWikidataLinks,
  resolveSeriesWikidataLinks,
  resolveTournamentWikidataLinks,
} from '../src/lib/seo/wikidataRegistry.mjs';
import { buildDailyTournamentSchema } from '../src/lib/poker-near-me/structuredData.js';

test('Phase 6: WIKIDATA_ENTITIES includes prominent venues, series, and disciplines', () => {
  assert.ok(WIKIDATA_ENTITIES['world-series-of-poker'].qid === 'Q819961');
  assert.ok(WIKIDATA_ENTITIES['bellagio'].qid === 'Q25007');
  assert.ok(WIKIDATA_ENTITIES['choctaw-durant'].qid === 'Q5103498');
  assert.ok(WIKIDATA_ENTITIES['maryland-live'].qid === 'Q6551980');
  assert.ok(WIKIDATA_ENTITIES['texas-holdem'].qid === 'Q214536');
  assert.ok(WIKIDATA_ENTITIES['omaha-holdem'].qid === 'Q649282');
});

test('Phase 6: resolveVenueWikidataLinks resolves entities accurately', () => {
  const bellagioLinks = resolveVenueWikidataLinks({ name: 'Bellagio Hotel and Casino' });
  assert.ok(bellagioLinks.length >= 2);
  assert.ok(bellagioLinks.includes('https://www.wikidata.org/wiki/Q25007'));
  assert.ok(bellagioLinks.includes('https://en.wikipedia.org/wiki/Bellagio_(resort)'));

  const choctawLinks = resolveVenueWikidataLinks({ name: 'Choctaw Casino Resort Durant' });
  assert.ok(choctawLinks.length >= 2);
  assert.ok(choctawLinks.includes('https://www.wikidata.org/wiki/Q5103498'));
});

test('Phase 6: resolveSeriesWikidataLinks resolves major tour series', () => {
  const wsopLinks = resolveSeriesWikidataLinks({ name: 'World Series of Poker 2026' });
  assert.ok(wsopLinks.length >= 2);
  assert.ok(wsopLinks.includes('https://www.wikidata.org/wiki/Q819961'));

  const wptLinks = resolveSeriesWikidataLinks({ name: 'WPT Seminole Hard Rock Poker Showdown' });
  assert.ok(wptLinks.length >= 2);
  assert.ok(wptLinks.includes('https://www.wikidata.org/wiki/Q1137849'));
});

test('Phase 6: resolveTournamentWikidataLinks resolves discipline and venue', () => {
  const nlHoldemLinks = resolveTournamentWikidataLinks({
    tournament_name: '$1,100 No-Limit Hold\'em Deepstack',
    venue_name: 'Bellagio Poker Room',
  });
  assert.ok(nlHoldemLinks.length >= 4);
  assert.ok(nlHoldemLinks.includes('https://www.wikidata.org/wiki/Q214536')); // Texas hold'em
  assert.ok(nlHoldemLinks.includes('https://www.wikidata.org/wiki/Q25007')); // Bellagio
});

test('Phase 6: buildDailyTournamentSchema injects sameAs entity links into SportsEvent', () => {
  const tournaments = [
    {
      tournament_name: 'Wednesday $240 No Limit Hold\'em',
      venue_name: 'Bellagio',
      venue_id: '100',
      buy_in: 240,
      start_time: '12:00 PM',
      day_of_week: 'Wednesday',
    },
  ];

  const schema = buildDailyTournamentSchema(tournaments, '2026-10-18T12:00:00Z');
  assert.ok(schema);
  assert.ok(schema.mainEntity);
  const firstItem = schema.mainEntity.itemListElement[0].item;
  assert.equal(firstItem['@type'], 'SportsEvent');
  assert.ok(Array.isArray(firstItem.sameAs));
  assert.ok(firstItem.sameAs.includes('https://www.wikidata.org/wiki/Q214536'));
  assert.ok(firstItem.sameAs.includes('https://www.wikidata.org/wiki/Q25007'));
});
