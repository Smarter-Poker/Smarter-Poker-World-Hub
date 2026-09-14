import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const MERCH = read('src/components/store/MerchStore.jsx');
const CSS = read('src/components/store/MerchStore.module.css');

test('merch keeps its existing catalog layout, photography, and purchase wiring', () => {
  for (const productImage of [
    '/images/merch/neural-steel/mockups/diamond-altitude-hoodie.webp',
    '/images/merch/neural-steel/mockups/royal-circuit-tee.webp',
    '/images/merch/neural-steel/mockups/diamond-dad-hat.webp',
  ]) {
    assert.match(MERCH, new RegExp(productImage.replaceAll('/', '\\/').replace('.', '\\.')));
  }
  assert.match(MERCH, /className=\{`merch-discovery-controls \$\{merchStyles\.discoveryControls\}`\}/);
  assert.match(MERCH, /onToggleWishlist\(product\)/);
  assert.match(MERCH, /onAddToCart\(product, variant, clampedQty\)/);
  assert.match(MERCH, /onBuyCard\(product, variant, clampedQty\)/);
  assert.match(MERCH, /onBuyDiamonds\(product, variant, clampedQty\)/);
  assert.match(MERCH, /href=\{`\/hub\/merch-store\/\$\{product\.catalogId \|\| product\.key\}`\}/);
  assert.doesNotMatch(MERCH, /target=["']_blank|window\.open|MarketplaceConsoleSelector/);
});

test('merch replaces floating generic icons with integrated console controls', () => {
  assert.doesNotMatch(MERCH, /lucide-react|<Heart|<ShoppingCart|<CreditCard|<Gem|<Search/);
  assert.match(MERCH, /isWishlisted \? 'Saved' : 'Save'/);
  assert.match(MERCH, /className=\{`\$\{merchStyles\.actionControl\} \$\{merchStyles\.actionPrimary\}`\}/);
  assert.match(MERCH, /className=\{`\$\{merchStyles\.actionControl\} \$\{merchStyles\.actionDiamond\}`\}/);
  assert.match(CSS, /marketplace-console-v1\/shark-panel\/button-primary\.png/);
  assert.match(CSS, /marketplace-console-v1\/shark-panel\/button-secondary\.png/);
  assert.match(CSS, /marketplace-console-v1\/navigation\/nav-shell\.png/);
  assert.match(CSS, /marketplace-console-v1\/shark-panel\/bay\.png/);
  assert.doesNotMatch(CSS, /:hover|(?:linear|radial|conic)-gradient|border-radius|box-shadow/);
});

test('merch typography and controls meet the console accessibility floor', () => {
  assert.match(CSS, /font-family: var\(--font-roboto-condensed\), 'Roboto Condensed'/);
  assert.match(CSS, /font-family: var\(--font-inter\), Inter/);
  assert.match(CSS, /font-family: var\(--font-ibm-plex-mono\), 'IBM Plex Mono'/);
  assert.match(CSS, /min-height: 44px/);
  assert.match(CSS, /:focus-visible/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(MERCH, /[—–]/);
});
