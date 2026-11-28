import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { hasSecondFrame, offStandardPaint } from './smarterdesign-standard.test.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const STORE = read('pages/hub/diamond-store.js');
const SHOWCASE = read('src/components/diamond-store/SmarterStoreShowcase.jsx');
const SHOWCASE_CSS = read('src/components/diamond-store/SmarterStoreShowcase.module.css');
const SHELL_CSS = read('src/components/diamond-store/DiamondStoreShell.module.css');
const CHECKOUT = read('pages/api/store/create-checkout-session.js');

test('store section navigation is native, addressable, and stays in the current app surface', () => {
  assert.match(SHOWCASE, /const TAB_ROUTES = \{/);
  assert.match(SHOWCASE, /<Link[\s\S]*?href=\{storeTabHref\(id, clubId\)\}/);
  assert.match(SHOWCASE, /const route = TAB_ROUTES\[tabId\]/);
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
  /*
   * THE INVARIANT IS THE ORDER, NOT THE MEMBERSHIP LIST.
   *
   * This located the guard with indexOf on the exact literal
   * `new Set(['diamonds', 'subscription', 'merchandise'])`. Adding a fourth
   * checkout type - 'vip_lifetime' - made that string absent, indexOf returned
   * -1, and the test failed while the code it guards was entirely correct: the
   * type check still runs before stripe.customers.create, several hundred lines
   * ahead of it.
   *
   * So it sat red on main for every branch, reporting a Stripe side-effect
   * ordering bug that did not exist - and the next checkout type would have
   * broken it again. What this test is FOR is that no Stripe customer is
   * created before the request shape is validated. It finds the guard by shape
   * now, and adding a type is no longer a reason for it to fail.
   */
  const typeGuard = CHECKOUT.search(/const checkoutTypes = new Set\(\[/);
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
  const mainMatch = STORE.match(
    /<main\s+className=\{`store-redesign-content \$\{shellStyles\.root\}[^`]*`\}\s+data-marketplace-route=\{TAB_ROUTES\[activeTab\]\}/
  );
  assert.ok(headerIndex > -1 && mainMatch?.index > headerIndex);
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

test('storefront introductions retain their artwork without stacked decorative frames', () => {
  // #SMARTERDESIGN: every storefront opens on the shared StoreImageHeader. Its
  // one steel rim comes from the global .sd-masthead; the module paints only
  // the approved header backdrop, the masked scene and the round seal ring, so
  // there is never a second frame stacked on the header.
  const HEADER = read('src/components/diamond-store/StoreImageHeader.jsx');
  const HEADER_CSS = read('src/components/diamond-store/StoreImageHeader.module.css');
  assert.match(SHOWCASE, /<StoreImageHeader art=\{header\.art\} title=\{header\.title\} help=\{header\.help\} \/>/);
  assert.match(HEADER, /className=\{`sd-masthead \$\{styles\.header\}/);
  const headerRule = HEADER_CSS.match(/\.header\.header\s*\{[^}]*\}/)?.[0] || '';
  assert.ok(headerRule, 'the image header rule must exist');
  assert.doesNotMatch(headerRule, /border(?:-image)?\s*:|outline\s*:|inset 0 0 0/);
  assert.match(headerRule, /border-radius:\s*0/);
  assert.deepEqual(offStandardPaint(HEADER_CSS), []);
  assert.equal(hasSecondFrame(headerRule), false);
  // The old painted hero blocks and their per-route hero art are gone.
  assert.doesNotMatch(SHOWCASE_CSS, /(?:^|\n)\s*(?:\.diamonds\s+)?\.hero(?:::?after)?\s*\{/);
  for (const asset of ['diamond-vault-hero', 'vip-hero', 'merch-hero', 'rewards-hero', 'club-shop-hero']) {
    assert.doesNotMatch(SHOWCASE_CSS, new RegExp(asset + '\\.webp'));
  }
  // The tab rail is the global sd-tabs control set: the module adds layout
  // only, never a second frame or a rejected painted plate.
  assert.match(SHOWCASE, /<nav className=\{`sd-tabs \$\{styles\.tabs\}`\}/);
  const tabs = SHOWCASE_CSS.match(/\n\.tabs\s*\{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(tabs, /border(?:-image)?\s*:|background\s*:|box-shadow\s*:/);
  const tab = SHOWCASE_CSS.match(/\n\.tab\s*\{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(tab, /button-secondary\.png|marketplace-console-v1|url\(/);
});
