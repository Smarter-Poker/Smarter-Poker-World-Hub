import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const MERCH_DETAIL = read('pages/hub/merch-store/[productId].js');
const MERCH = read('src/components/store/MerchStore.jsx');
const ORDERS = read('pages/hub/diamond-store/orders.js');
const WISHLIST = read('pages/hub/diamond-store/wishlist.js');

test('merchandise detail pages own an in-place live purchase console', () => {
  assert.match(MERCH_DETAIL, /useAuthUser/);
  assert.match(MERCH_DETAIL, /<MerchStore/);
  assert.match(MERCH_DETAIL, /focusProductId=\{product\.id\}/);
  assert.match(MERCH_DETAIL, /detailMode/);
  assert.match(MERCH_DETAIL, /href="#purchase-console"/);
  assert.doesNotMatch(MERCH_DETAIL, /href=\{`\/hub\/merch-store#merch-product-/);
  assert.match(MERCH, /focusProductId = null/);
  assert.match(MERCH, /detailMode = false/);
  assert.match(MERCH, /id=\{detailMode \? 'purchase-console' : undefined\}/);
});

test('order history provides searchable filterable ledger intelligence', () => {
  for (const label of ['Search Orders', 'Order Type', 'Order Status']) {
    assert.match(ORDERS, new RegExp(`aria-label=["']${label}["']`));
  }
  assert.match(ORDERS, /visibleOrders/);
  assert.match(ORDERS, /Showing \{visibleOrders\.length\} Of \{orders\.length\} Loaded Orders/);
  assert.match(ORDERS, /Load 50 More Orders/);
  assert.match(ORDERS, /setRecordLimit\(\(current\) => current \+ 50\)/);
  assert.match(ORDERS, /Clear Filters/);
  assert.match(ORDERS, /Marketplace Ledger Summary/);
});

test('every order can open a private same-surface receipt route', () => {
  const file = 'pages/hub/diamond-store/orders/[orderId].js';
  assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
  const receipt = read(file);
  assert.match(ORDERS, /View Receipt/);
  assert.match(ORDERS, /\/hub\/diamond-store\/orders\/\$\{order\.id\}/);
  assert.match(receipt, /useRequireAuth/);
  assert.match(receipt, /ORDER_SOURCES/);
  assert.match(receipt, /\.eq\('user_id', user\.id\)/);
  assert.doesNotMatch(receipt, /select\(['"]\*['"]\)/);
  assert.doesNotMatch(receipt, /shipping_address|target=["']_blank|window\.open/);
  assert.match(receipt, /MarketplaceDetailExperience/);
  assert.match(
    read('scripts/verify-marketplace-deployment.mjs'),
    /diamond-store\/orders\/phase-11-proof/
  );
});

test('wishlist uses direct product details instead of catalog hash routing', () => {
  assert.match(WISHLIST, /`\/hub\/merch-store\/\$\{encodeURIComponent\(item\.product_id\)\}`/);
  assert.doesNotMatch(WISHLIST, /`\/hub\/merch-store#\$\{productAnchorId/);
});

test('marketplace account surfaces stay green-free and keyboard sized', () => {
  const accountSource = [ORDERS, WISHLIST, read('pages/hub/diamond-store/cart.js')].join('\n');
  assert.doesNotMatch(accountSource, /34,\s*197,\s*94|#22c55e|#10b981|\bgreen\b/i);
  assert.match(ORDERS, /minHeight:\s*44/);
  assert.match(WISHLIST, /minHeight:\s*44/);
});
