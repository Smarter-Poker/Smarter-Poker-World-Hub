import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// Three defects the Marketplace restoration measured on the live pages rather
// than inferred from source: a heading outline that skipped a level on the merch
// product detail page, two accessible names attached to role-less generic
// divs where assistive technology drops them, and a breadcrumb link that was
// tall enough to press but not wide enough.

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const merch = read('src/components/store/MerchStore.jsx');
const showcase = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const detailCss = read('src/components/store/MarketplaceDetailExperience.module.css');
const legacyStyles = read('src/components/diamond-store/diamondStoreStyles.js');
const shellCss = read('src/components/diamond-store/DiamondStoreShell.module.css');

test('the merch product card takes its heading level from its surroundings', () => {
  assert.match(
    merch,
    /headingLevel = 4,/,
    'MerchProductCard must accept a heading level instead of hard coding one'
  );
  assert.match(
    merch,
    /const ProductHeading = `h\$\{headingLevel\}`;/,
    'MerchProductCard must render the level it was given'
  );
  assert.match(
    merch,
    /<ProductHeading id=\{titleId\} className=\{merchStyles\.productTitle\}>/,
    'the product name must render through the level-aware heading'
  );
  assert.doesNotMatch(
    merch,
    /<h4 id=\{titleId\}/,
    'the fixed h4 product title is what produced the h2 to h4 skip'
  );
});

test('the detail page closes the gap the category heading used to fill', () => {
  // The grid renders `{!detailMode && <h3 …categoryTitle…>}`. Whenever that
  // heading is absent the card title has to take its place, or the outline
  // jumps from the console heading straight past h3.
  assert.match(
    merch,
    /\{!detailMode && <h3 className=\{merchStyles\.categoryTitle\}>\{section\.label\}<\/h3>\}/,
    'the category heading is still the h3 the card title has to answer to'
  );
  assert.match(
    merch,
    /headingLevel=\{detailMode \? 3 : 4\}/,
    'the card must step up to h3 exactly when the category h3 is not rendered'
  );
});

test('every accessible name the Marketplace sets lands on an element that can carry it', () => {
  assert.match(
    merch,
    /role=\{detailMode \? 'region' : undefined\}\n\s*aria-label=\{detailMode \? 'Live Product Purchase Console' : undefined\}/,
    'the named purchase console must declare a role before it is named'
  );
  assert.match(
    showcase,
    /<div className=\{styles\.starterRail\} role="group" aria-label="Starter Diamond Packs">/,
    'the named starter rail must declare a role before it is named'
  );

  // Nothing in these two files may name a bare div again.
  for (const [label, source] of [
    ['MerchStore.jsx', merch],
    ['SmarterStoreShowcase.jsx', showcase],
  ]) {
    for (const match of source.matchAll(/<div\b([^>]*?)>/gs)) {
      const attributes = match[1];
      if (!/\baria-label\b/.test(attributes)) continue;
      assert.ok(
        /\brole=/.test(attributes),
        `${label} names a div that declares no role: <div${attributes.slice(0, 120)}>`
      );
    }
  }
});

test('a breadcrumb link is a target in both directions', () => {
  // Anchored so it cannot match the shared `.breadcrumbs span, .breadcrumbs a`
  // rule, which deliberately carries the height and not the width.
  const block = /(?<!,)\n\.breadcrumbs a \{[^}]*\}/.exec(detailCss);
  assert.ok(block, 'the breadcrumb link rule is gone');
  assert.match(block[0], /min-width:\s*44px;/, 'a short crumb must still span 44px across');
  const shared = /\.breadcrumbs span,\n\.breadcrumbs a \{[^}]*\}/.exec(detailCss);
  assert.ok(shared, 'the shared breadcrumb rule is gone');
  assert.match(shared[0], /min-height:\s*44px;/, 'a crumb must still stand 44px tall');
  assert.doesNotMatch(
    shared[0],
    /min-width:/,
    'the separators are text, not targets, and must not be padded out to 44px'
  );
});

test('an inline link is given a height that min-height cannot give it', () => {
  // `min-height` does nothing to a non-replaced inline box. The global
  // `a { min-height: 44px }` rule therefore left the legal note's link 19px
  // tall at 320px and 14px at 1024px, and it measured 44px at exactly one
  // width, 390px, only because the text wrapped onto a second line there.
  const link = /\n  link: \{[^}]*\}/.exec(legacyStyles);
  assert.ok(link, 'the legal note link style is gone');
  assert.match(link[0], /display:\s*'inline-block'/, 'the link must not stay an inline box');
  assert.match(link[0], /paddingBlock:\s*14/, 'the link must reach 44px through real padding');
  assert.match(link[0], /marginBlock:\s*-14/, 'the paragraph must keep its own rhythm');

  // The same remedy, already shipped, on the reward detail link. Both are
  // asserted here so neither can be reverted as the odd one out.
  const reward = /\.rewardDetailLink \{[^}]*\}/.exec(shellCss);
  assert.ok(reward, 'the reward detail link rule is gone');
  assert.match(reward[0], /display:\s*inline-block/);
  assert.match(reward[0], /padding-block:\s*14px/);
  assert.match(reward[0], /margin-block:\s*-14px/);
});
