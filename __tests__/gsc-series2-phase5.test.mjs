import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATE_POKER_LEGALITY, getStatePokerLegality } from '../src/lib/poker-near-me/stateLegality.mjs';
import { buildLocationPaaQuestions, buildLocationFaqJsonLd } from '../src/lib/seo/locationAeo.mjs';
import { COMPARE_PAGES, compareRoutes } from '../src/content/compare/pages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('GSC / AEO Series 2 - Phase 5: Travel, Landmarks & State Legality Guides', () => {
  it('stateLegality kernel provides statutory poker data for key poker states', () => {
    assert.ok(STATE_POKER_LEGALITY.NV);
    assert.equal(STATE_POKER_LEGALITY.NV.status, 'Fully Legal And Regulated');
    assert.equal(STATE_POKER_LEGALITY.NV.onlinePokerRegulated, true);

    assert.ok(STATE_POKER_LEGALITY.TX);
    assert.match(STATE_POKER_LEGALITY.TX.status, /Private Social Club/i);
    assert.equal(STATE_POKER_LEGALITY.TX.commercialRooms, false);

    assert.ok(STATE_POKER_LEGALITY.CA);
    assert.match(STATE_POKER_LEGALITY.CA.statutes, /Gambling Control Act/i);

    assert.ok(STATE_POKER_LEGALITY.FL);
    assert.match(STATE_POKER_LEGALITY.FL.summary, /Pari-Mutuel/i);

    // Fallback for an unmapped code
    const fallback = getStatePokerLegality('XX');
    assert.ok(fallback.status);
    assert.ok(fallback.summary);
  });

  it('locationAeo injects state legality PAA questions and FAQPage schema into state directories', () => {
    const questions = buildLocationPaaQuestions({
      stateName: 'Texas',
      stateCode: 'TX',
      venueCount: 98,
      topVenues: [{ name: 'The Lodge Card Club' }],
    });

    const legalityQ = questions.find((q) => q.question === 'Is Poker Legal In Texas?');
    assert.ok(legalityQ, 'Should contain Is Poker Legal In Texas? question');
    assert.match(legalityQ.answer, /Texas Penal Code Chapter 47/);
    assert.match(legalityQ.answer, /Private Social Club/);

    const homeGamesQ = questions.find((q) => q.question === 'Are Home Poker Games Legal In Texas?');
    assert.ok(homeGamesQ, 'Should contain Are Home Poker Games Legal In Texas? question');

    const faqJsonLd = buildLocationFaqJsonLd({
      stateName: 'Nevada',
      stateCode: 'NV',
      venueCount: 72,
      canonicalUrl: 'https://smarter.poker/hub/poker-near-me/in/nv',
    });

    assert.equal(faqJsonLd['@type'], 'FAQPage');
    assert.ok(faqJsonLd.mainEntity.some((item) => item.name === 'Is Poker Legal In Nevada?'));
  });

  it('best-poker-rooms-near-major-airports comparison page is registered with verified facts and schema', () => {
    const page = COMPARE_PAGES.find((p) => p.slug === 'best-poker-rooms-near-major-airports');
    assert.ok(page, 'Airport comparison page must exist in COMPARE_PAGES');
    assert.equal(page.kind, 'best-of');
    assert.match(page.title, /Airports/);
    assert.deepEqual(page.table.products, ['southPoint', 'liveMaryland']);

    // Check routes
    const routes = compareRoutes();
    assert.ok(routes.includes('/compare/best-poker-rooms-near-major-airports'));
  });

  it('PokerNearMeLocationPage links to best-poker-rooms-near-major-airports', () => {
    const locationPageContent = fs.readFileSync(
      path.join(rootDir, 'src/components/poker-near-me/PokerNearMeLocationPage.jsx'),
      'utf8'
    );
    assert.match(locationPageContent, /\/compare\/best-poker-rooms-near-major-airports/);
  });
});
