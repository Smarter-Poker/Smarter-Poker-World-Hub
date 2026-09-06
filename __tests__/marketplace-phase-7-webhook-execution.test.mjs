import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const WEBHOOK_PATH = new URL('../pages/api/store/webhooks/stripe.js', import.meta.url);
const webhookSource = await readFile(WEBHOOK_PATH, 'utf8');
const pipelineStart = webhookSource.indexOf('function stripeObjectId(');
const pipelineEnd = webhookSource.indexOf(
  'async function handleInvoicePaymentSucceeded(',
  pipelineStart,
);
assert.ok(pipelineStart > -1 && pipelineEnd > pipelineStart,
  'the executable VIP subscription pipeline must be extractable');
const executablePipeline = webhookSource.slice(pipelineStart, pipelineEnd);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = 'cus_exact';
const SUBSCRIPTION_ID = 'sub_exact';
const SESSION_ID = 'cs_exact';
const INVOICE_ID = 'in_exact';
const REQUEST_ID = 'request-exact';
const INTENT_HASH = 'a'.repeat(64);

function vipSubscription(status) {
  return {
    id: SUBSCRIPTION_ID,
    authority: 'vip',
    customer: CUSTOMER_ID,
    latest_invoice: INVOICE_ID,
    status,
    metadata: {
      type: 'subscription',
      vip_tier: 'monthly',
      user_id: USER_ID,
      checkout_request_id: REQUEST_ID,
      checkout_intent_hash: INTENT_HASH,
    },
    items: {
      data: [{
        id: 'si_exact',
        quantity: 1,
        price: {
          id: 'price_monthly',
          type: 'recurring',
          active: true,
          currency: 'usd',
          billing_scheme: 'per_unit',
          transform_quantity: null,
          unit_amount: 1999,
          metadata: { sp_vip_tier: 'monthly' },
          recurring: {
            interval: 'month',
            interval_count: 1,
            usage_type: 'licensed',
          },
        },
      }],
    },
    current_period_start: 1_800_000_000,
    current_period_end: 1_802_592_000,
    cancel_at_period_end: false,
    canceled_at: status === 'canceled' ? 1_802_592_000 : null,
  };
}

function unknownSubscription() {
  return {
    id: 'sub_unknown',
    authority: 'unknown',
    customer: 'cus_unknown',
    status: 'active',
    metadata: {},
    items: { data: [] },
    current_period_start: 1_800_000_000,
    current_period_end: 1_802_592_000,
    cancel_at_period_end: false,
    canceled_at: null,
  };
}

function checkoutSession() {
  return {
    id: SESSION_ID,
    mode: 'subscription',
    subscription: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    invoice: INVOICE_ID,
    metadata: {
      type: 'subscription',
      vip_tier: 'monthly',
      user_id: USER_ID,
      checkout_request_id: REQUEST_ID,
      checkout_intent_hash: INTENT_HASH,
    },
  };
}

function paidTriggerInvoice(overrides = {}) {
  return {
    id: INVOICE_ID,
    subscription: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    status: 'paid',
    paid: true,
    amount_paid: 1999,
    payment_intent: 'pi_exact',
    charge: 'ch_exact',
    billing_reason: 'subscription_cycle',
    period_start: 1_800_000_000,
    period_end: 1_802_592_000,
    ...overrides,
  };
}

function makeHarness({
  snapshots,
  withAdmittingClaim,
  withPaymentContext = true,
  initialClaim = undefined,
  initialSubscription = null,
  projectionConflict = false,
  refundRows = [],
  createdRefund = null,
}) {
  const defaultClaim = withAdmittingClaim ? {
    request_id: REQUEST_ID,
    intent_hash: INTENT_HASH,
    state: 'admitting',
    session_id: SESSION_ID,
  } : null;
  const state = {
    subscription: initialSubscription ? { ...initialSubscription } : null,
    profile: { id: USER_ID, stripe_customer_id: CUSTOMER_ID },
    claim: initialClaim === undefined ? defaultClaim : { ...initialClaim },
  };
  const retrievals = [...snapshots];
  const rpcCalls = [];
  const projections = [];
  const finalizedStatuses = [];
  const databaseMutations = [];
  const providerReads = [];
  const providerMutations = [];
  const session = checkoutSession();

  function rowFor(table, filters) {
    if (table === 'vip_subscriptions') {
      return state.subscription?.stripe_subscription_id === filters.stripe_subscription_id
        ? { ...state.subscription }
        : null;
    }
    if (table === 'commander_subscriptions') return null;
    if (table === 'vip_subscription_checkout_claims') {
      return state.claim && filters.user_id === USER_ID ? { ...state.claim } : null;
    }
    if (table === 'profiles') {
      if (filters.id && filters.id !== state.profile.id) return null;
      if (filters.stripe_customer_id
        && filters.stripe_customer_id !== state.profile.stripe_customer_id) return null;
      return { ...state.profile };
    }
    throw new Error(`unexpected database table ${table}`);
  }

  function getSupabase() {
    return {
      from(table) {
        const filters = {};
        return {
          select() { return this; },
          eq(field, value) { filters[field] = value; return this; },
          async maybeSingle() { return { data: rowFor(table, filters), error: null }; },
          insert() { databaseMutations.push({ table, kind: 'insert' }); throw new Error('unexpected direct insert'); },
          update() { databaseMutations.push({ table, kind: 'update' }); throw new Error('unexpected direct update'); },
          upsert() { databaseMutations.push({ table, kind: 'upsert' }); throw new Error('unexpected direct upsert'); },
          delete() { databaseMutations.push({ table, kind: 'delete' }); throw new Error('unexpected direct delete'); },
        };
      },
      async rpc(name, args) {
        rpcCalls.push({ name, args });
        if (name === 'admit_vip_subscription_checkout') {
          if (state.claim) {
            assert.equal(state.claim.request_id, args.p_request_id);
            assert.equal(state.claim.intent_hash, args.p_intent_hash);
          }
          const replay = state.subscription?.stripe_subscription_id === args.p_stripe_subscription_id;
          return {
            data: {
              success: true,
              state: replay ? 'replay' : 'admitted',
              finalize_required: Boolean(state.claim),
            },
            error: null,
          };
        }
        if (name === 'apply_vip_subscription_projection') {
          assert.equal(rpcCalls.at(-2)?.name, 'admit_vip_subscription_checkout',
            'projection must immediately follow admission');
          if (projectionConflict) {
            return {
              data: {
                success: false,
                projected: false,
                state: 'reactivation_entitlement_conflict',
              },
              error: null,
            };
          }
          projections.push({ status: args.p_status, claimPresent: Boolean(state.claim) });
          state.subscription = {
            id: 'ledger-row-exact',
            user_id: args.p_user_id,
            stripe_subscription_id: args.p_stripe_subscription_id,
            stripe_customer_id: args.p_stripe_customer_id,
            tier: args.p_tier,
            status: args.p_status,
          };
          return {
            data: {
              success: true,
              projected: true,
              state: 'projected',
              stripe_subscription_id: args.p_stripe_subscription_id,
              status: args.p_status,
            },
            error: null,
          };
        }
        if (name === 'finalize_vip_subscription_admission') {
          assert.equal(rpcCalls.at(-2)?.name, 'apply_vip_subscription_projection',
            'finalization must immediately follow the last stable projection');
          assert.equal(retrievals.length, 0,
            'finalization must wait until the provider snapshot queue is stable');
          assert.ok(state.claim, 'finalization must be the operation that clears the claim');
          finalizedStatuses.push(state.subscription?.status);
          state.claim = null;
          return { data: { success: true, finalized: true, state: 'finalized' }, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    };
  }

  const stripe = {
    subscriptions: {
      async retrieve(subscriptionId) {
        providerReads.push({ kind: 'subscription-retrieve', subscriptionId });
        const snapshot = retrievals.shift();
        assert.ok(snapshot, `unexpected subscription retrieval for ${subscriptionId}`);
        assert.equal(snapshot.id, subscriptionId);
        return structuredClone(snapshot);
      },
      async cancel(subscriptionId, params, options) {
        providerMutations.push({ kind: 'cancel', subscriptionId, params, options });
        return { id: subscriptionId, status: 'canceled' };
      },
    },
    checkout: {
      sessions: {
        async list() {
          return withPaymentContext
            ? { data: [structuredClone(session)], has_more: false }
            : { data: [], has_more: false };
        },
      },
    },
    invoices: {
      async retrieve(invoiceId) {
        assert.equal(invoiceId, INVOICE_ID);
        return {
          id: INVOICE_ID,
          subscription: SUBSCRIPTION_ID,
          customer: CUSTOMER_ID,
          status: 'paid',
          paid: true,
          billing_reason: 'subscription_create',
          amount_paid: 1999,
          payment_intent: 'pi_exact',
          charge: 'ch_exact',
          period_start: 1_800_000_000,
          period_end: 1_802_592_000,
        };
      },
    },
    customers: {
      async retrieve(customerId) {
        assert.equal(customerId, CUSTOMER_ID);
        return { id: CUSTOMER_ID, metadata: { smarter_poker_id: USER_ID } };
      },
    },
    refunds: {
      async list(params) {
        providerReads.push({ kind: 'refund-list', params });
        return { data: structuredClone(refundRows), has_more: false };
      },
      async create(params, options) {
        providerMutations.push({ kind: 'refund-create', params, options });
        return createdRefund || { id: 're_exact', amount: 1999, status: 'succeeded' };
      },
    },
  };

  const STRIPE_VIP_AUTHORITY = Object.freeze({
    VIP: 'vip',
    COMMANDER: 'commander',
    UNKNOWN: 'unknown',
  });
  const context = {
    createHash,
    process: { env: { STRIPE_VIP_MONTHLY_PRICE_ID: 'price_monthly' } },
    console: { info() {}, warn() {}, error() {} },
    structuredClone,
    stripe,
    getSupabase,
    STRIPE_VIP_AUTHORITY,
    classifyStripeSubscriptionForVip: (subscription) => subscription.authority,
    classifyStripeCheckoutSessionForVip: (candidate) => (
      candidate?.metadata?.type === 'subscription'
        ? STRIPE_VIP_AUTHORITY.VIP
        : STRIPE_VIP_AUTHORITY.UNKNOWN
    ),
    resolveStripeSubscriptionVipTier: (subscription) => subscription?.metadata?.vip_tier || null,
    VIP_SUBSCRIPTION_STATUSES: new Set([
      'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused',
      'canceled', 'incomplete_expired',
    ]),
    VIP_FIRST_SEEN_TERMINAL_STATUSES: new Set(['canceled', 'incomplete_expired']),
    VIP_BLOCKING_SUBSCRIPTION_STATUSES: new Set([
      'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused',
    ]),
    VIP_COMPENSATED_ADMISSION_DENIALS: new Set([
      'vip_entitlement_active', 'claim_conflict', 'session_conflict', 'profile_not_found',
    ]),
    VIP_PLAN_CONTRACT: Object.freeze({
      monthly: Object.freeze({ amount: 1999, interval: 'month' }),
      yearly: Object.freeze({ amount: 19999, interval: 'year' }),
    }),
    VIP_SUBSCRIPTION_RECONCILIATION_LIMIT: 2,
    VIP_SUBSCRIPTION_METADATA_KEYS: Object.freeze([
      'venue_id', 'type', 'vip_tier', 'user_id', 'checkout_request_id',
      'checkout_intent_hash', 'checkout_session_id',
    ]),
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  };
  const handleStripeSubscriptionEvent = vm.runInNewContext(
    `${executablePipeline}\nhandleStripeSubscriptionEvent`,
    context,
  );

  return {
    databaseMutations,
    finalizedStatuses,
    handleStripeSubscriptionEvent,
    projections,
    providerMutations,
    providerReads,
    retrievals,
    rpcCalls,
    state,
  };
}

test('an unknown authoritative subscription performs no provider or database mutation', async () => {
  const unknown = unknownSubscription();
  const harness = makeHarness({
    snapshots: [unknown],
    withAdmittingClaim: false,
    withPaymentContext: false,
  });

  await harness.handleStripeSubscriptionEvent(unknown.id);

  assert.equal(harness.retrievals.length, 0);
  assert.deepEqual(harness.rpcCalls, []);
  assert.deepEqual(harness.databaseMutations, []);
  assert.deepEqual(harness.providerMutations, []);
  assert.equal(harness.state.subscription, null);
});

test('matching admission projects terminal truth and reconciles changes before one finalization', async (t) => {
  await t.test('a first-seen terminal retry with the exact admitting claim completes', async () => {
    const canceled = vipSubscription('canceled');
    const harness = makeHarness({
      snapshots: [canceled, canceled],
      withAdmittingClaim: true,
    });

    await harness.handleStripeSubscriptionEvent(canceled.id);

    assert.deepEqual(harness.rpcCalls.map(({ name }) => name), [
      'admit_vip_subscription_checkout',
      'apply_vip_subscription_projection',
      'finalize_vip_subscription_admission',
    ]);
    assert.deepEqual(harness.projections, [{ status: 'canceled', claimPresent: true }]);
    assert.deepEqual(harness.finalizedStatuses, ['canceled']);
    assert.equal(harness.state.subscription.status, 'canceled');
    assert.equal(harness.state.claim, null);
  });

  await t.test('an active snapshot changed to canceled is reprojected before finalization', async () => {
    const active = vipSubscription('active');
    const canceled = vipSubscription('canceled');
    const harness = makeHarness({
      snapshots: [active, canceled, canceled],
      withAdmittingClaim: true,
    });

    await harness.handleStripeSubscriptionEvent(active.id);

    assert.deepEqual(harness.rpcCalls.map(({ name }) => name), [
      'admit_vip_subscription_checkout',
      'apply_vip_subscription_projection',
      'admit_vip_subscription_checkout',
      'apply_vip_subscription_projection',
      'finalize_vip_subscription_admission',
    ]);
    assert.deepEqual(harness.projections, [
      { status: 'active', claimPresent: true },
      { status: 'canceled', claimPresent: true },
    ]);
    assert.deepEqual(harness.finalizedStatuses, ['canceled']);
    assert.equal(harness.state.subscription.status, 'canceled');
    assert.equal(harness.state.claim, null);
    assert.deepEqual(harness.databaseMutations, []);
    assert.deepEqual(harness.providerMutations, []);
  });
});

test('a signed historical invoice cannot mutate or compensate the current VIP subscription', async () => {
  const active = vipSubscription('active');
  const harness = makeHarness({
    snapshots: [active],
    withAdmittingClaim: false,
    withPaymentContext: false,
    initialSubscription: {
      id: 'ledger-row-exact',
      user_id: USER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
      stripe_customer_id: CUSTOMER_ID,
      tier: 'monthly',
      status: 'canceled',
    },
  });
  const historicalInvoice = {
    id: 'in_historical',
    subscription: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    status: 'paid',
    paid: true,
    amount_paid: 1999,
    payment_intent: 'pi_historical',
    billing_reason: 'subscription_cycle',
    period_start: active.current_period_start,
    period_end: active.current_period_end,
  };

  await assert.rejects(
    harness.handleStripeSubscriptionEvent(SUBSCRIPTION_ID, {
      triggerInvoice: historicalInvoice,
    }),
    /exact paid trigger invoice/,
  );
  assert.deepEqual(harness.rpcCalls, []);
  assert.deepEqual(harness.databaseMutations, []);
  assert.deepEqual(harness.providerMutations, []);
  assert.equal(harness.state.subscription.status, 'canceled');
});

test('an exact current reactivation invoice is refunded before its subscription is canceled', async () => {
  const active = vipSubscription('active');
  const harness = makeHarness({
    snapshots: [active, active, active, active],
    withAdmittingClaim: false,
    withPaymentContext: false,
    projectionConflict: true,
    initialSubscription: {
      id: 'ledger-row-exact',
      user_id: USER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
      stripe_customer_id: CUSTOMER_ID,
      tier: 'monthly',
      status: 'canceled',
    },
  });

  await harness.handleStripeSubscriptionEvent(SUBSCRIPTION_ID, {
    triggerInvoice: paidTriggerInvoice(),
  });

  assert.deepEqual(harness.rpcCalls.map(({ name }) => name), [
    'admit_vip_subscription_checkout',
    'apply_vip_subscription_projection',
  ]);
  assert.equal(harness.retrievals.length, 0);
  assert.deepEqual(harness.providerMutations.map(({ kind }) => kind), [
    'refund-create',
    'cancel',
  ]);
  const refund = harness.providerMutations[0];
  assert.equal(refund.params.amount, 1999);
  assert.equal(refund.params.payment_intent, 'pi_exact');
  assert.equal(refund.params.metadata.stripe_subscription_id, SUBSCRIPTION_ID);
  assert.equal(refund.params.metadata.stripe_invoice_id, INVOICE_ID);
  assert.match(
    refund.options.idempotencyKey,
    /^commerce:vip-overlap-refund:sub_exact:in_exact:[a-f0-9]{32}$/,
  );
  assert.equal(harness.providerMutations[1].subscriptionId, SUBSCRIPTION_ID);
});

test('a reactivation invoice superseded before refund causes no irreversible provider mutation', async () => {
  const active = vipSubscription('active');
  const superseded = { ...active, latest_invoice: 'in_new' };
  const harness = makeHarness({
    snapshots: [active, active, superseded],
    withAdmittingClaim: false,
    withPaymentContext: false,
    projectionConflict: true,
    initialSubscription: {
      id: 'ledger-row-exact',
      user_id: USER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
      stripe_customer_id: CUSTOMER_ID,
      tier: 'monthly',
      status: 'canceled',
    },
  });

  await assert.rejects(
    harness.handleStripeSubscriptionEvent(SUBSCRIPTION_ID, {
      triggerInvoice: paidTriggerInvoice(),
    }),
    /exact paid trigger invoice/,
  );
  assert.deepEqual(harness.providerMutations, []);
  assert.deepEqual(harness.providerReads.map(({ kind }) => kind), [
    'subscription-retrieve',
    'subscription-retrieve',
    'refund-list',
    'subscription-retrieve',
  ]);
});

test('a reactivation renewed during refund is not canceled behind an unrefunded invoice', async () => {
  const active = vipSubscription('active');
  const renewed = {
    ...active,
    latest_invoice: 'in_new',
    current_period_start: active.current_period_end,
    current_period_end: active.current_period_end + 2_592_000,
  };
  const harness = makeHarness({
    snapshots: [active, active, active, renewed],
    withAdmittingClaim: false,
    withPaymentContext: false,
    projectionConflict: true,
    initialSubscription: {
      id: 'ledger-row-exact',
      user_id: USER_ID,
      stripe_subscription_id: SUBSCRIPTION_ID,
      stripe_customer_id: CUSTOMER_ID,
      tier: 'monthly',
      status: 'canceled',
    },
  });

  await assert.rejects(
    harness.handleStripeSubscriptionEvent(SUBSCRIPTION_ID, {
      triggerInvoice: paidTriggerInvoice(),
    }),
    /exact paid trigger invoice/,
  );
  assert.deepEqual(harness.providerMutations.map(({ kind }) => kind), ['refund-create']);
});

test('every stored Checkout Session claim fails closed before admission on missing or mismatched discovery', async (t) => {
  for (const [name, withPaymentContext] of [
    ['missing', false],
    ['mismatched', true],
  ]) {
    await t.test(name, async () => {
      const active = vipSubscription('active');
      const harness = makeHarness({
        snapshots: [active],
        withAdmittingClaim: false,
        withPaymentContext,
        initialClaim: {
          request_id: REQUEST_ID,
          intent_hash: INTENT_HASH,
          state: 'open',
          session_id: 'cs_other',
        },
      });

      await assert.rejects(
        harness.handleStripeSubscriptionEvent(SUBSCRIPTION_ID),
        /claimed Checkout Session/,
      );
      assert.deepEqual(harness.rpcCalls, []);
      assert.deepEqual(harness.databaseMutations, []);
      assert.deepEqual(harness.providerMutations, []);
    });
  }
});
