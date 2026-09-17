/**
 * THE HOME PAGE TITLE AND SHARE IMAGE ARE HONEST (AEO phase 1, 2026-09-17).
 *
 * The <title> of the home page is the most-quoted string the site has: it is
 * what an AI answer, a search result and a link preview call the product.
 * It read "Smarter.Poker - The Future Of The Game | Smarter.Poker": the brand
 * twice and no noun. And every page declared its share image as 1200 x 630
 * while the file was 1200 x 2151 and 3.1 MB, so link previews cropped it
 * wherever they liked. This pins three things:
 *
 *   1. SEOHead does not suffix a title that already names the site;
 *   2. the home page title names the site once and says what it is;
 *   3. public/images/og-default.png is the 1200 x 630 the meta tags promise
 *      and small enough for a preview fetcher (under 400 KB).
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/**
 * What the browser tab and the search result actually show. SEOHead appends
 * " | Smarter.Poker" unless the title already names the site, so a raw title
 * that measures 63 characters on its own ships as 80 (2026-09-17).
 */
const renderedTitle = (title) => (title.includes('Smarter.Poker') ? title : `${title} | Smarter.Poker`);

test('SEOHead does not suffix a title that already names the site', () => {
  const src = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.match(src, /title\.includes\(SITE_NAME\)\s*\?\s*title/);
  assert.match(src, /`\$\{title\} \| \$\{SITE_NAME\}`/);
});

test('the home page title names the site once and says what the product is', () => {
  const src = read('pages/index.js');
  const title = src.match(/<SEOHead\s+title="([^"]+)"/)?.[1];
  assert.ok(title, 'pages/index.js passes a title to SEOHead');
  assert.equal(title.split('Smarter.Poker').length - 1, 1, `names the site once: ${title}`);
  assert.match(title, /Poker/, 'says what it is');
  assert.doesNotMatch(title, /The Future Of The Game/, 'a slogan is not a title');
  assert.ok(renderedTitle(title).length <= 70, `fits a result heading: ${renderedTitle(title)}`);
  assert.doesNotMatch(title, /—/, 'no em dash');
  const description = src.match(/<SEOHead[\s\S]*?description="([^"]+)"/)?.[1];
  assert.ok(description && description.length >= 120 && description.length <= 320, 'a definition-length description');
  assert.match(description, /Free/, 'says it is free');
  assert.match(description, /No Real-Money Gambling/, 'says what it is not');
});

test('the training page title says what it is instead of "Training - Smarter.Poker"', () => {
  const src = read('pages/hub/training.js');
  const title = src.match(/<SEOHead\s+title="([^"]+)"/)?.[1];
  assert.ok(title, 'pages/hub/training.js passes a title to SEOHead');
  assert.match(title, /GTO Poker Training/);
  assert.doesNotMatch(title, /Smarter\.Poker/, 'SEOHead adds the site name once');
  assert.ok(renderedTitle(title).length <= 70, `fits a result heading: ${renderedTitle(title)}`);
});

test('the fonts come from next/font: no Google Fonts stylesheet on the home page, no preconnect in the document', () => {
  assert.doesNotMatch(read('pages/index.js'), /fonts\.googleapis\.com/);
  assert.doesNotMatch(read('src/components/landing/LandingProductSummary.js'), /'Orbitron'|'Inter'/);
  assert.doesNotMatch(read('pages/_document.js'), /rel="preconnect" href="https:\/\/fonts\./);
});

test('the app-level social defaults say what the product is', () => {
  const app = read('pages/_app.js');
  assert.doesNotMatch(app, /content="Smarter\.Poker \| The Future Of The Game"/);
  assert.match(app, /property="og:title" content="Smarter\.Poker: Free Poker Training, Private Clubs And Live Games"/);
});

test('the training heading never ends in a loading message', () => {
  const src = read('pages/hub/training.js');
  assert.doesNotMatch(src, /\{greet\} Loading/);
  assert.match(src, /GTO Poker Training: Build Better Decisions, One Hand At A Time\./);
});

test('every public page title fits a search result once SEOHead has added the site name', () => {
  // The raw string in the source is not what ships: SEOHead appends
  // " | Smarter.Poker" unless the title already names the site. Two titles
  // shipped at 80 and 86 characters while each measured under 70 on its own
  // (2026-09-17). These are the public product pages a search result names.
  const PUBLIC_PAGES = [
    'pages/index.js',
    'pages/hub/training.js',
    'pages/hub/commander/index.js',
    'pages/hub/home-games.js',
    'pages/hub/bankroll-manager.js',
  ];
  for (const file of PUBLIC_PAGES) {
    const title = read(file).match(/<SEOHead[\s\S]{0,400}?title="([^"]+)"/)?.[1];
    assert.ok(title, `${file} passes a title to SEOHead`);
    const shipped = renderedTitle(title);
    assert.ok(shipped.length <= 70, `${file} ships ${shipped.length} characters: ${shipped}`);
    assert.doesNotMatch(shipped, /\u2014/, `${file}: no em dash`);
    assert.equal(
      (shipped.match(/Smarter\.Poker/g) || []).length,
      1,
      `${file} names the site once: ${shipped}`,
    );
  }
});

test('the share image is the 1200 x 630 PNG the meta tags promise, under 400 KB', () => {
  const file = path.join(ROOT, 'public/images/og-default.png');
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString('ascii'), 'PNG', 'a PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, 1200);
  assert.equal(height, 630);
  assert.ok(buf.length < 400 * 1024, `${buf.length} bytes`);
  const seo = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.match(seo, /og:image:width" content="1200"/);
  assert.match(seo, /og:image:height" content="630"/);
});
