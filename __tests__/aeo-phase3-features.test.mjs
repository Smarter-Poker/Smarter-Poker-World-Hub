import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const FEATURE_ROUTES = [
  'bankroll-tax-tracker',
  'poker-dealer-toke-tracker',
  'poker-ai-coach',
  'virtual-poker-sandbox',
  'club-commander',
];

test('Feature Landers: all 5 page files exist and are populated', () => {
  for (const slug of FEATURE_ROUTES) {
    const filePath = path.join(ROOT, 'pages', 'features', `${slug}.js`);
    assert.ok(fs.existsSync(filePath), `pages/features/${slug}.js must exist`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.length > 500, `pages/features/${slug}.js must have substantial content`);
  }
});

test('Feature Landers: strict zero em dashes in page code and copy', () => {
  for (const slug of FEATURE_ROUTES) {
    const filePath = path.join(ROOT, 'pages', 'features', `${slug}.js`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(content.includes('—'), false, `pages/features/${slug}.js must contain zero em dashes`);
  }
});

test('Feature Landers: all markdown generators exist and render non-empty text', async () => {
  const {
    renderBankrollTrackerMarkdown,
    renderTokeTrackerMarkdown,
    renderPokerAiCoachMarkdown,
    renderVirtualSandboxMarkdown,
    renderClubCommanderMarkdown,
  } = await import('../src/lib/seo/markdownIngestion.mjs');

  const generators = [
    { name: 'Bankroll', fn: renderBankrollTrackerMarkdown },
    { name: 'TokeTracker', fn: renderTokeTrackerMarkdown },
    { name: 'AiCoach', fn: renderPokerAiCoachMarkdown },
    { name: 'Sandbox', fn: renderVirtualSandboxMarkdown },
    { name: 'Commander', fn: renderClubCommanderMarkdown },
  ];

  for (const g of generators) {
    const md = g.fn();
    assert.ok(typeof md === 'string' && md.length > 200, `${g.name} markdown generator must return valid markdown`);
    assert.equal(md.includes('—'), false, `${g.name} markdown must contain zero em dashes`);
  }
});

test('Feature Landers: listed in STATIC_PAGES for XML sitemaps', async () => {
  const { STATIC_PAGES } = await import('../src/lib/seo/sitemapBuilders.mjs');
  for (const slug of FEATURE_ROUTES) {
    const expectedPath = `/features/${slug}`;
    const entry = STATIC_PAGES.find(p => p.path === expectedPath);
    assert.ok(entry, `STATIC_PAGES must include ${expectedPath}`);
    assert.equal(entry.priority, '0.9');
  }
});
