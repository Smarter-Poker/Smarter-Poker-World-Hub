import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hubProductSchema, hubCollectionSchema } from '../src/lib/seo/hubPageSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('GSC / AEO Series 3 - Phase 1: Google Merchant Product Enhancements & Voice speakable Schema', () => {
  it('diamond store structured data outputs enhanced Google Merchant Offer fields', () => {
    const diamondStorePath = path.join(rootDir, 'pages/hub/diamond-store.js');
    const content = fs.readFileSync(diamondStorePath, 'utf8');

    // Merchant return policy
    assert.match(content, /hasMerchantReturnPolicy:\s*\{/);
    assert.match(content, /returnPolicyCategory:\s*'https:\/\/schema\.org\/MerchantReturnNotPermitted'/);
    assert.match(content, /merchantReturnDays:\s*0/);

    // Shipping details (digital instant zero-cost delivery)
    assert.match(content, /shippingDetails:\s*\{/);
    assert.match(content, /shippingRate:\s*\{/);
    assert.match(content, /itemCondition:\s*'https:\/\/schema\.org\/NewCondition'/);
    assert.match(content, /priceValidUntil:\s*'2027-12-31'/);
    assert.match(content, /availability:\s*'https:\/\/schema\.org\/InStock'/);
  });

  it('hubProductSchema and hubCollectionSchema include speakable specifications for voice search', () => {
    const productNodes = hubProductSchema({
      path: '/hub/poker-tools',
      name: 'Poker Tools',
      description: 'Free Odds Calculator',
      trail: [['Hub', '/hub'], ['Poker Tools', '/hub/poker-tools']],
    });

    const webPageNode = productNodes.find((n) => n['@type'] === 'WebPage');
    assert.ok(webPageNode, 'Must contain WebPage node');
    assert.ok(webPageNode.speakable, 'WebPage must declare speakable');
    assert.equal(webPageNode.speakable['@type'], 'SpeakableSpecification');
    assert.deepEqual(webPageNode.speakable.cssSelector, ['h1', 'p']);

    const collectionNodes = hubCollectionSchema({
      path: '/hub/trivia',
      name: 'Poker Trivia',
      description: 'Test Poker Knowledge',
      trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia']],
    });

    const collectionNode = collectionNodes.find((n) => n['@type'] === 'CollectionPage');
    assert.ok(collectionNode, 'Must contain CollectionPage node');
    assert.ok(collectionNode.speakable, 'CollectionPage must declare speakable');
    assert.equal(collectionNode.speakable['@type'], 'SpeakableSpecification');
    assert.deepEqual(collectionNode.speakable.cssSelector, ['h1', 'p']);
  });
});
