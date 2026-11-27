import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  VIP_INTRO_CHECKOUT_LIMITS,
  VIP_INTRO_OFFER,
  VIP_INTRO_PLAN_SWITCH_LOCKED_MESSAGE,
  VIP_INTRO_SWITCH_ENV,
  isVipIntroSubscription,
  readVipIntroOfferSwitch,
  vipIntroOfferCatalogTerms,
  vipIntroOfferPublicTerms,
  vipIntroPlanSwitchDecision,
} from '../src/lib/store/vipIntroOffer.mjs';
import {
  consumeVipIntroCheckoutAllowance,
  readVipIntroContactVerified,
  resolveVipIntroOffer,
} from '../src/lib/store/vipIntroEligibility.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';

/* A minimal service client: `subscriptions` is the rows the first-subscription
   read returns (or an Error), `authUser` what auth.admin.getUserById returns,
   `rpc` the durable limiter. Every call is recorded. */
function fakeSupabase({ subscriptions = [], authUser = undefined, rpc = null } = {}) {
  const calls = { tables: [], adminLookups: 0, rpc: [] };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        limit: async () =>
          subscriptions instanceof Error
            ? { data: null, error: subscriptions }
            : { data: subscriptions, error: null },
      };
      return query;
    },
    auth: {
      admin: {
        async getUserById() {
          calls.adminLookups += 1;
          if (authUser instanceof Error) throw authUser;
          return authUser === undefined
            ? { data: null, error: new Error('missing') }
            : { data: { user: authUser }, error: null };
        },
      },
    },
    async rpc(name, params) {
      calls.rpc.push({ name, params });
      return rpc(name, params);
    },
  };
}

const verifiedUser = { id: USER_ID, email_confirmed_at: '2026-11-01T00:00:00Z' };

/* ---------- 1. The off switch ---------- */

test('the offer is on unless the switch says off, and a typo is unknown', () => {
  assert.equal(VIP_INTRO_SWITCH_ENV, 'VIP_INTRO_OFFER_DISABLED');
  for (const env of [{}, { VIP_INTRO_OFFER_DISABLED: '' }, { VIP_INTRO_OFFER_DISABLED: '0' },
    { VIP_INTRO_OFFER_DISABLED: 'false' }, { VIP_INTRO_OFFER_DISABLED: ' Off ' }, { VIP_INTRO_OFFER_DISABLED: 'no' }]) {
    assert.equal(readVipIntroOfferSwitch(env), 'on', JSON.stringify(env));
  }
  for (const value of ['1', 'true', 'TRUE', 'yes', ' on ']) {
    assert.equal(readVipIntroOfferSwitch({ VIP_INTRO_OFFER_DISABLED: value }), 'off', value);
  }
  for (const value of ['maybe', 'disabled', '2', 'tru']) {
    assert.equal(readVipIntroOfferSwitch({ VIP_INTRO_OFFER_DISABLED: value }), 'unknown', value);
  }
  assert.equal(readVipIntroOfferSwitch({ VIP_INTRO_OFFER_DISABLED: 1 }), 'unknown');
  const throwing = new Proxy({}, { get() { throw new Error('unreadable'); } });
  assert.equal(readVipIntroOfferSwitch(throwing), 'unknown');
});

test('the public catalog publishes the offer only while the switch is on', () => {
  assert.deepEqual(vipIntroOfferCatalogTerms({}), vipIntroOfferPublicTerms());
  assert.equal(vipIntroOfferCatalogTerms({ VIP_INTRO_OFFER_DISABLED: 'true' }), null);
  assert.equal(vipIntroOfferCatalogTerms({ VIP_INTRO_OFFER_DISABLED: 'maybe' }), null);
});

test('switched off, nobody is eligible and nothing is read', async () => {
  const supabase = fakeSupabase();
  const decision = await resolveVipIntroOffer(supabase, verifiedUser, {
    env: { VIP_INTRO_OFFER_DISABLED: '1' },
  });
  assert.deepEqual(decision, { eligible: false, reason: 'offer_off' });
  assert.deepEqual(supabase.calls.tables, []);
});

test('an unreadable switch is unknown for an otherwise eligible account, never a price', async () => {
  const eligible = await resolveVipIntroOffer(fakeSupabase(), verifiedUser, {
    env: { VIP_INTRO_OFFER_DISABLED: 'maybe' },
  });
  assert.deepEqual(eligible, { eligible: null, reason: 'switch_unknown' });
  // An account that pays the regular price either way is not held up by it.
  const returning = await resolveVipIntroOffer(
    fakeSupabase({ subscriptions: [{ stripe_subscription_id: 'sub_old' }] }),
    verifiedUser,
    { env: { VIP_INTRO_OFFER_DISABLED: 'maybe' } }
  );
  assert.deepEqual(returning, { eligible: false, reason: 'already_subscribed' });
});

test('one decision: first subscription, verified email, switch on', async () => {
  assert.deepEqual(await resolveVipIntroOffer(fakeSupabase(), verifiedUser, { env: {} }), {
    eligible: true,
    reason: null,
  });
  assert.deepEqual(
    await resolveVipIntroOffer(fakeSupabase({ subscriptions: new Error('down') }), verifiedUser, { env: {} }),
    { eligible: null, reason: 'eligibility_unknown' }
  );
});

/* ---------- 2. Card-testing protection ---------- */

test('an unverified email is not eligible and is told to verify', async () => {
  const unverified = { id: USER_ID, email_confirmed_at: null };
  assert.equal(await readVipIntroContactVerified(fakeSupabase(), unverified), false);
  assert.deepEqual(await resolveVipIntroOffer(fakeSupabase(), unverified, { env: {} }), {
    eligible: false,
    reason: 'verify_contact',
  });
});

test('a token that does not say whether the email is confirmed asks the auth record', async () => {
  const decoded = { id: USER_ID };
  const confirmed = fakeSupabase({ authUser: { email_confirmed_at: '2026-11-01T00:00:00Z' } });
  assert.equal(await readVipIntroContactVerified(confirmed, decoded), true);
  assert.equal(confirmed.calls.adminLookups, 1);
  assert.equal(
    await readVipIntroContactVerified(fakeSupabase({ authUser: { email_confirmed_at: null } }), decoded),
    false
  );
  // The auth record could not be read: unknown, which stops a $1 checkout.
  assert.equal(await readVipIntroContactVerified(fakeSupabase(), decoded), null);
  assert.equal(await readVipIntroContactVerified(fakeSupabase({ authUser: new Error('x') }), decoded), null);
  assert.deepEqual(await resolveVipIntroOffer(fakeSupabase(), decoded, { env: {} }), {
    eligible: null,
    reason: 'contact_unknown',
  });
});

test('new one dollar checkouts are counted per account and per network by the durable limiter', async () => {
  assert.deepEqual(VIP_INTRO_CHECKOUT_LIMITS.account, { max: 5, windowSeconds: 86400 });
  assert.deepEqual(VIP_INTRO_CHECKOUT_LIMITS.network, { max: 20, windowSeconds: 86400 });

  const supabase = fakeSupabase({ rpc: async () => ({ data: true, error: null }) });
  const req = { headers: { 'x-real-ip': '203.0.113.9' } };
  assert.equal(await consumeVipIntroCheckoutAllowance(supabase, USER_ID, req), 'allowed');
  assert.equal(supabase.calls.rpc.length, 2);
  assert.deepEqual(supabase.calls.rpc[0], {
    name: 'check_rate_limit_strict',
    params: { p_key: `store:vip-intro-checkout:user:${USER_ID}`, p_limit: 5, p_window_seconds: 86400 },
  });
  assert.match(supabase.calls.rpc[1].params.p_key, /^store:vip-intro-checkout:net:[a-f0-9]{64}$/);
  assert.doesNotMatch(supabase.calls.rpc[1].params.p_key, /203\.0\.113\.9/);
  assert.equal(supabase.calls.rpc[1].params.p_limit, 20);

  // No network address: the account counter still applies.
  const noAddress = fakeSupabase({ rpc: async () => ({ data: true, error: null }) });
  assert.equal(await consumeVipIntroCheckoutAllowance(noAddress, USER_ID, { headers: {} }), 'allowed');
  assert.equal(noAddress.calls.rpc.length, 1);
});

test('over the limit is limited; a limiter that cannot answer is unavailable, never allowed', async () => {
  const req = { headers: { 'x-real-ip': '203.0.113.9' } };
  const overAccount = fakeSupabase({
    rpc: async (_name, params) => ({ data: !params.p_key.includes(':user:'), error: null }),
  });
  assert.equal(await consumeVipIntroCheckoutAllowance(overAccount, USER_ID, req), 'limited');
  const overNetwork = fakeSupabase({
    rpc: async (_name, params) => ({ data: !params.p_key.includes(':net:'), error: null }),
  });
  assert.equal(await consumeVipIntroCheckoutAllowance(overNetwork, USER_ID, req), 'limited');
  const failing = fakeSupabase({ rpc: async () => ({ data: null, error: new Error('down') }) });
  assert.equal(await consumeVipIntroCheckoutAllowance(failing, USER_ID, req), 'unavailable');
  const throwing = fakeSupabase({ rpc: async () => { throw new Error('network'); } });
  assert.equal(await consumeVipIntroCheckoutAllowance(throwing, USER_ID, req), 'unavailable');
  assert.equal(await consumeVipIntroCheckoutAllowance(null, USER_ID, req), 'unavailable');
});

/* ---------- 3. Plan switch during the $1 month ---------- */

const introSubscription = (overrides = {}) => ({
  id: 'sub_intro',
  metadata: { vip_intro_offer: VIP_INTRO_OFFER.metadataValue },
  ...overrides,
});
const invoice = (total, overrides = {}) => ({
  status: 'paid', subscription: 'sub_intro', currency: 'usd', total, ...overrides,
});

test('a subscription sold on the offer is recognised from Stripe metadata or its coupon', () => {
  assert.equal(isVipIntroSubscription(introSubscription()), true);
  assert.equal(isVipIntroSubscription({ id: 'sub_a', metadata: {}, discount: { coupon: { id: VIP_INTRO_OFFER.couponId } } }), true);
  assert.equal(isVipIntroSubscription({ id: 'sub_a', metadata: {}, discounts: [{ coupon: VIP_INTRO_OFFER.couponId }] }), true);
  assert.equal(isVipIntroSubscription({ id: 'sub_a', metadata: { vip_tier: 'monthly' } }), false);
  assert.equal(isVipIntroSubscription({ id: 'sub_a', metadata: {}, discount: { coupon: { id: 'other' } } }), false);
  assert.equal(isVipIntroSubscription(null), false);
});

test('a plan change stays locked until one full-price invoice is paid', () => {
  assert.equal(VIP_INTRO_PLAN_SWITCH_LOCKED_MESSAGE, 'Plan Changes Open After Your First Full-Price Renewal.');
  // A regular subscription is never locked and needs no invoice history.
  assert.equal(vipIntroPlanSwitchDecision({ id: 'sub_regular', metadata: {} }, null), 'open');
  // Only the $1 invoice so far.
  assert.equal(vipIntroPlanSwitchDecision(introSubscription(), { data: [invoice(100)], has_more: false }), 'locked');
  assert.equal(vipIntroPlanSwitchDecision(introSubscription(), { data: [], has_more: false }), 'locked');
  // The first $20 renewal is paid.
  assert.equal(
    vipIntroPlanSwitchDecision(introSubscription(), { data: [invoice(2000), invoice(100)], has_more: false }),
    'open'
  );
  // Invoices that prove nothing: unpaid, another subscription, another currency.
  for (const other of [invoice(2000, { status: 'open' }), invoice(2000, { subscription: 'sub_other' }),
    invoice(2000, { currency: 'eur' }), invoice('2000')]) {
    assert.equal(vipIntroPlanSwitchDecision(introSubscription(), { data: [other], has_more: false }), 'locked');
  }
});

test('a billing history that cannot be read is unknown, neither open nor locked', () => {
  assert.equal(vipIntroPlanSwitchDecision(introSubscription(), null), 'unknown');
  assert.equal(vipIntroPlanSwitchDecision(introSubscription(), { data: 'nope' }), 'unknown');
  assert.equal(vipIntroPlanSwitchDecision(introSubscription(), { data: [invoice(100)], has_more: true }), 'unknown');
  assert.equal(vipIntroPlanSwitchDecision(introSubscription({ id: null }), { data: [invoice(2000)] }), 'unknown');
});

/* ---------- Wiring: every surface reads the one decision ---------- */

test('checkout, status and catalog all read the same switch and decision', async () => {
  const [checkout, status, catalog, eligibility] = await Promise.all([
    read('pages/api/store/create-checkout-session.js'),
    read('pages/api/store/vip-membership-status.js'),
    read('pages/api/club-arena/store-catalog.js'),
    read('src/lib/store/vipIntroEligibility.js'),
  ]);
  assert.match(checkout, /const introDecision = await resolveVipIntroOffer\(getSupabase\(\), user\);/);
  assert.match(status, /: await resolveVipIntroOffer\(getSupabase\(\), user\);/);
  assert.match(status, /eligible: introDecision\.eligible,\s*reason: introDecision\.reason,\s*checkoutOpensAt,/);
  assert.match(catalog, /vipIntroOffer: vipIntroOfferCatalogTerms\(\),/);
  assert.match(eligibility, /const offerSwitch = readVipIntroOfferSwitch\(env\);/);
  // The switch is read in exactly one module; no route reads the variable itself.
  for (const source of [checkout, status, catalog, eligibility]) {
    assert.doesNotMatch(source, /VIP_INTRO_OFFER_DISABLED/);
  }
});

test('checkout stops on an unknown decision and explains every refusal before charging', async () => {
  const checkout = await read('pages/api/store/create-checkout-session.js');
  assert.match(checkout, /code: switchUnknown \? 'VIP_INTRO_OFFER_UNAVAILABLE' : 'VIP_ELIGIBILITY_UNAVAILABLE'/);
  assert.match(checkout, /retryable: true,\s*error: \{\s*code: switchUnknown/);
  for (const code of ['VIP_INTRO_OFFER_ENDED', 'VIP_INTRO_VERIFY_CONTACT', 'VIP_INTRO_OFFER_USED']) {
    assert.match(checkout, new RegExp(`code: '${code}'`));
  }
  assert.match(checkout, /VIP_INTRO_REFUSALS\[introDecision\.reason\] \|\| VIP_INTRO_REFUSALS\.default/);
  // The coupon is attached only when the decision is exactly true.
  assert.match(checkout, /if \(introDecision\.eligible === true\) \{\s*const introCoupon = await ensureVipIntroCoupon\(\);/);
});

test('checkout counts a new one dollar session before it takes the claim', async () => {
  const checkout = await read('pages/api/store/create-checkout-session.js');
  const limiter = checkout.indexOf('await consumeVipIntroCheckoutAllowance(getSupabase(), user.id, req)');
  const claim = checkout.indexOf("'claim_vip_subscription_checkout',");
  assert.ok(limiter > 0 && claim > limiter);
  assert.match(checkout, /if \(\(preparedCheckout\.intro \|\| preparedCheckout\.comeback\) && !matchingSession\) \{/);
  assert.match(checkout, /code: 'VIP_INTRO_CHECKOUT_LIMIT'/);
  assert.match(checkout, /if \(allowance === 'unavailable'\) \{\s*return res\.status\(503\)/);
  assert.match(checkout, /if \(allowance !== 'allowed'\) \{[\s\S]{0,140}return res\.status\(429\)/);
});

test('the stipend asks Stripe whether a first-period subscription was sold on the offer', async () => {
  const cron = await read('pages/api/cron/vip-stipend.js');
  assert.match(cron, /soldOnIntro = isVipIntroSubscription\(subscription\);/);
  assert.match(cron, /if \(soldOnIntro === false\) continue;/);
  assert.match(cron, /else stats\.introUnknownSkipped \+= 1;/);
});
