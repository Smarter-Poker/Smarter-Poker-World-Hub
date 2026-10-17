import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COMPARE_PAGES,
  compareJsonLd,
  compareRoutes,
  getComparePage,
} from '../src/content/compare/pages.js';

test('gsc-series2-phase3: venue comparison pages are registered in compare module', () => {
  const venueSlugs = [
    'bellagio-vs-aria-poker',
    'commerce-casino-vs-the-bicycle-hotel-poker',
    'best-poker-rooms-in-las-vegas',
    'best-poker-rooms-in-texas',
  ];

  for (const slug of venueSlugs) {
    const page = getComparePage(slug);
    assert.ok(page, `Must register ${slug} in COMPARE_PAGES`);
    assert.ok(page.title, `${slug} must have a title`);
    assert.ok(page.description, `${slug} must have a description`);
    assert.ok(page.table, `${slug} must define comparison table`);
    assert.ok(page.table.products.length >= 2, `${slug} must compare at least 2 products/venues`);
    assert.ok(page.faq && page.faq.length >= 1, `${slug} must have FAQ questions`);
  }
});

test('gsc-series2-phase3: venue comparison pages generate valid Article and FAQPage schema', () => {
  const page = getComparePage('bellagio-vs-aria-poker');
  const jsonLd = compareJsonLd(page);
  const article = jsonLd.find((node) => node['@type'] === 'Article');
  const faq = jsonLd.find((node) => node['@type'] === 'FAQPage');

  assert.ok(article, 'Must include Article schema');
  assert.equal(article.headline, 'Bellagio Vs Aria Poker Room');
  assert.ok(faq, 'Must include FAQPage schema');
  assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 2, 'FAQ must have at least 2 questions');
});

test('gsc-series2-phase3: best-of venue pages generate ItemList structured data', () => {
  const page = getComparePage('best-poker-rooms-in-las-vegas');
  const jsonLd = compareJsonLd(page);
  const itemList = jsonLd.find((node) => node['@type'] === 'ItemList');

  assert.ok(itemList, 'Best-of page must include ItemList schema');
  assert.equal(itemList.numberOfItems, 2);
  assert.deepEqual(itemList.itemListElement.map((item) => item.name), ['Bellagio Poker Room', 'Aria Poker Room']);
});

test('gsc-series2-phase3: comparison routes exist in sitemap.xml', () => {
  const routes = compareRoutes();
  assert.ok(routes.includes('/compare/bellagio-vs-aria-poker'));
  assert.ok(routes.includes('/compare/commerce-casino-vs-the-bicycle-hotel-poker'));
  assert.ok(routes.includes('/compare/best-poker-rooms-in-las-vegas'));
  assert.ok(routes.includes('/compare/best-poker-rooms-in-texas'));
});

test('gsc-series2-phase3: PokerNearMeLocationPage links to high-intent comparison hubs', () => {
  const locationPagePath = path.resolve(process.cwd(), 'src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  const code = fs.readFileSync(locationPagePath, 'utf8');

  assert.ok(code.includes('/compare/bellagio-vs-aria-poker'), 'Must link to Bellagio vs Aria');
  assert.ok(code.includes('/compare/commerce-casino-vs-the-bicycle-hotel-poker'), 'Must link to Commerce vs Bike');
  assert.ok(code.includes('/compare/best-poker-rooms-in-las-vegas'), 'Must link to Best Poker Rooms in Las Vegas');
  assert.ok(code.includes('/compare/best-poker-rooms-in-texas'), 'Must link to Best Poker Rooms in Texas');
});
