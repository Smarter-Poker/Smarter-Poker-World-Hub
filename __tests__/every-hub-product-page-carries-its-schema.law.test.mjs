/**
 * EVERY HUB PRODUCT PAGE CARRIES ITS SCHEMA (AEO phase 3, 2026-09-17).
 *
 * Measured on production with every script stripped, the four largest
 * pages on the site carried thousands of server-rendered words each and
 * not one line of structured data:
 *
 *   /hub                      200 words   0 ld+json
 *   /hub/training           1,843 words   0 ld+json
 *   /hub/home-games           229 words   0 ld+json
 *   /hub/bankroll-manager     211 words   0 ld+json
 *
 * The two pages that came back clean in the same audit, /hub/commander
 * and /hub/commander/faq, were the two that had built their schema by
 * hand. src/lib/seo/hubPageSchema.js is that pattern made shared, so a
 * fifth page cannot ship without it and no page invents its own shape.
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

/** page file -> the constant it must pass to SEOHead as jsonLd. */
const PAGES = {
  'pages/hub/index.js': 'HUB_SCHEMA',
  'pages/hub/training.js': 'TRAINING_SCHEMA',
  'pages/hub/home-games.js': 'HOME_GAMES_SCHEMA',
  'pages/hub/bankroll-manager.js': 'BANKROLL_SCHEMA',
};

test('every large hub page ships structured data, built by the shared builder', () => {
  for (const [file, constant] of Object.entries(PAGES)) {
    const src = read(file);
    assert.match(
      src,
      /import \{ hub(Product|Collection)Schema \} from '[^']+lib\/seo\/hubPageSchema'/,
      `${file} imports the shared builder`,
    );
    assert.match(src, new RegExp(`const ${constant} = hub(Product|Collection)Schema\\(`), `${file} builds ${constant}`);
    assert.match(src, new RegExp(`jsonLd=\\{${constant}\\}`), `${file} passes ${constant} to SEOHead`);
  }
});

test('the hub is a CollectionPage and the products are not', () => {
  // Claiming SoftwareApplication for a menu is a claim the page does not
  // support, and a claim an engine can check.
  assert.match(read('pages/hub/index.js'), /hubCollectionSchema\(/);
  for (const file of ['pages/hub/training.js', 'pages/hub/home-games.js', 'pages/hub/bankroll-manager.js']) {
    assert.match(read(file), /hubProductSchema\(/, `${file} is a product page`);
  }
  // A ledger is not a game.
  assert.match(read('pages/hub/bankroll-manager.js'), /applicationCategory: 'FinanceApplication'/);
});

test('the builder joins the site graph instead of starting a new one', () => {
  const src = read('src/lib/seo/hubPageSchema.js');
  assert.match(src, /ORGANIZATION_ID = `\$\{SITE\}\/#organization`/);
  assert.match(src, /WEBSITE_ID = `\$\{SITE\}\/#website`/);
  assert.match(src, /isPartOf: \{ '@id': WEBSITE_ID \}/, 'a page is part of the WebSite');
  assert.match(src, /publisher: \{ '@id': ORGANIZATION_ID \}/, 'the Organization publishes the app');
  assert.match(src, /'@type': 'BreadcrumbList'/, 'a deep page says where it sits');

  // The ids it references have to be the ids SEOHead actually publishes.
  const head = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  for (const id of ['https://smarter.poker/#website', 'https://smarter.poker/#organization']) {
    assert.ok(head.includes(`'${id}'`), `SEOHead publishes ${id}`);
  }
});

test('every breadcrumb trail starts at the site root', () => {
  const src = read('src/lib/seo/hubPageSchema.js');
  assert.match(src, /const items = \[\['Smarter\.Poker', '\/'\], \.\.\.trail\]/);
  for (const file of Object.keys(PAGES)) {
    assert.match(read(file), /trail: \[/, `${file} declares its trail`);
  }
});
