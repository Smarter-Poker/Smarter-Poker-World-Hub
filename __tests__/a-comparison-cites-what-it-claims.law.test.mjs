/**
 * A COMPARISON CITES WHAT IT CLAIMS (AEO programme section 3.3, 2026-09-22).
 *
 * Comparison and best-of pages are the format AI engines quote most, which
 * makes them the place a wrong claim about a named competitor travels
 * furthest. The spec's standard is "written honestly, with real competitor
 * facts, updated quarterly". This law is that standard made mechanical:
 *
 *   - eleven pages, unique slugs, the sweepstakes page NOT built (it needs
 *     a compliance review first)
 *   - every product fact carries an https source and the day it was read;
 *     a fact nobody publishes says Not Published and carries no number
 *   - a sentence that names a competitor carries a source that competitor's
 *     facts were read from
 *   - every page renders the "Checked" line, the play-credit disclosure, a
 *     real <table> (or a step list for the how-to) and a Sources list with
 *     rel="nofollow noopener"
 *   - schema is Article + BreadcrumbList (+ ItemList on best-of pages),
 *     published by the site Organization; never Review, AggregateRating,
 *     Person or author
 *   - related slugs, glossary terms and product links resolve
 *   - every route is in the sitemap
 *   - copy is Title Case with no em or en dashes, and titles fit a result
 *
 * Reads the content module under plain node and the page sources as text;
 * no network, no database, no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AS_OF,
  CHECKED_LABEL,
  COMPARE_BASE,
  COMPARE_INDEX_TITLE,
  COMPARE_PAGES,
  NOT_PUBLISHED,
  ORGANIZATION_ID,
  PLAY_CREDIT_DISCLOSURE,
  PRODUCTS,
  SOURCES,
  SOURCES_NOTE,
  cellFor,
  compareIndexJsonLd,
  compareJsonLd,
  compareRoutes,
  getComparePage,
  pageBlocks,
  pageSources,
  sourceKeysOf,
} from '../src/content/compare/pages.js';
import { fitsInAResult } from '../src/lib/seo/titleFit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SLUG_PAGE = read('pages/compare/[slug].js');
const INDEX_PAGE = read('pages/compare/index.js');
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const EXPECTED_SLUGS = [
  'best-poker-club-apps',
  'poker-arena-vs-pokerbros',
  'poker-arena-vs-pppoker',
  'poker-arena-vs-clubgg',
  'best-free-poker-apps-with-friends',
  'how-to-start-a-private-online-poker-club',
  'best-poker-room-management-software',
  'club-commander-vs-tablecaptain',
  'club-commander-vs-bravo-poker-live',
  'best-gto-poker-trainers',
  'best-poker-bankroll-trackers',
];

/** Other names a product goes by in running copy. */
const ALIASES = {
  bravo: ['Bravo Poker', 'BravoPokerLive'],
  suprema: ['Suprema Poker'],
  pokerstarsHomeGames: ['PokerStars Home Games'],
  tablecaptain: ['TableCaptain'],
};

const allFacts = () =>
  Object.entries(PRODUCTS).flatMap(([productId, product]) =>
    Object.entries(product.facts).map(([key, value]) => ({ productId, key, value }))
  );

test('there are eleven comparison pages, each with a unique slug, and no sweepstakes page', () => {
  assert.deepEqual(
    COMPARE_PAGES.map((page) => page.slug),
    EXPECTED_SLUGS,
    'the eleven pages of section 3.3, in order'
  );
  assert.equal(new Set(COMPARE_PAGES.map((page) => page.slug)).size, COMPARE_PAGES.length, 'slugs are unique');
  for (const page of COMPARE_PAGES) assert.match(page.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${page.slug} is a clean slug`);
  assert.ok(
    !COMPARE_PAGES.some((page) => /sweepstake/i.test(page.slug + page.title)),
    'the sweepstakes explainer needs a compliance review before it exists'
  );
});

test('every known fact cites an https source that exists and the day it was read', () => {
  assert.match(AS_OF, ISO_DAY);
  for (const { productId, key, value } of allFacts()) {
    const where = `${productId}.${key}`;
    assert.equal(value.asOf, AS_OF, `${where} carries the day it was read`);
    if (value.unknown) continue;
    const keys = sourceKeysOf(value);
    assert.ok(keys.length > 0, `${where} names a source`);
    for (const sourceKey of keys) {
      const source = SOURCES[sourceKey];
      assert.ok(source, `${where} cites ${sourceKey}, which is a known source`);
      assert.match(source.url, /^https:\/\/[^\s]+$/, `${sourceKey} is an https URL`);
      assert.ok(source.title && source.title.length > 3, `${sourceKey} has a readable title`);
      assert.ok(['listing', 'maker', 'press', 'own'].includes(source.kind), `${sourceKey} says what kind of source it is`);
    }
    assert.ok(!String(value.value).includes(NOT_PUBLISHED), `${where} is known, so it does not say Not Published`);
  }
  for (const [sourceKey, source] of Object.entries(SOURCES)) {
    if (source.kind === 'press') assert.match(source.published || '', /^\d{4}-\d{2}(-\d{2})?$/, `${sourceKey} is press, so it records its own date`);
    if (source.kind === 'own') assert.match(source.url, /^https:\/\/smarter\.poker\//, `${sourceKey} is one of our live pages`);
  }
});

test('an unknown value is shown as Not Published, never as a number', () => {
  for (const { productId, key, value } of allFacts()) {
    if (!value.unknown) continue;
    const where = `${productId}.${key}`;
    assert.equal(value.value, NOT_PUBLISHED, `${where} says Not Published`);
    assert.doesNotMatch(String(value.value), /\d/, `${where} carries no number`);
    assert.ok(value.why && value.why.length > 8, `${where} says why it is unknown`);
    assert.equal(value.source, undefined, `${where} cites nothing it did not read`);
  }
  for (const page of COMPARE_PAGES) {
    if (!page.table) continue;
    for (const productId of page.table.products) {
      assert.ok(PRODUCTS[productId], `${page.slug} lists ${productId}, a known product`);
      for (const column of page.table.columns) {
        const cell = cellFor(productId, column.key);
        assert.ok(cell.unknown || sourceKeysOf(cell).length > 0, `${page.slug} ${productId}.${column.key} is sourced or Not Published`);
      }
    }
  }
});

test('a sentence that names a competitor carries a source that competitor was read from', () => {
  const competitors = Object.entries(PRODUCTS)
    .filter(([, product]) => !product.own)
    .map(([productId, product]) => ({
      productId,
      names: [product.name, ...(ALIASES[productId] || [])],
      sources: new Set(Object.values(product.facts).flatMap(sourceKeysOf)),
    }));
  const offenders = [];
  for (const page of COMPARE_PAGES) {
    for (const block of pageBlocks(page)) {
      for (const sourceKey of block.sources) {
        assert.ok(SOURCES[sourceKey], `${page.slug} cites ${sourceKey}, which is a known source`);
      }
      for (const competitor of competitors) {
        const named = competitor.names.some((name) =>
          new RegExp(`(^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`).test(block.text)
        );
        if (!named) continue;
        if (!block.sources.some((sourceKey) => competitor.sources.has(sourceKey))) {
          offenders.push(`${page.slug}: "${block.text.slice(0, 70)}..." names ${competitor.names[0]} without its source`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every page carries the Checked line, the disclosure, a table and a Sources list', () => {
  const [year, month] = AS_OF.split('-').map(Number);
  assert.equal(CHECKED_LABEL, `Checked ${MONTHS[month - 1]} ${year}`, 'the Checked line is the month of AS_OF');
  assert.ok(SOURCES_NOTE.includes(`${MONTHS[month - 1]} ${Number(AS_OF.slice(8))}, ${year}`), 'the Sources note names the day of AS_OF');

  for (const page of COMPARE_PAGES) {
    const sources = pageSources(page);
    assert.ok(sources.length >= 2, `${page.slug} lists its sources`);
    for (const source of sources) assert.match(source.url, /^https:\/\//, `${page.slug} source ${source.key} is https`);
    assert.ok(page.table || (page.steps && page.steps.length >= 5), `${page.slug} has a comparison table or a step list`);
    if (page.kind !== 'guide') assert.ok(page.table && page.table.products.length >= 2, `${page.slug} compares at least two products`);
    assert.ok(sources.some((source) => source.key === 'spHome'), `${page.slug} cites the page the disclosure is read from`);
  }

  // The template renders these unconditionally, on every slug.
  const body = SLUG_PAGE.slice(SLUG_PAGE.indexOf('<h1'));
  const first = (needle) => body.indexOf(needle);
  assert.ok(first('{page.summary.text}') > 0 && first('{page.summary.text}') < first('{page.intro.text}'), 'the answer comes right after the h1');
  assert.ok(first('{CHECKED_LABEL}') > 0, 'the Checked line is rendered');
  assert.ok(first('{PLAY_CREDIT_DISCLOSURE.value}') > 0, 'the play-credit disclosure is rendered');
  assert.ok(first('<table') > 0 && first('<caption>') > 0 && first('<th scope="col"') > 0, 'the comparison is a real table');
  assert.ok(first('>Sources</h2>') > 0 && first('{SOURCES_NOTE}') > 0, 'the Sources list is rendered');
  assert.match(SLUG_PAGE, /<a href=\{source\.url\} rel="nofollow noopener">/, 'source links are nofollow noopener');
  assert.doesNotMatch(SLUG_PAGE + INDEX_PAGE, /<img|<Image/, 'no competitor logos or images');
  assert.match(SLUG_PAGE, /fallback: false/, 'an unknown slug is a 404, not an empty shell');
  for (const needle of ['{CHECKED_LABEL}', '{PLAY_CREDIT_DISCLOSURE.value}']) {
    assert.ok(INDEX_PAGE.includes(needle), `the index renders ${needle}`);
  }
});

test('the play-credit disclosure says what Smarter.Poker is not', () => {
  const text = PLAY_CREDIT_DISCLOSURE.value;
  for (const phrase of ['No Real-Money Gambling', 'Play Credits With No Cash Value', 'Promotional Rewards Currency']) {
    assert.ok(text.includes(phrase), `the disclosure says "${phrase}"`);
  }
  assert.deepEqual(sourceKeysOf(PLAY_CREDIT_DISCLOSURE), ['spHome']);
});

test('schema is an Article by the site organization, never a review, a rating or a person', () => {
  const vendorSeo = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.ok(vendorSeo.includes(`'@id': '${ORGANIZATION_ID}'`), 'the publisher @id is the one the Organization node declares');
  assert.match(SLUG_PAGE, /jsonLd=\{\[schemas\.organization, \.\.\.compareJsonLd\(page\)\]\}/, 'the Organization node ships in the same graph');
  assert.match(INDEX_PAGE, /jsonLd=\{\[schemas\.organization, \.\.\.compareIndexJsonLd\(\)\]\}/);

  const forbidden = /"@type":"(Review|AggregateRating|Rating|Person)"|"author"|"reviewRating"|"ratingValue"|"aggregateRating"/;
  for (const page of COMPARE_PAGES) {
    const nodes = compareJsonLd(page);
    const json = JSON.stringify(nodes);
    assert.doesNotMatch(json, forbidden, `${page.slug} carries no review, rating or person schema`);
    const article = nodes.find((node) => node['@type'] === 'Article');
    assert.ok(article, `${page.slug} is an Article`);
    assert.equal(article.publisher['@id'], ORGANIZATION_ID);
    assert.equal(article.dateModified, AS_OF, `${page.slug} was modified the day its facts were read`);
    assert.equal(article.headline, page.h1);
    assert.ok(nodes.some((node) => node['@type'] === 'BreadcrumbList'), `${page.slug} has a breadcrumb`);
    const list = nodes.find((node) => node['@type'] === 'ItemList');
    if (page.kind === 'best-of') {
      assert.ok(list, `${page.slug} is a best-of page, so it carries an ItemList`);
      assert.equal(list.numberOfItems, page.table.products.length);
      assert.deepEqual(list.itemListElement.map((item) => item.name), page.table.products.map((id) => PRODUCTS[id].name));
    } else {
      assert.equal(list, undefined, `${page.slug} is not a list`);
    }
  }
  assert.doesNotMatch(JSON.stringify(compareIndexJsonLd()), forbidden);
  // The index writes its title literally (a title={...} read from this
  // module would be attributed every page title by two-pages-never-share-a-title).
  assert.ok(INDEX_PAGE.includes(`title="${COMPARE_INDEX_TITLE}"`), 'the index title is the one its schema names');
});

test('related pages, glossary terms and product links resolve', () => {
  const glossary = read('pages/hub/training/glossary.js');
  const terms = new Set([...glossary.matchAll(/term: '([^']+)'/g)].map((m) => m[1]));
  const nextConfig = read('next.config.js');
  const pageFileFor = (route) => [`pages${route}.js`, `pages${route}/index.js`].some((file) => fs.existsSync(path.join(ROOT, file)));

  for (const page of COMPARE_PAGES) {
    assert.ok(page.related.length >= 2, `${page.slug} links to other comparisons`);
    for (const slug of page.related) {
      assert.ok(getComparePage(slug), `${page.slug} links to ${slug}, which exists`);
      assert.notEqual(slug, page.slug, `${page.slug} does not link to itself`);
    }
    for (const term of page.glossary) assert.ok(terms.has(term), `${page.slug} links the glossary term "${term}", which the glossary defines`);
    assert.ok(page.productLinks.length >= 1, `${page.slug} links to a Smarter.Poker product`);
  }
  for (const [productId, product] of Object.entries(PRODUCTS)) {
    if (!product.own) continue;
    const served = pageFileFor(product.href) || (product.href === '/hub/club-arena' && nextConfig.includes('/hub/club-arena'));
    assert.ok(served, `${productId} links to ${product.href}, which is served`);
  }
});

test('every comparison route is in the sitemap, with its checked date as lastmod', () => {
  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /from '\.\.\/src\/content\/compare\/pages'/, 'the sitemap reads the routes from the content module');
  assert.match(sitemap, /compareRoutes\(\)/, 'the sitemap lists compareRoutes()');
  assert.match(sitemap, /\.\.\.comparePages,/, 'the comparison block is part of the generated sitemap');
  assert.deepEqual(compareRoutes(), [COMPARE_BASE, ...EXPECTED_SLUGS.map((slug) => `${COMPARE_BASE}/${slug}`)]);
});

test('copy is Title Case with no em or en dashes, and every title fits a result', () => {
  const copy = [COMPARE_INDEX_TITLE, PLAY_CREDIT_DISCLOSURE.value, SOURCES_NOTE, CHECKED_LABEL];
  for (const page of COMPARE_PAGES) {
    copy.push(page.title, page.h1, page.description);
    pageBlocks(page).forEach((block) => copy.push(block.text));
    (page.sections || []).forEach((section) => copy.push(section.heading));
    (page.faq || []).forEach((item) => copy.push(item.q));
    if (page.table) {
      copy.push(page.table.caption);
      page.table.columns.forEach((column) => copy.push(column.label));
    }
    assert.ok(fitsInAResult(page.title), `"${page.title} | Smarter.Poker" fits in a result`);
    assert.ok(page.description.length >= 70 && page.description.length <= 160, `${page.slug} description is 70 to 160 characters`);
    assert.ok(page.summary.text.split(/\s+/).length >= 35, `${page.slug} opens with a real answer`);
  }
  for (const product of Object.values(PRODUCTS)) {
    copy.push(product.name);
    Object.values(product.facts).forEach((value) => copy.push(value.value, value.why || ''));
  }
  Object.values(SOURCES).forEach((source) => copy.push(source.title));
  assert.ok(fitsInAResult(COMPARE_INDEX_TITLE));

  // Brand words that are lower case by their owners' choice.
  const OWN_CASING = new Set(['iPhone', 'iPad', 'macOS']);
  const offenders = [];
  for (const text of copy.filter(Boolean)) {
    if (/[—–]/.test(text)) offenders.push(`dash: ${text}`);
    for (const word of text.split(/\s+/)) {
      const bare = word.replace(/^[("'$]+/, '').replace(/[)"',.;:!?]+$/, '');
      if (!bare || /^\d/.test(bare) || OWN_CASING.has(bare)) continue;
      if (/^[a-z]/.test(bare)) offenders.push(`"${bare}" in: ${text}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});
