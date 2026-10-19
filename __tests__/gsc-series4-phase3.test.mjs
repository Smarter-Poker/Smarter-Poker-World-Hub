/**
 * GSC & AEO SERIES 4 PHASE 3: GOOGLE IMAGES LICENSABLE IMAGEOBJECT & SITELINKS SEARCHACTION ENTRYPOINT
 *
 * Verifies:
 *   1. licensableImageSchema() produces a valid schema.org ImageObject node with:
 *      - @type: 'ImageObject'
 *      - contentUrl & url
 *      - license: 'https://smarter.poker/terms'
 *      - acquireLicensePage
 *      - creditText: 'Smarter.Poker'
 *      - copyrightNotice: 'Copyright Smarter Software Inc.'
 *      - creator: { '@type': 'Organization', '@id': 'https://smarter.poker/#organization', name: 'Smarter.Poker' }
 *   2. hubProductSchema() and hubCollectionSchema() include the licensable ImageObject
 *      and link it via primaryImageOfPage.
 *   3. pages/hub/venues/[id].js buildVenueJsonLd() emits a structured ImageObject with
 *      license, acquireLicensePage, creditText, copyrightNotice, and creator.
 *   4. SEOHead schemas.website.potentialAction uses a structured EntryPoint object
 *      with urlTemplate and 'query-input': 'required name=search_term_string'.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  licensableImageSchema,
  hubProductSchema,
  hubCollectionSchema,
} from '../src/lib/seo/hubPageSchema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('licensableImageSchema outputs valid Google Images Licensable ImageObject metadata', () => {
  const node = licensableImageSchema({
    url: 'https://smarter.poker/tools/preflop-ranges',
    contentUrl: 'https://smarter.poker/images/og-card.jpg',
    caption: 'GTO Preflop Ranges - Smarter.Poker',
    acquireLicensePage: 'https://smarter.poker/hub/training',
  });

  assert.equal(node['@type'], 'ImageObject');
  assert.equal(node['@id'], 'https://smarter.poker/tools/preflop-ranges#primaryimage');
  assert.equal(node.contentUrl, 'https://smarter.poker/images/og-card.jpg');
  assert.equal(node.license, 'https://smarter.poker/terms');
  assert.equal(node.acquireLicensePage, 'https://smarter.poker/hub/training');
  assert.equal(node.creditText, 'Smarter.Poker');
  assert.equal(node.copyrightNotice, 'Copyright Smarter Software Inc.');
  assert.deepEqual(node.creator, {
    '@type': 'Organization',
    '@id': 'https://smarter.poker/#organization',
    name: 'Smarter.Poker',
  });
});

test('hubProductSchema and hubCollectionSchema embed licensable ImageObject and primaryImageOfPage', () => {
  const prodNodes = hubProductSchema({
    path: '/tools/preflop-ranges',
    name: 'GTO Preflop Range Matrix',
    description: 'Interactive 13x13 preflop range chart.',
    trail: [['Preflop Ranges', '/tools/preflop-ranges']],
  });

  const webPage = prodNodes.find((n) => n['@type'] === 'WebPage');
  const imgObj = prodNodes.find((n) => n['@type'] === 'ImageObject');
  assert.ok(webPage, 'hubProductSchema includes WebPage');
  assert.ok(imgObj, 'hubProductSchema includes ImageObject');
  assert.deepEqual(webPage.primaryImageOfPage, {
    '@id': 'https://smarter.poker/tools/preflop-ranges#primaryimage',
  });
  assert.equal(imgObj.license, 'https://smarter.poker/terms');

  const collNodes = hubCollectionSchema({
    path: '/hub',
    name: 'World Hub',
    description: 'The Smarter.Poker World Hub.',
    trail: [['Hub', '/hub']],
  });
  const collImg = collNodes.find((n) => n['@type'] === 'ImageObject');
  assert.ok(collImg, 'hubCollectionSchema includes ImageObject');
  assert.equal(collImg.license, 'https://smarter.poker/terms');
});

test('pages/hub/venues/[id].js emits ImageObject with license and acquireLicensePage in buildVenueJsonLd', () => {
  const venueCode = read('pages/hub/venues/[id].js');
  assert.match(venueCode, /'@type':\s*'ImageObject'/);
  assert.match(venueCode, /license:\s*'https:\/\/smarter\.poker\/terms'/);
  assert.match(venueCode, /acquireLicensePage:\s*canonical/);
  assert.match(venueCode, /creditText:\s*'Smarter\.Poker'/);
});

test('SEOHead schemas.website declares SearchAction with EntryPoint urlTemplate', () => {
  const seoCode = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.match(seoCode, /'@type':\s*'SearchAction'/);
  assert.match(seoCode, /'@type':\s*'EntryPoint'/);
  assert.match(seoCode, /urlTemplate:\s*'https:\/\/smarter\.poker\/hub\/poker-near-me\/lobby\?q=\{search_term_string\}'/);
  assert.match(seoCode, /'query-input':\s*'required name=search_term_string'/);
});
