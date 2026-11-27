import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  VIP_INTRO_AMOUNT_OFF_CENTS,
  VIP_INTRO_OFFER,
  vipIntroCouponMismatch,
  vipIntroCouponParams,
  vipIntroOfferAppliesToPlan,
  vipIntroOfferPublicTerms,
} from '../src/lib/store/vipIntroOffer.mjs';
import { readVipIntroEligibility } from '../src/lib/store/vipIntroEligibility.js';
import { subscriptionCheckoutOfferConfirmation } from '../src/lib/store/verifiedCheckoutUrl.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

/* Dan, 2026-11-26: "the first month should be $1 and then $20 a month after
   that, they can cancel anytime, but all first month subscriptions are just a
   dollar." These pin the amounts and the places that must agree on them. */

test('the first VIP month is one dollar and every renewal is twenty', () => {
  assert.equal(VIP_INTRO_OFFER.plan, 'monthly');
  assert.equal(VIP_INTRO_OFFER.firstPeriodCents, 100);
  assert.equal(VIP_INTRO_OFFER.regularCents, 2000);
  assert.equal(VIP_INTRO_AMOUNT_OFF_CENTS, 1900);
  assert.deepEqual(vipIntroOfferPublicTerms(), {
    plan: 'monthly',
    firstPeriodCents: 100,
    firstPeriodUsd: 1,
    regularCents: 2000,
    regularUsd: 20,
    paymentMethod: 'card',
  });
});

test('the offer applies to the monthly plan at its regular price and nothing else', () => {
  assert.equal(vipIntroOfferAppliesToPlan({ key: 'monthly', interval: 'month', unitAmount: 2000 }), true);
  assert.equal(vipIntroOfferAppliesToPlan({ key: 'yearly', interval: 'year', unitAmount: 20000 }), false);
  assert.equal(vipIntroOfferAppliesToPlan({ key: 'monthly', interval: 'month', unitAmount: 1999 }), false);
  assert.equal(vipIntroOfferAppliesToPlan(null), false);
});

test('only the exact one-time nineteen dollar coupon may be attached', () => {
  const good = { ...vipIntroCouponParams(), valid: true, percent_off: null, max_redemptions: null, redeem_by: null };
  assert.equal(vipIntroCouponMismatch(good), null);
  assert.equal(vipIntroCouponMismatch(null), 'missing_coupon');
  assert.equal(vipIntroCouponMismatch({ ...good, id: 'other' }), 'wrong_coupon');
  assert.equal(vipIntroCouponMismatch({ ...good, valid: false }), 'invalid_coupon');
  assert.equal(vipIntroCouponMismatch({ ...good, duration: 'forever' }), 'wrong_duration');
  assert.equal(vipIntroCouponMismatch({ ...good, duration: 'repeating' }), 'wrong_duration');
  assert.equal(vipIntroCouponMismatch({ ...good, amount_off: 2000 }), 'wrong_amount');
  assert.equal(vipIntroCouponMismatch({ ...good, amount_off: null, percent_off: 95 }), 'percent_coupon');
  assert.equal(vipIntroCouponMismatch({ ...good, currency: 'eur' }), 'wrong_currency');
  assert.equal(vipIntroCouponMismatch({ ...good, max_redemptions: 5 }), 'limited_coupon');
});

test('the reviewed terms name one dollar due today only when the caller asks for the offer', () => {
  const regular = subscriptionCheckoutOfferConfirmation('account-a', {
    id: 'vip-monthly',
    interval: 'month',
    price: 20,
  });
  assert.equal(regular.totalCents, 2000);
  assert.equal(Object.prototype.hasOwnProperty.call(regular, 'introCents'), false);

  const intro = subscriptionCheckoutOfferConfirmation('account-a', {
    id: 'vip-monthly',
    interval: 'month',
    price: 20,
    introCents: 100,
  });
  assert.deepEqual({ ...intro }, {
    version: 1,
    accountId: 'account-a',
    type: 'subscription',
    currency: 'usd',
    plan: 'monthly',
    interval: 'month',
    quantity: 1,
    unitCents: 2000,
    totalCents: 100,
    introCents: 100,
  });

  // No other plan, amount or regular price can carry the offer.
  assert.equal(
    subscriptionCheckoutOfferConfirmation('account-a', { id: 'vip-yearly', interval: 'year', price: 200, introCents: 100 }),
    null
  );
  assert.equal(
    subscriptionCheckoutOfferConfirmation('account-a', { id: 'vip-monthly', interval: 'month', price: 20, introCents: 1 }),
    null
  );
  assert.equal(
    subscriptionCheckoutOfferConfirmation('account-a', { id: 'vip-monthly', interval: 'month', price: 19, introCents: 100 }),
    null
  );
});

function fakeSupabase(result) {
  const calls = [];
  const builder = {
    from(table) { calls.push(['from', table]); return builder; },
    select(columns) { calls.push(['select', columns]); return builder; },
    eq(column, value) { calls.push(['eq', column, value]); return builder; },
    not(column, op, value) { calls.push(['not', column, op, value]); return builder; },
    limit(count) { calls.push(['limit', count]); return Promise.resolve(result); },
  };
  return { builder, calls };
}

test('an account is eligible only when it has never held a Card subscription', async () => {
  const none = fakeSupabase({ data: [], error: null });
  assert.equal(await readVipIntroEligibility(none.builder, 'user-1'), true);
  assert.deepEqual(none.calls, [
    ['from', 'vip_subscriptions'],
    ['select', 'stripe_subscription_id'],
    ['eq', 'user_id', 'user-1'],
    ['not', 'stripe_subscription_id', 'is', null],
    ['not', 'stripe_subscription_id', 'like', 'diamond_%'],
    ['limit', 1],
  ]);

  const prior = fakeSupabase({ data: [{ stripe_subscription_id: 'sub_old' }], error: null });
  assert.equal(await readVipIntroEligibility(prior.builder, 'user-1'), false);

  // Unknown is its own answer: never eligible, never ineligible.
  const failed = fakeSupabase({ data: null, error: { message: 'timeout' } });
  assert.equal(await readVipIntroEligibility(failed.builder, 'user-1'), null);
  assert.equal(await readVipIntroEligibility(null, 'user-1'), null);
  assert.equal(await readVipIntroEligibility(none.builder, ''), null);
});

test('Checkout decides the offer on the server and charges it with a one-time coupon', async () => {
  const route = await read('pages/api/store/create-checkout-session.js');
  // Eligibility is read before the offer is built, and unknown stops the sale.
  const eligibility = route.indexOf('await resolveVipIntroOffer(getSupabase(), user)');
  const offer = route.indexOf('let checkoutOffer = buildCheckoutOffer(type, preparedCheckout, user.id);');
  assert.ok(eligibility > 0 && offer > eligibility);
  assert.match(route, /if \(introDecision\.eligible === null\) \{[\s\S]{0,120}return res\.status\(503\)/);
  // The amount never comes from the request: only the server constant sets it.
  assert.match(route, /firstPeriodCents: VIP_INTRO_OFFER\.firstPeriodCents,\s*couponId: introCoupon\.id,/);
  assert.match(route, /sessionConfig\.discounts = \[\{ coupon: preparedCheckout\.intro\.couponId \}\];/);
  // The recurring price is the regular one; the offer is not a cheaper Price.
  assert.match(route, /unitAmount: 2000, \/\/ \$20/);
  assert.doesNotMatch(route, /trial_period_days|trial_end/);
  // A member shown $1 who is not eligible is told so, never charged $20 silently.
  assert.match(route, /code: 'VIP_INTRO_OFFER_USED'/);
  // A page that still confirms $20 for an eligible account is refused, not charged $20.
  assert.match(route, /code: 'VIP_INTRO_OFFER_AVAILABLE'/);
  // The intent hash and the confirmed offer both carry the amount due today.
  assert.match(route, /\? \{ introCents: preparedCheckout\.intro\.firstPeriodCents \}/);
  assert.match(route, /offer\.totalCents = preparedCheckout\.intro\.firstPeriodCents;/);
  assert.match(route, /offer\.totalCents === offer\.introCents/);
});

test('the one dollar month does not earn the monthly Diamond stipend', async () => {
  const cron = await read('pages/api/cron/vip-stipend.js');
  assert.match(cron, /const INTRO_PERIOD_DAYS\s+= 31;/);
  assert.match(cron, /row\.tier === 'monthly' && row\.created_at && row\.created_at > introPeriodFloorISO/);
  assert.match(cron, /\.lte\('created_at', introPeriodFloorISO\)/);
  assert.match(cron, /eligibleUserIds\.delete\(userId\);\s*if \(soldOnIntro === true\) stats\.introPeriodSkipped \+= 1;/);
});

test('every surface that sells monthly VIP states the first month price', async () => {
  const [store, cards, gate, memory, compare, status, catalog] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('src/components/store/StoreCards.js'),
    read('src/components/gates/OutOfDiamondsModal.jsx'),
    read('pages/hub/memory-games.js'),
    read('pages/hub/vip-membership/compare.js'),
    read('pages/api/store/vip-membership-status.js'),
    read('pages/api/club-arena/store-catalog.js'),
  ]);
  assert.match(store, /Subscribe With Card: \$1 First Month, Then \$/);
  assert.match(store, /introCents: VIP_INTRO_OFFER\.firstPeriodCents/);
  assert.match(store, /introOffer=\{vipIntro\.display\}/);
  assert.match(cards, /\{intro \? '\$1' : regularPrice\}/);
  assert.match(gate, /\$1<span> First Month<\/span>/);
  assert.match(gate, /Then \$20\/Month\. Cancel Anytime\./);
  assert.doesNotMatch(gate, /\$20<span>\/Month<\/span>/);
  assert.match(memory, /Go VIP - \$1 First Month, Then \$20\/Month/);
  assert.match(memory, /introCents: VIP_INTRO_OFFER\.firstPeriodCents/);
  assert.match(compare, /New Subscribers: \$1 First Month/);
  assert.match(status, /introOffer: \{\s*\.\.\.vipIntroOfferPublicTerms\(\),\s*eligible: introDecision\.eligible,/);
  assert.match(catalog, /vipIntroOffer: vipIntroOfferCatalogTerms\(\),/);
});
