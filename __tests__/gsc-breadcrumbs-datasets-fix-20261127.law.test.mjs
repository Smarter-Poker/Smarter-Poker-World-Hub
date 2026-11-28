import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  breadcrumbSchema,
  datasetSchema,
  freerollEventSchema,
  hubCollectionSchema,
  hubProductSchema,
} from '../src/lib/seo/hubPageSchema.js';

const ROOT = process.cwd();

test('GSC Datasets Law: datasetSchema never emits WebSite isPartOf and links valid DataCatalog', () => {
  const routes = [
    '/hub/tournaments/this-weekend',
    '/hub/daily-tournaments',
    '/hub/poker-series',
    '/hub/poker-tours',
    '/hub/events-calendar',
    '/hub/poker-near-me/lobby',
  ];

  for (const route of routes) {
    const node = datasetSchema({
      path: route,
      name: `Test Dataset For ${route}`,
      description: `Verified poker dataset for ${route} with complete live schedule metadata.`,
    });

    assert.equal(node['@type'], 'Dataset');
    assert.equal(
      node.isPartOf,
      undefined,
      `${route} Dataset must never set isPartOf to #website (GSC Datasets requires Dataset or URL)`,
    );
    assert.equal(node.includedInDataCatalog?.['@type'], 'DataCatalog');
    assert.equal(node.includedInDataCatalog?.url, 'https://smarter.poker/research');
  }
});

test('GSC Breadcrumbs Law: hubProductSchema, hubCollectionSchema, and freerollEventSchema always match WebPage.breadcrumb @id to BreadcrumbList @id', () => {
  const productGraph = hubProductSchema({
    path: '/tools/preflop-ranges/btn',
    name: 'Smarter.Poker BTN GTO Preflop Range Matrix',
    description: 'Interactive 13x13 GTO Preflop Range Matrix For The Button (BTN).',
    trail: [
      ['Hub', '/hub'],
      ['Poker Tools', '/tools/poker-odds-calculator'],
      ['Preflop Ranges', '/tools/preflop-ranges'],
    ],
  });

  const webPage = productGraph.find((n) => n['@type'] === 'WebPage');
  const breadcrumb = productGraph.find((n) => n['@type'] === 'BreadcrumbList');
  assert.ok(webPage, 'hubProductSchema must emit WebPage');
  assert.ok(breadcrumb, 'hubProductSchema must emit BreadcrumbList');
  assert.equal(
    breadcrumb['@id'],
    webPage.breadcrumb['@id'],
    'BreadcrumbList @id must match WebPage.breadcrumb @id even when trail ends on a parent path',
  );
  assert.equal(breadcrumb['@id'], 'https://smarter.poker/tools/preflop-ranges/btn#breadcrumb');
  assert.ok(Array.isArray(breadcrumb.itemListElement) && breadcrumb.itemListElement.length >= 2);

  const collectionGraph = hubCollectionSchema({
    path: '/hub/events-calendar/custom',
    name: 'Events Calendar',
    description: 'Poker Events Calendar.',
    trail: [['Hub', '/hub']],
  });
  const colPage = collectionGraph.find((n) => n['@type'] === 'CollectionPage');
  const colBc = collectionGraph.find((n) => n['@type'] === 'BreadcrumbList');
  assert.equal(colBc['@id'], colPage.breadcrumb['@id']);

  const freerollGraph = freerollEventSchema({
    path: '/freerolls',
    name: 'Free Daily Poker Freerolls',
    description: 'Daily Poker Freerolls.',
    trail: [['Freerolls', '/freerolls']],
  });
  const frPage = freerollGraph.find((n) => n['@type'] === 'WebPage');
  const frBc = freerollGraph.find((n) => n['@type'] === 'BreadcrumbList');
  assert.equal(frBc['@id'], frPage.breadcrumb['@id']);

  // Direct breadcrumbSchema call still supports explicit idPath override
  const direct = breadcrumbSchema([['Tools', '/tools']], 'https://smarter.poker', '/tools/custom');
  assert.equal(direct['@id'], 'https://smarter.poker/tools/custom#breadcrumb');
});

test('GSC Breadcrumbs Law: positional /tools/preflop-ranges/[position] routes append positional crumb and pass positional markdownPath', () => {
  const indexSrc = fs.readFileSync(path.join(ROOT, 'src/components/seo/PreflopRangeMatrixHub.jsx'), 'utf8');
  const posSrc = fs.readFileSync(path.join(ROOT, 'pages/tools/preflop-ranges/[position].js'), 'utf8');

  assert.match(indexSrc, /isPositionalRoute\s*=\s*canonicalPath\s*!==\s*'\/tools\/preflop-ranges'/);
  assert.match(indexSrc, /\[\`\$\{posData\.name\} \(\$\{posData\.abbrev\}\)\`,\s*canonicalPath\]/);
  assert.match(indexSrc, /markdownUrl=\{\`https:\/\/smarter\.poker\$\{markdownPath\}\`\}/);
  assert.match(posSrc, /markdownPath:\s*\`\/tools\/preflop-ranges\/\$\{rawPos\.toLowerCase\(\)\}\.md\`/);
});

test('GSC Traffic Recovery Law: clicked dead video URLs xxM8Q76ddHI and u_Yk0kC_4c4 permanently redirect to /hub/video-library', () => {
  const nextCfg = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');
  for (const id of ['xxM8Q76ddHI', 'u_Yk0kC_4c4']) {
    assert.ok(
      nextCfg.includes(`/hub/video-library/watch/${id}`),
      `next.config.js must permanently redirect removed clicked video ${id}`,
    );
  }
});
