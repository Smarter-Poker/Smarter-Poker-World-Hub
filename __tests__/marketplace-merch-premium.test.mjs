import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const MERCH = read('src/components/store/MerchStore.jsx');
const CSS = read('src/components/store/MerchStore.module.css');
const ART = read('src/lib/store/merchProductArt.js');

test('merch keeps its existing catalog layout, photography, and purchase wiring', () => {
  for (const productImage of [
    '/images/merch/neural-steel/mockups/diamond-altitude-hoodie.webp',
    '/images/merch/neural-steel/mockups/royal-circuit-tee.webp',
    '/images/merch/neural-steel/mockups/diamond-dad-hat.webp',
  ]) {
    assert.match(MERCH, new RegExp(productImage.replaceAll('/', '\\/').replace('.', '\\.')));
  }
  assert.match(
    MERCH,
    /className=\{`merch-discovery-controls \$\{merchStyles\.discoveryControls\}`\}/
  );
  assert.match(MERCH, /onToggleWishlist\(product\)/);
  assert.match(MERCH, /onAddToCart\(product, variant, clampedQty\)/);
  assert.match(MERCH, /onBuyCard\(product, variant, clampedQty\)/);
  assert.match(MERCH, /onBuyDiamonds\(product, variant, clampedQty\)/);
  assert.match(
    MERCH,
    /href=\{`\/hub\/merch-store\/\$\{encodeURIComponent\(product\.catalogId \|\| product\.key\)\}`\}/
  );
  assert.doesNotMatch(MERCH, /target=["']_blank|window\.open|MarketplaceConsoleSelector/);
});

test('merch replaces floating generic icons with integrated console controls', () => {
  assert.doesNotMatch(MERCH, /lucide-react|<Heart|<ShoppingCart|<CreditCard|<Gem|<Search/);
  assert.match(MERCH, /isWishlisted \? 'Saved' : 'Save'/);
  assert.match(
    MERCH,
    /className=\{`\$\{merchStyles\.actionControl\} \$\{merchStyles\.actionPrimary\}`\}/
  );
  assert.match(
    MERCH,
    /className=\{`\$\{merchStyles\.actionControl\} \$\{merchStyles\.actionDiamond\}`\}/
  );
  assert.match(CSS, /marketplace-console-v1\/shark-panel\/button-primary\.png/);
  assert.match(CSS, /marketplace-console-v1\/shark-panel\/button-secondary\.png/);
  assert.doesNotMatch(
    CSS,
    /marketplace-console-v1\/(?:navigation\/nav-shell|shark-panel\/bay)\.(?:png|webp)/
  );
  assert.match(CSS, /linear-gradient|box-shadow/);
  assert.doesNotMatch(CSS, /:hover|border-radius/);
  assert.match(MERCH, /resolveReviewedMerchArt\(rawId\)/);
  assert.match(ART, /const REVIEWED_MERCH_IMAGES = new Map/);
  assert.match(MERCH, /mediaApproved: Boolean\(approvedImage \|\| atlasPosition\)/);
  assert.match(MERCH, /Product Artwork Requires Review/);
  assert.doesNotMatch(MERCH, /src="\/images\/store-v3\/merch-hero\.webp"/);
});

test('a merch card offers one primary action, not four equal ones', () => {
  const rule = (name) => CSS.match(new RegExp(`\\.${name}\\s*\\{[\\s\\S]*?\\n\\}`, 'g')) || [];
  const heightOf = (name) => {
    for (const block of rule(name)) {
      const m = block.match(/min-height:\s*(\d+)px/);
      if (m) return Number(m[1]);
    }
    return null;
  };

  const primary = heightOf('actionPrimary');
  const diamond = heightOf('actionDiamond');
  const gold = heightOf('actionGold');
  const secondary = heightOf('actionSecondary');

  for (const [name, value] of [
    ['actionPrimary', primary],
    ['actionDiamond', diamond],
    ['actionGold', gold],
    ['actionSecondary', secondary],
  ]) {
    assert.ok(typeof value === 'number', `${name} must state its own min-height`);
    assert.ok(value >= 44, `${name} must stay a 44px touch target, found ${value}`);
  }

  // Measured on production before this contract existed: all four actions
  // rendered at 48px, weight 800, 13px, on the same background. A shopper
  // could not tell which action was the main one.
  assert.ok(primary > diamond, 'the primary action must outrank the Diamond action');
  assert.ok(diamond > gold, 'the Diamond action must outrank Add To Cart');
  assert.ok(gold >= secondary, 'Add To Cart must not rank below View Details');

  // Only one action wears the primary painted plate.
  const primaryPlate = CSS.match(
    /[^}]*button-primary\.png[^}]*/g
  ) || [];
  assert.equal(primaryPlate.length, 1, 'exactly one rule may use the primary plate');
  assert.doesNotMatch(
    primaryPlate[0],
    /\.actionDiamond/,
    'the Diamond action must not share the primary plate'
  );

  // View Details is navigation, so it carries no painted commerce plate.
  const secondaryBlock = rule('actionSecondary')[0] || '';
  assert.match(secondaryBlock, /background-image:\s*none/);

  // The favorite control sits beside the product name, not over the photo.
  assert.doesNotMatch(
    CSS.match(/\.wishlistControl\s*\{[\s\S]*?\n\}/)?.[0] || '',
    /position:\s*absolute/
  );
  assert.match(MERCH, /className=\{merchStyles\.titleRow\}/);
  assert.match(
    MERCH,
    /titleRow[\s\S]{0,600}merchStyles\.wishlistControl/,
    'the wishlist control must render inside the title row'
  );
});

test('merch typography and controls meet the console accessibility floor', () => {
  assert.match(CSS, /font-family: var\(--font-roboto-condensed\), 'Roboto Condensed'/);
  assert.match(CSS, /font-family: var\(--font-inter\), Inter/);
  assert.doesNotMatch(CSS, /IBM Plex Mono|ui-monospace|\bmonospace\b/);
  assert.match(CSS, /min-height: 44px/);
  assert.match(CSS, /:focus-visible/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(MERCH, /[\u2013\u2014]/u);
});
