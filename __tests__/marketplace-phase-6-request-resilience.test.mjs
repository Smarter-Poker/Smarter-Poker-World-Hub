import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

test('every Marketplace settlement request has a terminal browser deadline', () => {
  const surfaces = {
    'pages/hub/diamond-store.js': [
      '/api/store/create-checkout-session',
      '/api/store/purchase-vip-with-diamonds',
      '/api/club-arena/marketplace-purchase',
    ],
    'src/components/store/MerchStore.jsx': [
      '/api/store/create-checkout-session',
      '/api/store/purchase-with-diamonds',
    ],
    'pages/hub/club-shop/[itemId].js': [
      '/api/club-arena/marketplace-purchase',
      '/api/store/create-checkout-session',
      '/api/store/checkout-status',
    ],
    'pages/hub/diamond-store/cart.js': [
      '/api/store/create-checkout-session',
      '/api/store/purchase-with-diamonds',
    ],
    'src/components/store/DiamondWalletModal.jsx': ['/api/store/diamond-transfer'],
  };

  for (const [file, endpoints] of Object.entries(surfaces)) {
    const source = read(file);
    assert.match(source, /boundedCommerceFetch/, `${file} must use the bounded request helper`);
    for (const endpoint of endpoints) {
      const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        source,
        new RegExp(`boundedCommerceFetch\\([\\s\\n]*['"\`]${escaped}`),
        `${file} must bound ${endpoint}`
      );
      assert.doesNotMatch(
        source,
        new RegExp(`(?:await\\s+)?fetch\\([\\s\\n]*['"\`]${escaped}`),
        `${file} must not issue an unbounded ${endpoint} request`
      );
    }
  }

  const helper = read('src/lib/store/boundedCommerceFetch.js');
  assert.match(helper, /COMMERCE_REQUEST_TIMEOUT_MS = 20000/);
  assert.match(helper, /No Result Was Assumed\. Retry The Same Purchase\./);
  assert.match(helper, /controller\.abort\(\)/);
  assert.match(helper, /clearTimeout\(timer\)/);
  assert.match(helper, /removeEventListener\?\.\('abort'/);
});

test('bounded commerce requests distinguish timeout from caller cancellation', async () => {
  const context = vm.createContext({
    AbortController,
    Error,
    clearTimeout,
    setTimeout,
    fetch: (_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  const module = new vm.SourceTextModule(read('src/lib/store/boundedCommerceFetch.js'), { context });
  await module.link(() => {});
  await module.evaluate();

  await assert.rejects(
    module.namespace.boundedCommerceFetch('/timeout', {}, 5),
    (error) => error?.code === 'COMMERCE_REQUEST_TIMEOUT'
  );

  const caller = new AbortController();
  const request = module.namespace.boundedCommerceFetch('/cancelled', { signal: caller.signal }, 1000);
  caller.abort();
  await assert.rejects(request, (error) => error?.name === 'AbortError');
});

test('private Marketplace APIs reject caching on every response path', () => {
  const helper = read('src/lib/store/privateCommerceResponse.js');
  assert.match(helper, /private, no-store, max-age=0/);
  assert.match(helper, /Vary['"],\s*['"]Authorization/);

  const privateApis = [
    'pages/api/store/create-checkout-session.js',
    'pages/api/store/diamond-transactions.js',
    'pages/api/store/diamond-transfer.js',
    'pages/api/store/merch-order.js',
    'pages/api/store/purchase-vip-with-diamonds.js',
    'pages/api/store/purchase-with-diamonds.js',
    'pages/api/store/vip-membership-status.js',
    'pages/api/club-arena/manage-shop.js',
    'pages/api/club-arena/marketplace-items.js',
    'pages/api/club-arena/marketplace-purchase.js',
    'pages/api/club-arena/refund-purchase.js',
    'pages/api/club-arena/shop-analytics.js',
    'pages/api/club-arena/shop-items.js',
    'pages/api/club-arena/shop-purchases.js',
    'pages/api/rewards/progress.js',
  ];

  for (const file of privateApis) {
    const source = read(file);
    const handler = source.indexOf('export default async function handler');
    const privacy = source.indexOf('setPrivateCommerceResponse(res)', handler);
    const method = source.indexOf('req.method', handler);
    assert.ok(privacy > handler, `${file} must apply private response headers in its handler`);
    assert.ok(method < 0 || privacy < method, `${file} must set privacy before method validation`);
  }

  const verifier = read('scripts/verify-marketplace-deployment.mjs');
  assert.match(verifier, /missing_private_no_store/);
  assert.match(verifier, /missing_vary_authorization/);
  assert.match(verifier, /\/api\/store\/create-checkout-session/);
  assert.match(verifier, /\/api\/store\/diamond-transfer/);
  assert.match(verifier, /\/api\/club-arena\/marketplace-items/);
  assert.match(verifier, /\/api\/rewards\/progress/);

  const middleware = read('middleware.ts');
  const authGate = middleware.slice(middleware.indexOf('if (needsAuth)'));
  assert.match(authGate, /Cache-Control['"],\s*['"]private, no-store, max-age=0/);
  assert.match(authGate, /Vary['"],\s*['"]Authorization/);
});

test('purchase APIs validate bounded request shapes after authentication', () => {
  const checkout = read('pages/api/store/create-checkout-session.js');
  assert.match(checkout, /MAX_CHECKOUT_BODY_BYTES = 64 \* 1024/);
  assert.match(checkout, /CHECKOUT_BODY_FIELDS/);
  assert.match(checkout, /BODY_TOO_LARGE/);
  assert.match(checkout, /UNKNOWN_FIELDS/);
  assert.ok(checkout.indexOf('const bodyBytes') > checkout.indexOf('getServerUserWithFallback'));

  const vip = read('pages/api/store/purchase-vip-with-diamonds.js');
  assert.match(vip, /Buffer\.byteLength\(JSON\.stringify\(req\.body \|\| \{\}\), 'utf8'\) > 512/);
  assert.match(vip, /new Set\(\['plan', 'idempotencyKey'\]\)/);

  const merchandise = read('pages/api/store/purchase-with-diamonds.js');
  assert.match(merchandise, /new Set\(\['items', 'shipping'\]\)/);
  assert.match(merchandise, /Unknown fields:/);
});

test('reward and fulfillment subpages cancel stale reads and expose retryable timeouts', () => {
  const rewards = read('src/components/store/RewardTelemetryConsole.jsx');
  assert.match(rewards, /REWARD_TELEMETRY_TIMEOUT_MS = 20000/);
  assert.match(rewards, /requestRef\.current/);
  assert.match(rewards, /abortRef\.current\?\.abort\(\)/);
  assert.match(rewards, /signal: controller\.signal/);
  assert.match(rewards, /Reward Telemetry Timed Out/);

  const fulfillment = read('pages/hub/merch-store/fulfillment.js');
  assert.match(fulfillment, /loadAbortRef\.current\?\.abort\(\)/);
  assert.match(fulfillment, /signal: controller\.signal/);
  assert.match(fulfillment, /boundedCommerceFetch\(`\/api\/store\/fulfillment-operations/);
  assert.match(fulfillment, /boundedCommerceFetch\('\/api\/store\/fulfillment-operations'/);
  assert.match(fulfillment, /if \(requestId !== requestRef\.current\) return/);
});
