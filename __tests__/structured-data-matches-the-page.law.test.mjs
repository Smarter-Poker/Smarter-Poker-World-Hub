/**
 * LAW: structured data describes the page it ships with.
 *
 * STRUCTURED DATA AUDIT (2026-11-09). Every public page audited carried
 * parseable JSON-LD with a schema.org @context, but the markup disagreed with
 * the page in four ways:
 *
 *   - 25 pages published a FAQPage whose questions existed only in the
 *     JSON-LD (every calculator under /tools, /hub/home-games,
 *     /hub/bankroll-manager, /hub/memory-games, /hub/events-calendar,
 *     /hub/daily-tournaments, /hub/poker-series, /hub/tournaments/this-weekend,
 *     /hub/tours/[code], /learn/hands/[hand]);
 *   - the comparison and lesson Articles named no author and the comparison
 *     Articles no image;
 *   - the starting hand Articles were modified (2026-09-22) before they
 *     were published (2026-10-01) and carried a Quiz the page does not host;
 *   - the tournament directories published an ItemList with no
 *     itemListElement while their rows were still loading, and
 *     /hub/poker-series spread a Dataset and a FAQPage into one object.
 *
 * Part 1 reads every page source: a page that hands questions to a schema
 * builder must render that same list through FaqSection, or already render a
 * Frequently Asked Questions block of its own. Part 2 builds the JSON-LD
 * document for each page type exactly as SEOHead serializes it and validates
 * it: it parses back, every node has a type, required properties are present,
 * URLs are absolute, dates are ISO and ordered, and every @id reference
 * resolves inside the document. Part 3 renders FaqSection and checks the
 * questions are in the HTML.
 *
 * No network, no database, no install beyond the repository's own
 * dependencies (react-dom and typescript, both already used by other tests).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── Part 1: a FAQPage's questions are on the page ─────────────────────────

function pageFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (rel === 'pages/api') continue;
      pageFiles(rel, out);
    } else if (/\.jsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const FAQ_SOURCES = /\bfaqs\s*:\s*([A-Za-z_$][\w$]*|\[)|\bfaqSchema\(\s*([A-Za-z_$][\w$]*|\[)|\bfaqs\s*,/g;

test('every page that publishes a FAQPage renders the same questions', () => {
  const offenders = [];
  let checked = 0;
  for (const file of pageFiles('pages')) {
    const src = read(file);
    const matches = [...src.matchAll(FAQ_SOURCES)];
    if (matches.length === 0) continue;
    checked += 1;
    // A page with its own visible FAQ block (the odds calculator, freerolls,
    // the Club Commander FAQ) renders the questions itself.
    if (/Frequently Asked Questions/i.test(src)) continue;
    for (const m of matches) {
      const ident = m[1] || m[2] || 'faqs';
      if (ident === '[') {
        offenders.push(`${file}: passes an inline faqs literal to the schema builder; name the list and render it with <FaqSection faqs={...} />`);
        continue;
      }
      const rendered = new RegExp(`<FaqSection\\s[^>]*faqs=\\{${ident.replace(/\$/g, '\\$')}\\}`).test(src);
      if (!rendered) offenders.push(`${file}: publishes ${ident} as a FAQPage but never renders <FaqSection faqs={${ident}} />`);
    }
  }
  assert.ok(checked >= 20, `the law found ${checked} FAQ pages; the audit found 30, so the pattern it matches has drifted`);
  assert.deepEqual(offenders, []);
});

test('the shared schema builders drop a FAQPage with no questions and a list with no items', async () => {
  const { faqSchema, hubProductSchema } = await import('../src/lib/seo/hubPageSchema.js');
  assert.equal(faqSchema([], '/x'), null);
  assert.equal(faqSchema(null, '/x'), null);
  const nodes = hubProductSchema({ path: '/hub/x', name: 'X', description: 'Y', trail: [['Hub', '/hub'], ['X', '/hub/x']], faqs: [] });
  assert.equal(nodes.find((n) => n['@type'] === 'FAQPage'), undefined);
  const { buildDailyTournamentSchema, buildSeriesDirectorySchema } = await import('../src/lib/poker-near-me/structuredData.js');
  assert.equal(buildDailyTournamentSchema([], '2026-11-09T00:00:00Z').mainEntity, undefined, 'no rows, no ItemList');
  assert.equal(buildSeriesDirectorySchema([], 0).mainEntity, undefined, 'no rows, no ItemList');
  const one = buildDailyTournamentSchema([{ tournament_name: 'Daily Deepstack', venue_id: '1', venue_name: 'Room', city: 'Austin', state: 'TX', event_date: '2026-11-14', start_time: '7:00 PM', buy_in: 150 }], '2026-11-09T00:00:00Z');
  assert.equal(one.mainEntity['@type'], 'ItemList');
  assert.equal(one.mainEntity.itemListElement.length, 1);
});

test('a tournament row without a real date or venue publishes no SportsEvent at all', async () => {
  const { buildDailyTournamentSchema } = await import('../src/lib/poker-near-me/structuredData.js');
  const full = { tournament_name: 'Daily Deepstack', venue_id: '1', venue_name: 'Room', city: 'Austin', state: 'TX', event_date: '2026-11-14', start_time: '7:00 PM', buy_in: 150 };
  const noDate = { tournament_name: 'Wednesday Nightly', venue_id: '2', venue_name: 'The Lodge', city: 'Austin', state: 'TX', start_time: '7:00 PM', buy_in: 100 };
  const epochDate = { ...noDate, tournament_name: 'Epoch Nightly', event_date: '1970-01-01' };
  const noVenue = { tournament_name: 'Mystery Bounty', venue_id: '3', event_date: '2026-11-15', start_time: '2:00 PM', buy_in: 200 };

  // The page shows these rows without a date or a venue, so the markup may
  // not invent one: no generation-day startDate, no '2026-01-01' anchor, no
  // 'Live Poker Room' placeholder (structured data audit, 2026-11-09).
  const incomplete = buildDailyTournamentSchema([noDate, epochDate, noVenue], '2026-11-09T00:00:00Z');
  assert.equal(incomplete.mainEntity, undefined, 'no supported rows, no ItemList');
  const text = JSON.stringify(incomplete);
  assert.ok(!text.includes('SportsEvent'), 'no SportsEvent node for unsupported rows');
  assert.ok(!text.includes('Live Poker Room'), 'no placeholder venue name');
  assert.ok(!text.includes('2026-01-01'), 'no invented anchor date');

  // A fully populated row keeps the exact node it published before the
  // filter existed, whether or not unsupported rows sit beside it.
  const mixed = buildDailyTournamentSchema([noDate, full, noVenue], '2026-11-09T00:00:00Z');
  assert.equal(mixed.mainEntity.itemListElement.length, 1, 'only the supported row is listed');
  assert.deepEqual(mixed.mainEntity.itemListElement[0], {
    '@type': 'ListItem',
    position: 1,
    item: {
      '@type': 'SportsEvent',
      name: 'Daily Deepstack',
      url: 'https://smarter.poker/hub/venues/1',
      startDate: '2026-11-14T19:00:00',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      sport: 'Poker',
      location: {
        '@type': 'SportsActivityLocation',
        name: 'Room',
        address: { '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' },
      },
      offers: { '@type': 'Offer', price: 150, priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: 'https://smarter.poker/hub/venues/1' },
    },
  });
});

// ─── Part 2: the JSON-LD document for each page type is valid ──────────────

/** Compile a JSX module the way the other component tests do, with import stubs. */
function compiled(rel, load) {
  const source = read(rel);
  const code = ts.transpileModule(source, {
    fileName: 'module.jsx',
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  // Next.js injects React for JSX; the Function wrapper does the same here.
  new Function('require', 'module', 'exports', 'React', code)(load, module, module.exports, React);
  return module.exports;
}

const stubComponent = { __esModule: true, default: () => null };
const nullish = () => stubComponent;

const vendorSeo = compiled('vendor/commander-shared/src/components/seo/SEOHead.js', (name) => {
  if (name === 'next/head') return stubComponent;
  if (name === 'react') return React;
  return require(name);
});
const { toJsonLdDocument, schemas } = vendorSeo;

const siteSeo = compiled('src/components/seo/SEOHead.js', (name) => {
  if (name === 'next/head' || name === 'next/router') return { __esModule: true, default: () => null, useRouter: () => null };
  if (name === '@smarter-poker/commander-shared/components/seo/SEOHead') return vendorSeo;
  if (name === 'react') return React;
  if (name.endsWith('productOgImage')) return { productOgImage: () => undefined, PRODUCT_OG_IMAGES: [] };
  if (name.endsWith('shareImageMetadata.mjs')) return { shareImageMetadata: () => ({}) };
  return require(name);
});
const { normalizeJsonLdGraph } = siteSeo;

/** Exactly what SEOHead writes into <script type="application/ld+json">. */
function serializeLikeSEOHead(jsonLd) {
  const normalized = Array.isArray(jsonLd) ? normalizeJsonLdGraph(jsonLd) : jsonLd;
  return JSON.stringify(toJsonLdDocument(normalized)).replace(/</g, '\\u003c');
}

const REQUIRED = {
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  WebPage: ['name'],
  CollectionPage: ['name'],
  AboutPage: ['name'],
  Article: ['headline', 'image', 'datePublished', 'author', 'publisher'],
  Report: ['headline', 'datePublished', 'author'],
  SoftwareApplication: ['name', 'offers', 'applicationCategory', 'operatingSystem'],
  WebApplication: ['name', 'offers', 'applicationCategory', 'operatingSystem'],
  FAQPage: ['mainEntity'],
  Question: ['name', 'acceptedAnswer'],
  Answer: ['text'],
  HowTo: ['name', 'step'],
  HowToStep: ['name', 'text'],
  BreadcrumbList: ['itemListElement'],
  ListItem: ['position'],
  ItemList: ['itemListElement'],
  Dataset: ['name', 'description'],
  DefinedTerm: ['name'],
  DefinedTermSet: ['name'],
  Offer: ['price', 'priceCurrency'],
  Course: ['name', 'description', 'provider'],
  EventSeries: ['name', 'startDate'],
  SportsEvent: ['name', 'startDate'],
  SportsOrganization: ['name'],
  ImageObject: ['url'],
};
const URL_KEYS = ['url', 'item', 'image', 'logo', 'thumbnailUrl', 'contentUrl', 'sameAs', 'mainEntityOfPage'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[0-9:.+\-Z]+)?$/;

function* nodes(value, trail = '$') {
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) yield* nodes(value[i], `${trail}[${i}]`); return; }
  if (value && typeof value === 'object') {
    if ('@type' in value) yield [value, trail];
    for (const [k, v] of Object.entries(value)) if (k !== '@context') yield* nodes(v, `${trail}.${k}`);
  }
}

/** Every problem with a serialized JSON-LD document; an empty list means valid. */
function validate(serialized) {
  const problems = [];
  let doc;
  try { doc = JSON.parse(serialized); } catch (e) { return [`does not parse: ${e.message}`]; }
  if (serialized.includes('</')) problems.push('a closing tag survived serialization');
  if (doc['@context'] !== 'https://schema.org') problems.push(`@context is ${JSON.stringify(doc['@context'])}`);
  const roots = Array.isArray(doc['@graph']) ? doc['@graph'] : [doc];
  const ids = new Set();
  const idCounts = new Map();
  for (const [node] of nodes(roots)) if (typeof node['@id'] === 'string') { ids.add(node['@id']); idCounts.set(node['@id'], (idCounts.get(node['@id']) || 0) + 1); }
  for (const root of roots) {
    if (!root || typeof root !== 'object') { problems.push('a root is not an object'); continue; }
    if (!root['@type']) problems.push(`root ${root['@id'] || JSON.stringify(root).slice(0, 60)} has no @type`);
    if ('@context' in root && Array.isArray(doc['@graph'])) problems.push(`graph node ${root['@id'] || root['@type']} repeats @context`);
  }
  for (const [node, trail] of nodes(roots)) {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    // A typed reference ({ '@type', '@id', name }) to a node declared in full
    // elsewhere in the document is complete by that declaration.
    const keys = Object.keys(node);
    const isReference = typeof node['@id'] === 'string' && ((idCounts.get(node['@id']) || 0) > 1 && keys.length <= 3 || keys.every((k) => k === '@id' || k === '@type'));
    for (const type of types) {
      if (typeof type !== 'string' || !/^[A-Z][A-Za-z0-9]+$/.test(type)) problems.push(`${trail}: @type ${JSON.stringify(type)} is not a schema.org type name`);
      if (isReference) continue;
      for (const key of REQUIRED[type] || []) {
        const v = node[key];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) problems.push(`${trail} (${type}) is missing ${key}`);
      }
    }
    for (const key of URL_KEYS) {
      const v = node[key];
      if (v === undefined) continue;
      const values = (Array.isArray(v) ? v : [v]).map((x) => (x && typeof x === 'object' ? x.url || x['@id'] : x));
      for (const s of values) {
        if (typeof s !== 'string') { problems.push(`${trail}.${key} is not a URL string`); continue; }
        if (!/^https:\/\/[^\s"<>]+$/.test(s)) problems.push(`${trail}.${key} is not an absolute https URL: ${s}`);
      }
    }
    for (const key of ['datePublished', 'dateModified', 'startDate', 'endDate', 'uploadDate']) {
      if (node[key] !== undefined && !ISO_DATE.test(String(node[key]))) problems.push(`${trail}.${key} is not ISO 8601: ${node[key]}`);
    }
    if (node.datePublished && node.dateModified && String(node.dateModified) < String(node.datePublished)) {
      problems.push(`${trail}: dateModified ${node.dateModified} precedes datePublished ${node.datePublished}`);
    }
    if (node.startDate && node.endDate && String(node.endDate) < String(node.startDate)) problems.push(`${trail}: endDate precedes startDate`);
    if (node['@type'] === 'FAQPage') {
      const qs = Array.isArray(node.mainEntity) ? node.mainEntity : [node.mainEntity];
      for (const q of qs) if (!q || q['@type'] !== 'Question' || !q.acceptedAnswer || !q.acceptedAnswer.text) problems.push(`${trail}: a FAQPage question has no answer`);
    }
    if (node['@type'] === 'BreadcrumbList' || node['@type'] === 'ItemList') {
      const items = node.itemListElement || [];
      items.forEach((item, i) => { if (item.position !== i + 1) problems.push(`${trail}: itemListElement[${i}].position is ${item.position}`); });
    }
    if (node.aggregateRating || node.review || node.reviewRating) problems.push(`${trail}: asserts a rating or review; the site publishes none`);
    for (const [key, v] of Object.entries(node)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v['@id'] === 'string' && v['@id'].startsWith('https://smarter.poker/#')) {
        if (!ids.has(v['@id'])) problems.push(`${trail}.${key} references ${v['@id']}, which is not a node in this document`);
      }
    }
  }
  return problems;
}

function assertValid(label, jsonLd) {
  const serialized = serializeLikeSEOHead(jsonLd);
  const problems = validate(serialized);
  assert.deepEqual(problems, [], `${label}:\n  ${problems.join('\n  ')}`);
  return JSON.parse(serialized);
}

test('the validator itself rejects the defects the audit found', () => {
  const bad = serializeLikeSEOHead([
    { '@type': 'Article', '@id': 'https://smarter.poker/x#article', headline: 'X', datePublished: '2026-10-01', dateModified: '2026-09-22', url: '/x', publisher: { '@id': 'https://smarter.poker/#organization' } },
    { '@type': 'ItemList', numberOfItems: 0 },
    { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q' }] },
  ]);
  const problems = validate(bad);
  for (const expected of ['missing image', 'missing author', 'precedes datePublished', 'not an absolute https URL', '(ItemList) is missing itemListElement', 'question has no answer']) {
    assert.ok(problems.some((p) => p.includes(expected)), `reports "${expected}" in ${JSON.stringify(problems)}`);
  }
  assert.deepEqual(validate('{"@context":"https://schema.org"'), ['does not parse: ' + validate('{"@context":"https://schema.org"')[0].slice('does not parse: '.length)]);
});

test('the home page graph: Organization, WebSite and the free SoftwareApplication', () => {
  const doc = assertValid('home', [schemas.organization, schemas.website, schemas.softwareApp]);
  const types = doc['@graph'].map((n) => n['@type']);
  assert.deepEqual(types, ['Organization', 'WebSite', 'SoftwareApplication']);
  assert.equal(doc['@graph'][2].offers.price, '0');
  assert.match(read('pages/index.js'), /jsonLd=\{\[schemas\.organization, schemas\.website, schemas\.softwareApp\]\}/);
});

test('About publishes the visible company identity, not identities of its software or datasets', () => {
  let jsonLd;
  const link = { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
  const products = compiled('src/components/landing/LandingProductSummary.js', () => link);
  const page = compiled('pages/about.js', (name) => {
    if (name === 'next/link') return link;
    if (name.endsWith('LandingProductSummary')) return products;
    if (name.endsWith('SEOHead')) return {
      __esModule: true, schemas,
      default: props => { jsonLd = props.jsonLd; return null; },
    };
    throw new Error(`Unexpected About import: ${name}`);
  });
  const html = renderToStaticMarkup(React.createElement(page.default));
  const doc = assertValid('about', jsonLd);
  const org = doc['@graph'].find(node => node['@type'] === 'Organization');
  const about = doc['@graph'].find(node => node['@type'] === 'AboutPage');
  assert.equal(about.mainEntity['@id'], org['@id']);
  assert.match(html, /Smarter Software Inc\./);
  assert.equal(org.legalName, 'Smarter Software Inc.');
  assert.equal(org.contactPoint.email, 'support@smarter.poker');
  assert.ok(html.includes(`href="mailto:${org.contactPoint.email}"`));
  assert.deepEqual(org.sameAs, ['https://github.com/Smarter-Poker']);
  for (const identity of org.sameAs) assert.ok(html.includes(`href="${identity}"`), 'company reference is visible');
  assert.equal(org.knowsAbout, undefined, 'do not inherit expertise claims absent from the About page');
  assert.equal(org.description, undefined, 'do not inherit a separate marketing description');
  assert.equal(about.name, 'About Smarter.Poker');
});

test('a calculator page graph from hubProductSchema, with its FAQ and HowTo', async () => {
  const { hubProductSchema, hubCollectionSchema } = await import('../src/lib/seo/hubPageSchema.js');
  const faqs = [{ question: 'Is It Free?', answer: 'Yes.' }];
  const howTo = { name: 'How To Read Pot Odds', description: 'Three steps.', steps: [{ name: 'Enter The Pot', text: 'Type the pot size.' }] };
  const product = hubProductSchema({ path: '/tools/pot-odds-calculator', name: 'Pot Odds Calculator', description: 'Pot odds.', trail: [['Hub', '/hub'], ['Pot Odds', '/tools/pot-odds-calculator']], faqs, howTo });
  const doc = assertValid('calculator', [schemas.organization, ...product]);
  const graphTypes = doc['@graph'].flatMap((n) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]));
  for (const t of ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'BreadcrumbList', 'FAQPage', 'HowTo']) assert.ok(graphTypes.includes(t), `calculator graph carries ${t}`);
  const collection = hubCollectionSchema({ path: '/hub/events-calendar', name: 'Events', description: 'Events.', trail: [['Hub', '/hub'], ['Events', '/hub/events-calendar']], faqs });
  assertValid('collection', [schemas.organization, ...collection]);
});

test('every comparison page is an Article with image, organization author and breadcrumb', async () => {
  const { COMPARE_PAGES, compareJsonLd, compareIndexJsonLd } = await import('../src/content/compare/pages.js');
  assert.ok(COMPARE_PAGES.length >= 10);
  for (const page of COMPARE_PAGES) {
    const doc = assertValid(`/compare/${page.slug}`, [schemas.organization, ...compareJsonLd(page)]);
    const article = doc['@graph'].find((n) => n['@type'] === 'Article');
    assert.deepEqual(article.author, { '@id': 'https://smarter.poker/#organization' });
    assert.equal(article.headline, page.h1);
  }
  assertValid('/compare', [schemas.organization, ...compareIndexJsonLd()]);
});

test('every lesson is an Article authored by the organization', async () => {
  const learnSite = await import('../src/lib/learn/learnSite.js');
  const lessons = await import('../src/content/learn/lessons.js');
  const wikidata = await import('../src/lib/seo/wikidataConcepts.js');
  const page = compiled('pages/learn/[topic].js', (name) => {
    if (name.endsWith('learnSite.js')) return learnSite;
    if (name.endsWith('lessons.js')) return lessons;
    if (name.endsWith('wikidataConcepts.js')) return wikidata;
    if (name.endsWith('titleFit.js') || name.endsWith('glossaryLinks.js')) return new Proxy({}, { get: () => () => [] });
    if (name === 'react') return React;
    return nullish();
  });
  assert.ok(lessons.LESSONS.length >= 40);
  for (const lesson of lessons.LESSONS) {
    const doc = assertValid(`/learn/${lesson.slug}`, [schemas.organization, ...page.lessonSchema(lesson)]);
    assert.deepEqual(doc['@graph'].find((n) => n['@type'] === 'Article').author, { '@id': 'https://smarter.poker/#organization' });
  }
});

test('every starting hand page is an Article with a visible FAQ, no Quiz and dates in order', async () => {
  const learnSite = await import('../src/lib/learn/learnSite.js');
  const hands = await import('../src/content/learn/hands.js');
  const page = compiled('pages/learn/hands/[hand].js', (name) => {
    if (name.endsWith('learnSite.js')) return learnSite;
    if (name.endsWith('hands.js')) return hands;
    if (name.endsWith('components/seo/SEOHead')) return siteSeo;
    if (name === 'react') return React;
    return nullish();
  });
  assert.ok(hands.STARTING_HANDS.length >= 100);
  for (const hand of hands.STARTING_HANDS) {
    const doc = assertValid(`/learn/hands/${hand.slug}`, page.handJsonLd(hand));
    const types = doc['@graph'].map((n) => n['@type']);
    assert.ok(!types.includes('Quiz'), `${hand.slug} hosts no quiz`);
    const faq = doc['@graph'].find((n) => n['@type'] === 'FAQPage');
    assert.deepEqual(faq.mainEntity.map((q) => q.name), page.handFaqs(hand).map((q) => q.question), 'the FAQPage and the rendered FAQ are the same list');
  }
  const src = read('pages/learn/hands/[hand].js');
  assert.match(src, /<FaqSection faqs=\{handFaqs\(hand\)\} \/>/);
});

test('tour, series and tournament directory graphs are valid before and after their rows arrive', async () => {
  const { tourSchema, tourFaqs } = await import('../src/lib/seo/tourPageSeo.js');
  const stops = [{ name: 'WSOP Circuit Choctaw', venue: 'Choctaw Casino', location: 'Durant, OK', dates: '2026-12-01 to 2026-12-12' }];
  for (const s of [[], stops]) {
    const doc = assertValid(`tour with ${s.length} stops`, tourSchema({ code: 'WSOP', name: 'World Series of Poker', type: 'major', website: 'https://www.wsop.com', stops: s }));
    const faq = doc['@graph'].find((n) => n['@type'] === 'FAQPage');
    assert.deepEqual(faq.mainEntity.map((q) => q.name), tourFaqs({ code: 'WSOP', name: 'World Series of Poker', stops: s }).map((q) => q.question));
  }
  assert.match(read('src/components/seo/TourPageSummary.js'), /<FaqSection faqs=\{tourFaqs\(\{ code, name, stops: stopList \}\)\}/, 'the tour summary renders the same questions');

  const { buildDailyTournamentSchema, serializePokerJsonLd } = await import('../src/lib/poker-near-me/structuredData.js');
  const { datasetSchema, faqSchema } = await import('../src/lib/seo/hubPageSchema.js');
  const rows = [{ tournament_name: 'Saturday Deepstack', venue_id: '7', venue_name: 'The Lodge', city: 'Austin', state: 'TX', event_date: '2026-11-14', start_time: '12:00 PM', buy_in: 250 }];
  for (const r of [[], rows]) {
    const problems = validate(serializePokerJsonLd(buildDailyTournamentSchema(r, '2026-11-09T00:00:00Z', { canonical: 'https://smarter.poker/hub/tournaments/this-weekend', pageName: 'Poker Tournaments This Weekend', pageDescription: 'Weekend tournaments.' })));
    assert.deepEqual(problems, [], `directory with ${r.length} rows`);
  }
  // The raw second <script> the directories write: it must declare the
  // Organization and WebSite its Dataset points at, which normalizeJsonLdGraph does.
  const weekend = serializePokerJsonLd({
    '@context': 'https://schema.org',
    '@graph': normalizeJsonLdGraph([
      datasetSchema({ path: '/hub/tournaments/this-weekend', name: 'Weekend Directory', description: 'Weekend tournaments.', keywords: ['poker'], variableMeasured: ['Buy-In'] }),
      faqSchema([{ question: 'Q?', answer: 'A.' }], '/hub/tournaments/this-weekend'),
    ].filter(Boolean)),
  });
  assert.deepEqual(validate(weekend), []);
  for (const file of ['pages/hub/daily-tournaments.js', 'pages/hub/tournaments/this-weekend.js', 'pages/hub/poker-series.js', 'pages/hub/poker-tours.js']) {
    assert.ok(read(file).includes("'@graph': normalizeJsonLdGraph(["), `${file} declares the nodes its raw graph references`);
  }
  assert.match(read('pages/hub/poker-series.js'), /'@graph': normalizeJsonLdGraph\(\[\s*datasetSchema\(/, '/hub/poker-series publishes the Dataset and the FAQPage as two graph nodes, not one merged object');
});

// ─── Part 3: FaqSection puts the questions on the page ─────────────────────

test('FaqSection renders every question and answer it is given, and nothing for an empty list', () => {
  const { default: FaqSection } = compiled('src/components/seo/FaqSection.js', (name) => (name === 'react' ? React : require(name)));
  const faqs = [
    { question: 'Is The Pot Odds Calculator Free?', answer: 'Yes, Every Tool Under /tools Is Free.' },
    { question: 'What Is MDF?', answer: 'Minimum Defense Frequency Is Pot / (Pot + Bet).' },
  ];
  const html = renderToStaticMarkup(React.createElement(FaqSection, { faqs }));
  assert.match(html, /<h2[^>]*>Frequently Asked Questions<\/h2>/);
  for (const { question, answer } of faqs) {
    assert.ok(html.includes(question.replace(/'/g, '&#x27;')), `renders "${question}"`);
    assert.ok(html.includes(answer.replace(/\//g, '/').replace(/\+/g, '+').replace(/\(/g, '(').replace(/\)/g, ')')), `renders "${answer}"`);
  }
  assert.doesNotMatch(html, /<details/, 'answers are visible without a click');
  assert.equal(renderToStaticMarkup(React.createElement(FaqSection, { faqs: [] })), '');
  assert.equal(renderToStaticMarkup(React.createElement(FaqSection, { faqs: [{ question: '', answer: 'x' }] })), '');
  const source = read('src/components/seo/FaqSection.js');
  assert.doesNotMatch(source, /[—–]/, 'no em or en dashes in the component');
});
