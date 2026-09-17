import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const STORE_PAGE = read('pages/hub/diamond-store.js');
const STORE_CSS = read('src/components/diamond-store/DiamondStoreShell.module.css');
const LEGACY_STYLES = read('src/components/diamond-store/diamondStoreStyles.js');
const SUBPAGE_SHELL = read('src/components/store/MarketplaceSubpageShell.jsx');
const SUBPAGE_CSS = read('src/components/store/MarketplaceSubpageShell.module.css');
const TOAST = read('src/components/store/StoreToast.jsx');
const WALLET = read('src/components/store/DiamondWalletModal.jsx');
const MERCH = read('src/components/store/MerchStore.jsx');
const MERCH_ART = read('src/lib/store/merchProductArt.js');
const CART = read('pages/hub/diamond-store/cart.js');

test('lower marketplace suites preserve their own layouts without duplicate display windows', () => {
  for (const asset of ['public/images/merch/neural-steel/legacy-tabletop-atlas.webp']) {
    assert.ok(statSync(join(ROOT, asset)).size > 100_000, `${asset} must be production artwork`);
  }

  assert.doesNotMatch(STORE_PAGE, /LOWER_SECTION_META|sectionThreshold|thresholdImage/);
  assert.doesNotMatch(
    STORE_CSS,
    /marketplace-lower-suites-atlas\.webp|sectionThreshold|thresholdReadout/
  );
  const rewardRowRule = STORE_CSS.match(/\.rewardRow\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.doesNotMatch(rewardRowRule, /wallet-row-shell|clamp\(78px|padding[^;]*72px/);
  assert.match(rewardRowRule, /shark-panel\/bay\.png/);
  assert.doesNotMatch(rewardRowRule, /(?:linear|radial|conic)-gradient|border-left/);
  assert.match(STORE_CSS, /\.casinoDataCard/);
  assert.match(STORE_CSS, /\.casinoProductCard/);
  assert.match(STORE_CSS, /\.rewardsSurface \[role='tab'\]\[aria-selected='true'\]/);
});

test('every legacy merchandise row has physical product media instead of an icon-only bay', () => {
  assert.match(MERCH_ART, /export const LEGACY_MERCH_ATLAS/);
  for (const id of [
    'card-protector-gold',
    'card-protector-black',
    'deck-premium',
    'chip-set-100',
    'chip-set-500',
  ]) {
    assert.match(MERCH_ART, new RegExp(`['"]${id}['"]`));
  }
  assert.match(MERCH_ART, /legacy-tabletop-atlas\.webp/);
  assert.match(MERCH, /resolveReviewedMerchArt\(rawId\)/);
  assert.match(MERCH, /merchStyles\.atlasProductImage/);
  assert.ok(
    MERCH.indexOf('product.atlasPosition && !imageFailed') <
      MERCH.indexOf('product.image && !imageFailed'),
    'reviewed atlas products must crop before the direct-image branch'
  );
  assert.match(
    MERCH,
    /role="img"[\s\S]{0,180}?className=\{`\$\{merchStyles\.productImage\} \$\{merchStyles\.atlasProductImage\}`\}/
  );
  assert.match(MERCH, /<img[\s\S]{0,260}?className=\{merchStyles\.productImage\}/);
  assert.match(MERCH, /backgroundSize: '400% 100%'/);
  assert.match(
    read('src/components/store/MerchStore.module.css'),
    /\.atlasProductImage\s*\{[^}]*aspect-ratio:\s*1 \/ 2/s
  );
  assert.match(MERCH, /loading=\{mediaPriority \? ['"]eager['"] : ['"]lazy['"]\}/);
});

test('cart, orders, and wishlist keep same-surface navigation without a shared display window', () => {
  assert.doesNotMatch(SUBPAGE_SHELL, /const BAY_META/);
  assert.match(SUBPAGE_SHELL, /data-active=\{active\}/);
  assert.doesNotMatch(SUBPAGE_SHELL, /operationsVisual|visualReadout|bayCode/);
  assert.doesNotMatch(
    SUBPAGE_CSS,
    /commerce-operations-atlas|operationsVisual|visualReadout|bayCode/
  );
  assert.match(SUBPAGE_CSS, /marketplace-console-v1\/shark-panel\/button-secondary\.png/);
  assert.doesNotMatch(SUBPAGE_CSS, /marketplace-console-v1\/navigation\/nav-shell\.png/);
  assert.doesNotMatch(SUBPAGE_SHELL, /marketplace-console-v1\/selectors\//);
  assert.doesNotMatch(SUBPAGE_SHELL, /<img src=\{bay\.image\}/);
  assert.doesNotMatch(SUBPAGE_SHELL, /target=|window\.open/);
});

test('marketplace visual language contains no legacy green or purple accent tokens', () => {
  const scopedSource = [
    STORE_PAGE,
    STORE_CSS,
    LEGACY_STYLES,
    SUBPAGE_SHELL,
    SUBPAGE_CSS,
    TOAST,
    WALLET,
    MERCH,
    CART,
  ]
    .join('\n')
    .toLowerCase();
  for (const token of [
    '#00ff88',
    '#00cc66',
    '#4ade80',
    '#22c55e',
    '#10b981',
    '#34d399',
    '#35d48a',
    '#4caf50',
    '#8a2be2',
    '#a855f7',
    '#8b5cf6',
    '#9c27b0',
    '#ec4899',
    'rgba(16, 185, 129',
    'rgba(53, 212, 138',
    'rgba(74, 222, 128',
    'rgba(76, 175, 80',
    'rgba(138, 43, 226',
    'rgba(156, 39, 176',
    'rgba(168, 85, 247',
  ]) {
    assert.doesNotMatch(scopedSource, new RegExp(token.replace(/[()]/g, '\\$&')));
  }
  assert.match(WALLET, /const MARKETPLACE_ANALYTICS_COLORS/);
  assert.doesNotMatch(WALLET, /hsl\(\$\{/);
});

test('dual payment language remains visible after the realism pass', () => {
  assert.match(STORE_PAGE, /Pay With Diamonds Instead/);
  assert.match(STORE_PAGE, /All Major Credit And Debit Cards/);
  assert.match(STORE_PAGE, /handleClubCardCheckout/);
  assert.match(STORE_PAGE, /'Buy With Diamonds'/);
  assert.match(STORE_PAGE, /`Card \$\$\{cardCharge\.toFixed\(2\)\}`/);
  assert.doesNotMatch(STORE_PAGE, /<CreditCard\b|<Gem\b/);
});
