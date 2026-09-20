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
const merchCss = read('src/components/store/MerchStore.module.css');
const vipCss = read('src/components/store/VipMembershipConsole.module.css');
const detailCssFocus = read('src/components/store/MarketplaceDetailExperience.module.css');
const globalCss = read('src/index.css');

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

test('an unavailable product does not become an unreadable one', () => {
  // Fading the whole card carried the state. At 0.68 the card's own 9px bold
  // text composited against #000305 to 3.78:1 on the price note, 4.17:1 on the
  // control label and 3.76:1 on the reason line, all under the 4.5:1 that text
  // size needs. Measured with axe-core on /hub/merch-store/hoodie-neural.
  const rule = /\.productCardUnavailable \{[^}]*\}/.exec(merchCss);
  assert.ok(rule, 'the unavailable card rule is gone');
  assert.doesNotMatch(
    rule[0],
    /opacity/,
    'a card that fades its own text takes the reason for the sale with it'
  );
  assert.match(
    merchCss,
    /\.productCardUnavailable \.mediaBay \{[^}]*opacity/,
    'the state belongs on the imagery'
  );
});

test('the VIP surfaces are sized by their content, not by a painted plate', () => {
  // Two instances of the same fault, both measured on production. The
  // confirmation dialog: 211px of padding a side at 1280px wide, 973px tall
  // inside a 720px viewport, both actions below the fold and unclickable. The
  // signed-out panel: 480x754 with 212.4px a side and a 55px content box.
  for (const [name, pattern] of [
    ['dialog', /\n\.dialog \{[^}]*\}/],
    ['signedOut', /\.signedOut,\n\.loading \{[^}]*\}/],
  ]) {
    const rule = pattern.exec(vipCss);
    assert.ok(rule, `the VIP ${name} rule is gone`);
    assert.doesNotMatch(rule[0], /padding:\s*\d+(?:\.\d+)?%/, `${name} must not take a percentage padding`);
    assert.doesNotMatch(rule[0], /aspect-ratio/, `${name} must be sized by its content`);
    assert.doesNotMatch(rule[0], /utility-shell\.webp/, `${name} must not carry the console housing`);
  }
  // The approved gold plan artwork stays exactly as it is.
  assert.match(vipCss, /\.plan \{[^}]*utility-shell\.webp/s, 'the VIP plan artwork is approved and stays');
});

test('the rewards stats readout wraps instead of running off the side', () => {
  // Four tiles at a 148px floor measured 646px across inside a 313px column,
  // with no wrap and no scroll: main.scrollWidth read 687 against a 393px
  // viewport and the last tiles were clipped out of reach.
  const rule = /\.rewardsQuickStats \{[^}]*\}/.exec(shellCss);
  assert.ok(rule, 'the rewards stats rule is gone');
  assert.match(rule[0], /flex-wrap:\s*wrap/, 'the stats row must wrap');
  assert.match(
    shellCss,
    /@media \(max-width: 700px\) \{\s*\.rewardsQuickStats > div \{[^}]*min-width:\s*0/,
    'the tiles must be allowed to shrink on a narrow screen'
  );
});

test('a keyboard user can see where they are on every Marketplace surface', () => {
  // src/index.css resets `input, textarea, select, button:focus` with
  // `outline: none !important`. That beats any focus-visible outline declared
  // at normal specificity, so a module rule without `!important` never paints:
  // measured on production, MarketplaceDetailExperience's inspect button
  // reported `outline-style: none` while `:focus-visible` matched. Every
  // Marketplace focus ring that uses `outline` has to out-rank that reset.
  //
  // For the record, because an earlier note here overstated it: this is about a
  // module getting the ring it declares, not about a keyboard user being
  // stranded. src/styles/premium.css:480 already rings every focusable element
  // with a box-shadow the reset cannot erase.
  assert.match(
    globalCss,
    /button:focus \{[^}]*outline:\s*none\s*!important/,
    'the global reset moved; re-check whether these !important rings are still needed'
  );

  for (const [name, css] of [
    ['MarketplaceDetailExperience', detailCssFocus],
    ['VipMembershipConsole', vipCss],
    ['MerchStore', merchCss],
    ['DiamondStoreShell', shellCss],
  ]) {
    const blocks = [...css.matchAll(/:focus-visible[^{]*\{[^}]*\}/g)].map((m) => m[0]);
    assert.ok(blocks.length > 0, `${name} declares no focus ring at all`);
    for (const block of blocks) {
      if (!/outline:/.test(block)) continue; // a box-shadow ring is unaffected by the reset
      assert.match(
        block,
        /outline:[^;]*!important/,
        `${name} has an outline focus ring the global reset will erase: ${block.slice(0, 90)}`
      );
    }
  }
});
