import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIKIDATA_ENTITIES,
  resolveVenueWikidataLinks,
  resolveSeriesWikidataLinks,
} from '../src/lib/seo/wikidataRegistry.mjs';
import { seriesSchema } from '../src/lib/poker-near-me/seriesSeo.mjs';

test('WIKIDATA_ENTITIES contains verified Q-IDs and Wikipedia links for key entities', () => {
  assert.ok(WIKIDATA_ENTITIES['world-series-of-poker']);
  assert.equal(WIKIDATA_ENTITIES['world-series-of-poker'].qid, 'Q819961');
  assert.equal(WIKIDATA_ENTITIES['world-series-of-poker'].wikidata, 'https://www.wikidata.org/wiki/Q819961');

  assert.ok(WIKIDATA_ENTITIES['bellagio']);
  assert.equal(WIKIDATA_ENTITIES['bellagio'].qid, 'Q25007');

  assert.ok(WIKIDATA_ENTITIES['the-bicycle-hotel-and-casino']);
  assert.equal(WIKIDATA_ENTITIES['the-bicycle-hotel-and-casino'].qid, 'Q4903744');
});

test('resolveVenueWikidataLinks correctly matches exact and partial venue names', () => {
  const bellagioVenue = { name: 'Bellagio Hotel and Casino' };
  const bellagioLinks = resolveVenueWikidataLinks(bellagioVenue);
  assert.ok(bellagioLinks.length >= 2);
  assert.ok(bellagioLinks.includes('https://www.wikidata.org/wiki/Q25007'));
  assert.ok(bellagioLinks.includes('https://en.wikipedia.org/wiki/Bellagio_(resort)'));

  const bikeVenue = { name: 'The Bicycle Hotel & Casino' };
  const bikeLinks = resolveVenueWikidataLinks(bikeVenue);
  assert.ok(bikeLinks.length >= 2);
  assert.ok(bikeLinks.includes('https://www.wikidata.org/wiki/Q4903744'));

  const unknownVenue = { name: 'Small Town Social Club' };
  const unknownLinks = resolveVenueWikidataLinks(unknownVenue);
  assert.deepEqual(unknownLinks, []);
});

test('resolveSeriesWikidataLinks correctly matches tour series and circuits', () => {
  const wsopSeries = { name: 'WSOP Circuit - Choctaw' };
  const wsopcLinks = resolveSeriesWikidataLinks(wsopSeries);
  assert.ok(wsopcLinks.includes('https://www.wikidata.org/wiki/Q1586978'));
  assert.ok(wsopcLinks.includes('https://en.wikipedia.org/wiki/World_Series_of_Poker_Circuit'));

  const wptSeries = { name: 'WPT World Championship' };
  const wptLinks = resolveSeriesWikidataLinks(wptSeries);
  assert.ok(wsopcLinks.length >= 2);
  assert.ok(wptLinks.includes('https://www.wikidata.org/wiki/Q1137849'));
  assert.ok(wptLinks.includes('https://en.wikipedia.org/wiki/World_Poker_Tour'));

  const eptSeries = { name: 'European Poker Tour Barcelona' };
  const eptLinks = resolveSeriesWikidataLinks(eptSeries);
  assert.ok(eptLinks.includes('https://www.wikidata.org/wiki/Q1351144'));
});

test('seriesSchema attaches sameAs disambiguation links to EventSeries node', () => {
  const series = {
    id: '999',
    name: 'WSOP Main Event 2026',
    venueName: 'Horseshoe Las Vegas',
    city: 'Las Vegas',
    state: 'NV',
    startDate: '2026-06-01',
  };

  const nodes = seriesSchema(series);
  const eventNode = nodes.find((n) => n['@type'] === 'EventSeries');
  assert.ok(eventNode, 'EventSeries node should exist');
  assert.ok(Array.isArray(eventNode.sameAs), 'EventSeries should have sameAs array');
  assert.ok(eventNode.sameAs.includes('https://www.wikidata.org/wiki/Q819961'));
  assert.ok(eventNode.sameAs.includes('https://en.wikipedia.org/wiki/World_Series_of_Poker'));
});
