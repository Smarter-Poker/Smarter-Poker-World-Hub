import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const STORE = read('pages/hub/diamond-store.js');
const CHECKOUT = read('pages/api/store/create-checkout-session.js');
const STATUS = read('pages/api/store/checkout-status.js');
const WEBHOOK = read('pages/api/store/webhooks/stripe.js');
const SHOWCASE = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const SHOWCASE_CSS = read('src/components/diamond-store/SmarterStoreShowcase.module.css');
const MERCH = read('src/components/store/MerchStore.jsx');
const STATUS_PANEL = read('src/components/diamond-store/CheckoutStatusPanel.jsx');
const STATUS_CSS = read('src/components/diamond-store/CheckoutStatusPanel.module.css');
const LEGACY_STYLES = read('src/components/diamond-store/diamondStoreStyles.js');

test('checkout returns are authenticated, verified, displayed, and removed from the URL', () => {
  assert.match(STORE, /\/api\/store\/checkout-status\?session_id=/);
  assert.match(STORE, /<CheckoutStatusPanel/);
  assert.match(STORE, /window\.history\.replaceState/);
  assert.match(STORE, /as: cleanPath, url: cleanPath/);
  assert.match(STATUS, /getServerUserWithFallback/);
  assert.match(STATUS, /session\.metadata\?\.user_id !== user\.id/);
  assert.match(STATUS, /stripe\.checkout\.sessions\.retrieve\(sessionId\)/);
  assert.match(STATUS_PANEL, /data-checkout-status=\{state\.status\}/);
  assert.match(STATUS_PANEL, /aria-live=/);
  assert.match(STATUS_CSS, /border-radius:\s*0/);
});

test('checkout validates real products before Stripe customer side effects', () => {
  const prepare = CHECKOUT.indexOf('preparedCheckout = await prepareCheckout(type, items)');
  const customer = CHECKOUT.indexOf('stripe.customers.create');
  assert.ok(prepare > -1 && prepare < customer);
  assert.match(CHECKOUT, /async function prepareCheckout/);
  assert.match(CHECKOUT, /stripe\.prices\.retrieve\(plan\.priceId\)/);
  assert.match(CHECKOUT, /from\('merchandise_items'\)/);
  assert.match(CHECKOUT, /reserve_merch_order/);
});

test('Stripe checkout creation is request-idempotent and pending rows are terminally cleaned', () => {
  assert.match(STORE, /X-Checkout-Request-ID/);
  assert.match(MERCH, /X-Checkout-Request-ID/);
  assert.match(CHECKOUT, /validateCheckoutRequestId/);
  assert.match(CHECKOUT, /findExistingCheckout/);
  assert.match(CHECKOUT, /idempotencyKey:\s*checkoutRequestId/);
  assert.match(CHECKOUT, /Pending diamond cleanup failed/);
  assert.match(CHECKOUT, /Pending merchandise cleanup failed/);
  assert.match(WEBHOOK, /case 'checkout\.session\.expired'/);
  assert.match(WEBHOOK, /async function handleCheckoutExpired/);
});

test('card merchandise orders preserve catalog and variant IDs for stock fulfillment', () => {
  assert.match(CHECKOUT, /id:\s*item\.id,[\s\S]*?variantId:\s*item\.variantId \|\| item\.variant_id/);
  const resolvedIndex = CHECKOUT.indexOf('const resolvedItems = items.map((item) =>');
  const reuseIndex = CHECKOUT.indexOf('const { resolvedItems, totalUsd } = preparedCheckout');
  const orderIndex = CHECKOUT.indexOf(".from('merchandise_orders')", resolvedIndex);
  const itemsIndex = CHECKOUT.indexOf('items: resolvedItems', resolvedIndex);
  assert.ok(resolvedIndex > -1 && reuseIndex > resolvedIndex && orderIndex > reuseIndex && itemsIndex > orderIndex);
});

test('the merch page server-renders a static lineup while refreshing the live catalog', () => {
  assert.doesNotMatch(STORE, /dynamic\(\(\) => import\('\.\.\/\.\.\/src\/components\/store\/MerchStore'\), \{\s*ssr: false/);
  assert.match(MERCH, /const STATIC_PRODUCTS = MERCHANDISE/);
  assert.match(MERCH, /return normalized \? \[normalized\] : STATIC_PRODUCTS/);
  assert.match(MERCH, /useState\(\(\) => initialProducts\)/);
  assert.match(MERCH, /setLoading\(true\)/);
  assert.match(MERCH, /Verifying Live Prices, Options, And Stock/);
  assert.doesNotMatch(MERCH, /\{!loading && sections\.map/);
  assert.match(MERCH, /catalog_fallback/);
  assert.match(MERCH, /width:\s*44,[\s\S]*?minWidth:\s*44,[\s\S]*?height:\s*44/);
});

test('seeded merch image placeholders do not issue guaranteed production 404s', () => {
  assert.match(MERCH, /const UNSHIPPED_MERCH_IMAGES = new Set/);
  for (const path of [
    '/merch/card-protector-gold.jpg',
    '/merch/card-protector-black.jpg',
    '/merch/hoodie-neural.jpg',
    '/merch/tshirt-gto.jpg',
    '/merch/hat-diamond.jpg',
    '/merch/deck-premium.jpg',
    '/merch/chip-set-100.jpg',
    '/merch/chip-set-500.jpg',
  ]) {
    assert.match(MERCH, new RegExp(path.replaceAll('/', '\\/').replace('.', '\\.')));
  }
  assert.match(MERCH, /image: image && !UNSHIPPED_MERCH_IMAGES\.has\(image\) \? image : null/);
});

test('all store routes own canonical and social metadata', () => {
  assert.match(STORE, /rel="canonical"/);
  assert.match(STORE, /type="application\/ld\+json"/);
  assert.match(STORE, /'@type': 'CollectionPage'/);
  for (const field of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:title', 'twitter:image']) {
    assert.match(STORE, new RegExp(field.replace(':', '\\:')));
  }
  for (const route of Object.values({
    diamonds: '/hub/diamond-store',
    vip: '/hub/vip-membership',
    merch: '/hub/merch-store',
    rewards: '/hub/smarter-rewards',
    club: '/hub/club-shop',
  })) {
    assert.match(STORE, new RegExp(route.replaceAll('/', '\\/')));
  }
});

test('route heroes are isolated under the image budget and preloaded by route', () => {
  for (const asset of ['vip-hero', 'merch-hero', 'rewards-hero', 'club-shop-hero']) {
    assert.ok(statSync(join(ROOT, `public/images/store-v3/${asset}.webp`)).size < 100 * 1024);
    assert.match(SHOWCASE_CSS, new RegExp(`${asset}\\.webp`));
    assert.match(STORE, new RegExp(`${asset}\\.webp`));
  }
  assert.doesNotMatch(SHOWCASE_CSS, /store-section-heroes\.(png|webp)/);
});

test('starter packs, store analytics, legible legal copy, and pressed metal states are wired', () => {
  assert.match(SHOWCASE, /packages\.slice\(0, 2\)/);
  assert.match(SHOWCASE, /Starter Diamond Packs/);
  assert.match(STORE, /captureStoreEvent\('viewed'/);
  assert.match(MERCH, /captureStoreEvent\('catalog_viewed'/);
  assert.match(SHOWCASE_CSS, /\.packageCard button:active:not\(:disabled\)/);
  assert.doesNotMatch(LEGACY_STYLES, /legalNote:[\s\S]{0,120}rgba\(255, 255, 255, 0\.4\)/);
  assert.match(SHOWCASE_CSS, /\.legal\s*\{[\s\S]*?font-size:\s*12px/);
});

test('the global header remains outside every Phase 5 surface', () => {
  const headerIndex = STORE.indexOf('<UniversalHeader pageDepth={1} />');
  const mainIndex = STORE.indexOf('<main className={`store-redesign-content');
  assert.ok(headerIndex > -1 && mainIndex > headerIndex);
  for (const source of [STATUS_PANEL, STATUS_CSS, SHOWCASE_CSS]) {
    assert.doesNotMatch(source, /UniversalHeader|global-header|site-header/i);
  }
});
