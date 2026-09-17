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

test('merch typography and controls meet the console accessibility floor', () => {
  assert.match(CSS, /font-family: var\(--font-roboto-condensed\), 'Roboto Condensed'/);
  assert.match(CSS, /font-family: var\(--font-inter\), Inter/);
  assert.doesNotMatch(CSS, /IBM Plex Mono|ui-monospace|\bmonospace\b/);
  assert.match(CSS, /min-height: 44px/);
  assert.match(CSS, /:focus-visible/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(MERCH, /[\u2013\u2014]/u);
});
