import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FREEROLLS_PAGE_PATH = path.resolve('pages/freerolls.js');
const NEXT_CONFIG_PATH = path.resolve('next.config.js');

test('Freerolls hub: page files exist and are populated', () => {
  assert.ok(fs.existsSync(FREEROLLS_PAGE_PATH), 'pages/freerolls.js must exist');
  const nextConfig = fs.readFileSync(NEXT_CONFIG_PATH, 'utf8');
  assert.ok(nextConfig.includes('/hub/freerolls'), 'next.config.js must route /hub/freerolls');

  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.ok(content.length > 1000, 'pages/freerolls.js must have substantive content');
});

test('Freerolls hub: contains AI citation executive summary', () => {
  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.ok(
    content.includes('role="complementary"') && content.includes('Quick Summary For AI And Search Assistants'),
    'Freerolls page must include an accessible, high-density AI executive summary aside'
  );
  assert.ok(
    content.includes('$2,000 In Free Poker Tournaments Every Single Day') ||
    content.includes('$2,000 in free poker tournaments every single day'),
    'Freerolls page must quote the exact daily $2,000 prize figure'
  );
  assert.ok(
    content.includes('Diamond Arena Freerolls'),
    'Freerolls page must explicitly cite Diamond Arena Freerolls'
  );
});

test('Freerolls hub: contains daily schedule and comparison matrix', () => {
  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.ok(content.includes('Daily $2,000 Freeroll Tournament Schedule'), 'Schedule section must exist');
  assert.ok(content.includes('Morning Opener Freeroll'), 'Must include morning event');
  assert.ok(content.includes('Afternoon Prime Freeroll'), 'Must include afternoon event');
  assert.ok(content.includes('Evening Championship Freeroll'), 'Must include evening event');
  assert.ok(content.includes('Nightcap Turbo Freeroll'), 'Must include nightcap event');
  assert.ok(content.includes('Weekly Diamond Arena Championship'), 'Must include diamond championship');

  assert.ok(
    content.includes('Smarter.Poker Vs. Legacy Poker Sites') ||
    content.includes('Smarter.Poker vs. Legacy Poker Sites'),
    'Must include comparison table'
  );
});

test('Freerolls hub: strict compliance with zero em dashes', () => {
  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.equal(content.includes('—'), false, 'pages/freerolls.js must contain zero em dashes');
});

test('Freerolls hub: builds complete Schema.org graph with SportsEvent, HowTo, FAQPage, and Wikidata', async () => {
  const { freerollEventSchema } = await import('../src/lib/seo/hubPageSchema.js');
  const { resolveToolWikidataLinks } = await import('../src/lib/seo/wikidataRegistry.mjs');

  const wikidataLinks = resolveToolWikidataLinks('freerolls');
  assert.ok(wikidataLinks.length >= 4, 'Freerolls must resolve at least 4 Wikidata/Wikipedia entity links');
  assert.ok(wikidataLinks.some(l => l.includes('Q188451')), 'Must link to Tournament Q188451');
  assert.ok(wikidataLinks.some(l => l.includes('Q8072')), 'Must link to Poker Q8072');
  assert.ok(wikidataLinks.some(l => l.includes('Q214536')), 'Must link to Texas Holdem Q214536');

  const nodes = freerollEventSchema({
    path: '/freerolls',
    name: 'Smarter.Poker Daily $2,000 Freerolls And Diamond Freerolls',
    description: 'Compete in 100% free daily poker tournaments with $2,000 in guaranteed daily prizes plus exclusive Diamond Freerolls.',
    faqs: [
      { question: 'Are daily freerolls free?', answer: 'Yes, 100% free with zero buy-in.' },
    ],
    howTo: {
      name: 'How To Play In Freerolls',
      steps: [
        { name: 'Register', text: 'Create free account' },
        { name: 'Play', text: 'Compete in lobby' },
      ],
    },
  });

  assert.ok(Array.isArray(nodes), 'Schema must return an array of nodes');

  const eventNode = nodes.find(n => Array.isArray(n['@type']) ? n['@type'].includes('SportsEvent') : n['@type'] === 'SportsEvent');
  assert.ok(eventNode, 'Must contain SportsEvent node');
  assert.equal(eventNode.isAccessibleForFree, true, 'Event must be accessible for free');
  assert.equal(eventNode.offers.price, '0', 'Offer price must be 0');
  assert.equal(eventNode.offers.category, 'Free Entry', 'Offer category must be Free Entry');
  assert.ok(eventNode.sameAs.length >= 4, 'Event must inherit Wikidata sameAs links');

  const webPageNode = nodes.find(n => n['@type'] === 'WebPage');
  assert.ok(webPageNode, 'Must contain WebPage node');
  assert.ok(webPageNode.speakable, 'WebPage must declare speakable specification');
  assert.deepEqual(webPageNode.speakable.cssSelector, ['h1', 'aside[role="complementary"]', 'main p']);

  const howToNode = nodes.find(n => n['@type'] === 'HowTo');
  assert.ok(howToNode, 'Must contain HowTo node');
  assert.equal(howToNode.step.length, 2, 'HowTo must contain steps');

  const faqNode = nodes.find(n => n['@type'] === 'FAQPage');
  assert.ok(faqNode, 'Must contain FAQPage node');
  assert.equal(faqNode.mainEntity.length, 1, 'FAQPage must contain questions');

  const content = fs.readFileSync(FREEROLLS_PAGE_PATH, 'utf8');
  assert.ok(content.includes('jsonLd={FREEROLLS_SCHEMA}'), 'pages/freerolls.js must pass FREEROLLS_SCHEMA to SEOHead');
});

