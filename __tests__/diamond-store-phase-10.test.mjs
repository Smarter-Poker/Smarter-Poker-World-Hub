import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const STORE = read('pages/hub/diamond-store.js');
const MERCH = read('src/components/store/MerchStore.jsx');
const SHOWCASE = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const E2E = read('e2e/05-diamond-store.spec.ts');

test('marketplace navigation stays in one browser surface everywhere', () => {
  assert.doesNotMatch(SHOWCASE, /target=['"]_blank['"]/);
  assert.doesNotMatch(E2E, /toHaveAttribute\(['"]target['"],\s*['"]_blank['"]\)/);
  assert.match(E2E, /not\.toHaveAttribute\(['"]target['"]\)/);
});

test('every storefront exposes cart, orders, wishlist, and live cart count', () => {
  const file = 'src/components/store/MarketplaceCommerceNav.jsx';
  assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
  const nav = read(file);
  assert.match(nav, /useCartStore/);
  for (const route of [
    '/hub/diamond-store/cart',
    '/hub/diamond-store/orders',
    '/hub/diamond-store/wishlist',
  ]) {
    assert.match(nav, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(STORE, /<MarketplaceCommerceNav/);
});

test('merchandise supports discovery, product details, cart, and progressive media', () => {
  assert.match(MERCH, /Search Marketplace Gear/);
  assert.match(MERCH, /Sort Products/);
  assert.match(MERCH, /All Categories/);
  assert.match(MERCH, /useCartStore/);
  assert.match(MERCH, /Add To Cart/);
  assert.match(MERCH, /\/hub\/merch-store\/\$\{/);
  assert.match(MERCH, /loading=\{mediaPriority \? ['"]eager['"] : ['"]lazy['"]\}/);
});

test('real marketplace detail routes exist with product and breadcrumb schema', () => {
  for (const file of [
    'pages/hub/merch-store/[productId].js',
    'pages/hub/club-shop/[itemId].js',
    'pages/hub/smarter-rewards/[rewardId].js',
    'pages/hub/vip-membership/compare.js',
    'pages/hub/vip-membership/manage.js',
  ]) {
    assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
  }
  const product = read('pages/hub/merch-store/[productId].js');
  assert.match(product, /['"]@type['"]:\s*['"]Product['"]/);
  assert.match(product, /['"]@type['"]:\s*['"]Offer['"]/);
  assert.match(product, /['"]@type['"]:\s*['"]BreadcrumbList['"]/);
});

test('every current VIP term exposes its enabled settlement paths without duplicating Lifetime', () => {
  assert.match(STORE, /const handleVIPSubscribe = async/);
  for (const plan of ['monthly', 'yearly', 'lifetime']) {
    assert.match(STORE, new RegExp(`plan=\\{VIP_MEMBERSHIP\\.${plan}\\}`));
  }
  assert.match(STORE, /onClick=\{handleVIPSubscribe\}/);
  assert.match(STORE, /Lifetime VIP Is Bought With Diamonds/);
  assert.match(STORE, /selectedVIPPlan && vipCardReady && \(/);
  assert.match(STORE, /Pay With Diamonds Instead/);
});

test('the retired Daily Pass stays retired', () => {
  /**
   * REPLACED 2026-09-05. This used to assert the Daily Pass existed:
   *
   *     assert.match(STORE, /handleDailyVipCardCheckout/);
   *     assert.match(STORE, /Pay For Daily VIP With Card/);
   *
   * Dan retired the product the same day - "the terms are monthly, yearly and
   * lifetime" - and the removal was done properly: 0 vip_daily diamond
   * transactions and 0 purchases carried the intent, so no receipt, refund or
   * in-flight settlement depended on it, and /api/store/purchase-daily-vip
   * went with it. What did NOT happen is this test being updated in the same
   * commit, which CLAUDE.md requires, so main went red and STAYED red: Global
   * Footer E2E is not a required check, so nothing was blocked and nobody
   * looked.
   *
   * Note the first assertion would still have PASSED on its own - the only
   * remaining `handleDailyVipCardCheckout` in the file is inside the comment
   * recording the removal. A pin that a comment can satisfy is a pin that has
   * stopped reading the code.
   *
   * So this now guards the decision instead of the deleted feature: the
   * product is gone from the storefront, and the ledger still understands its
   * history, because history does not change when a product is retired.
   */
  // Read CODE, not prose. The store page carries a comment recording exactly
  // what was removed and why - which is good practice and must not be what
  // decides this test. Asserting against the raw file would have let that
  // comment satisfy every negative below, and asserting the OLD way let it
  // satisfy the positive: either direction, the pin stops reading the code.
  const code = STORE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert.doesNotMatch(code, /Pay For Daily VIP With Card/);
  assert.doesNotMatch(code, /runDailyPassPurchase\s*=/);
  assert.doesNotMatch(code, /purchase-daily-vip/);
  assert.ok(!existsSync(join(ROOT, 'pages/api/store/purchase-daily-vip.js')));

  // The reader side is deliberately unchanged: these two read history.
  assert.match(read('pages/api/admin/diamond-liability.js'), /vip_daily/);
  assert.match(read('pages/api/store/order-ledger.js'), /vip_daily/);});

test('production readiness is observable without exposing secrets', () => {
  const endpoint = 'pages/api/store/readiness.js';
  const verifier = 'scripts/verify-marketplace-deployment.mjs';
  assert.ok(existsSync(join(ROOT, endpoint)), `${endpoint} must exist`);
  assert.ok(existsSync(join(ROOT, verifier)), `${verifier} must exist`);
  const api = read(endpoint);
  assert.match(api, /stripe/);
  assert.match(api, /supabase/);
  assert.match(api, /printful/);
  assert.doesNotMatch(api, /STRIPE_SECRET_KEY\s*[,}]/);
  assert.doesNotMatch(api, /SUPABASE_SERVICE_ROLE_KEY\s*[,}]/);
  assert.doesNotMatch(api, /PRINTFUL_API_TOKEN\s*[,}]/);
});

test('marketplace controls and utility copy enforce the AA quality floor', () => {
  const css = read('src/components/store/MarketplaceCommerceNav.module.css');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(MERCH, /fontSize:\s*12/);
});
