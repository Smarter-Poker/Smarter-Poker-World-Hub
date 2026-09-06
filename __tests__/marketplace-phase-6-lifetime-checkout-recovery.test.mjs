import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('Lifetime VIP derives one stable purchase row for every durable checkout request', async () => {
  const source = await read('pages/api/store/create-checkout-session.js');
  const start = source.indexOf('function deriveCheckoutRecordId');
  const end = source.indexOf('const UUID_RE', start);
  assert.ok(start > -1 && end > start, 'stable record ID helper must exist');

  const deriveCheckoutRecordId = vm.runInNewContext(
    `${source.slice(start, end)}\nderiveCheckoutRecordId`,
    { createHash }
  );
  const first = deriveCheckoutRecordId('vip_lifetime', 'user-1', 'vip-lifetime-request-123');
  const replay = deriveCheckoutRecordId('vip_lifetime', 'user-1', 'vip-lifetime-request-123');
  const other = deriveCheckoutRecordId('vip_lifetime', 'user-1', 'vip-lifetime-request-456');

  assert.equal(first, replay);
  assert.notEqual(first, other);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('Lifetime VIP recovery keeps ambiguous Stripe state and immediately links a recovered session', async () => {
  const source = await read('pages/api/store/create-checkout-session.js');

  assert.match(source, /\['diamonds', 'merchandise', 'vip_lifetime'\]\.includes\(type\)/);
  assert.match(source, /const lifetimeRecordId = deriveCheckoutRecordId\(/);
  assert.match(source, /insert\(\{[\s\S]*?id: lifetimeRecordId,[\s\S]*?checkout_request_id: checkoutRequestId/);
  assert.match(source, /isAmbiguousStripeCreateFailure\(sessionError\)[\s\S]*?sessionError\.checkoutRetryable = true/);
  assert.match(source, /from\('vip_lifetime_purchases'\)[\s\S]*?update\(\{ stripe_checkout_session_id: session\.id \}\)/);
  assert.match(source, /eq\('stripe_checkout_session_id', session\.id\)[\s\S]*?maybeSingle\(\)/);
  assert.match(source, /error\.checkoutRetryable \? 503 : 500/);
  assert.match(source, /code: error\.checkoutRetryable \? 'CHECKOUT_RECOVERY_PENDING'/);
});

test('Lifetime ownership blocks before a recovered URL and expired canceled rows remain resettable', async () => {
  const source = await read('pages/api/store/create-checkout-session.js');
  const classifierStart = source.indexOf('function classifyStoredCheckout');
  const ownershipStart = source.indexOf('function vipOwnershipError');
  const handlerStart = source.indexOf('export default async function handler');
  assert.ok(classifierStart > -1 && ownershipStart > classifierStart && handlerStart > ownershipStart);

  const classifyStoredCheckout = vm.runInNewContext(
    `${source.slice(classifierStart, ownershipStart)}\nclassifyStoredCheckout`
  );
  const vipOwnershipError = vm.runInNewContext(
    `${source.slice(ownershipStart, handlerStart)}\nvipOwnershipError`
  );
  const row = {
    id: 'order-1',
    status: 'canceled',
    stripe_checkout_session_id: 'cs_expired',
    metadata: { checkout_intent_hash: 'same' },
  };
  assert.deepEqual(
    { ...classifyStoredCheckout(row, 'same', { expired: true, sessionId: 'cs_expired' }) },
    { expired: true, sessionId: 'cs_expired' }
  );
  assert.deepEqual({ ...classifyStoredCheckout(row, 'same', { initializing: true }) }, { conflict: true });
  assert.equal(vipOwnershipError('merchandise', { vip_tier: 'lifetime' }), null);
  assert.equal(
    vipOwnershipError('vip_lifetime', { vip_tier: 'lifetime' }).code,
    'LIFETIME_VIP_ALREADY_OWNED'
  );

  const ownershipCall = source.indexOf('const ownershipError = vipOwnershipError', handlerStart);
  const recoveryCall = source.indexOf('const existingCheckout = await findExistingCheckout', handlerStart);
  assert.ok(ownershipCall > handlerStart && ownershipCall < recoveryCall,
    'Lifetime ownership must be evaluated before any recovered Checkout URL can return');
});

test('Lifetime card price and active-session database guards are fixed and reproducible', async () => {
  const source = await read('pages/api/store/create-checkout-session.js');
  const parityMigration = await read('supabase/migrations/20260905153833_vip_is_monthly_yearly_or_lifetime.sql');
  const guardMigration = await read('supabase/migrations/20260906150000_marketplace_phase6_lifetime_and_fulfillment_guards.sql');

  assert.match(source, /stripePrice\.currency !== 'usd'/);
  assert.match(source, /lifetimeUnitAmount !== 49900/);
  assert.match(source, /code: 'LIFETIME_CARD_CHECKOUT_PAUSED'/);
  assert.match(source, /type === 'subscription' \|\| type === 'vip_lifetime'/);
  assert.match(source, /findActiveLifetimeCheckout\(user\.id\)/);
  assert.match(parityMigration, /p_plan NOT IN \('monthly', 'yearly', 'lifetime'\)/);
  assert.match(parityMigration, /IF v_lifetime THEN[\s\S]*?v_expires := NULL/);
  assert.match(guardMigration, /vip_lifetime_purchases_one_active_per_user_uidx/);
  assert.match(guardMigration, /WHERE status IN \('pending', 'completed'\)/);
  assert.match(guardMigration, /REVOKE ALL PRIVILEGES ON TABLE public\.vip_lifetime_purchases/);
});

test('checkout configuration is private and evaluated only after authentication and request validation', async () => {
  const source = await read('pages/api/store/create-checkout-session.js');
  const auth = source.indexOf('getServerUserWithFallback(req, getSupabase())');
  const requestValidation = source.indexOf("if (type === 'subscription' && !checkoutRequestId)");
  const stripeReadiness = source.indexOf('const stripeSecretKey = process.env.STRIPE_SECRET_KEY');
  const catalogPreparation = source.indexOf('preparedCheckout = await prepareCheckout(type, items, {');

  assert.ok(auth > -1 && auth < stripeReadiness, 'authentication must precede Stripe readiness');
  assert.ok(requestValidation > auth && requestValidation < stripeReadiness,
    'request validation must precede Stripe readiness');
  assert.ok(stripeReadiness < catalogPreparation,
    'Stripe readiness must precede catalog/database side effects');
  assert.doesNotMatch(
    source.slice(stripeReadiness, catalogPreparation),
    /details:\s*['"]Stripe keys/,
    'configuration details must not be exposed to clients'
  );
});

test('Lifetime VIP browser retries preserve identity except after a definitively expired session', async () => {
  const source = await read('pages/hub/diamond-store.js');
  const start = source.indexOf('const startStripeCheckout = async');
  const end = source.indexOf('// Merchandise checkout lives', start);
  const branch = source.slice(start, end);

  assert.match(branch, /const commerceIntent = \{/);
  assert.match(branch, /getOrCreateCommerceRequestId\(commerceIntent\)/);
  assert.match(branch, /checkoutError\.code = data\?\.error\?\.code/);
  assert.match(branch, /error\?\.code === 'CHECKOUT_EXPIRED'/);
  assert.match(branch, /clearCommerceRequestId\(commerceIntent\)/);
  assert.doesNotMatch(
    branch.slice(0, branch.indexOf('} catch (error)')),
    /clearCommerceRequestId\(commerceIntent\)/,
    'an open session response must retain its identity until return reconciliation'
  );
});

test('every request-bound card surface releases only a definitively expired checkout identity', async () => {
  for (const file of [
    'pages/hub/diamond-store.js',
    'pages/hub/diamond-store/cart.js',
    'pages/hub/club-shop/[itemId].js',
    'src/components/store/MerchStore.jsx',
  ]) {
    const source = await read(file);
    assert.match(source, /CHECKOUT_EXPIRED/, `${file} must recognize an expired checkout`);
    assert.match(
      source,
      /clearCommerceRequestId\(commerceIntent\)/,
      `${file} must release the terminal request identity`
    );
  }
});
