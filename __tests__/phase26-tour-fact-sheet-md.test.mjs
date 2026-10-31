import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderTourMarkdown } from '../src/lib/seo/markdownIngestion.mjs';
import { tourSchema } from '../src/lib/seo/tourPageSeo.js';

test('Phase 26: renderTourMarkdown emits clean Title Case Markdown for tour fact sheets', () => {
  const md = renderTourMarkdown({
    seo: {
      code: 'WSOP',
      name: 'World Series Of Poker',
      type: 'major',
      website: 'https://www.wsop.com',
      canonical: '/hub/tours/WSOP',
      description: 'The World Series Of Poker Schedule And Stops.',
    },
    stops: [
      { name: 'WSOP Summer Championship', venue: 'Horseshoe & Paris', location: 'Las Vegas, NV', dates: 'May 26 - Jul 15' },
    ],
    events: [
      { name: '$10,000 WSOP Main Event', dates: 'Jul 2 - Jul 15', buyin: 10000 },
    ],
    facts: {
      headquarters: 'Las Vegas, NV',
      established: 1970,
      regions: ['United States', 'International'],
      mainEvent: 10000,
      buyinMin: 400,
      buyinMax: 250000,
      notes: 'Annual World Championship Of Poker.',
    },
  });

  assert.ok(md.includes('# World Series Of Poker (WSOP)'));
  assert.ok(md.includes('## Scheduled Tour Stops (1)'));
  assert.ok(md.includes('## Featured Series Events (1)'));
  assert.ok(!md.includes('—'));
});

test('Phase 26: tourSchema includes SportsOrganization, EventSeries, SpeakableSpecification, and FAQPage', () => {
  const nodes = tourSchema({
    code: 'MSPT',
    name: 'Mid-States Poker Tour',
    type: 'regional',
    website: 'https://msptpoker.com',
    stops: [
      { name: 'MSPT Venetian', venue: 'The Venetian', location: 'Las Vegas, NV', dates: 'Jun 1 - Jun 7' },
    ],
  });

  const collectionNode = nodes.find((n) => n['@type'] === 'CollectionPage');
  const orgNode = nodes.find((n) => n['@type'] === 'SportsOrganization');
  const faqNode = nodes.find((n) => n['@type'] === 'FAQPage');
  assert.ok(collectionNode.speakable);
  assert.ok(orgNode);
  assert.ok(faqNode);
});

test('Phase 26: next.config.js rewrites /hub/tours/:code.md and pages/hub/tours/[code].js wires markdownUrl', () => {
  const nextConfig = fs.readFileSync(path.resolve('next.config.js'), 'utf8');
  assert.ok(nextConfig.includes("source: '/hub/tours/:code.md'"));

  const tourPage = fs.readFileSync(path.resolve('pages/hub/tours/[code].js'), 'utf8');
  assert.ok(tourPage.includes('renderTourMarkdown'));
  assert.ok(tourPage.includes('markdownUrl='));
});
