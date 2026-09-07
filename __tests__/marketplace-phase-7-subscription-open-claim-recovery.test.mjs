import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const CHECKOUT_PATH = new URL('../pages/api/store/create-checkout-session.js', import.meta.url);
const checkoutSource = await readFile(CHECKOUT_PATH, 'utf8');

function loadStoredClaimClassifier() {
  const start = checkoutSource.indexOf('function classifyDurableSubscriptionClaimSession');
  const end = checkoutSource.indexOf('async function inspectDurableSubscriptionClaim', start);
  assert.ok(start > -1 && end > start, 'durable subscription claim classifier must exist');
  return vm.runInNewContext(
    `${checkoutSource.slice(start, end)}\nclassifyDurableSubscriptionClaimSession`
  );
}

test('a durable open claim returns only an exact Stripe-confirmed open Checkout Session', () => {
  const classify = loadStoredClaimClassifier();
  const claim = { session_id: 'cs_exact', session_url: 'https://stored.invalid' };
  const identity = {
    customerId: 'cus_exact',
    userId: 'user-exact',
    requestId: 'request-exact',
    intentHash: 'hash-exact',
  };
  const exact = {
    id: 'cs_exact',
    customer: 'cus_exact',
    mode: 'subscription',
    status: 'open',
    url: 'https://checkout.stripe.test/exact',
    metadata: {
      type: 'subscription',
      user_id: 'user-exact',
      checkout_request_id: 'request-exact',
      checkout_intent_hash: 'hash-exact',
    },
  };

  assert.equal(classify(exact, claim, identity), 'open');
  assert.equal(classify({ ...exact, id: 'cs_other' }, claim, identity), 'unknown');
  assert.equal(classify({ ...exact, customer: 'cus_other' }, claim, identity), 'unknown');
  assert.equal(classify({ ...exact, mode: 'payment' }, claim, identity), 'unknown');
  assert.equal(classify({ ...exact, url: null }, claim, identity), 'unknown');
  for (const field of ['type', 'user_id', 'checkout_request_id', 'checkout_intent_hash']) {
    assert.equal(classify({
      ...exact,
      metadata: { ...exact.metadata, [field]: 'wrong' },
    }, claim, identity), 'unknown', field);
  }
});

test('expired and complete exact sessions are terminal or reconciling, never reusable URLs', () => {
  const classify = loadStoredClaimClassifier();
  const claim = { session_id: 'cs_exact', session_url: 'https://stored.invalid' };
  const identity = {
    customerId: 'cus_exact',
    userId: 'user-exact',
    requestId: 'request-exact',
    intentHash: 'hash-exact',
  };
  const session = {
    id: 'cs_exact',
    customer: { id: 'cus_exact' },
    mode: 'subscription',
    url: 'https://checkout.stripe.test/exact',
    metadata: {
      type: 'subscription',
      user_id: 'user-exact',
      checkout_request_id: 'request-exact',
      checkout_intent_hash: 'hash-exact',
    },
  };

  assert.equal(classify({ ...session, status: 'expired' }, claim, identity), 'expired');
  assert.equal(classify({ ...session, status: 'complete' }, claim, identity), 'complete');
  assert.equal(classify({ ...session, status: null }, claim, identity), 'unknown');
  assert.equal(classify(null, claim, identity), 'unknown');
});

test('durable claim inspection retrieves the claimed session and quarantines provider errors', async () => {
  const helperStart = checkoutSource.indexOf('function classifyDurableSubscriptionClaimSession');
  const helperEnd = checkoutSource.indexOf('function classifyStoredCheckout', helperStart);
  assert.ok(helperStart > -1 && helperEnd > helperStart);

  const claim = { session_id: 'cs_exact' };
  const identity = {
    customerId: 'cus_exact',
    userId: 'user-exact',
    requestId: 'request-exact',
    intentHash: 'hash-exact',
  };
  const exact = {
    id: 'cs_exact',
    customer: 'cus_exact',
    mode: 'subscription',
    status: 'open',
    url: 'https://checkout.stripe.test/exact',
    metadata: {
      type: 'subscription',
      user_id: 'user-exact',
      checkout_request_id: 'request-exact',
      checkout_intent_hash: 'hash-exact',
    },
  };
  const retrieved = [];
  const stripe = {
    checkout: {
      sessions: {
        retrieve: async (sessionId) => {
          retrieved.push(sessionId);
          return exact;
        },
      },
    },
  };
  const inspect = vm.runInNewContext(
    `${checkoutSource.slice(helperStart, helperEnd)}\ninspectDurableSubscriptionClaim`,
    { stripe, console: { warn() {} } }
  );

  const verified = await inspect(claim, identity);
  assert.deepEqual(retrieved, ['cs_exact']);
  assert.equal(verified.state, 'open');
  assert.equal(verified.session.url, exact.url);

  stripe.checkout.sessions.retrieve = async () => {
    throw new Error('provider unavailable');
  };
  const unknown = await inspect(claim, identity);
  assert.equal(unknown.state, 'unknown');
  assert.equal(unknown.session, null);
});

test('open claim recovery retrieves Stripe authority and fails closed by state', () => {
  const inspectorStart = checkoutSource.indexOf('async function inspectDurableSubscriptionClaim');
  const claimStart = checkoutSource.indexOf("if (claim?.state === 'open')");
  const nextState = checkoutSource.indexOf("if (claim?.state === 'vip_entitlement_active')", claimStart);
  assert.ok(inspectorStart > -1 && claimStart > inspectorStart && nextState > claimStart);

  const inspector = checkoutSource.slice(inspectorStart, claimStart);
  const branch = checkoutSource.slice(claimStart, nextState);
  assert.match(inspector, /stripe\.checkout\.sessions\.retrieve\(claim\.session_id\)/);
  assert.match(branch, /inspection\.state === 'open'/);
  assert.match(branch, /url: inspection\.session\.url/);
  assert.doesNotMatch(branch, /url: claim\.session_url/);

  const expired = branch.indexOf("inspection.state === 'expired'");
  const release = branch.indexOf(".from('vip_subscription_checkout_claims')", expired);
  const terminal = branch.indexOf("code: 'CHECKOUT_EXPIRED'", release);
  assert.ok(expired > -1 && release > expired && terminal > release,
    'an exact expired session must release its claim before returning CHECKOUT_EXPIRED');
  const releaseBranch = branch.slice(release, terminal);
  assert.match(releaseBranch, /\.delete\(\)/);
  assert.match(releaseBranch, /\.eq\('request_id', checkoutRequestId\)/);
  assert.match(releaseBranch, /\.eq\('intent_hash', checkoutIntentHash\)/);
  assert.match(releaseBranch, /\.eq\('state', 'open'\)/);
  assert.match(releaseBranch, /\.eq\('session_id', inspection\.session\.id\)/);
  assert.match(releaseBranch, /releasedRows\?\.length !== 1/);
  assert.doesNotMatch(releaseBranch, /release_vip_subscription_checkout/);

  assert.match(branch, /inspection\.state === 'complete'/);
  assert.match(branch, /recoveryError\.checkoutRetryable = true/);
  assert.match(branch, /recoveryError\.preserveSubscriptionClaim = true/);
  assert.match(checkoutSource, /error\.checkoutRetryable \? 503 : 500/);
});
