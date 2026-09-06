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
      '/api/store/checkout-status',
      '/api/store/purchase-vip-with-diamonds',
      '/api/club-arena/marketplace-purchase',
    ],
    'pages/hub/memory-games.js': ['/api/store/create-checkout-session'],
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
  assert.match(helper, /response\.clone\(\)\.arrayBuffer\(\)/);
  assert.match(helper, /Promise\.race\(\[request, deadline\]\)/);
  assert.match(helper, /requestImpl = fetch/);
  assert.match(helper, /clearTimeout\(timer\)/);
  assert.match(helper, /removeEventListener\?\.\('abort'/);

  const memoryGames = read('pages/hub/memory-games.js');
  assert.match(memoryGames, /getOrCreateCommerceRequestId\(commerceIntent\)/);
  assert.match(memoryGames, /X-Checkout-Request-ID': checkoutRequestId/);
  assert.match(memoryGames, /COMMERCE_REQUEST_TIMEOUT_MS,\s*authedFetch/);
  assert.match(memoryGames, /vipCheckoutAbortRef\.current/);
  assert.doesNotMatch(memoryGames, /preflop-vip-\$\{crypto\.randomUUID\(\)\}/);
});

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function responseWithDrain(drain, payload = { success: true }) {
  return {
    ok: true,
    status: 200,
    clone: () => ({ arrayBuffer: drain }),
    json: async () => payload,
  };
}

async function loadBoundedFetch(fetchImpl) {
  const context = vm.createContext({
    AbortController,
    Error,
    clearTimeout,
    setTimeout,
    fetch: fetchImpl,
  });
  const module = new vm.SourceTextModule(read('src/lib/store/boundedCommerceFetch.js'), { context });
  await module.link(() => {});
  await module.evaluate();
  return module.namespace.boundedCommerceFetch;
}

test('bounded commerce requests time out while response headers are stalled', async () => {
  const boundedCommerceFetch = await loadBoundedFetch((_input, init) => (
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        reject(abortError());
      }, { once: true });
    })
  ));

  await assert.rejects(
    boundedCommerceFetch('/headers-timeout', {}, 10),
    (error) => error?.code === 'COMMERCE_REQUEST_TIMEOUT'
  );
});

test('bounded commerce requests keep the deadline active through a stalled body', async () => {
  const boundedCommerceFetch = await loadBoundedFetch(async (_input, init) => (
    responseWithDrain(() => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(abortError()), { once: true });
    }))
  ));

  await assert.rejects(
    boundedCommerceFetch('/body-timeout', {}, 10),
    (error) => error?.name === 'CommerceTimeoutError'
      && error?.code === 'COMMERCE_REQUEST_TIMEOUT'
  );
});

test('bounded commerce requests preserve the original readable response after a full-body drain', async () => {
  let bodyDrained = false;
  let defaultFetchCalled = false;
  const response = responseWithDrain(async () => {
    bodyDrained = true;
    return new ArrayBuffer(0);
  }, { success: true, data: { url: '/checkout' } });
  const boundedCommerceFetch = await loadBoundedFetch(() => {
    defaultFetchCalled = true;
    throw new Error('default fetch should not run');
  });

  const returned = await boundedCommerceFetch(
    '/success',
    {},
    100,
    async () => response
  );
  assert.equal(defaultFetchCalled, false);
  assert.equal(bodyDrained, true);
  assert.equal(returned, response);
  assert.deepEqual(await returned.json(), { success: true, data: { url: '/checkout' } });
});

test('bounded commerce requests distinguish caller cancellation during body transfer from timeout', async () => {
  let markBodyStarted;
  const bodyStarted = new Promise((resolve) => { markBodyStarted = resolve; });
  const boundedCommerceFetch = await loadBoundedFetch(async (_input, init) => (
    responseWithDrain(() => new Promise((_resolve, reject) => {
      markBodyStarted();
      init.signal.addEventListener('abort', () => reject(abortError()), { once: true });
    }))
  ));

  const caller = new AbortController();
  const request = boundedCommerceFetch('/cancelled', { signal: caller.signal }, 1000);
  await bodyStarted;
  caller.abort();
  await assert.rejects(
    request,
    (error) => error?.name === 'AbortError' && error?.code !== 'COMMERCE_REQUEST_TIMEOUT'
  );
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
