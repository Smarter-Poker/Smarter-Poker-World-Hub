import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  BANNED_TEXT_COLOUR,
  ROUNDED_CORNER,
  SD_FRAME,
  SMARTERDESIGN_GRADIENTS,
  offStandardPaint,
} from './smarterdesign-standard.test.mjs';

const literal = (value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const cobalt = literal(SMARTERDESIGN_GRADIENTS.cobalt);
const control = literal(SMARTERDESIGN_GRADIENTS.control);

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const MERCH = read('src/components/store/MerchStore.jsx');
const CSS = read('src/components/store/MerchStore.module.css');
const ART = read('src/lib/store/merchProductArt.js');
const DETAIL = read('pages/hub/merch-store/[productId].js');
const FULFILLMENT = read('pages/hub/merch-store/fulfillment.js');
const FULFILLMENT_CSS = read('pages/hub/merch-store/fulfillment.module.css');
const DIALOG_CSS = read('src/components/store/MerchPurchaseDialog.module.css');

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

test('merch replaces floating generic icons with restrained retail controls', () => {
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
  assert.doesNotMatch(
    `${CSS}\n${DIALOG_CSS}\n${FULFILLMENT_CSS}`,
    /marketplace-console-v1|spade-console|wallet-row-shell|button-(?:primary|secondary)/
  );
  // #SMARTERDESIGN: square chrome controls on the four standard fills only.
  assert.match(CSS, SD_FRAME.control);
  assert.deepEqual(offStandardPaint(CSS), []);
  assert.doesNotMatch(CSS, /:hover/);
  assert.doesNotMatch(CSS, ROUNDED_CORNER);
  assert.doesNotMatch(CSS, BANNED_TEXT_COLOUR);
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

  const primaryBlock = rule('actionPrimary')[0] || '';
  const diamondBlock = rule('actionDiamond')[0] || '';
  const goldBlock = rule('actionGold')[0] || '';
  const secondaryBlock = rule('actionSecondary')[0] || '';
  // #SMARTERDESIGN hierarchy: only the primary is the cobalt chrome-active
  // control; Diamond, Add To Cart and View Details share the steel control and
  // step down by size and ink (ice, white, silver).
  assert.match(primaryBlock, SD_FRAME.active);
  assert.match(primaryBlock, cobalt);
  for (const block of [diamondBlock, goldBlock, secondaryBlock]) {
    assert.match(block, control);
    assert.doesNotMatch(block, /chrome-active|#1981ec/);
  }
  assert.match(diamondBlock, /color:\s*#86daff/);
  assert.match(goldBlock, /color:\s*#f2f7ff/);
  assert.match(secondaryBlock, /color:\s*#bdd0e2/);
  assert.doesNotMatch(`${CSS}\n${DIALOG_CSS}\n${FULFILLMENT_CSS}`, /button-primary\.png/);

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
  assert.match(DIALOG_CSS, /min-height: 44px/);
  assert.match(FULFILLMENT_CSS, /min-height: 44px/);
  assert.match(CSS, /:focus-visible/);
  assert.match(DIALOG_CSS, /:focus-visible/);
  assert.match(FULFILLMENT_CSS, /:focus-visible/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(`${MERCH}\n${DETAIL}\n${FULFILLMENT}`, /[\u2013\u2014]/u);
  assert.doesNotMatch(`${CSS}\n${DIALOG_CSS}\n${FULFILLMENT_CSS}`, /\bgreen\b/i);
});

test('merch detail keeps one same-page purchase area and fulfillment stays readable', () => {
  assert.match(DETAIL, /Choose Purchase Options/);
  assert.match(DETAIL, /href="#purchase-console"/);
  assert.doesNotMatch(DETAIL, /Open Purchase Console|Live Purchase Console/);
  assert.match(MERCH, /id=\{detailMode \? 'purchase-console' : undefined\}/);
  assert.match(MERCH, /aria-label=\{detailMode \? 'Purchase Options' : undefined\}/);
  // The operator console opens on the shared #SMARTERDESIGN image header.
  assert.match(
    FULFILLMENT,
    /<StoreImageHeader\s+art="store-orders"\s+title="Merch Fulfillment"\s+parent="Smarter\.Poker Marketplace"\s+heading="h1"/
  );
  assert.doesNotMatch(FULFILLMENT, /Fulfillment Command Vault/);
  assert.doesNotMatch(
    `${MERCH}\n${DETAIL}\n${FULFILLMENT}`,
    /target=["']_blank|window\.open/
  );
});
