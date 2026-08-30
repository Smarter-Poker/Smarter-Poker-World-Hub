import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const STORE = read('pages/hub/diamond-store.js');
const SHOWCASE = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const SHOWCASE_CSS = read('src/components/diamond-store/SmarterStoreShowcase.module.css');
const SHELL_CSS = read('src/components/diamond-store/DiamondStoreShell.module.css');
const CHECKOUT = read('pages/api/store/create-checkout-session.js');

test('store section navigation is native, addressable, and stays in the current app surface', () => {
  assert.match(SHOWCASE, /const TAB_ROUTES = \{/);
  assert.match(SHOWCASE, /<Link[\s\S]*?href=\{TAB_ROUTES\[id\]\}/);
  assert.doesNotMatch(SHOWCASE, /target=.*_blank|window\.open\(/);
  assert.match(SHOWCASE, /aria-current=\{id === activeTab \? 'page' : undefined\}/);
  assert.match(SHOWCASE_CSS, /\.tab\s*\{[\s\S]*?place-items:\s*center/);
  assert.doesNotMatch(STORE, /function openTab|window\.open\(/);
});

test('dialog busy-state changes do not release the focus trap or lose return focus', () => {
  assert.match(STORE, /const isBusyRef = useRef\(isBusy\)/);
  assert.match(STORE, /isBusyRef\.current = isBusy/);
  assert.match(STORE, /event\.key === 'Escape' && !isBusyRef\.current/);
  assert.match(STORE, /\}, \[dialogRef, isOpen, onDismiss\]\);/);
  assert.doesNotMatch(STORE, /\[dialogRef, isBusy, isOpen, onDismiss\]/);
});

test('the route-specific LCP artwork is preloaded and merchandise is code split', () => {
  assert.match(STORE, /rel="preload"[\s\S]*?as="image"[\s\S]*?fetchPriority="high"/);
  assert.match(STORE, /diamond-vault-hero\.webp/);
  for (const asset of ['vip-hero', 'merch-hero', 'rewards-hero', 'club-shop-hero']) {
    assert.match(STORE, new RegExp(`${asset}\\.webp`));
  }
  assert.match(STORE, /const MerchStore = dynamic\(/);
  assert.match(STORE, /Loading Merch Store\.\.\./);
});

test('checkout shape is rejected before Stripe customer side effects', () => {
  const typeGuard = CHECKOUT.indexOf(
    "const checkoutTypes = new Set(['diamonds', 'subscription', 'merchandise'])"
  );
  const sizeGuard = CHECKOUT.indexOf('if (items.length > 50)');
  const customerCreation = CHECKOUT.indexOf('stripe.customers.create');
  assert.ok(typeGuard > -1 && typeGuard < customerCreation);
  assert.ok(sizeGuard > -1 && sizeGuard < customerCreation);
  assert.equal(CHECKOUT.match(/if \(items\.length > 50\)/g)?.length, 1);
  assert.match(CHECKOUT, /type === 'subscription' && items\.length !== 1/);
  assert.match(CHECKOUT, /code: 'INVALID_TYPE'/);
});

test('global header remains outside the redesign and untouched by Phase 4 selectors', () => {
  const headerIndex = STORE.indexOf('<UniversalHeader pageDepth={1} />');
  const mainIndex = STORE.indexOf('<main className={`store-redesign-content');
  assert.ok(headerIndex > -1 && mainIndex > headerIndex);
  assert.doesNotMatch(SHOWCASE_CSS, /UniversalHeader/);
});

test('the rewards boost banner can shrink without clipping narrow mobile viewports', () => {
  assert.match(STORE, /className=\{shellStyles\.rewardsBoostLayout\}/);
  assert.match(STORE, /className=\{shellStyles\.rewardsBoostCopy\}/);
  assert.match(STORE, /className=\{shellStyles\.rewardsBoostTiers\}/);
  assert.match(SHELL_CSS, /\.rewardsBoostCopy\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(SHELL_CSS, /\.rewardsBoostTiers\s*\{[\s\S]*?width:\s*100%/);
  assert.match(STORE, /className=\{shellStyles\.rewardsCapBanner\}/);
  assert.match(STORE, /className=\{shellStyles\.rewardRow\}/);
  assert.match(SHELL_CSS, /\.rewardRow > :last-child\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
});
