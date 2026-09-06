import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('checkout verification fails closed when a settlement record lookup fails', async () => {
  const source = await read('pages/api/store/checkout-status.js');
  const diamondLookup = source.slice(
    source.indexOf("if (type === 'diamonds'"),
    source.indexOf("if (type === 'merchandise'")
  );
  const merchandiseLookup = source.slice(
    source.indexOf("if (type === 'merchandise'"),
    source.indexOf("if (session.mode === 'subscription')")
  );
  for (const lookup of [diamondLookup, merchandiseLookup]) {
    assert.match(lookup, /const \{ data, error \}/);
    assert.match(lookup, /if \(error\) throw error/);
  }
  assert.doesNotMatch(source, /catch \([^)]*\) \{\}/);
  assert.match(source, /Error reporting failed/);
});

test('Club Shop card returns terminate explicitly when Stripe reports failure', async () => {
  const source = await read('pages/hub/club-shop/[itemId].js');
  const failed = source.indexOf("body?.data?.status === 'failed'");
  const complete = source.indexOf("body?.data?.status === 'complete'");
  assert.ok(failed > -1 && failed < complete);
  const branch = source.slice(failed, complete);
  assert.match(branch, /No item was granted/);
  assert.match(branch, /clearCommerceRequestById/);
  assert.match(branch, /router\.replace/);
  assert.match(branch, /return;/);
  assert.doesNotMatch(branch, /purchaseWithDiamonds/);
});

test('reward detail readouts describe earnings rather than purchase settlement', async () => {
  const [detail, reward, storePage, transition] = await Promise.all([
    read('src/components/store/MarketplaceDetailExperience.jsx'),
    read('pages/hub/smarter-rewards/[rewardId].js'),
    read('pages/hub/diamond-store.js'),
    read('src/components/transitions/PageTransition.js'),
  ]);
  assert.match(detail, /diamondLabel = 'Diamond Settlement'/);
  assert.match(detail, /const copyDiamondLabel = marketplaceCopy\(diamondLabel\)/);
  assert.match(detail, /<small>\{copyDiamondLabel\}<\/small>/);
  assert.match(detail, /securityCopy = 'Card checkout is handled by Stripe/);
  assert.match(detail, /fetchPriority="high"/);
  assert.match(reward, /diamondLabel="Reward Value"/);
  assert.match(reward, /inventoryLabel="Reward Signal"/);
  assert.match(reward, /Reward telemetry is verified against your Smarter\.Poker account/);
  assert.match(storePage, /<PageTransition disableInitialAnimation>/);
  assert.match(detail, /<PageTransition disableInitialAnimation>/);
  assert.match(transition, /disableInitialAnimation = false/);
  assert.match(transition, /initial=\{disableInitialAnimation \? false : 'initial'\}/);
});

test('fulfillment pagination preserves the current queue and uses an in-page operation dialog', async () => {
  const [source, css] = await Promise.all([
    read('pages/hub/merch-store/fulfillment.js'),
    read('pages/hub/merch-store/fulfillment.module.css'),
  ]);
  assert.match(source, /ordersRef\.current = merged/);
  assert.match(source, /if \(!append\) \{\s*ordersRef\.current = \[\]/);
  assert.match(source, /No older exceptions remain/);
  assert.doesNotMatch(source, /window\.prompt|window\.confirm/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /acquireScrollLock\('MerchFulfillmentOperationDialog'\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /trackingNumber: operation\.trackingNumber\.trim\(\)/);
  assert.match(css, /\.dialogBackdrop/);
  assert.match(css, /\.formGrid/);
});

test('production verification exercises canonical cache behavior and ships Phase 19', async () => {
  const [verifier, pkg, ignore] = await Promise.all([
    read('scripts/verify-marketplace-deployment.mjs'),
    read('package.json'),
    read('.vercelignore'),
  ]);
  assert.match(verifier, /const merchCatalogPath = requireProductionTruth/);
  assert.match(verifier, /fetch\(`\$\{baseUrl\}\$\{merchCatalogPath\}`/);
  assert.match(verifier, /\/api\/store\/merch-catalog\?strict=1/);
  assert.doesNotMatch(verifier, /merch-catalog\?limit=100/);
  const readinessProbe = verifier.slice(
    verifier.indexOf('`${baseUrl}/api/store/readiness`'),
    verifier.indexOf('let health = null')
  );
  assert.doesNotMatch(readinessProbe, /'Cache-Control': 'no-cache'/);
  assert.match(pkg, /__tests__\/diamond-store-phase-19\.test\.mjs/);
  assert.match(ignore, /!\/__tests__\/diamond-store-phase-19\.test\.mjs/);
});

test('merchandise detail builds bound live catalog latency and preserve the static fallback', async () => {
  const source = await read('pages/hub/merch-store/[productId].js');
  assert.match(source, /async function boundedCatalogProduct\(productId, timeoutMs = 5000\)/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /Promise\.race\(\[/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /\.abortSignal\(signal\)/);
  assert.match(source, /product = await boundedCatalogProduct\(productId\)/);
  assert.match(source, /product \|\|= staticProduct\(MERCHANDISE\.find/);
});
