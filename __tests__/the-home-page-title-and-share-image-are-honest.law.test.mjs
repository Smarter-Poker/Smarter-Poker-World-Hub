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
/**
 * The pixel size of a WebP, without a dependency: the Build Safety Gate runs
 * these tests with `node --test` and no install. Handles the three chunk
 * layouts (lossy VP8, lossless VP8L, extended VP8X).
 */
function webpSize(buf) {
  assert.equal(buf.subarray(0, 4).toString('latin1'), 'RIFF', 'a RIFF container');
  assert.equal(buf.subarray(8, 12).toString('latin1'), 'WEBP', 'a WebP file');
  const tag = buf.subarray(12, 16).toString('latin1');
  if (tag === 'VP8X') {
    return {
      width: 1 + (buf.readUIntLE(24, 3) & 0xffffff),
      height: 1 + (buf.readUIntLE(27, 3) & 0xffffff),
    };
  }
  if (tag === 'VP8 ') {
    // Key-frame header: 3-byte frame tag, the 0x9d 0x01 0x2a start code,
    // then width and height as 14-bit little-endian values.
    assert.equal(buf.readUIntLE(23, 3), 0x2a019d, 'a WebP key frame');
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (tag === 'VP8L') {
    assert.equal(buf[20], 0x2f, 'a VP8L signature');
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`unknown WebP chunk ${tag}`);
}

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
  assert.match(app, /property="og:title" content="Smarter\.Poker: Free Poker Training, Clubs And Live Games"/);
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
  // (2026-09-17). The bound is 60, not 70, because 70 is where the tag stops
  // being valid and 60 is where a search result stops showing it: measured on
  // production, / shipped 64, /hub/training 66 and the lobby 67, each of them
  // cut mid-phrase (AEO phase 3, 2026-09-17). These are the public product
  // pages a search result names.
  const PUBLIC_PAGES = [
    'pages/index.js',
    'pages/hub/training.js',
    'pages/hub/commander/index.js',
    'pages/hub/home-games.js',
    'pages/hub/bankroll-manager.js',
    'pages/hub/index.js',
    'pages/hub/poker-near-me/lobby.js',
  ];
  for (const file of PUBLIC_PAGES) {
    const title = read(file).match(/<SEOHead[\s\S]{0,400}?title="([^"]+)"/)?.[1];
    assert.ok(title, `${file} passes a title to SEOHead`);
    const shipped = renderedTitle(title);
    assert.ok(shipped.length <= 60, `${file} ships ${shipped.length} characters: ${shipped}`);
    assert.doesNotMatch(shipped, /\u2014/, `${file}: no em dash`);
    assert.equal(
      (shipped.match(/Smarter\.Poker/g) || []).length,
      1,
      `${file} names the site once: ${shipped}`,
    );
  }
});

/**
 * Every big image a public page paints early must declare its pixels: with
 * width:100% and height:auto but no intrinsic size the browser reserves a
 * zero-height box, and whatever sits below it moves when the bytes land.
 * Measured on production: the landing hero took CLS to 0.797 on one load in
 * six, and the Poker Near Me grid to 0.267 on every single load.
 */
const SIZED_IMAGES = [
  { file: 'pages/index.js', asset: 'public/images/landing-hero.webp', needle: 'src="/images/landing-hero.webp"' },
  {
    file: 'src/components/poker-near-me/lobby/LobbyOverlay.jsx',
    asset: 'public/images/lobby-pods/poker-near-me-grid.webp',
    needle: 'src="/images/lobby-pods/poker-near-me-grid.webp"',
  },
];

test('every early image declares the pixels the file actually has', () => {
  for (const { file, asset, needle } of SIZED_IMAGES) {
    const src = read(file);
    const at = src.indexOf(needle);
    assert.ok(at > 0, `${file} renders ${needle}`);
    const img = src.slice(src.lastIndexOf('<img', at), src.indexOf('/>', at) + 2);
    const width = Number(img.match(/width=\{(\d+)\}/)?.[1]);
    const height = Number(img.match(/height=\{(\d+)\}/)?.[1]);
    assert.ok(width && height, `${file} declares intrinsic width and height`);
    const actual = webpSize(fs.readFileSync(path.join(ROOT, asset)));
    assert.equal(width, actual.width, `${file}: declared width matches ${asset}`);
    assert.equal(height, actual.height, `${file}: declared height matches ${asset}`);
  }

  // And the landing placeholder must not add or remove layout height of its own.
  const shimmer = read('pages/index.js').match(/shimmer: \{[\s\S]*?\},/)?.[0] || '';
  assert.doesNotMatch(shimmer, /paddingBottom/, 'the shimmer does not reserve a band in the flow');
  assert.match(shimmer, /position: 'absolute'/, 'the shimmer is an overlay');
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
