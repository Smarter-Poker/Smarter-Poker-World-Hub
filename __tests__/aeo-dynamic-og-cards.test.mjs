/**
 * Test Suite: AEO Dynamic OpenGraph Social Card Generators
 * Validates Satori compatibility, edge runtime configurations,
 * query parameter handling, and page head integration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seriesOgImage } from '../src/lib/poker-near-me/seriesSeo.mjs';

const ROOT = process.cwd();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('venue-card OG generator module exists with edge runtime and @vercel/og', () => {
  const code = read('pages/api/og/venue-card.js');
  assert.match(code, /import\s+\{\s*ImageResponse\s*\}\s+from\s+['"]@vercel\/og['"]/);
  assert.match(code, /runtime:\s*['"]edge['"]/);
  assert.match(code, /searchParams\.get\(['"]id['"]\)/);
  assert.match(code, /searchParams\.get\(['"]name['"]\)/);
  assert.match(code, /searchParams\.get\(['"]city['"]\)/);
  assert.match(code, /searchParams\.get\(['"]state['"]\)/);
  assert.match(code, /searchParams\.get\(['"]tables['"]\)/);
  assert.match(code, /POKER NEAR ME/);
});

test('series-card OG generator module exists with edge runtime and @vercel/og', () => {
  const code = read('pages/api/og/series-card.js');
  assert.match(code, /import\s+\{\s*ImageResponse\s*\}\s+from\s+['"]@vercel\/og['"]/);
  assert.match(code, /runtime:\s*['"]edge['"]/);
  assert.match(code, /searchParams\.get\(['"]id['"]\)/);
  assert.match(code, /searchParams\.get\(['"]name['"]\)/);
  assert.match(code, /searchParams\.get\(['"]venue['"]\)/);
  assert.match(code, /searchParams\.get\(['"]dates['"]\)/);
  assert.match(code, /TOURNAMENT SERIES/);
});

test('seriesOgImage helper generates valid absolute URLs with search parameters', () => {
  const series = {
    id: 468,
    name: '2026 WSOP Circuit',
    venueName: 'Horseshoe Las Vegas',
    city: 'Las Vegas',
    state: 'NV',
    totalEvents: 18,
    mainEventBuyin: 1700,
    mainEventGuaranteed: 1000000,
    startDate: '2026-03-01',
    endDate: '2026-03-12',
    logoUrl: 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/venue-logos/468.png',
  };

  const url = seriesOgImage(series);
  assert.ok(url.startsWith('https://smarter.poker/api/og/series-card?'));
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('id'), '468');
  assert.equal(parsed.searchParams.get('name'), '2026 WSOP Circuit');
  assert.equal(parsed.searchParams.get('venue'), 'Horseshoe Las Vegas');
  assert.equal(parsed.searchParams.get('city'), 'Las Vegas');
  assert.equal(parsed.searchParams.get('state'), 'NV');
  assert.equal(parsed.searchParams.get('events'), '18');
  assert.equal(parsed.searchParams.get('buyin'), '1700');
  assert.equal(parsed.searchParams.get('guarantee'), '1000000');
  assert.equal(parsed.searchParams.get('dates'), 'March 1 to March 12, 2026');
});

test('seriesOgImage handles null or missing fields gracefully', () => {
  assert.equal(seriesOgImage(null), null);
  assert.equal(seriesOgImage({}), null);

  const minimal = { id: 999 };
  const url = seriesOgImage(minimal);
  assert.ok(url.startsWith('https://smarter.poker/api/og/series-card?'));
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('id'), '999');
  assert.equal(parsed.searchParams.get('name'), null);
});

test('pages/hub/series/[id].js uses seriesOgImage in SEOHead', () => {
  const code = read('pages/hub/series/[id].js');
  assert.match(code, /import\s*\{[^}]*seriesOgImage[^}]*\}\s*from\s*['"][^'"]*seriesSeo\.mjs['"]/);
  assert.match(code, /ogImage=\{seriesOgImage\(series\)\s*\|\|\s*series\.logoUrl\s*\|\|\s*null\}/);
});

test('tool-card OG generator module exists with edge runtime and @vercel/og', () => {
  const code = read('pages/api/og/tool-card.js');
  assert.match(code, /import\s+\{\s*ImageResponse\s*\}\s+from\s+['"]@vercel\/og['"]/);
  assert.match(code, /runtime:\s*['"]edge['"]/);
  assert.match(code, /EQUITY CALCULATOR/);
  assert.match(code, /GTO PREFLOP MATRIX/);
  assert.match(code, /ICM PAYOUT SOLVER/);
  assert.match(code, /POKER GLOSSARY/);
  assert.match(code, /ABOUT SMARTER\.POKER/);
  assert.match(code, /WEBMASTER EMBEDS/);
  assert.ok(!code.includes('—'), 'Must contain zero em dashes');
});

test('all interactive tools, glossary terms, and about pages pass dynamic ogImage to SEOHead', () => {
  const glossaryCode = read('pages/glossary/[term].js');
  assert.match(glossaryCode, /ogImage=\{`\/api\/og\/tool-card\?tool=glossary/);

  const icmCode = read('pages/hub/training/icm-calculator.js');
  assert.match(icmCode, /ogImage="\/api\/og\/tool-card\?tool=icm/);

  const rangesCode = read('pages/tools/preflop-ranges/index.js');
  assert.match(rangesCode, /ogImage=\{`\/api\/og\/tool-card\?tool=ranges/);

  const oddsCode = read('pages/hub/poker-tools.js');
  assert.match(oddsCode, /ogImage="\/api\/og\/tool-card\?tool=odds/);

  const aboutCode = read('pages/about.js');
  assert.match(aboutCode, /ogImage="\/api\/og\/tool-card\?tool=about/);

  const embedsCode = read('pages/tools/embeds.js');
  assert.match(embedsCode, /ogImage="\/api\/og\/tool-card\?tool=embeds/);
});
