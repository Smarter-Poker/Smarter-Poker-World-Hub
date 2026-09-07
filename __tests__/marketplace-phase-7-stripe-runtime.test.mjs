import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import stripeRuntimeMode from '../src/lib/store/stripeRuntimeMode.js';

const {
  inspectStripeRuntime,
  isProductionRuntime,
  stripeEventModeAllowed,
  stripeKeyMode,
  stripeWebhookSecretConfigured,
} = stripeRuntimeMode;
const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const LIVE_ENV = Object.freeze({
  VERCEL_ENV: 'production',
  STRIPE_SECRET_KEY: 'sk_live_server',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_browser',
  STRIPE_WEBHOOK_SECRET: 'whsec_productionfixture1234',
});

test('Stripe key modes accept only structurally matched live or test keys', () => {
  assert.equal(stripeKeyMode('sk_live_server', 'sk'), 'live');
  assert.equal(stripeKeyMode('pk_test_browser', 'pk'), 'test');
  assert.equal(stripeKeyMode('rk_live_restricted', 'sk'), null);
  assert.equal(stripeKeyMode('sk_live', 'sk'), null);
  assert.equal(stripeKeyMode('sk_live_', 'sk'), null);
  assert.equal(stripeKeyMode('sk_live_server value', 'sk'), null);
  assert.equal(stripeKeyMode('', 'sk'), null);
});

test('Stripe webhook readiness rejects nonempty placeholders and malformed secrets', () => {
  assert.equal(stripeWebhookSecretConfigured('whsec_productionfixture1234'), true);
  assert.equal(stripeWebhookSecretConfigured('  whsec_productionfixture1234  '), true);
  for (const secret of [
    '',
    'wrong',
    'whsec_wrong',
    'whsec_',
    'whsec_contains-a-dash-and-is-long',
    'whsec_contains a space and is long',
  ]) {
    assert.equal(stripeWebhookSecretConfigured(secret), false, secret);
  }
});

test('production is identified from Vercel or a fail-closed Node runtime', () => {
  assert.equal(isProductionRuntime({ VERCEL_ENV: 'production' }), true);
  assert.equal(isProductionRuntime({ NODE_ENV: 'production' }), true);
  assert.equal(isProductionRuntime({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }), false);
  assert.equal(isProductionRuntime({ VERCEL_ENV: 'development', NODE_ENV: 'production' }), false);
  assert.equal(isProductionRuntime({ VERCEL_ENV: 'unexpected', NODE_ENV: 'production' }), true);
});

test('production Stripe mutations require matching live keys and settlement configuration', () => {
  assert.equal(inspectStripeRuntime(LIVE_ENV, {
    requirePublishable: true,
    requireWebhook: true,
  }).ready, true);

  for (const env of [
    { ...LIVE_ENV, STRIPE_SECRET_KEY: 'sk_test_server', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_browser' },
    { ...LIVE_ENV, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_browser' },
    { ...LIVE_ENV, STRIPE_SECRET_KEY: 'invalid' },
    { ...LIVE_ENV, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '' },
    { ...LIVE_ENV, STRIPE_WEBHOOK_SECRET: '' },
    { ...LIVE_ENV, STRIPE_WEBHOOK_SECRET: '   ' },
    { ...LIVE_ENV, STRIPE_WEBHOOK_SECRET: 'wrong' },
    { ...LIVE_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_wrong' },
    { ...LIVE_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_contains-a-dash-and-is-long' },
  ]) {
    assert.equal(inspectStripeRuntime(env, {
      requirePublishable: true,
      requireWebhook: true,
    }).ready, false);
  }
});

test('preview may use matching test keys while mismatched modes still fail', () => {
  assert.equal(inspectStripeRuntime({
    VERCEL_ENV: 'preview',
    STRIPE_SECRET_KEY: 'sk_test_server',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_browser',
  }).ready, true);
  assert.equal(inspectStripeRuntime({
    VERCEL_ENV: 'preview',
    STRIPE_SECRET_KEY: 'sk_test_server',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_browser',
  }).ready, false);
});

test('production webhook settlement accepts only live Stripe events', () => {
  assert.equal(stripeEventModeAllowed({ livemode: true }, LIVE_ENV), true);
  assert.equal(stripeEventModeAllowed({ livemode: false }, LIVE_ENV), false);
  assert.equal(stripeEventModeAllowed({}, LIVE_ENV), false);
  assert.equal(stripeEventModeAllowed({ livemode: false }, { VERCEL_ENV: 'preview' }), true);
});

test('every Stripe-backed Marketplace mutation and read shares the runtime mode gate', async () => {
  const [checkout, webhook, readiness, switchVip, cancelVip, checkoutStatus, diamondVip] = await Promise.all([
    read('pages/api/store/create-checkout-session.js'),
    read('pages/api/store/webhooks/stripe.js'),
    read('src/lib/store/marketplaceReadiness.js'),
    read('pages/api/store/switch-vip-plan.js'),
    read('pages/api/store/cancel-vip.js'),
    read('pages/api/store/checkout-status.js'),
    read('pages/api/store/purchase-vip-with-diamonds.js'),
  ]);
  assert.match(checkout, /inspectStripeRuntime\(process\.env/);
  assert.match(checkout, /requireWebhook: isProductionRuntime\(process\.env\)/);
  assert.match(webhook, /inspectStripeRuntime\(process\.env/);
  assert.match(webhook, /stripeEventModeAllowed\(event, process\.env\)/);
  assert.match(readiness, /inspectStripeRuntime\(env/);
  for (const route of [switchVip, cancelVip, checkoutStatus, diamondVip]) {
    assert.match(route, /inspectStripeRuntime\(process\.env/);
  }
});
