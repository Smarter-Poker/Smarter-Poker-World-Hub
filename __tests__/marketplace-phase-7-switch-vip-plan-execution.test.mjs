import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROUTE_PATH = new URL('../pages/api/store/switch-vip-plan.js', import.meta.url);
const routeSource = await readFile(ROUTE_PATH, 'utf8');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = 'cus_exact';
const SUBSCRIPTION_ID = 'sub_exact';

const PLANS = Object.freeze({
  monthly: Object.freeze({ amount: 1999, interval: 'month' }),
  yearly: Object.freeze({ amount: 19999, interval: 'year' }),
});

function stripeSubscription(tier = 'monthly', overrides = {}) {
  const contract = PLANS[tier];
  const base = {
    id: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    status: 'active',
    cancel_at_period_end: false,
    metadata: {
      type: 'subscription',
      user_id: USER_ID,
      vip_tier: tier,
      checkout_request_id: 'request-exact',
    },
    items: {
      data: [{
        id: 'si_exact',
        quantity: 1,
        price: {
          id: `price_${tier}`,
          active: true,
          type: 'recurring',
          currency: 'usd',
          billing_scheme: 'per_unit',
          transform_quantity: null,
          unit_amount: contract.amount,
          metadata: { sp_vip_tier: tier },
          recurring: {
            interval: contract.interval,
            interval_count: 1,
            usage_type: 'licensed',
          },
          product: 'prod_vip',
        },
      }],
    },
  };
  return {
    ...base,
    ...overrides,
    metadata: overrides.metadata === undefined ? base.metadata : overrides.metadata,
    items: overrides.items === undefined ? base.items : overrides.items,
  };
}

function responseRecorder() {
  return {
    body: null,
    headers: {},
    headersSent: false,
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadHarness({
  localTier = 'monthly',
  live = stripeSubscription('monthly'),
  profile = { stripe_customer_id: CUSTOMER_ID },
  updateBehavior = null,
  updateError = null,
  updated = undefined,
} = {}) {
  const calls = {
    auditRows: [],
    databaseReads: [],
    priceReads: [],
    retrieves: [],
    updates: [],
  };

  const supabase = {
    from(table) {
      const state = { table, equals: [], included: [] };
      const query = {
        select() { return query; },
        eq(column, value) { state.equals.push([column, value]); return query; },
        in(column, values) { state.included.push([column, values]); return query; },
        order() { return query; },
        limit() { return query; },
        async maybeSingle() {
          calls.databaseReads.push(structuredClone(state));
          if (table === 'vip_subscriptions') {
            return {
              data: {
                stripe_subscription_id: SUBSCRIPTION_ID,
                status: 'active',
                tier: localTier,
              },
              error: null,
            };
          }
          if (table === 'profiles') return { data: profile, error: null };
          throw new Error(`unexpected maybeSingle table ${table}`);
        },
        async insert(row) {
          assert.equal(table, 'vip_plan_switches');
          calls.auditRows.push(structuredClone(row));
          return { data: null, error: null };
        },
      };
      return query;
    },
  };

  const stripe = {
    subscriptions: {
      async retrieve(subscriptionId) {
        calls.retrieves.push(subscriptionId);
        return structuredClone(live);
      },
      async update(subscriptionId, params, options) {
        const call = {
          subscriptionId,
          params: structuredClone(params),
          options: structuredClone(options),
        };
        calls.updates.push(call);
        if (updateBehavior) return updateBehavior(call);
        if (updateError) throw updateError;
        if (updated !== undefined) return structuredClone(updated);
        const targetTier = params.metadata.vip_tier;
        return stripeSubscription(targetTier, { metadata: params.metadata });
      },
    },
    prices: {
      async retrieve(priceId) {
        calls.priceReads.push(priceId);
        throw new Error(`unexpected configured price read ${priceId}`);
      },
    },
    invoices: {
      async retrieveUpcoming() {
        return { total: 1500, next_payment_attempt: 1_800_000_000 };
      },
    },
  };

  function Stripe() { return stripe; }
  const context = vm.createContext({
    console: { info() {}, warn() {}, error() {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
        STRIPE_SECRET_KEY: 'sk_test_exact',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
      },
    },
    require(specifier) {
      assert.equal(specifier, '../../../src/lib/store/stripeRuntimeMode');
      return {
        inspectStripeRuntime: () => ({ ready: true }),
        isProductionRuntime: () => false,
      };
    },
    structuredClone,
  });
  const dependencies = {
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: () => true,
      LIMITS: { write: {} },
    },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null }),
    },
    '../../../src/lib/store/vipStripePrice.mjs': { vipStripePriceMismatch: () => null },
    '../../../src/lib/supabaseServerClient': { createClient: () => supabase },
    stripe: { default: Stripe },
  };
  const module = new vm.SourceTextModule(routeSource, {
    context,
    identifier: 'switch-vip-plan.js',
  });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();

  async function request(plan = 'monthly', key = 'switch-request-1') {
    const req = {
      body: { plan },
      headers: {
        authorization: 'Bearer token',
        'x-idempotency-key': key,
      },
      method: 'POST',
    };
    const res = responseRecorder();
    await module.namespace.default(req, res);
    return res;
  }

  return { calls, request };
}

test('an exact live target plan replays idempotently only after Stripe and ownership validation', async () => {
  const { calls, request } = await loadHarness({ localTier: 'monthly' });
  const response = await request('monthly');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.idempotent, true);
  assert.deepEqual(calls.retrieves, [SUBSCRIPTION_ID]);
  assert.equal(calls.updates.length, 0);
  assert.ok(calls.databaseReads.some((read) => read.table === 'profiles'));
});

test('a stale matching local tier cannot suppress a required live Stripe switch', async () => {
  const { calls, request } = await loadHarness({
    localTier: 'monthly',
    live: stripeSubscription('yearly'),
  });
  const response = await request('monthly', 'switch-request-2');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.idempotent, undefined);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].params.metadata.vip_tier, 'monthly');
  assert.equal(calls.updates[0].options.idempotencyKey, `vip-switch:${USER_ID}:switch-request-2`);
  assert.equal(calls.auditRows[0].from_tier, 'yearly');
  assert.equal(calls.auditRows[0].to_tier, 'monthly');
});

test('an archived current Stripe Price can switch to a currently sellable target', async () => {
  const archivedMonthly = stripeSubscription('monthly');
  archivedMonthly.items.data[0].price.active = false;
  const { calls, request } = await loadHarness({ live: archivedMonthly });

  const response = await request('yearly', 'switch-request-archived-current');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.tier, 'yearly');
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].params.metadata.vip_tier, 'yearly');
});

test('an exact target scheduled for cancellation is resumed before success is returned', async () => {
  const { calls, request } = await loadHarness({
    live: stripeSubscription('monthly', { cancel_at_period_end: true }),
  });

  const response = await request('monthly', 'switch-request-resume');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.notEqual(response.body.idempotent, true);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].params.cancel_at_period_end, false);
});

test('a post-update target that remains scheduled for cancellation is never reported as switched', async () => {
  const { calls, request } = await loadHarness({
    live: stripeSubscription('monthly'),
    updated: stripeSubscription('yearly', { cancel_at_period_end: true }),
  });

  const response = await request('yearly', 'switch-request-still-canceling');

  assert.equal(calls.updates.length, 1);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.reconciliationPending, true);
  assert.equal(response.body.code, 'VIP_PLAN_SWITCH_RECONCILIATION_PENDING');
});

test('a post-update target Price must remain active even when the archived current Price was accepted', async () => {
  const archivedMonthly = stripeSubscription('monthly');
  archivedMonthly.items.data[0].price.active = false;
  const archivedYearly = stripeSubscription('yearly');
  archivedYearly.items.data[0].price.active = false;
  const { calls, request } = await loadHarness({
    live: archivedMonthly,
    updated: archivedYearly,
  });

  const response = await request('yearly', 'switch-request-inactive-target');

  assert.equal(calls.updates.length, 1);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.reconciliationPending, true);
});

test('the live subscription must belong to the authoritative profile customer', async () => {
  const { calls, request } = await loadHarness({
    live: stripeSubscription('monthly', { customer: 'cus_attacker' }),
  });
  const response = await request('monthly');

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'VIP_SUBSCRIPTION_OWNERSHIP_MISMATCH');
  assert.equal(calls.updates.length, 0);
});

test('the live subscription must carry exact VIP authority metadata for the signed-in user', async () => {
  const malformedMetadata = [
    {},
    { type: 'commander', user_id: USER_ID, vip_tier: 'monthly' },
    { type: 'subscription', user_id: 'another-user', vip_tier: 'monthly' },
    { type: 'subscription', user_id: USER_ID, vip_tier: 'lifetime' },
    { type: 'subscription', user_id: USER_ID, vip_tier: 'monthly', venue_id: 'venue-1' },
  ];

  for (const metadata of malformedMetadata) {
    const { calls, request } = await loadHarness({
      live: stripeSubscription('monthly', { metadata }),
    });
    const response = await request('monthly');
    assert.equal(response.statusCode, 409, JSON.stringify(metadata));
    assert.equal(response.body.code, 'VIP_SUBSCRIPTION_CONTRACT_MISMATCH');
    assert.equal(calls.updates.length, 0);
  }
});

test('the current VIP offer must be a single quantity-one exact recurring USD item', async () => {
  const monthly = stripeSubscription('monthly');
  const item = monthly.items.data[0];
  const malformedItems = [
    [],
    [item, { ...item, id: 'si_second' }],
    [{ ...item, quantity: 2 }],
    [{ ...item, price: { ...item.price, currency: 'eur' } }],
    [{ ...item, price: { ...item.price, unit_amount: 1 } }],
    [{ ...item, price: { ...item.price, recurring: { ...item.price.recurring, interval: 'year' } } }],
    [{ ...item, price: { ...item.price, recurring: { ...item.price.recurring, interval_count: 2 } } }],
  ];

  for (const data of malformedItems) {
    const { calls, request } = await loadHarness({
      live: stripeSubscription('monthly', { items: { data } }),
    });
    const response = await request('monthly');
    assert.equal(response.statusCode, 409, JSON.stringify(data));
    assert.equal(response.body.code, 'VIP_SUBSCRIPTION_CONTRACT_MISMATCH');
    assert.equal(calls.updates.length, 0);
  }
});

test('the Stripe update result is post-validated before success is returned', async () => {
  const { calls, request } = await loadHarness({
    live: stripeSubscription('monthly'),
    updated: stripeSubscription('yearly', {
      customer: 'cus_wrong_after_update',
    }),
  });
  const response = await request('yearly');

  assert.equal(calls.updates.length, 1);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.reconciliationPending, true);
  assert.equal(response.body.retryable, true);
  assert.equal(response.body.code, 'VIP_PLAN_SWITCH_RECONCILIATION_PENDING');
  assert.equal(calls.auditRows.length, 0);
});

test('an ambiguous Stripe update failure is retryable and never claims no charge occurred', async () => {
  const { calls, request } = await loadHarness({
    live: stripeSubscription('monthly'),
    updateError: new Error('connection closed after request body was sent'),
  });
  const response = await request('yearly', 'switch-request-ambiguous');

  assert.equal(calls.updates.length, 1);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.reconciliationPending, true);
  assert.equal(response.body.retryable, true);
  assert.equal(response.body.code, 'VIP_PLAN_SWITCH_RECONCILIATION_PENDING');
  assert.doesNotMatch(JSON.stringify(response.body), /nothing was charged/i);
});

test('same-key commitless retries send byte-equivalent provider intent and idempotency identity', async () => {
  const { calls, request } = await loadHarness({
    live: stripeSubscription('monthly'),
    updateBehavior: () => {
      throw new Error('connection failed before provider commit');
    },
  });

  const first = await request('yearly', 'switch-request-stable-retry');
  const second = await request('yearly', 'switch-request-stable-retry');

  assert.equal(first.statusCode, 503);
  assert.equal(second.statusCode, 503);
  assert.equal(calls.updates.length, 2);
  assert.deepEqual(calls.updates[1], calls.updates[0]);
  assert.equal(JSON.stringify(calls.updates[1]), JSON.stringify(calls.updates[0]));
  assert.equal(
    calls.updates[0].options.idempotencyKey,
    `vip-switch:${USER_ID}:switch-request-stable-retry`
  );
  assert.equal(
    calls.updates[0].params.metadata.plan_switch_request_id,
    'switch-request-stable-retry'
  );
  assert.equal('plan_switched_at' in calls.updates[0].params.metadata, false);
});
