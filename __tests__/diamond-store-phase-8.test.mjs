import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const ORDERS = read('pages/hub/diamond-store/orders.js');
const WISHLIST = read('pages/hub/diamond-store/wishlist.js');
const PREFERENCES = read('src/services/preferences-service.js');
const MERCH = read('src/components/store/MerchStore.jsx');
const CART = read('pages/hub/diamond-store/cart.js');
const PURCHASE = read('pages/api/store/purchase-with-diamonds.js');

test('merchandise order history exposes safe same-surface shipment tracking', () => {
  assert.match(ORDERS, /tracking_number, tracking_url, carrier/);
  assert.match(ORDERS, /function safeTrackingUrl/);
  assert.match(ORDERS, /url\.protocol === 'https:'/);
  assert.match(ORDERS, /href=\{order\.trackingUrl\}/);
  assert.doesNotMatch(ORDERS, /target=["']_blank|window\.open/);
  assert.match(ORDERS, /Fulfillment telemetry/);
  assert.match(ORDERS, /Order placed/);
  assert.match(ORDERS, /In production/);
  assert.match(ORDERS, /Track package/);
});

test('realtime order refreshes are latest-request-wins', () => {
  assert.match(ORDERS, /const loadRequestRef = useRef\(0\)/);
  assert.match(ORDERS, /const requestId = \+\+loadRequestRef\.current/);
  assert.match(ORDERS, /requestId !== loadRequestRef\.current/);
});

test('diamond merchandise retries replay the original recorded order', () => {
  assert.match(PURCHASE, /findCompletedDiamondMerchOrder/);
  assert.match(PURCHASE, /purchase_reference: purchaseRef/);
  assert.match(PURCHASE, /replayPurchaseResponse/);
  assert.match(PURCHASE, /idempotent: true/);
  assert.match(PURCHASE, /deductResult\.duplicate/);
  assert.match(PURCHASE, /PURCHASE_ALREADY_PROCESSING/);
  assert.match(PURCHASE, /order_id: order\.id/);
});

test('wishlist saves are conflict-safe and refreshes cannot commit stale results', () => {
  const addWishlist = PREFERENCES.slice(
    PREFERENCES.indexOf('async addToWishlist'),
    PREFERENCES.indexOf('async removeFromWishlist')
  );
  assert.match(addWishlist, /\.upsert\(/);
  assert.match(addWishlist, /onConflict: 'user_id,product_id'/);
  assert.match(addWishlist, /ignoreDuplicates: true/);
  assert.match(WISHLIST, /const loadRequestRef = useRef\(0\)/);
  assert.match(WISHLIST, /requestId !== loadRequestRef\.current/);
});

test('wishlist merchandise links deep-link to a stable in-page product target', () => {
  assert.match(WISHLIST, /item\.product_type === 'diamond'/);
  assert.match(WISHLIST, /\/hub\/merch-store#\$\{productAnchorId\(item\.product_id\)\}/);
  assert.match(MERCH, /id=\{productAnchorId\(product\.catalogId \|\| product\.key\)\}/);
  assert.match(MERCH, /article\[id\^='merch-product-'\]:target/);
  assert.match(MERCH, /scrollMarginTop: 96/);
  assert.doesNotMatch(WISHLIST, /target=["']_blank|window\.open/);
});

test('cart checkout errors preserve server guidance and accurately describe grouped packages', () => {
  assert.match(CART, /const checkoutErrorMessage/);
  assert.match(CART, /typeof data\?\.error === 'string'/);
  assert.match(CART, /All diamond packages check out together/);
  assert.doesNotMatch(CART, /Diamond packages check out one at a time/);
  assert.match(CART, /if \(!replayed\) busEmit\.diamondsSpent/);
  assert.match(MERCH, /No Additional Diamonds Were Deducted/);
});
