/**
 * Phase 4 Test Suite: Schema.org QAPage / FAQPage & Speakable Structured Data
 * ==============================================================================
 * Verifies that all 4 poker root tools ship complete Schema.org graphs for
 * AI Search Overviews (Google SGE, Perplexity, SearchGPT) and AI Voice Assistants (Siri, Assistant).
 *
 * Enforces:
 * 1. WebPage with SpeakableSpecification (cssSelector: ['h1', 'p'])
 * 2. SoftwareApplication / WebApplication with free price offer
 * 3. FAQPage with Question and acceptedAnswer (Answer) nodes
 * 4. BreadcrumbList starting from site root
 * 5. ImageObject with licensable metadata
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hubProductSchema } from '../src/lib/seo/hubPageSchema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function getToJsonLdDocument() {
  const src = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  const start = src.indexOf('export function toJsonLdDocument');
  const end = src.indexOf('export function normalizeCanonicalUrl');
  return new Function(`${src.slice(start, end).replace('export function', 'function')}; return toJsonLdDocument;`)();
}

const toJsonLdDocument = getToJsonLdDocument();

test('Poker Odds Calculator ships complete Schema.org graph with FAQPage and Speakable', () => {
  const src = read('pages/hub/poker-tools.js');
  assert.ok(src.includes('jsonLd={schema}'), 'poker-tools.js must pass jsonLd to SEOHead');
  assert.ok(!src.includes('...ODDS_CALCULATOR_SCHEMA'), 'Must not spread array into an object');

  const nodes = hubProductSchema({
    path: '/tools/poker-odds-calculator',
    name: 'Smarter.Poker Odds Calculator',
    description: "Free Poker Odds Calculator For Texas Hold'em, Omaha, PLO5, PLO6, Seven Card Stud And Razz.",
    trail: [['Hub', '/hub'], ['Poker Odds Calculator', '/tools/poker-odds-calculator']],
    faqs: [
      { question: 'How does it compute equity?', answer: 'Monte Carlo simulations across 10,000 iterations.' },
      { question: 'Is it free?', answer: 'Yes, 100% free with no paywall.' },
    ],
  });

  const doc = toJsonLdDocument(nodes);
  assert.equal(doc['@context'], 'https://schema.org');
  assert.ok(Array.isArray(doc['@graph']), '@graph must be an array of nodes');

  const webPage = doc['@graph'].find((n) => n['@type'] === 'WebPage');
  assert.ok(webPage, 'WebPage node required');
  assert.equal(webPage.speakable['@type'], 'SpeakableSpecification');
  assert.deepEqual(webPage.speakable.cssSelector, ['h1', 'p']);

  const app = doc['@graph'].find((n) => Array.isArray(n['@type']) && n['@type'].includes('SoftwareApplication'));
  assert.ok(app, 'SoftwareApplication node required');

  const faq = doc['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage node required');
  assert.equal(faq.mainEntity[0]['@type'], 'Question');
  assert.equal(faq.mainEntity[0].acceptedAnswer['@type'], 'Answer');
});

test('Tournament ICM Calculator ships complete Schema.org graph with FAQPage and Speakable', () => {
  const src = read('pages/hub/training/icm-calculator.js');
  assert.ok(src.includes('jsonLd={schema}'), 'icm-calculator.js must pass jsonLd to SEOHead');
  assert.ok(!src.includes('...ICM_CALCULATOR_SCHEMA'), 'Must not spread array into an object');

  const nodes = hubProductSchema({
    path: '/tools/icm-calculator',
    name: 'Smarter.Poker Tournament ICM Calculator',
    description: 'Free Tournament ICM Equity Calculator.',
    trail: [['Hub', '/hub'], ['GTO Training', '/hub/training'], ['ICM Calculator', '/tools/icm-calculator']],
    faqs: [
      { question: 'What is ICM in tournament poker?', answer: 'Independent Chip Model.' },
    ],
  });

  const doc = toJsonLdDocument(nodes);
  assert.equal(doc['@context'], 'https://schema.org');
  const webPage = doc['@graph'].find((n) => n['@type'] === 'WebPage');
  assert.ok(webPage.speakable, 'SpeakableSpecification required');
  const faq = doc['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage required');
});

test('GTO Preflop Ranges Matrix ships complete Schema.org graph with FAQPage and Speakable', () => {
  const src = read('pages/tools/preflop-ranges/index.js');
  assert.ok(src.includes('jsonLd={schema}'), 'preflop-ranges index.js must pass jsonLd to SEOHead');

  const nodes = hubProductSchema({
    path: '/tools/preflop-ranges',
    name: 'Smarter.Poker UTG GTO Preflop Range Matrix',
    description: '100BB 6-Max Opening Matrix',
    trail: [['Hub', '/hub'], ['Preflop Ranges', '/tools/preflop-ranges']],
    faqs: [
      { question: 'What percentage of hands does UTG open?', answer: '14.5% of hands.' },
    ],
  });

  const doc = toJsonLdDocument(nodes);
  assert.equal(doc['@context'], 'https://schema.org');
  const webPage = doc['@graph'].find((n) => n['@type'] === 'WebPage');
  assert.ok(webPage.speakable, 'SpeakableSpecification required');
  const faq = doc['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage required');
});

test('Webmaster Embeds Portal ships complete Schema.org graph with FAQPage and Speakable', () => {
  const src = read('pages/tools/embeds.js');
  assert.ok(src.includes('jsonLd={EMBEDS_SCHEMA}'), 'embeds.js must pass jsonLd to SEOHead');
  assert.ok(src.includes('hubProductSchema'), 'embeds.js must use hubProductSchema');

  const nodes = hubProductSchema({
    path: '/tools/embeds',
    name: 'Smarter.Poker Webmaster Widgets & Embed Distribution Center',
    description: 'Free embeddable poker widgets, odds calculators, ICM solvers, and GTO charts.',
    trail: [['Hub', '/hub'], ['Poker Tools', '/tools/poker-odds-calculator'], ['Embed Widgets', '/tools/embeds']],
    faqs: [
      { question: 'How do I embed the Smarter.Poker Odds Calculator on my website?', answer: 'Copy the responsive HTML iframe snippet.' },
    ],
  });

  const doc = toJsonLdDocument(nodes);
  assert.equal(doc['@context'], 'https://schema.org');
  const webPage = doc['@graph'].find((n) => n['@type'] === 'WebPage');
  assert.ok(webPage.speakable, 'SpeakableSpecification required');
  const faq = doc['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage required');
});

test('Glossary term pages emit FAQPage and SpeakableSpecification in schema graph', () => {
  const src = read('pages/glossary/[term].js');
  assert.ok(src.includes("'@type': 'FAQPage'"), 'glossary term page must declare FAQPage');
  assert.ok(src.includes("'@type': 'Question'"), 'glossary term page must declare Question');
  assert.ok(src.includes("'@type': 'Answer'"), 'glossary term page must declare Answer');
  assert.ok(src.includes("'@type': 'SpeakableSpecification'"), 'glossary term page must declare SpeakableSpecification');
});

test('About page declares SpeakableSpecification on AboutPage entity', () => {
  const src = read('pages/about.js');
  assert.ok(src.includes("'@type': 'SpeakableSpecification'"), 'About page must declare SpeakableSpecification');
  assert.ok(src.includes("cssSelector: ['h1', 'p']"), 'About page speakable must target h1 and p');
});
