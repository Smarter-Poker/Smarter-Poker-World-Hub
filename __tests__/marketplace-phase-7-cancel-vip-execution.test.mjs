import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROUTE_PATH = new URL('../pages/api/store/cancel-vip.js', import.meta.url);
const routeSource = await readFile(ROUTE_PATH, 'utf8');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = 'cus_exact';
const SUBSCRIPTION_ID = 'sub_exact';
const BLOCKING_STATUSES = Object.freeze([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

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
  environment = {},
  live = stripeSubscription(),
  localSubscription = {
    stripe_subscription_id: SUBSCRIPTION_ID,
    stripe_customer_id: CUSTOMER_ID,
    status: 'active',
  },
  profile = { stripe_customer_id: CUSTOMER_ID },
  projectionError = null,
  projectionResult = undefined,
  telemetryError = null,
  updateBehavior = null,
  updated = undefined,
} = {}) {
  let providerSubscription = structuredClone(live);
  const calls = {
    databaseReads: [],
    localUpdates: [],
    retrieves: [],
    runtimeInspections: [],
    telemetryUpdates: [],
    updates: [],
  };

  const supabase = {
    from(table) {
      const state = {
        equals: [],
        included: [],
        operation: 'read',
        patch: null,
        selected: null,
        table,
      };
      const query = {
        select(columns) { state.selected = columns; return query; },
        update(patch) {
          state.operation = 'update';
          state.patch = structuredClone(patch);
          return query;
        },
        eq(column, value) { state.equals.push([column, value]); return query; },
        in(column, values) { state.included.push([column, structuredClone(values)]); return query; },
        order() { return query; },
        limit() { return query; },
        async maybeSingle() {
          if (state.operation === 'update') {
            calls.localUpdates.push(structuredClone(state));
            if (projectionError) return { data: null, error: projectionError };
            const data = projectionResult === undefined
              ? {
                  stripe_subscription_id: SUBSCRIPTION_ID,
                  cancel_at_period_end: true,
                }
              : projectionResult;
            return { data: structuredClone(data), error: null };
          }

          calls.databaseReads.push(structuredClone(state));
          if (table === 'vip_subscriptions') {
            return { data: structuredClone(localSubscription), error: null };
          }
          if (table === 'profiles') return { data: structuredClone(profile), error: null };
          throw new Error(`unexpected maybeSingle table ${table}`);
        },
        then(resolve, reject) {
          if (state.operation !== 'update') {
            return Promise.reject(new Error(`unexpected awaited query for ${table}`)).then(resolve, reject);
          }
          calls.telemetryUpdates.push(structuredClone(state));
          return Promise.resolve({ data: null, error: telemetryError }).then(resolve, reject);
        },
      };
      return query;
    },
  };

  const stripe = {
    subscriptions: {
      async retrieve(subscriptionId, params) {
        calls.retrieves.push({ subscriptionId, params: structuredClone(params) });
        return structuredClone(providerSubscription);
      },
      async update(subscriptionId, params, options) {
        const call = {
          subscriptionId,
          params: structuredClone(params),
          options: structuredClone(options),
        };
        calls.updates.push(call);
        if (updateBehavior) {
          return updateBehavior({
            call,
            getProvider: () => structuredClone(providerSubscription),
            setProvider: (next) => { providerSubscription = structuredClone(next); },
          });
        }
        if (updated !== undefined) return structuredClone(updated);
        providerSubscription = {
          ...providerSubscription,
          cancel_at_period_end: true,
          ...(params.metadata ? { metadata: params.metadata } : {}),
        };
        return structuredClone(providerSubscription);
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
        ...environment,
      },
    },
    require(specifier) {
      assert.equal(specifier, '../../../src/lib/store/stripeRuntimeMode');
      return {
        inspectStripeRuntime: (env, options) => {
          calls.runtimeInspections.push({
            options: structuredClone(options),
            stripeSecretKey: env.STRIPE_SECRET_KEY,
            stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
            vercelEnvironment: env.VERCEL_ENV,
          });
          return { ready: true };
        },
      };
    },
    structuredClone,
  });
  const dependencies = {
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: () => true,
      LIMITS: { write: {} },
    },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null }),
    },
    '../../../src/lib/store/vipPurchaseGuards.mjs': {
      BLOCKING_RECURRING_VIP_STATUSES: BLOCKING_STATUSES,
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => supabase },
    stripe: { default: Stripe },
  };
  const module = new vm.SourceTextModule(routeSource, {
    context,
    identifier: 'cancel-vip.js',
  });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();

  async function request(key = 'cancel-request-1') {
    const req = {
      body: { reason: 'not_using', reasonText: 'Taking a break' },
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

test('a missing or malformed Stripe subscription reference fails closed without local success', async () => {
  for (const stripeSubscriptionId of [null, '', 'cus_wrong_object']) {
    const { calls, request } = await loadHarness({
      localSubscription: {
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: CUSTOMER_ID,
        status: 'active',
      },
    });
    const response = await request();

    assert.equal(response.statusCode, 409, String(stripeSubscriptionId));
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'VIP_SUBSCRIPTION_REFERENCE_MISSING');
    assert.equal(calls.retrieves.length, 0);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.localUpdates.length, 0);
  }
});

test('the local and provider customer must both match the authenticated profile owner', async () => {
  const scenarios = [
    {
      localSubscription: {
        stripe_subscription_id: SUBSCRIPTION_ID,
        stripe_customer_id: 'cus_other',
        status: 'active',
      },
      live: stripeSubscription(),
      expectedRetrieves: 0,
    },
    {
      localSubscription: {
        stripe_subscription_id: SUBSCRIPTION_ID,
        stripe_customer_id: CUSTOMER_ID,
        status: 'active',
      },
      live: stripeSubscription('monthly', { customer: 'cus_other' }),
      expectedRetrieves: 1,
    },
  ];

  for (const scenario of scenarios) {
    const { calls, request } = await loadHarness(scenario);
    const response = await request();
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'VIP_SUBSCRIPTION_OWNERSHIP_MISMATCH');
    assert.equal(calls.retrieves.length, scenario.expectedRetrieves);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.localUpdates.length, 0);
  }
});

test('missing authoritative profile billing ownership is retryable and never mutates Stripe', async () => {
  const { calls, request } = await loadHarness({ profile: { stripe_customer_id: null } });
  const response = await request();

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.retryable, true);
  assert.equal(response.body.code, 'VIP_SUBSCRIPTION_OWNERSHIP_UNAVAILABLE');
  assert.equal(calls.retrieves.length, 0);
  assert.equal(calls.updates.length, 0);
});

test('only an exact VIP subscription for this user can be canceled', async () => {
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
    const response = await request();
    assert.equal(response.statusCode, 409, JSON.stringify(metadata));
    assert.equal(response.body.code, 'VIP_SUBSCRIPTION_CONTRACT_MISMATCH');
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.localUpdates.length, 0);
  }
});

test('current offer anomalies never strand an authorized member on recurring billing', async () => {
  const monthly = stripeSubscription();
  const item = monthly.items.data[0];
  const grandfatheredItems = [
    [{ ...item, price: { ...item.price, active: false } }],
    [],
    [item, { ...item, id: 'si_second' }],
    [{ ...item, quantity: 2 }],
    [{ ...item, price: { ...item.price, currency: 'eur' } }],
    [{ ...item, price: { ...item.price, unit_amount: 1 } }],
    [{ ...item, price: { ...item.price, recurring: { ...item.price.recurring, interval: 'year' } } }],
  ];

  for (const data of grandfatheredItems) {
    const { calls, request } = await loadHarness({
      live: stripeSubscription('monthly', { items: { data } }),
    });
    const response = await request();
    assert.equal(response.statusCode, 200, JSON.stringify(data));
    assert.equal(response.body.success, true, JSON.stringify(data));
    assert.equal(response.body.cancelAtPeriodEnd, true, JSON.stringify(data));
    assert.equal(calls.updates.length, 1, JSON.stringify(data));
    assert.equal(calls.localUpdates.length, 1, JSON.stringify(data));
  }
});

test('an already scheduled live cancellation replays idempotently after exact validation', async () => {
  const archived = stripeSubscription('monthly');
  archived.items.data[0].price.active = false;
  const { calls, request } = await loadHarness({
    live: { ...archived, cancel_at_period_end: true },
  });
  const response = await request('cancel-request-replay');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.idempotent, true);
  assert.equal(response.body.cancelAtPeriodEnd, true);
  assert.equal(response.body.reconciliationPending, false);
  assert.equal(calls.retrieves.length, 1);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.localUpdates.length, 1);
});

test('every nonterminal obligation that blocks repurchase remains cancellable', async () => {
  for (const status of BLOCKING_STATUSES) {
    const { calls, request } = await loadHarness({
      live: stripeSubscription('monthly', { status }),
      localSubscription: {
        stripe_subscription_id: SUBSCRIPTION_ID,
        stripe_customer_id: CUSTOMER_ID,
        status,
      },
    });
    const response = await request(`cancel-request-${status}`);

    assert.equal(response.statusCode, 200, status);
    assert.equal(response.body.success, true, status);
    assert.equal(response.body.status, status);
    assert.equal(calls.updates.length, 1, status);
    assert.deepEqual(
      calls.databaseReads[0].included,
      [['status', BLOCKING_STATUSES]],
      status
    );
    assert.deepEqual(
      calls.localUpdates[0].included,
      [['status', BLOCKING_STATUSES]],
      status
    );
  }
});

test('a new cancellation uses the exact request key and succeeds only after provider confirmation', async () => {
  const { calls, request } = await loadHarness();
  const response = await request('cancel-request-exact');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.idempotent, false);
  assert.equal(response.body.cancelAtPeriodEnd, true);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].subscriptionId, SUBSCRIPTION_ID);
  assert.deepEqual(calls.updates[0].params, { cancel_at_period_end: true });
  assert.equal(
    calls.updates[0].options.idempotencyKey,
    `vip-cancel:${USER_ID}:cancel-request-exact`
  );
  assert.equal(calls.localUpdates.length, 1);
  assert.equal(calls.telemetryUpdates.length, 1);
});

test('production cancellation never depends on a missing or malformed webhook secret', async () => {
  for (const stripeWebhookSecret of [undefined, 'not-a-webhook-secret']) {
    const { calls, request } = await loadHarness({
      environment: {
        NODE_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_live_exact',
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
        VERCEL_ENV: 'production',
      },
    });

    const response = await request(`cancel-production-${stripeWebhookSecret ? 'malformed' : 'missing'}`);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.runtimeInspections.length, 1);
    assert.equal(calls.runtimeInspections[0].vercelEnvironment, 'production');
    assert.equal(calls.runtimeInspections[0].stripeSecretKey, 'sk_live_exact');
    assert.equal(calls.runtimeInspections[0].stripeWebhookSecret, stripeWebhookSecret);
    assert.deepEqual(calls.runtimeInspections[0].options, {
      requirePublishable: false,
      requireWebhook: false,
    });
  }
});

test('provider cancellation is not coupled to Stripe metadata capacity', async () => {
  const metadata = Object.fromEntries(
    Array.from({ length: 47 }, (_, index) => [`legacy_${index}`, `value_${index}`])
  );
  Object.assign(metadata, {
    type: 'subscription',
    user_id: USER_ID,
    vip_tier: 'monthly',
  });
  assert.equal(Object.keys(metadata).length, 50);

  const { calls, request } = await loadHarness({
    live: stripeSubscription('monthly', { metadata }),
  });
  const response = await request('cancel-metadata-cap');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(calls.updates[0].params, { cancel_at_period_end: true });
  assert.equal('metadata' in calls.updates[0].params, false);
});

test('an ambiguous Stripe commit becomes a verified same-key idempotent retry', async () => {
  let firstAttempt = true;
  const { calls, request } = await loadHarness({
    updateBehavior: ({ call, getProvider, setProvider }) => {
      const committed = {
        ...getProvider(),
        cancel_at_period_end: true,
        ...(call.params.metadata ? { metadata: call.params.metadata } : {}),
      };
      setProvider(committed);
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error('connection closed after request body was sent');
      }
      return committed;
    },
  });

  const first = await request('cancel-request-ambiguous');
  assert.equal(first.statusCode, 503);
  assert.equal(first.body.success, false);
  assert.equal(first.body.retryable, true);
  assert.equal(first.body.reconciliationPending, true);
  assert.equal(first.body.code, 'VIP_CANCELLATION_RECONCILIATION_PENDING');
  assert.equal(calls.localUpdates.length, 0);

  const retry = await request('cancel-request-ambiguous');
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.success, true);
  assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.cancelAtPeriodEnd, true);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.retrieves.length, 2);
  assert.equal(calls.localUpdates.length, 1);
});

test('an unconfirmed Stripe update result never produces cancellation success or a local write', async () => {
  const exact = stripeSubscription('monthly', { cancel_at_period_end: true });
  const unconfirmedResults = [
    stripeSubscription('monthly', { cancel_at_period_end: false }),
    { ...exact, id: 'sub_other' },
    { ...exact, customer: 'cus_other' },
    { ...exact, metadata: { ...exact.metadata, user_id: 'another-user' } },
  ];

  for (const updated of unconfirmedResults) {
    const { calls, request } = await loadHarness({ updated });
    const response = await request();

    assert.equal(calls.updates.length, 1);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.reconciliationPending, true);
    assert.equal(response.body.retryable, true);
    assert.equal(response.body.code, 'VIP_CANCELLATION_RECONCILIATION_PENDING');
    assert.equal(calls.localUpdates.length, 0);
  }
});

test('a zero-row local projection is surfaced without denying the confirmed provider cancellation', async () => {
  const { calls, request } = await loadHarness({ projectionResult: null });
  const response = await request();

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.localUpdates.length, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.cancelAtPeriodEnd, true);
  assert.equal(response.body.reconciliationPending, true);
  assert.match(response.body.message, /Membership Telemetry Is Refreshing/);
});

test('user-facing cancellation errors stay Title Case and source contains no U+2014', () => {
  assert.doesNotMatch(routeSource, /\u2014/);
  const errorLiterals = [...routeSource.matchAll(/\berror:\s+'([^'\n]+)'/g)].map((match) => match[1]);
  assert.ok(errorLiterals.length > 0);
  for (const message of errorLiterals) {
    const words = message.match(/[A-Za-z][A-Za-z-]*/g) || [];
    for (const word of words) {
      if (['A', 'An', 'And', 'At', 'Is', 'No', 'Not', 'Of', 'Or', 'The', 'This', 'To', 'Was', 'Your'].includes(word)) continue;
      assert.match(word, /^[A-Z]/, message);
    }
  }
});
