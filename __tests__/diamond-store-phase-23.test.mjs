import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const reconciliationSource = await read('src/lib/store/checkoutReconciliation.js');
const reconciliation = await import(
  `data:text/javascript;base64,${Buffer.from(reconciliationSource).toString('base64')}`
);

test('verified checkout reconciliation removes only paid quantities', () => {
  const cart = [
    { id: 'diamond-small', packageId: 'small', type: 'diamonds', quantity: 3 },
    {
      id: 'shirt::large',
      catalogId: 'shirt',
      variantId: 'large',
      type: 'Merchandise: Large',
      quantity: 4,
    },
    { id: 'vip-monthly', type: 'vip', quantity: 1 },
  ];
  const result = reconciliation.reconcilePurchasedCart(cart, [
    { kind: 'diamonds', id: 'small', quantity: 2 },
    { kind: 'merchandise', id: 'shirt', variantId: 'large', quantity: 4 },
  ]);

  assert.deepEqual(result, [
    { id: 'diamond-small', packageId: 'small', type: 'diamonds', quantity: 1 },
    { id: 'vip-monthly', type: 'vip', quantity: 1 },
  ]);
  assert.equal(cart[0].quantity, 3);
});

test('unmatched, malformed, and variant-distinct cart lines remain untouched', () => {
  const cart = [
    {
      id: 'shirt::medium',
      catalogId: 'shirt',
      variantId: 'medium',
      type: 'Merchandise: Medium',
      quantity: 2,
    },
  ];
  assert.equal(
    reconciliation.reconcilePurchasedCart(cart, [
      { kind: 'merchandise', id: 'shirt', variantId: 'large', quantity: 2 },
      { kind: 'merchandise', id: 'shirt', variantId: 'medium', quantity: null },
      { kind: 'merchandise', id: 'shirt', variantId: 'medium', quantity: 11 },
      { kind: 'merchandise', id: '', quantity: 10 },
      { kind: 'unknown', id: 'shirt', variantId: 'medium', quantity: 2 },
    ]),
    cart
  );
});

test('verified receipts build private same-surface destinations only', () => {
  assert.equal(
    reconciliation.checkoutReceiptHref({ orderSource: 'merchandise', orderId: 'order_123' }),
    '/hub/diamond-store/orders/order_123?source=merchandise'
  );
  assert.equal(
    reconciliation.checkoutReceiptHref({ orderSource: 'club', orderId: 'order_123' }),
    null
  );
  assert.equal(
    reconciliation.checkoutReceiptHref({ orderSource: '__proto__', orderId: 'x' }),
    null
  );
});

test('checkout status requires owner and session matched backing records', async () => {
  const status = await read('pages/api/store/checkout-status.js');
  assert.match(status, /lookupRecord\(session, userId\)/);
  assert.match(status, /\.eq\('user_id', userId\)/);
  assert.match(status, /\.eq\('stripe_checkout_session_id', session\.id\)/);
  assert.match(status, /\.eq\('stripe_subscription_id', subscriptionId\)/);
  assert.match(status, /orderSource: 'diamonds'/);
  assert.match(status, /orderSource: 'merchandise'/);
  assert.match(status, /orderSource: 'vip'/);
  assert.match(status, /Cache-Control', 'private, no-store, max-age=0'/);
  assert.match(status, /Vary', 'Authorization'/);
});

test('server-resolved checkout lines are persisted for exact cart recovery', async () => {
  const checkout = await read('pages/api/store/create-checkout-session.js');
  assert.match(checkout, /const cartSnapshot = resolvedPackages\.map/);
  assert.match(checkout, /kind: 'diamonds'/);
  assert.match(checkout, /const cartSnapshot = resolvedItems\.map/);
  assert.match(checkout, /kind: 'merchandise'/);
  assert.ok((checkout.match(/cart_snapshot: cartSnapshot/g) || []).length >= 5);
});

test('paid cart snapshots stay locally authoritative until server mirroring succeeds', async () => {
  const [store, cartPage, storefront] = await Promise.all([
    read('src/stores/cartStore.js'),
    read('pages/hub/diamond-store/cart.js'),
    read('pages/hub/diamond-store.js'),
  ]);
  assert.match(store, /syncPending: true/);
  assert.match(store, /replaceFromServer/);
  assert.match(store, /markSynced/);
  assert.match(store, /version: 3/);
  assert.match(cartPage, /useCartStore\.getState\(\)\.syncPending/);
  assert.match(cartPage, /markCartSynced\(\)/);
  assert.match(cartPage, /cartWriteChainRef/);
  assert.match(storefront, /reconcilePurchasedCart/);
  assert.match(storefront, /reconciledCheckoutSessionsRef/);
});

test('checkout, order ledger, and receipt verification terminate and retry', async () => {
  const [storefront, panel, orders, receipt] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('src/components/diamond-store/CheckoutStatusPanel.jsx'),
    read('pages/hub/diamond-store/orders.js'),
    read('pages/hub/diamond-store/orders/[orderId].js'),
  ]);
  assert.match(storefront, /CHECKOUT_STATUS_REQUEST_TIMEOUT_MS/);
  assert.match(storefront, /Checkout Verification Timed Out/);
  assert.match(storefront, /normalizeVerifiedCheckoutStatus\(body, \{/);
  assert.match(storefront, /getAuthUser\(\)\?\.id !== expectedAccountId/);
  assert.doesNotMatch(storefront, /receipt: body\.data/);
  assert.doesNotMatch(storefront, /body\.data\?\.walletBalance/);
  assert.match(storefront, /controller\.signal\.removeEventListener\('abort', settle\)/);
  assert.match(storefront, /setCheckoutVerificationAttempt/);
  assert.match(panel, /Verify Again/);
  assert.match(panel, /View Verified Receipt/);
  assert.match(panel, /View Order History/);
  assert.match(orders, /MARKETPLACE_LEDGER_TIMEOUT_MS/);
  assert.match(orders, /Order History Timed Out/);
  assert.match(receipt, /MARKETPLACE_RECEIPT_TIMEOUT_MS/);
  assert.match(receipt, /Retry Receipt Verification/);
});

test('checkout status classifies paid before expired and never claims unpaid completion', async () => {
  const source = await read('pages/api/store/checkout-status.js');
  const start = source.indexOf('function publicStatus');
  const end = source.indexOf('\n\nfunction normalizedCartSnapshot', start);
  assert.ok(start >= 0 && end > start);
  const publicStatus = Function(`${source.slice(start, end)}; return publicStatus;`)();

  assert.equal(publicStatus({ payment_status: 'paid', status: 'expired' }, null), 'pending');
  assert.equal(
    publicStatus({ payment_status: 'paid', status: 'expired' }, 'completed'),
    'complete'
  );
  assert.equal(publicStatus({ payment_status: 'unpaid', status: 'expired' }, null), 'failed');
  assert.equal(publicStatus({ payment_status: 'unpaid', status: 'complete' }, null), 'pending');
});

test('purchase assurance controls retain the approved cyan metal palette', async () => {
  const css = await read('src/components/diamond-store/CheckoutStatusPanel.module.css');
  assert.match(css, /\.complete\s*\{\s*--seal:\s*#75eaff;\s*\}/);
  assert.doesNotMatch(css, /#72f6b3|#10b981|#22c55e|#16a34a/i);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /border-radius: 0/);
});

test('Phase 23 is part of the compact Vercel Marketplace contract', async () => {
  const [pkg, ignore] = await Promise.all([read('package.json'), read('.vercelignore')]);
  assert.match(pkg, /__tests__\/diamond-store-phase-23\.test\.mjs/);
  assert.match(ignore, /!\/__tests__\/diamond-store-phase-23\.test\.mjs/);
});
