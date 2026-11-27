/**
 * THE COMEBACK PRICE for lapsed Card members: a one-time $10 first month on
 * the regular $20 monthly price (src/lib/store/vipComebackOffer.mjs).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  VIP_COMEBACK_AMOUNT_OFF_CENTS,
  VIP_COMEBACK_CHECKOUT_LIMITS,
  VIP_COMEBACK_CHECKOUT_SCOPE,
  VIP_COMEBACK_MIN_LAPSE_DAYS,
  VIP_COMEBACK_OFFER,
  VIP_COMEBACK_SWITCH_ENV,
  isVipComebackSubscription,
  readVipComebackOfferSwitch,
  vipComebackCouponMismatch,
  vipComebackCouponParams,
  vipComebackOfferAppliesToPlan,
  vipSubscriptionEndedAt,
} from '../src/lib/store/vipComebackOffer.mjs';
import { resolveVipComebackOffer } from '../src/lib/store/vipComebackEligibility.js';
import { consumeVipIntroCheckoutAllowance } from '../src/lib/store/vipIntroEligibility.js';
import {
  VIP_INTRO_OFFER,
  isVipIntroSubscription,
  vipFullPriceRenewalDecision,
} from '../src/lib/store/vipIntroOffer.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-12-31T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const verifiedUser = { id: USER_ID, email_confirmed_at: '2026-11-01T00:00:00Z' };

function fakeSupabase({ ledger = null, redemption = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        async maybeSingle() {
          const value = table === 'vip_subscriptions' ? ledger : redemption;
          if (value instanceof Error) return { data: null, error: value };
          return { data: value, error: null };
        },
      };
      return query;
    },
    auth: { admin: { async getUserById() { return { data: null, error: new Error('missing') }; } } },
  };
}
const lapsedRow = (overrides = {}) => ({
  stripe_subscription_id: 'sub_old',
  status: 'canceled',
  canceled_at: daysAgo(45),
  current_period_end: daysAgo(40),
  ...overrides,
});
const decide = (options, user = verifiedUser, env = {}) =>
  resolveVipComebackOffer(fakeSupabase(options), user, { env, now: NOW });

test('the comeback terms: $10 first month on the regular $20 monthly price, once', () => {
  assert.equal(VIP_COMEBACK_OFFER.firstPeriodCents, 1000);
  assert.equal(VIP_COMEBACK_OFFER.regularCents, 2000);
  assert.equal(VIP_COMEBACK_AMOUNT_OFF_CENTS, 1000);
  assert.equal(VIP_COMEBACK_MIN_LAPSE_DAYS, 30);
  assert.notEqual(VIP_COMEBACK_OFFER.couponId, VIP_INTRO_OFFER.couponId);
  assert.notEqual(VIP_COMEBACK_OFFER.metadataValue, VIP_INTRO_OFFER.metadataValue);
  assert.equal(vipComebackOfferAppliesToPlan({ key: 'monthly', interval: 'month', unitAmount: 2000 }), true);
  for (const plan of [{ key: 'yearly', interval: 'year', unitAmount: 20000 }, { key: 'monthly', interval: 'month', unitAmount: 1999 }, null]) {
    assert.equal(vipComebackOfferAppliesToPlan(plan), false);
  }
});

test('only the exact one-time $10 USD coupon may be attached', () => {
  const exact = { ...vipComebackCouponParams(), valid: true, percent_off: null, max_redemptions: null, redeem_by: null };
  assert.equal(vipComebackCouponMismatch(exact), null);
  assert.equal(vipComebackCouponMismatch({ ...exact, duration: 'repeating' }), 'wrong_duration');
  assert.equal(vipComebackCouponMismatch({ ...exact, amount_off: 1900 }), 'wrong_amount');
  assert.equal(vipComebackCouponMismatch({ ...exact, percent_off: 50 }), 'percent_coupon');
  assert.equal(vipComebackCouponMismatch({ ...exact, currency: 'eur' }), 'wrong_currency');
  assert.equal(vipComebackCouponMismatch({ ...exact, valid: false }), 'invalid_coupon');
  assert.equal(vipComebackCouponMismatch({ ...exact, id: VIP_INTRO_OFFER.couponId }), 'wrong_coupon');
  assert.equal(vipComebackCouponMismatch({ ...exact, max_redemptions: 1 }), 'limited_coupon');
  assert.equal(vipComebackCouponMismatch(null), 'missing_coupon');
});

test('its own off switch, read with the same rule as the $1 month', () => {
  assert.equal(VIP_COMEBACK_SWITCH_ENV, 'VIP_COMEBACK_OFFER_DISABLED');
  assert.equal(readVipComebackOfferSwitch({}), 'on');
  assert.equal(readVipComebackOfferSwitch({ VIP_COMEBACK_OFFER_DISABLED: 'off' }), 'on');
  assert.equal(readVipComebackOfferSwitch({ VIP_COMEBACK_OFFER_DISABLED: '1' }), 'off');
  assert.equal(readVipComebackOfferSwitch({ VIP_COMEBACK_OFFER_DISABLED: 'maybe' }), 'unknown');
  // The $1 switch does not turn the comeback price off, and vice versa.
  assert.equal(readVipComebackOfferSwitch({ VIP_INTRO_OFFER_DISABLED: '1' }), 'on');
});

test('a lapsed Card member, ended 30+ days ago, verified, never redeemed, is eligible', async () => {
  assert.deepEqual(await decide({ ledger: lapsedRow() }), { eligible: true, reason: null });
});

test('every reason the comeback price is not on the table', async () => {
  assert.deepEqual(await decide({ ledger: lapsedRow() }, verifiedUser, { VIP_COMEBACK_OFFER_DISABLED: 'true' }),
    { eligible: false, reason: 'offer_off' });
  assert.deepEqual(await decide({ ledger: null }), { eligible: false, reason: 'no_lapsed_card_subscription' });
  assert.deepEqual(await decide({ ledger: lapsedRow({ stripe_subscription_id: 'diamond_x_1' }) }),
    { eligible: false, reason: 'no_lapsed_card_subscription' });
  for (const status of ['active', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired']) {
    assert.deepEqual(await decide({ ledger: lapsedRow({ status }) }), { eligible: false, reason: 'subscription_not_ended' }, status);
  }
  // Ended 29 days ago, or cancelled long ago with paid time ending recently.
  assert.deepEqual(await decide({ ledger: lapsedRow({ canceled_at: daysAgo(29), current_period_end: daysAgo(29) }) }),
    { eligible: false, reason: 'lapsed_too_recently' });
  assert.deepEqual(await decide({ ledger: lapsedRow({ canceled_at: daysAgo(90), current_period_end: daysAgo(10) }) }),
    { eligible: false, reason: 'lapsed_too_recently' });
  assert.deepEqual(await decide({ ledger: lapsedRow(), redemption: { stripe_subscription_id: 'sub_comeback' } }),
    { eligible: false, reason: 'comeback_used' });
  assert.deepEqual(await decide({ ledger: lapsedRow() }, { id: USER_ID, email_confirmed_at: null }),
    { eligible: false, reason: 'verify_contact' });
});

test('anything unreadable is unknown, never a price', async () => {
  assert.deepEqual(await decide({ ledger: new Error('down') }), { eligible: null, reason: 'eligibility_unknown' });
  assert.deepEqual(await decide({ ledger: lapsedRow(), redemption: new Error('down') }), { eligible: null, reason: 'eligibility_unknown' });
  assert.deepEqual(await decide({ ledger: lapsedRow({ canceled_at: 'not a date' }) }), { eligible: null, reason: 'eligibility_unknown' });
  assert.deepEqual(await decide({ ledger: lapsedRow({ canceled_at: null, current_period_end: null }) }), { eligible: null, reason: 'eligibility_unknown' });
  assert.deepEqual(await decide({ ledger: lapsedRow() }, { id: USER_ID }), { eligible: null, reason: 'contact_unknown' });
  assert.deepEqual(await decide({ ledger: lapsedRow() }, verifiedUser, { VIP_COMEBACK_OFFER_DISABLED: 'maybe' }),
    { eligible: null, reason: 'switch_unknown' });
  assert.deepEqual(await resolveVipComebackOffer(null, verifiedUser, { env: {}, now: NOW }), { eligible: null, reason: 'eligibility_unknown' });
  assert.equal(vipSubscriptionEndedAt({ canceled_at: daysAgo(50), current_period_end: daysAgo(40) }).toISOString(), daysAgo(40));
});

test('the comeback checkout has its own durable counters', async () => {
  const calls = [];
  const supabase = { async rpc(name, params) { calls.push(params); return { data: true, error: null }; } };
  assert.equal(await consumeVipIntroCheckoutAllowance(supabase, USER_ID, { headers: { 'x-real-ip': '203.0.113.9' } }, {
    scope: VIP_COMEBACK_CHECKOUT_SCOPE,
    limits: VIP_COMEBACK_CHECKOUT_LIMITS,
  }), 'allowed');
  assert.equal(calls[0].p_key, `store:vip-comeback-checkout:user:${USER_ID}`);
  assert.match(calls[1].p_key, /^store:vip-comeback-checkout:net:[a-f0-9]{64}$/);
  assert.deepEqual([calls[0].p_limit, calls[1].p_limit], [5, 20]);
});

test('a comeback subscription is recognised, and is never mistaken for a $1 one', () => {
  const comeback = { id: 'sub_c', metadata: { vip_comeback_offer: VIP_COMEBACK_OFFER.metadataValue } };
  assert.equal(isVipComebackSubscription(comeback), true);
  assert.equal(isVipComebackSubscription({ id: 'sub_c', metadata: {}, discounts: [{ coupon: VIP_COMEBACK_OFFER.couponId }] }), true);
  assert.equal(isVipIntroSubscription(comeback), false);
  assert.equal(isVipComebackSubscription({ id: 'sub_i', metadata: { vip_intro_offer: VIP_INTRO_OFFER.metadataValue } }), false);
  // The plan-switch invoice rule: locked on the $10 invoice, open after a $20 one.
  const invoice = (total) => ({ status: 'paid', subscription: 'sub_c', currency: 'usd', total });
  assert.equal(vipFullPriceRenewalDecision(comeback, { data: [invoice(1000)], has_more: false }), 'locked');
  assert.equal(vipFullPriceRenewalDecision(comeback, { data: [invoice(2000), invoice(1000)], has_more: false }), 'open');
  assert.equal(vipFullPriceRenewalDecision(comeback, null), 'unknown');
});

/* The confirmed offer and the intent hash, executed from the real route. */
const checkoutSource = await read('pages/api/store/create-checkout-session.js');
const offerCode = checkoutSource.slice(
  checkoutSource.indexOf('function hasExactObjectKeys('),
  checkoutSource.indexOf('function computeCheckoutIntentHash(')
);
const hashCode = checkoutSource.slice(
  checkoutSource.indexOf('function computeCheckoutIntentHash('),
  checkoutSource.indexOf('}\n', checkoutSource.indexOf("return createHash('sha256')", checkoutSource.indexOf('function computeCheckoutIntentHash('))) + 2
);
const offerApi = vm.runInNewContext(
  `${offerCode}\n${hashCode}\n({ buildCheckoutOffer, isCheckoutOfferConfirmationShape, computeCheckoutIntentHash })`,
  { VIP_INTRO_OFFER, VIP_COMEBACK_OFFER, createHash, BigInt, Number, Object, Array, JSON, String }
);
const monthly = { key: 'monthly', interval: 'month', unitAmount: 2000 };

test('the confirmed offer names $10 due today and $20 renewals, and hashes apart from $20 and $1', () => {
  const regular = offerApi.buildCheckoutOffer('subscription', { plan: monthly }, USER_ID);
  const comeback = offerApi.buildCheckoutOffer('subscription', { plan: monthly, comeback: { firstPeriodCents: 1000 } }, USER_ID);
  assert.ok(regular && comeback);
  assert.equal(comeback.comebackCents, 1000);
  assert.equal(comeback.totalCents, 1000);
  assert.equal(comeback.unitCents, 2000);
  assert.equal('introCents' in comeback, false);
  assert.equal('comebackCents' in regular, false);
  assert.equal(offerApi.isCheckoutOfferConfirmationShape('subscription', { ...comeback, introCents: 100 }), false);
  assert.equal(offerApi.isCheckoutOfferConfirmationShape('subscription', { ...comeback, comebackCents: 100, totalCents: 100 }), false);
  assert.equal(offerApi.isCheckoutOfferConfirmationShape('subscription', { ...comeback, plan: 'yearly', interval: 'year', unitCents: 20000 }), false);
  const hashes = new Set([
    offerApi.computeCheckoutIntentHash('subscription', { plan: monthly }),
    offerApi.computeCheckoutIntentHash('subscription', { plan: monthly, comeback: { firstPeriodCents: 1000 } }),
    offerApi.computeCheckoutIntentHash('subscription', { plan: monthly, intro: { firstPeriodCents: 100 } }),
  ]);
  assert.equal(hashes.size, 3);
});

test('checkout decides the comeback price only after the $1 month is ruled out, and refuses stale confirmations both ways', () => {
  const block = checkoutSource.slice(
    checkoutSource.indexOf('const introDecision = await resolveVipIntroOffer(getSupabase(), user);'),
    checkoutSource.indexOf('let checkoutOffer = buildCheckoutOffer(type, preparedCheckout, user.id);')
  );
  const introTrue = block.indexOf('if (introDecision.eligible === true) {');
  const comeback = block.indexOf('await resolveVipComebackOffer(getSupabase(), user)');
  assert.ok(introTrue > 0 && comeback > introTrue, 'comeback is decided in the not-eligible branch');
  assert.match(block, /if \(comebackDecision\.eligible === null\) \{[\s\S]{0,160}return res\.status\(503\)/);
  assert.match(block, /if \(comebackDecision\.eligible === true\) \{\s*const comebackCoupon = await ensureVipComebackCoupon\(\);/);
  assert.match(block, /if \(!confirmedComeback\) \{[\s\S]{0,120}code: 'VIP_COMEBACK_OFFER_AVAILABLE'/);
  assert.match(block, /VIP_COMEBACK_REFUSALS\[comebackDecision\.reason\] \|\| VIP_COMEBACK_REFUSALS\.default/);
  for (const code of ['VIP_COMEBACK_OFFER_ENDED', 'VIP_COMEBACK_VERIFY_CONTACT', 'VIP_COMEBACK_OFFER_USED', 'VIP_COMEBACK_OFFER_UNAVAILABLE']) {
    assert.match(checkoutSource, new RegExp(`'${code}'`));
  }
  // Charged exactly like the $1 month: regular price, one-time coupon, stamped on the subscription.
  assert.match(checkoutSource, /sessionConfig\.discounts = \[\{ coupon: preparedCheckout\.comeback\.couponId \}\];/);
  assert.match(checkoutSource, /\? \{ vip_comeback_offer: VIP_COMEBACK_OFFER\.metadataValue \}/);
  assert.match(checkoutSource, /scope: VIP_COMEBACK_CHECKOUT_SCOPE,\s*limits: VIP_COMEBACK_CHECKOUT_LIMITS,/);
  assert.match(checkoutSource, /const mismatch = vipComebackCouponMismatch\(coupon\);/);
});

test('status reports comebackOffer from the same decision; switch and stipend treat it like the $1 month', async () => {
  const [status, switchRoute, cron] = await Promise.all([
    read('pages/api/store/vip-membership-status.js'),
    read('pages/api/store/switch-vip-plan.js'),
    read('pages/api/cron/vip-stipend.js'),
  ]);
  assert.match(status, /: await resolveVipComebackOffer\(getSupabase\(\), user\);/);
  assert.match(status, /introDecision\.eligible === true\s*\? \{ eligible: false, reason: 'first_month_offer' \}/);
  assert.match(status, /comebackOffer: \{\s*eligible: comebackDecision\.eligible,\s*firstPeriodCents: VIP_COMEBACK_OFFER\.firstPeriodCents,\s*regularCents: VIP_COMEBACK_OFFER\.regularCents,\s*reason: comebackDecision\.reason,\s*\},/);
  assert.match(switchRoute, /if \(isVipIntroSubscription\(live\) \|\| isVipComebackSubscription\(live\)\) \{/);
  assert.match(switchRoute, /const switchDecision = vipFullPriceRenewalDecision\(live, paidInvoices\);/);
  assert.match(cron, /\.from\('vip_comeback_redemptions'\)/);
  assert.match(cron, /if \(eligibleSubscriptionIds\.get\(row\.user_id\) !== row\.stripe_subscription_id\) continue;/);
  assert.match(cron, /stats\.comebackPeriodSkipped \+= 1;/);
  assert.match(cron, /if \(comebackError\) \{[\s\S]{0,140}return res\.status\(500\)/);
});
