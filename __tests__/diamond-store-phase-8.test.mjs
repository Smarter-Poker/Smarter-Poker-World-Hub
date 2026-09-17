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
const ORDER_LEDGER = read('pages/api/store/order-ledger.js');

test('merchandise order history exposes safe same-surface shipment tracking', () => {
  assert.match(ORDER_LEDGER, /tracking_number, tracking_url, carrier/);
  assert.match(ORDER_LEDGER, /function safeTrackingUrl/);
  assert.match(ORDER_LEDGER, /url\.protocol === 'https:'/);
  assert.match(ORDERS, /href=\{order\.trackingUrl\}/);
  assert.doesNotMatch(ORDERS, /target=["']_blank|window\.open/);
  assert.match(ORDERS, /Fulfillment Telemetry/);
  assert.match(ORDERS, /Order Placed/);
  assert.match(ORDERS, /In Production/);
  assert.match(ORDERS, /Track Package/);
});

test('realtime order refreshes are latest-request-wins', () => {
  assert.match(ORDERS, /const loadRequestRef = useRef\(0\)/);
  assert.match(ORDERS, /const requestId = \+\+loadRequestRef\.current/);
  assert.match(ORDERS, /loadRequestRef\.current === requestId/);
});

test('diamond merchandise retries replay the original recorded order', () => {
  assert.match(PURCHASE, /purchase_merch_with_diamonds_atomic/);
  assert.match(PURCHASE, /p_purchase_reference: purchaseReference/);
  assert.match(PURCHASE, /p_request_hash: requestHash/);
  assert.match(PURCHASE, /idempotent: true/);
  assert.match(PURCHASE, /result\.duplicate/);
  assert.match(PURCHASE, /reference_conflict/);
  assert.match(PURCHASE, /const result = normalizeSuccessfulPurchaseResult\(/);
  assert.match(PURCHASE, /order_id: result\.order_id/);
  assert.match(
    PURCHASE,
    /accountId: user\.id,[\s\S]*?requestId: clientKey,[\s\S]*?data: responseData\(result\)/
  );
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
  assert.match(WISHLIST, /loadRequestRef\.current === requestId/);
});

test('orders and wishlist bind private state and async effects to the current account', () => {
  for (const source of [ORDERS, WISHLIST]) {
    assert.match(source, /useAvatar/);
    assert.match(source, /const synchronousAccountId = getAuthUser\(\)\?\.id \|\| null/);
    assert.match(source, /const committedAccountId =/);
    assert.match(source, /contextUser\?\.id === synchronousAccountId/);
    assert.match(source, /const activeAccountIdRef = useRef/);
    assert.match(source, /useIsomorphicLayoutEffect\(\(\) => \{/);
    assert.match(source, /getAuthUser\(\)\?\.id === expectedAccountId/);
    assert.match(source, /\.current\?\.abort\(\)/);
  }

  assert.match(ORDERS, /ordersOwnerId === committedAccountId/);
  assert.match(ORDERS, /loadRequestRef\.current === requestId/);
  assert.match(ORDERS, /loadAbortRef\.current === controller/);
  assert.match(ORDERS, /const projectedLoadError =/);
  assert.match(ORDERS, /\) : projectedLoadError \? \(/);

  assert.match(WISHLIST, /wishlistOwnerId === committedAccountId/);
  assert.match(WISHLIST, /removeRequestRef\.current === requestId/);
  assert.match(WISHLIST, /removeAbortRef\.current === controller/);
  assert.match(WISHLIST, /if \(!attemptIsCurrent\(\)\) return/);
  assert.match(WISHLIST, /projectedRemoveError &&[\s\S]{0,180}role="alert"/);
  assert.match(WISHLIST, /wishlistService\.removeFromWishlist\(expectedAccountId, productId\)/);
});

test('wishlist merchandise links open the dedicated product page in the same surface', () => {
  assert.match(WISHLIST, /item\.product_type === 'diamond'/);
  assert.match(WISHLIST, /\/hub\/merch-store\/\$\{encodeURIComponent\(item\.product_id\)\}/);
  assert.match(MERCH, /const reactCardId = useId\(\)/);
  assert.match(
    MERCH,
    /const productDomToken\s*=[\s\S]{0,80}?String\(product\.catalogId \|\| product\.key \|\| reactCardId\)[\s\S]{0,180}?\.trim\(\)[\s\S]{0,100}?\.toLowerCase\(\)[\s\S]{0,140}?\.replace\(\/\[\^a-z0-9_\-\]\+\/g, '-'\)/
  );
  assert.match(MERCH, /const cardDomId = `merch-product-\$\{productDomToken\}`/);
  assert.match(MERCH, /id=\{cardDomId\}/);
  assert.match(MERCH, /aria-labelledby=\{titleId\}/);
  assert.match(MERCH, /article\[data-merch-product-card='true'\]:target/);
  assert.match(MERCH, /encodeURIComponent\(product\.catalogId \|\| product\.key\)/);
  assert.match(MERCH, /scrollMarginTop: 96/);
  assert.doesNotMatch(WISHLIST, /target=["']_blank|window\.open/);
});

test('cart checkout errors preserve server guidance and accurately describe grouped packages', () => {
  assert.match(CART, /const checkoutErrorMessage/);
  assert.match(CART, /typeof data\?\.error === 'string'/);
  assert.match(CART, /All Diamond Packages Check Out Together/);
  assert.doesNotMatch(CART, /Diamond packages check out one at a time/);
  assert.match(CART, /if \(!replayed\) busEmit\.diamondsSpent/);
  assert.match(MERCH, /No Additional Diamonds Were Deducted/);
});
