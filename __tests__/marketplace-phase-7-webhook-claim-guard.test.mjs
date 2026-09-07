import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const WEBHOOK_PATH = new URL('../pages/api/store/webhooks/stripe.js', import.meta.url);
const webhookSource = await readFile(WEBHOOK_PATH, 'utf8');
const handlerStart = webhookSource.indexOf('export default async function handler(');
const handlerEnd = webhookSource.indexOf('\nasync function handleCheckoutCompleted(', handlerStart);

assert.ok(handlerStart > -1 && handlerEnd > handlerStart,
  'the Stripe webhook handler must be extractable for execution testing');

const executableHandler = webhookSource
  .slice(handlerStart, handlerEnd)
  .replace('export default async function handler(', 'async function handler(');

function makeHarness({
  claimResult,
  completionResult = { data: null, error: null },
  eventLivemode,
  eventId = 'evt_claim_guard',
  production = false,
}) {
  const calls = [];
  const mutations = [];
  const event = {
    ...(eventId === null ? {} : { id: eventId }),
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_claim_guard' } },
    ...(eventLivemode === undefined ? {} : { livemode: eventLivemode }),
  };

  const supabase = {
    async rpc(name, args) {
      calls.push({ kind: 'rpc', name, args });
      if (name === 'claim_stripe_webhook_event') {
        if (claimResult instanceof Error) throw claimResult;
        return claimResult;
      }
      if (name === 'complete_stripe_webhook_event') {
        if (completionResult instanceof Error) throw completionResult;
        return completionResult;
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    from(table) {
      return {
        delete() {
          return {
            async eq(field, value) {
              calls.push({ kind: 'release', table, field, value });
              return { error: null };
            },
          };
        },
      };
    },
  };

  const context = {
    console: { info() {}, warn() {}, error() {} },
    getRawBody: async () => Buffer.from('{}'),
    getSupabase: () => supabase,
    inspectStripeRuntime: () => ({ ready: true }),
    handleCheckoutCompleted: async () => { mutations.push('checkout-completed'); },
    handleCheckoutExpired: async () => { mutations.push('checkout-expired'); },
    handleDispute: async () => { mutations.push('dispute'); },
    handleInvoicePaymentFailed: async () => { mutations.push('invoice-failed'); },
    handleInvoicePaymentSucceeded: async () => { mutations.push('invoice-succeeded'); },
    handleRefund: async () => { mutations.push('refund'); },
    handleStripeSubscriptionEvent: async () => { mutations.push('subscription'); },
    process: {
      env: {
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        ...(production ? { VERCEL_ENV: 'production' } : {}),
      },
    },
    reportApiError() {},
    STRIPE_EVENT_ID_PATTERN: /^evt_[A-Za-z0-9_]{6,255}$/,
    stripe: {
      webhooks: {
        constructEvent() {
          return structuredClone(event);
        },
      },
    },
    stripeEventModeAllowed: (candidate, env) => env.VERCEL_ENV !== 'production'
      || candidate?.livemode === true,
    structuredClone,
  };

  const handler = vm.runInNewContext(`${executableHandler}\nhandler`, context);
  const req = {
    method: 'POST',
    headers: { 'stripe-signature': 'signed' },
  };
  const res = {
    body: null,
    headersSent: false,
    statusCode: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = JSON.parse(JSON.stringify(body));
      this.headersSent = true;
      return this;
    },
  };

  return { calls, handler, mutations, req, res };
}

test('a production test-mode event is rejected before the claim or any mutation', async () => {
  const harness = makeHarness({
    claimResult: { data: { claimed: true, state: 'processing' }, error: null },
    eventLivemode: false,
    production: true,
  });

  await harness.handler(harness.req, harness.res);

  assert.equal(harness.res.statusCode, 400);
  assert.deepEqual(harness.res.body, { error: 'Webhook mode not accepted' });
  assert.deepEqual(harness.mutations, []);
  assert.deepEqual(harness.calls, []);
});

test('a signed event without a valid Stripe identity is rejected before mutation', async () => {
  const harness = makeHarness({
    claimResult: { data: { claimed: true, state: 'processing' }, error: null },
    eventId: null,
  });

  await harness.handler(harness.req, harness.res);

  assert.equal(harness.res.statusCode, 400);
  assert.deepEqual(harness.res.body, { error: 'Invalid webhook event' });
  assert.deepEqual(harness.mutations, []);
  assert.deepEqual(harness.calls, []);
});

test('claim errors fail closed before a paid-event handler can mutate state', async (t) => {
  await t.test('a returned database error responds with a retryable 503', async () => {
    const harness = makeHarness({
      claimResult: { data: null, error: new Error('claim database unavailable') },
    });

    await harness.handler(harness.req, harness.res);

    assert.equal(harness.res.statusCode, 503);
    assert.deepEqual(harness.res.body, { error: 'Webhook claim unavailable' });
    assert.deepEqual(harness.mutations, []);
    assert.deepEqual(harness.calls.map(({ name, kind }) => name || kind), [
      'claim_stripe_webhook_event',
    ]);
  });

  await t.test('a thrown database error responds with a retryable 503', async () => {
    const harness = makeHarness({ claimResult: new Error('claim transport unavailable') });

    await harness.handler(harness.req, harness.res);

    assert.equal(harness.res.statusCode, 503);
    assert.deepEqual(harness.mutations, []);
    assert.deepEqual(harness.calls.map(({ name, kind }) => name || kind), [
      'claim_stripe_webhook_event',
    ]);
  });
});

test('an unclaimed live event returns 409 without handler, completion, or release', async () => {
  const harness = makeHarness({
    claimResult: { data: { claimed: false, state: 'processing' }, error: null },
  });

  await harness.handler(harness.req, harness.res);

  assert.equal(harness.res.statusCode, 409);
  assert.deepEqual(harness.res.body, { received: false, processing: true });
  assert.deepEqual(harness.mutations, []);
  assert.deepEqual(harness.calls.map(({ name, kind }) => name || kind), [
    'claim_stripe_webhook_event',
  ]);
});

test('a completed duplicate returns 200 without handler, completion, or release', async () => {
  const harness = makeHarness({
    claimResult: { data: { claimed: false, state: 'done' }, error: null },
  });

  await harness.handler(harness.req, harness.res);

  assert.equal(harness.res.statusCode, 200);
  assert.deepEqual(harness.res.body, { received: true, duplicate: true });
  assert.deepEqual(harness.mutations, []);
  assert.deepEqual(harness.calls.map(({ name, kind }) => name || kind), [
    'claim_stripe_webhook_event',
  ]);
});

test('an acquired claim runs the handler and completes exactly once', async () => {
  const harness = makeHarness({
    claimResult: { data: { claimed: true, state: 'processing' }, error: null },
  });

  await harness.handler(harness.req, harness.res);

  assert.equal(harness.res.statusCode, 200);
  assert.deepEqual(harness.res.body, { received: true });
  assert.deepEqual(harness.mutations, ['checkout-completed']);
  assert.deepEqual(harness.calls.map(({ name, kind }) => name || kind), [
    'claim_stripe_webhook_event',
    'complete_stripe_webhook_event',
  ]);
});

test('explicit compatible completion results are accepted', async (t) => {
  for (const completion of [true, { completed: true }]) {
    await t.test(JSON.stringify(completion), async () => {
      const harness = makeHarness({
        claimResult: { data: { claimed: true, state: 'processing' }, error: null },
        completionResult: { data: completion, error: null },
      });

      await harness.handler(harness.req, harness.res);

      assert.equal(harness.res.statusCode, 200);
      assert.deepEqual(harness.mutations, ['checkout-completed']);
      assert.deepEqual(harness.calls.map(({ name, kind }) => name || kind), [
        'claim_stripe_webhook_event',
        'complete_stripe_webhook_event',
      ]);
    });
  }
});

test('unconfirmed completion results fail and release only the acquired claim', async (t) => {
  for (const completion of [false, { completed: false }]) {
    await t.test(JSON.stringify(completion), async () => {
      const harness = makeHarness({
        claimResult: { data: { claimed: true, state: 'processing' }, error: null },
        completionResult: { data: completion, error: null },
      });

      await harness.handler(harness.req, harness.res);

      assert.equal(harness.res.statusCode, 500);
      assert.deepEqual(harness.res.body, { error: 'Webhook handler failed' });
      assert.deepEqual(harness.mutations, ['checkout-completed']);
      assert.deepEqual(harness.calls.map(({ name, kind }) => name || kind), [
        'claim_stripe_webhook_event',
        'complete_stripe_webhook_event',
        'release',
      ]);
    });
  }
});
