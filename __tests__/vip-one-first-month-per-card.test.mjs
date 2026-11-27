/**
 * ONE $1 MONTH PER CARD, ONE COMEBACK MONTH PER ACCOUNT, executed through the
 * real Stripe webhook subscription pipeline (pages/api/store/webhooks/stripe.js)
 * with the real admission guard (src/lib/store/vipDiscountedAdmission.mjs).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { VIP_INTRO_OFFER } from '../src/lib/store/vipIntroOffer.mjs';
import { VIP_COMEBACK_OFFER } from '../src/lib/store/vipComebackOffer.mjs';
import {
  readInitialInvoiceCardFingerprint,
  vipDiscountedAdmissionDecision,
} from '../src/lib/store/vipDiscountedAdmission.mjs';

const webhookSource = await readFile(
  new URL('../pages/api/store/webhooks/stripe.js', import.meta.url),
  'utf8'
);
const pipeline = webhookSource.slice(
  webhookSource.indexOf('function stripeObjectId('),
  webhookSource.indexOf('async function handleInvoicePaymentSucceeded(')
);

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const SUB = 'sub_new';
const INVOICE = 'in_first';
const SESSION = 'cs_first';
const CUSTOMER = 'cus_new';

function subscription({ userId = USER_A, offer = 'intro' } = {}) {
  return {
    id: SUB,
    authority: 'vip',
    customer: CUSTOMER,
    latest_invoice: INVOICE,
    status: 'active',
    metadata: {
      type: 'subscription',
      vip_tier: 'monthly',
      user_id: userId,
      checkout_request_id: 'request-1',
      checkout_intent_hash: 'b'.repeat(64),
      ...(offer === 'intro' ? { vip_intro_offer: VIP_INTRO_OFFER.metadataValue } : {}),
      ...(offer === 'comeback' ? { vip_comeback_offer: VIP_COMEBACK_OFFER.metadataValue } : {}),
    },
    items: {
      data: [{
        id: 'si_1',
        quantity: 1,
        price: {
          id: 'price_monthly',
          type: 'recurring',
          active: true,
          currency: 'usd',
          billing_scheme: 'per_unit',
          transform_quantity: null,
          unit_amount: 2000,
          metadata: { sp_vip_tier: 'monthly' },
          recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
        },
      }],
    },
    current_period_start: 1_800_000_000,
    current_period_end: 1_802_592_000,
    cancel_at_period_end: false,
    canceled_at: null,
  };
}

function harness({
  userId = USER_A,
  offer = 'intro',
  fingerprints = [],
  redemptions = [],
  fingerprint = 'fp_card_1',
  amountPaid = offer === 'comeback' ? 1000 : 100,
}) {
  const sub = subscription({ userId, offer });
  const state = {
    fingerprints: fingerprints.map((row) => ({ ...row })),
    redemptions: redemptions.map((row) => ({ ...row })),
    ledger: null,
    claim: null,
  };
  const rpcCalls = [];
  const mutations = [];
  const reads = [];
  const session = {
    id: SESSION,
    mode: 'subscription',
    subscription: SUB,
    customer: CUSTOMER,
    invoice: INVOICE,
    metadata: { ...sub.metadata },
  };

  function getSupabase() {
    return {
      from(table) {
        const filters = {};
        const query = {
          select() { return query; },
          eq(field, value) { filters[field] = value; return query; },
          async upsert(row, options) {
            mutations.push({ table, row, options });
            if (table === 'vip_intro_card_fingerprints') {
              assert.equal(options.onConflict, 'fingerprint');
              assert.equal(options.ignoreDuplicates, true);
              if (!state.fingerprints.some((r) => r.fingerprint === row.fingerprint)) {
                state.fingerprints.push({ ...row });
              }
              return { error: null };
            }
            if (table === 'vip_comeback_redemptions') {
              assert.equal(options.onConflict, 'user_id');
              if (!state.redemptions.some((r) => r.user_id === row.user_id)) {
                state.redemptions.push({ ...row });
              }
              return { error: null };
            }
            throw new Error(`unexpected upsert into ${table}`);
          },
          async maybeSingle() {
            if (table === 'vip_subscriptions') {
              return { data: state.ledger?.stripe_subscription_id === filters.stripe_subscription_id ? { ...state.ledger } : null, error: null };
            }
            if (table === 'commander_subscriptions') return { data: null, error: null };
            if (table === 'vip_subscription_checkout_claims') return { data: state.claim, error: null };
            if (table === 'profiles') {
              const id = filters.id || userId;
              return { data: { id, stripe_customer_id: CUSTOMER }, error: null };
            }
            if (table === 'vip_intro_card_fingerprints') {
              return { data: state.fingerprints.find((r) => r.fingerprint === filters.fingerprint) || null, error: null };
            }
            if (table === 'vip_comeback_redemptions') {
              return { data: state.redemptions.find((r) => r.user_id === filters.user_id) || null, error: null };
            }
            throw new Error(`unexpected read of ${table}`);
          },
        };
        return query;
      },
      async rpc(name, args) {
        rpcCalls.push(name);
        if (name === 'admit_vip_subscription_checkout') {
          const replay = state.ledger?.stripe_subscription_id === args.p_stripe_subscription_id;
          return { data: { success: true, state: replay ? 'replay' : 'admitted', finalize_required: true }, error: null };
        }
        if (name === 'apply_vip_subscription_projection') {
          state.ledger = { id: 'row', user_id: args.p_user_id, stripe_subscription_id: args.p_stripe_subscription_id, tier: args.p_tier, status: args.p_status };
          return { data: { success: true, projected: true, state: 'projected', stripe_subscription_id: args.p_stripe_subscription_id, status: args.p_status }, error: null };
        }
        if (name === 'finalize_vip_subscription_admission') {
          return { data: { success: true, finalized: true, state: 'finalized' }, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    };
  }

  const stripe = {
    subscriptions: {
      async retrieve(id) { assert.equal(id, SUB); return structuredClone(sub); },
      async cancel(id, params, options) {
        mutations.push({ table: 'stripe', kind: 'cancel', id, params, options });
        return { id, status: 'canceled' };
      },
    },
    checkout: { sessions: { async list() { return { data: [structuredClone(session)], has_more: false }; } } },
    invoices: {
      async retrieve(id) {
        assert.equal(id, INVOICE);
        return {
          id: INVOICE, subscription: SUB, customer: CUSTOMER, status: 'paid', paid: true,
          billing_reason: 'subscription_create', amount_paid: amountPaid,
          payment_intent: 'pi_first', charge: 'ch_first',
          period_start: 1_800_000_000, period_end: 1_802_592_000,
        };
      },
    },
    charges: {
      async retrieve(id) {
        reads.push({ kind: 'charge', id });
        return { id, payment_method_details: { type: 'card', card: { fingerprint } } };
      },
    },
    customers: { async retrieve() { return { id: CUSTOMER, metadata: { smarter_poker_id: userId } }; } },
    refunds: {
      async list() { return { data: [], has_more: false }; },
      async create(params, options) {
        mutations.push({ table: 'stripe', kind: 'refund', params, options });
        return { id: 're_1', amount: params.amount, status: 'succeeded' };
      },
    },
  };

  const AUTH = Object.freeze({ VIP: 'vip', COMMANDER: 'commander', UNKNOWN: 'unknown' });
  const context = {
    createHash,
    process: { env: { STRIPE_VIP_MONTHLY_PRICE_ID: 'price_monthly' } },
    console: { info() {}, warn() {}, error() {} },
    structuredClone,
    stripe,
    getSupabase,
    vipDiscountedAdmissionDecision,
    STRIPE_VIP_AUTHORITY: AUTH,
    classifyStripeSubscriptionForVip: (s) => s.authority,
    classifyStripeCheckoutSessionForVip: (c) => (c?.metadata?.type === 'subscription' ? AUTH.VIP : AUTH.UNKNOWN),
    resolveStripeSubscriptionVipTier: (s) => s?.metadata?.vip_tier || null,
    VIP_SUBSCRIPTION_STATUSES: new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', 'canceled', 'incomplete_expired']),
    VIP_FIRST_SEEN_TERMINAL_STATUSES: new Set(['canceled', 'incomplete_expired']),
    VIP_BLOCKING_SUBSCRIPTION_STATUSES: new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']),
    VIP_COMPENSATED_ADMISSION_DENIALS: new Set(['vip_entitlement_active', 'claim_conflict', 'session_conflict', 'profile_not_found']),
    VIP_PLAN_CONTRACT: Object.freeze({
      monthly: Object.freeze({ amount: 2000, legacyAmount: 1999, interval: 'month' }),
      yearly: Object.freeze({ amount: 20000, legacyAmount: 19999, interval: 'year' }),
    }),
    VIP_SUBSCRIPTION_RECONCILIATION_LIMIT: 2,
    VIP_SUBSCRIPTION_METADATA_KEYS: Object.freeze(['venue_id', 'type', 'vip_tier', 'user_id', 'checkout_request_id', 'checkout_intent_hash', 'checkout_session_id']),
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  };
  const run = vm.runInNewContext(`${pipeline}\nhandleStripeSubscriptionEvent`, context);
  return { run: () => run(SUB), state, rpcCalls, mutations, reads };
}

const stripeMutations = (h) => h.mutations.filter((m) => m.table === 'stripe').map((m) => m.kind);

test('a first $1 month is admitted and its card is recorded for that account', async () => {
  const h = harness({});
  await h.run();
  assert.deepEqual(h.state.fingerprints, [
    { fingerprint: 'fp_card_1', first_user_id: USER_A, first_subscription_id: SUB },
  ]);
  assert.ok(h.rpcCalls.includes('admit_vip_subscription_checkout'));
  assert.deepEqual(stripeMutations(h), []);
  assert.equal(h.state.ledger.status, 'active');
});

test('the same account seen again (a Stripe retry) is admitted and writes no second row', async () => {
  const h = harness({
    fingerprints: [{ fingerprint: 'fp_card_1', first_user_id: USER_A, first_subscription_id: SUB }],
  });
  await h.run();
  assert.equal(h.state.fingerprints.length, 1);
  assert.ok(h.rpcCalls.includes('admit_vip_subscription_checkout'));
  assert.deepEqual(stripeMutations(h), []);
});

test('another account paying $1 with the same card is refunded and ended, never admitted', async () => {
  const h = harness({
    userId: USER_B,
    fingerprints: [{ fingerprint: 'fp_card_1', first_user_id: USER_A, first_subscription_id: 'sub_old' }],
  });
  await h.run();
  assert.deepEqual(h.rpcCalls, [], 'no admission, projection or finalization');
  assert.deepEqual(stripeMutations(h), ['refund', 'cancel'], 'refund first, then end it');
  const refund = h.mutations.find((m) => m.kind === 'refund');
  assert.equal(refund.params.amount, 100);
  assert.equal(refund.params.payment_intent, 'pi_first');
  assert.equal(refund.params.metadata.smarter_poker_reason, 'vip_intro_card_reused');
  assert.equal(refund.params.metadata.stripe_subscription_id, SUB);
  assert.match(refund.options.idempotencyKey, /^commerce:vip-overlap-refund:sub_new:in_first:/);
  assert.equal(h.state.fingerprints[0].first_user_id, USER_A, 'the first account keeps the card');
  assert.equal(h.state.ledger, null);
});

test('an unreadable card fingerprint throws so Stripe retries; nothing is admitted or denied', async () => {
  const h = harness({ fingerprint: null });
  await assert.rejects(h.run(), /fingerprint is unreadable/);
  assert.deepEqual(h.rpcCalls, []);
  assert.deepEqual(h.mutations, []);
});

test('a regular-price subscription is untouched: no card read, no ledger write', async () => {
  const h = harness({ offer: 'none', amountPaid: 2000 });
  await h.run();
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.mutations, []);
  assert.ok(h.rpcCalls.includes('admit_vip_subscription_checkout'));
});

test('a comeback month is recorded once per account; a second one is refunded and ended', async () => {
  const first = harness({ offer: 'comeback' });
  await first.run();
  assert.deepEqual(first.state.redemptions, [{ user_id: USER_A, stripe_subscription_id: SUB }]);
  assert.deepEqual(stripeMutations(first), []);
  assert.deepEqual(first.reads, [], 'the comeback check reads no card');

  const retry = harness({ offer: 'comeback', redemptions: [{ user_id: USER_A, stripe_subscription_id: SUB }] });
  await retry.run();
  assert.deepEqual(stripeMutations(retry), []);

  const second = harness({ offer: 'comeback', redemptions: [{ user_id: USER_A, stripe_subscription_id: 'sub_earlier' }] });
  await second.run();
  assert.deepEqual(second.rpcCalls, []);
  assert.deepEqual(stripeMutations(second), ['refund', 'cancel']);
  const refund = second.mutations.find((m) => m.kind === 'refund');
  assert.equal(refund.params.amount, 1000);
  assert.equal(refund.params.metadata.smarter_poker_reason, 'vip_comeback_already_used');
});

test('the guard refuses to decide from an unpaid or mismatched first invoice', async () => {
  const base = { supabase: {}, stripe: {}, userId: USER_A };
  const intro = subscription();
  await assert.rejects(
    vipDiscountedAdmissionDecision({ ...base, subscription: intro, paymentContext: { kind: 'initial', invoice: { subscription: SUB, paid: false, status: 'open', billing_reason: 'subscription_create' } } }),
    /not paid yet/
  );
  await assert.rejects(
    vipDiscountedAdmissionDecision({ ...base, subscription: intro, paymentContext: { kind: 'trigger', invoice: { subscription: SUB } } }),
    /no initial payment context/
  );
  await assert.rejects(
    vipDiscountedAdmissionDecision({ ...base, subscription: intro, paymentContext: { error: new Error('session lookup failed') } }),
    /session lookup failed/
  );
  const both = { ...intro, metadata: { ...intro.metadata, vip_comeback_offer: VIP_COMEBACK_OFFER.metadataValue } };
  assert.deepEqual(
    await vipDiscountedAdmissionDecision({ ...base, subscription: both, paymentContext: null }),
    { admit: false, reason: 'vip_offers_combined' }
  );
});

test('the fingerprint comes from the charge, or the payment intent latest charge, never a guess', async () => {
  const invoice = { billing_reason: 'subscription_create', charge: null, payment_intent: 'pi_1' };
  const viaIntent = {
    paymentIntents: { async retrieve(id, opts) {
      assert.deepEqual(opts, { expand: ['latest_charge'] });
      return { id, latest_charge: { id: 'ch_9', payment_method_details: { card: { fingerprint: 'fp_9', wallet: { type: 'apple_pay' } } } } };
    } },
  };
  assert.equal(await readInitialInvoiceCardFingerprint(viaIntent, invoice), 'fp_9');
  const wrongCharge = { charges: { async retrieve() { return { id: 'ch_other', payment_method_details: { card: { fingerprint: 'fp' } } }; } } };
  await assert.rejects(readInitialInvoiceCardFingerprint(wrongCharge, { ...invoice, charge: 'ch_1' }), /unreadable/);
  await assert.rejects(readInitialInvoiceCardFingerprint({}, { billing_reason: 'subscription_create' }), /unreadable/);
  await assert.rejects(readInitialInvoiceCardFingerprint({}, { billing_reason: 'subscription_cycle', charge: 'ch_1' }), /no exact initial invoice/);
});

test('the ledger migration: two service-only tables, RLS on, no policies, no foreign keys, one transaction', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20261127081342_vip_first_month_card_and_comeback_ledgers.sql', import.meta.url),
    'utf8'
  );
  const body = sql.replace(/^--.*$/gm, '');
  assert.equal((body.match(/^BEGIN;/gm) || []).length, 1);
  assert.equal((body.match(/^COMMIT;/gm) || []).length, 1);
  assert.match(body, /CREATE TABLE public\.vip_intro_card_fingerprints \(\s*fingerprint text PRIMARY KEY/);
  assert.match(body, /first_user_id uuid NOT NULL/);
  assert.match(body, /first_subscription_id text NOT NULL/);
  assert.match(body, /CREATE TABLE public\.vip_comeback_redemptions \(\s*user_id uuid PRIMARY KEY/);
  assert.doesNotMatch(body, /REFERENCES/);
  assert.doesNotMatch(body, /CREATE POLICY/);
  assert.equal((body.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 2);
});
