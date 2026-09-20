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
const ACCOUNT_CONTROLS = read('pages/hub/diamond-store/marketplace-account-controls.module.css');

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
  assert.match(ORDERS, /loadOrders\(\{ append: true, cursor: nextCursor \}\)/);
  assert.match(ORDERS, /Clear Filters/);
  assert.match(ORDERS, /Marketplace Ledger Summary/);
});

test('every order can open a private same-surface receipt route', () => {
  const file = 'pages/hub/diamond-store/orders/[orderId].js';
  assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
  const receipt = read(file);
  assert.match(ORDERS, /View Receipt/);
  assert.match(ORDERS, /\/hub\/diamond-store\/orders\/\$\{encodeURIComponent\(order\.id\)\}/);
  assert.match(ORDERS, /source=\$\{encodeURIComponent\(order\.source\)\}/);
  assert.match(receipt, /useRequireAuth/);
  assert.match(receipt, /ORDER_SOURCES/);
  assert.match(receipt, /authedFetch/);
  assert.match(receipt, /\/api\/store\/order-ledger\?source=/);
  assert.doesNotMatch(
    receipt,
    /\.from\(['"](?:diamond_purchases|merchandise_orders|vip_subscriptions)['"]\)/
  );
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

test('merch product detail links encode exact catalog identifiers and card ARIA ids cannot collide', () => {
  assert.match(MERCH, /useId/);
  assert.match(MERCH, /const reactCardId = useId\(\)/);
  assert.match(
    MERCH,
    /const productDomToken\s*=[\s\S]{0,80}?String\(product\.catalogId \|\| product\.key \|\| reactCardId\)[\s\S]{0,180}?\.trim\(\)[\s\S]{0,100}?\.toLowerCase\(\)[\s\S]{0,140}?\.replace\(\/\[\^a-z0-9_\-\]\+\/g, '-'\)/
  );
  assert.match(MERCH, /const cardDomId = `merch-product-\$\{productDomToken\}`/);
  assert.match(MERCH, /const titleId = `\$\{cardDomId\}-title`/);
  assert.match(
    MERCH,
    /href=\{`\/hub\/merch-store\/\$\{encodeURIComponent\(product\.catalogId \|\| product\.key\)\}`\}/
  );
  assert.doesNotMatch(MERCH, /const productAnchorId/);
});

test('marketplace account surfaces stay green-free and keyboard sized', () => {
  const accountSource = [
    ORDERS,
    WISHLIST,
    read('pages/hub/diamond-store/cart.js'),
    ACCOUNT_CONTROLS,
  ].join('\n');
  assert.doesNotMatch(accountSource, /34,\s*197,\s*94|#22c55e|#10b981|\bgreen\b/i);
  assert.match(ORDERS, /accountControls\.action/);
  assert.match(WISHLIST, /accountControls\.action/);
  assert.match(ACCOUNT_CONTROLS, /\.action\s*\{[\s\S]*?min-height:\s*46px;/);
});
