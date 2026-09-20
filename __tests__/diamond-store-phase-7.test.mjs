import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const CART = read('pages/hub/diamond-store/cart.js');
const ORDERS = read('pages/hub/diamond-store/orders.js');
const WISHLIST = read('pages/hub/diamond-store/wishlist.js');
const MARKETPLACE = read('pages/hub/marketplace.js');
const MERCH = read('src/components/store/MerchStore.jsx');
const SHELL = read('src/components/store/MarketplaceSubpageShell.jsx');
const SHELL_CSS = read('src/components/store/MarketplaceSubpageShell.module.css');
const CART_STORE = read('src/stores/cartStore.js');
const PREFERENCES = read('src/services/preferences-service.js');
const DIAMOND_PURCHASE = read('pages/api/store/purchase-with-diamonds.js');
const ORDER_LEDGER = read('pages/api/store/order-ledger.js');

test('legacy marketplace links redirect on the server and preserve their query string', () => {
  assert.match(MARKETPLACE, /export async function getServerSideProps/);
  assert.match(MARKETPLACE, /destination: `\/hub\/diamond-store\$\{query\}`/);
  assert.match(MARKETPLACE, /permanent: false/);
  assert.doesNotMatch(MARKETPLACE, /useRouter|router\.replace|window\./);
});

test('marketplace account pages share same-surface navigation and accessible casino hardware', () => {
  for (const href of [
    '/hub/diamond-store',
    '/hub/diamond-store/cart',
    '/hub/diamond-store/orders',
    '/hub/diamond-store/wishlist',
  ]) {
    assert.match(SHELL, new RegExp(href.replaceAll('/', '\\/')));
  }
  assert.doesNotMatch(SHELL, /target=|window\.open/);
  assert.match(SHELL, /aria-current=\{active === id \? 'page'/);
  assert.match(SHELL, /aria-label="Marketplace Account Pages"/);
  assert.doesNotMatch(
    SHELL_CSS,
    /border-radius|(?:linear|radial|conic)-gradient|box-shadow|:hover/
  );
  assert.match(SHELL_CSS, /:focus-visible/);
  assert.match(SHELL_CSS, /@media \(prefers-reduced-motion: reduce\)/);
});

test('cart merchandise checkout supports card and diamonds with shipping and stable request IDs', () => {
  assert.match(CART, /Pay With Diamonds/);
  assert.match(CART, /<MerchPurchaseDialog/);
  assert.match(CART, /requiresShipping: true/);
  assert.match(CART, /balance=\{diamondBalance\}/);
  assert.match(CART, /onCancel=/);
  assert.match(CART, /X-Checkout-Request-ID/);
  assert.match(CART, /X-Idempotency-Key/);
  assert.doesNotMatch(CART, /PRINT_ON_DEMAND_ITEM_IDS|hasPrintOnDemandMerch/);
});

test('diamond checkout accepts a validated client idempotency key', () => {
  assert.match(DIAMOND_PURCHASE, /x-idempotency-key/);
  assert.match(DIAMOND_PURCHASE, /KEY_PATTERN = \/\^\[A-Za-z0-9\._:-\]\{12,180\}\$\//);
  assert.match(DIAMOND_PURCHASE, /buildPurchaseReference/);
  assert.match(DIAMOND_PURCHASE, /buildRequestHash/);
  assert.match(DIAMOND_PURCHASE, /createHash\('sha256'\)/);
  assert.match(DIAMOND_PURCHASE, /purchase_merch_with_diamonds_atomic/);
  assert.match(
    MERCH,
    /purchaseRequestId\s*=\s*purchaseWasResumed[\s\S]{0,120}?recovery\.requestId[\s\S]{0,120}?getOrCreateCommerceRequestId\(commerceIntent\)/
  );
  assert.match(MERCH, /const durableRequestId = getOrCreateCommerceRequestId/);
  assert.match(
    MERCH,
    /clearCommerceRequestId\(\{[\s\S]{0,160}\.\.\.pendingDiamondPurchase\.commerceIntent,[\s\S]{0,100}expectedRequestId: durableRequestId/
  );
  assert.match(MERCH, /'X-Idempotency-Key': durableRequestId/);
  assert.match(MERCH, /replaceCommerceRequestId\(/);
});

test('all cart lines obey the API quantity ceiling', () => {
  assert.match(CART_STORE, /MAX_STORE_QUANTITY_PER_LINE = 10/);
  assert.match(CART_STORE, /Math\.min\(safe, MAX_STORE_QUANTITY_PER_LINE\)/);
  assert.doesNotMatch(CART_STORE, /item\?\.type === 'diamonds'/);
});

test('order history is allowlisted and includes VIP subscription activity', () => {
  assert.match(ORDERS, /authedFetch\(`\/api\/store\/order-ledger\?limit=/);
  assert.doesNotMatch(
    ORDERS,
    /\.from\(['"](?:diamond_purchases|merchandise_orders|vip_subscriptions)['"]\)/
  );
  assert.match(ORDER_LEDGER, /table: 'vip_subscriptions'/);
  assert.match(ORDER_LEDGER, /table: 'diamond_purchases'/);
  assert.match(ORDER_LEDGER, /table: 'merchandise_orders'/);
  assert.doesNotMatch(ORDER_LEDGER, /select\(['"]\*['"]\)/);
  assert.doesNotMatch(ORDER_LEDGER, /shipping_address/);
  for (const status of ['paid', 'shipped', 'delivered', 'active', 'trialing', 'past_due']) {
    assert.match(ORDERS, new RegExp(`${status}:`));
  }
});

test('wishlist failures remain visible and live merchandise can be saved from its product card', () => {
  const getWishlist = PREFERENCES.slice(
    PREFERENCES.indexOf('async getWishlist'),
    PREFERENCES.indexOf('async addToWishlist')
  );
  assert.match(getWishlist, /throw error/);
  assert.doesNotMatch(getWishlist, /return \[\]/);
  assert.match(WISHLIST, /loadError/);
  assert.match(WISHLIST, /Retry Wishlist/);
  assert.match(WISHLIST, /\/api\/store\/merch-catalog/);
  assert.match(MERCH, /aria-pressed=\{isWishlisted\}/);
  assert.match(MERCH, /wishlistService\.addToWishlist/);
  assert.match(MERCH, /wishlistService\.removeFromWishlist/);
  assert.match(MERCH, /onToggleWishlist=\{toggleWishlist\}/);
});
