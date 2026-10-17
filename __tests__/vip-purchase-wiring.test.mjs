/**
 * VIP PAGE — THE PAGE MUST BE ABLE TO SELL VIP
 * ─────────────────────────────────────────────────────────────────────────
 * On 2026-08-26 the live VIP page could not take money. `VIPCard` was
 * imported and never rendered, `handleVIPSubscribe` was defined and never
 * called, `vipSubscribeLabel` was computed and never read. Confirmed against
 * the deployed bundle, not just the source: "subscribe-button.png" and
 * "Subscribe —" both returned 0 occurrences in production. A visitor read 23
 * benefits and 11 FAQ entries and then had no way to become a member.
 *
 * Nothing failed. Unused imports do not break a build, an uncalled handler
 * does not break a build, and no test asserted that the buy button existed.
 * That is the gap this file closes.
 *
 * These are source-level assertions because the decision lives in a
 * 3,000-line client component whose imports reach Supabase and the DOM.
 * What regresses is a render block being dropped again; that is visible here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STORE = readFileSync(join(ROOT, 'pages/hub/diamond-store.js'), 'utf8');
const DATA = readFileSync(join(ROOT, 'src/data/diamondStoreData.js'), 'utf8');
const CHECKOUT = readFileSync(join(ROOT, 'pages/api/store/create-checkout-session.js'), 'utf8');
const WEBHOOK = readFileSync(join(ROOT, 'pages/api/store/webhooks/stripe.js'), 'utf8');
const PUBLIC_CATALOG = readFileSync(join(ROOT, 'pages/api/club-arena/store-catalog.js'), 'utf8');

test('the three plans are actually RENDERED, not merely imported', () => {
  // Dan 2026-09-05: "just vip, monthly, yearly or lifetime". Was
  // daily/monthly/annual; the Daily Pass is retired and annual is yearly.
  for (const plan of ['monthly', 'yearly', 'lifetime']) {
    assert.ok(
      new RegExp(`<VIPCard\\s+plan=\\{VIP_MEMBERSHIP\\.${plan}\\}`).test(STORE),
      `VIP_MEMBERSHIP.${plan} is not rendered as a <VIPCard>`
    );
  }
  assert.ok(/onSelect=\{setSelectedVIP\}/.test(STORE), 'plan cards must be selectable');
});

test('the subscribe control exists and is wired to the handler', () => {
  assert.match(STORE, /onClick=\{handleVIPSubscribe\}/, 'no control calls handleVIPSubscribe');
  assert.doesNotMatch(STORE, /src="\/images\/subscribe-button\.webp"/, 'static monthly-price artwork must not mislabel another selected plan');
  assert.match(
    STORE,
    /\{isProcessing \? 'Processing\.\.\.' : vipSubscribeLabel\}/,
    'the plan-aware caption must render — the button image is a static $19.99/month picture'
  );
});

test('handleVIPSubscribe exposes subscription, Lifetime Card, and atomic Diamond paths', () => {
  assert.match(STORE, /const handleVIPSubscribe = async/);
  assert.match(STORE, /await startStripeCheckout\(plan\)/, 'card plans must reach Stripe');
  assert.match(STORE, /runDiamondPlanPurchase/, 'the diamond plan path must be reachable');
  assert.match(
    DATA,
    /lifetime:\s*\{[\s\S]*?oneTime:\s*true,[\s\S]*?cardCheckoutReady:\s*true/,
    'Lifetime must expose Card checkout after its complete refund/provenance lifecycle is present'
  );
  assert.match(
    PUBLIC_CATALOG,
    /id:\s*'vip-monthly',[\s\S]*?cardCheckoutReady:\s*true/,
    'the public catalog must explicitly advertise the live monthly Card path'
  );
  assert.match(
    PUBLIC_CATALOG,
    /id:\s*'vip-yearly',[\s\S]*?cardCheckoutReady:\s*true/,
    'the public catalog must explicitly advertise the live yearly Card path'
  );
  assert.match(
    PUBLIC_CATALOG,
    /id:\s*'vip-lifetime',[\s\S]*?cardCheckoutReady:\s*true/,
    'the public catalog must advertise the live Lifetime Card path'
  );
  assert.doesNotMatch(
    CHECKOUT,
    /code: 'LIFETIME_CARD_CHECKOUT_PAUSED'/,
    'the server must not retain the retired Lifetime Card capability gate'
  );
  assert.match(
    STORE,
    /const checkoutType = plan\.oneTime \? 'vip_lifetime' : 'subscription'/,
    'the Lifetime Card path must remain one-time rather than recurring'
  );
  assert.match(
    CHECKOUT,
    /type === 'vip_lifetime'/,
    'the server must retain the one-time Lifetime Card checkout implementation'
  );
  assert.match(
    WEBHOOK,
    /metadata\?\.type === 'vip_lifetime'/,
    'the webhook must remain able to settle any already-created lifetime checkout'
  );
});

test('paying for a membership in diamonds is offered and correctly wired', () => {
  assert.match(
    STORE,
    /\/api\/store\/purchase-vip-with-diamonds/,
    'the diamond-purchase endpoint exists server-side and must be called'
  );
  assert.match(
    STORE,
    /'x-idempotency-key': durableRequestId/,
    'a money path must send the idempotency key the API accepts'
  );
  assert.match(STORE, /Pay With Diamonds Instead/, 'the option must be visible to the member');
  // The FAQ promises this. If the button goes, the promise becomes false again.
  // The wording moved on 2026-09-05 when the Daily Pass left the same sentence
  // and lifetime joined it; the promise is what is pinned, not the phrasing.
  assert.ok(/1,999 Diamond Monthly/.test(STORE), 'FAQ references the monthly diamond option');
  assert.ok(/49,900 Lifetime/.test(STORE), 'FAQ references the lifetime diamond option');
});

test('the diamond cost shown matches the server formula (100 per dollar)', () => {
  const usd = DATA.match(/monthly:\s*\{[\s\S]*?price:\s*([\d.]+)/);
  assert.ok(usd, 'monthly price not found in the catalog');
  assert.equal(Math.round(Number(usd[1]) * 100), 1999, 'monthly must derive to 1,999 diamonds');
  assert.match(
    STORE,
    /Math\.round\(Number\(selectedVIPPlan\.price\) \* 100\)/,
    'the client must derive the cost the same way the server does, from the same price'
  );
});

test('an existing member is told so before being invited to pay again', () => {
  assert.match(STORE, /You Are Already A VIP Member/, 'no already-VIP state is rendered');
  assert.match(STORE, /\{isVip && !vipProduct\?\.gift && \(/, 'isVip must gate that banner');
  assert.match(STORE, /vipExpiresAt/, 'the expiry must be shown, not just the boolean');
});

test('no native confirm() on a path that spends diamonds', () => {
  const vipRegion = STORE.slice(0, STORE.indexOf("activeTab === 'club-shop'"));
  assert.ok(
    !/if \(confirm\(/.test(vipRegion),
    'window.confirm blocks the tab and is easy to miss in an installed PWA; use the in-page dialog'
  );
  assert.match(
    STORE,
    /role="dialog"[\s\S]{0,200}aria-modal="true"/,
    'the replacement dialog must exist'
  );
});

test('the obsolete image maps are gone and store actions use native buttons', () => {
  assert.doesNotMatch(
    STORE,
    /legacy-store-header|legacy-diamond-store|activateOnKey|new-diamond-store\.jpg|store-header-vip\.png/,
    'hidden image-map markup adds dead downloads and recreates fake-button accessibility debt'
  );
  assert.match(STORE, /<SmarterStoreShowcase[\s\S]*?onBuy=\{handleDirectCheckout\}/);
  assert.match(STORE, /<button[\s\S]*?onClick=\{handleVIPSubscribe\}/);
});

const VIP_STYLES = readFileSync(join(ROOT, 'src/components/store/VipMembershipPage.module.css'), 'utf8');
const VIP_NAV = await import('../src/lib/store/vipNavigation.mjs');

test('guest checkout preserves each selected plan through canonical sign-in', () => {
  for (const plan of ['vip-monthly', 'vip-yearly', 'vip-lifetime']) {
    const url = new URL(VIP_NAV.vipSignInHref(plan), 'https://smarter.poker');
    assert.equal(url.pathname, '/auth/login');
    assert.equal(url.searchParams.get('redirect'), `/hub/vip-membership?plan=${plan}`);
  }
  assert.equal(new URL(VIP_NAV.vipSignInHref('https://example.com'), 'https://smarter.poker').searchParams.get('redirect'), '/hub/vip-membership?plan=vip-monthly');
  const cardEntry = STORE.slice(STORE.indexOf('const startStripeCheckout = async'), STORE.indexOf('// Merchandise checkout lives'));
  assert.match(cardEntry, /router\.push\(vipSignInHref\(plan\.id, vipProduct \? vipProductPath\(vipProduct.plan, vipProduct.gift\) : null\)\)/);
  assert.match(STORE, /router\.push\(vipSignInHref\(selectedVIP, vipProduct \? vipProductPath\(vipProduct.plan\) : null\)\)/);
});

test('VIP owns its surface and excludes unrelated marketplace navigation', () => {
  assert.match(STORE, /activeTab !== 'vip' && <SmarterStoreShowcase/);
  assert.match(STORE, /activeTab !== 'diamonds' && activeTab !== 'vip' && marketplaceCommerceFooter/);
  const vip = STORE.slice(STORE.indexOf("{activeTab === 'vip' && ("), STORE.indexOf('{/* MERCHANDISE TAB */}'));
  assert.doesNotMatch(vip, /TAB_ROUTES\.merch|View In Marketplace|Store Sections|subscribe-button/);
  assert.match(vip, /Your Lifetime Access Never Expires/);
  assert.doesNotMatch(vip, /#FFD700|#FFF1A6|255,215,0/);
  assert.match(VIP_STYLES, /\.page[\s\S]*?background: #000;/);
  assert.match(VIP_STYLES, /@media \(max-width: 640px\)[\s\S]*?\.plans \{ grid-template-columns: 1fr;/);
  assert.match(VIP_STYLES, /inset 0 0 0 3px[\s\S]*?inset 0 0 0 4px[\s\S]*?0 4px 0/);
});

// Exercise the page's real event handler with isolated provider boundaries.
// The API/Stripe lifecycle has separate executable marketplace tests; these
// checks protect the UI-to-request-to-navigation connection reshaped here.
function checkoutHarness({ signedIn = true, responseOkay = true, vipProduct = null } = {}) {
  const requests = [], destinations = [], messages = [];
  const accountId = 'vip-checkout-fixture';
  const processingRef = { current: false };
  const dependencies = {
    processingRef,
    getAuthUser: () => signedIn ? { id: accountId } : null,
    committedStoreAccountId: accountId,
    activeStoreAccountRef: { current: accountId },
    showStoreToast: (...args) => messages.push(args),
    router: { push: (href) => destinations.push(href) },
    vipSignInHref: VIP_NAV.vipSignInHref,
    vipProduct,
    vipProductPath: plan => `/hub/vip-membership/${plan}`,
    lifetimeCheckoutOfferConfirmation: () => ({ kind: 'lifetime-review' }),
    subscriptionCheckoutOfferConfirmation: () => ({ kind: 'subscription-review' }),
    vipCardAttemptRef: { current: 0 },
    vipCardAbortRef: { current: null },
    setStoreProcessing: (value) => { processingRef.current = value; },
    getVerifiedCheckoutAuthorization: async () => ({ accessToken: 'isolated-test-token' }),
    getOrCreateCommerceRequestId: () => 'fixed-protected-request',
    captureStoreEvent: () => {},
    boundedCommerceFetch: async (url, init) => {
      requests.push({ url, ...init, body: JSON.parse(init.body) });
      return { ok: responseOkay, status: responseOkay ? 200 : 503,
        json: async () => responseOkay
          ? { success: true }
          : { success: false, error: { message: 'Checkout Is Temporarily Unavailable.' } } };
    },
    normalizeVerifiedCheckoutSession: () => ({ url: 'https://checkout.stripe.com/c/pay/isolated-fixture' }),
    leaveForCheckout: (href) => { destinations.push(href); return true; },
    checkoutRequestReplacementRequired: () => false,
    replaceCommerceRequestId: () => { throw new Error('Must Preserve Protected Request'); },
    console: { warn: () => {} },
  };
  const source = STORE.slice(STORE.indexOf('const startStripeCheckout = async'), STORE.indexOf('// Merchandise checkout lives'));
  const handler = new Function(...Object.keys(dependencies), `${source}; return startStripeCheckout;`)(...Object.values(dependencies));
  return { handler, requests, destinations, messages, processingRef };
}

test('each selected card plan reaches checkout with the correct server-owned plan and payment type', async () => {
  for (const [id, oneTime] of [['vip-monthly', false], ['vip-yearly', false], ['vip-lifetime', true]]) {
    const h = checkoutHarness();
    await Promise.all([h.handler({ id, oneTime }), h.handler({ id, oneTime })]);
    assert.equal(h.requests.length, 1, 'double-tap must create only one request');
    assert.equal(h.requests[0].url, '/api/store/create-checkout-session');
    assert.equal(h.requests[0].headers['X-Checkout-Request-ID'], 'fixed-protected-request');
    assert.deepEqual(h.requests[0].body.items, [{ plan: id }]);
    assert.equal(h.requests[0].body.type, oneTime ? 'vip_lifetime' : 'subscription');
    assert.equal(h.destinations.length, 1);
    assert.match(h.destinations[0], /^https:\/\/checkout\.stripe\.com\//);
    assert.equal(h.processingRef.current, false);
  }
});

test('guest and failed checkouts never navigate to a payment session', async () => {
  const guest = checkoutHarness({ signedIn: false });
  await guest.handler({ id: 'vip-yearly' });
  assert.equal(guest.requests.length, 0);
  assert.deepEqual(guest.destinations, [VIP_NAV.vipSignInHref('vip-yearly')]);
  const failed = checkoutHarness({ responseOkay: false });
  await failed.handler({ id: 'vip-monthly' });
  assert.deepEqual(failed.destinations, []);
  assert.deepEqual(failed.messages, [['error', 'Checkout Is Temporarily Unavailable.']]);
  assert.equal(failed.processingRef.current, false);
});


test('individual membership guest checkout returns to its exact canonical term', async () => {
  for (const plan of ['monthly', 'yearly', 'lifetime']) {
    const h = checkoutHarness({ signedIn: false, vipProduct: { plan, gift: false } });
    await h.handler({ id: `vip-${plan}`, oneTime: plan === 'lifetime' });
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.destinations, [`/auth/login?redirect=${encodeURIComponent(`/hub/vip-membership/${plan}`)}`]);
  }
});
