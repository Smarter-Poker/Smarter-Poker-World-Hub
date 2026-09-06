import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

const utilitySource = await read('src/lib/store/checkoutIntentStore.js');
const utility = await import(`data:text/javascript;base64,${Buffer.from(utilitySource).toString('base64')}`);

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    value(key) { return values.get(key); },
  };
}

function options(storage, overrides = {}) {
  return {
    scope: 'merch-diamonds-shirt',
    userId: 'user-a',
    paymentMethod: 'diamonds',
    intent: { productId: 'shirt', variantId: 'large', quantity: 1 },
    storage,
    now: 1_800_000_000_000,
    requestIdFactory: scope => `${scope}-request-00000001`,
    ...overrides,
  };
}

test('commerce request identity survives reload and ignores object key order', () => {
  const storage = memoryStorage();
  const first = utility.getOrCreateCommerceRequestId(options(storage));
  const second = utility.getOrCreateCommerceRequestId(options(storage, {
    intent: { quantity: 1, variantId: 'large', productId: 'shirt' },
    requestIdFactory: scope => `${scope}-request-00000002`,
  }));
  assert.equal(second, first);
  assert.match(storage.value(utility.commerceIntentStorage.key), /request-00000001/);
});

test('user, payment method, and exact intent are isolated financial identities', () => {
  const base = utility.commerceIntentIdentity(options(null));
  assert.notEqual(base, utility.commerceIntentIdentity(options(null, { userId: 'user-b' })));
  assert.notEqual(base, utility.commerceIntentIdentity(options(null, { paymentMethod: 'card' })));
  assert.notEqual(base, utility.commerceIntentIdentity(options(null, {
    intent: { productId: 'shirt', variantId: 'large', quantity: 2 },
  })));
});

test('a completed intent is cleared while unrelated recovery records survive', () => {
  const storage = memoryStorage();
  const firstOptions = options(storage);
  const otherOptions = options(storage, {
    scope: 'vip-monthly',
    intent: { plan: 'monthly' },
    requestIdFactory: scope => `${scope}-request-00000002`,
  });
  const first = utility.getOrCreateCommerceRequestId(firstOptions);
  const other = utility.getOrCreateCommerceRequestId(otherOptions);
  utility.clearCommerceRequestId(firstOptions);
  const replacement = utility.getOrCreateCommerceRequestId({
    ...firstOptions,
    requestIdFactory: scope => `${scope}-request-00000003`,
  });
  assert.notEqual(replacement, first);
  assert.equal(utility.getOrCreateCommerceRequestId(otherOptions), other);
});

test('card completion clears only the verified request and preserves another tab', () => {
  const storage = memoryStorage();
  const firstOptions = options(storage, {
    paymentMethod: 'card',
    requestIdFactory: scope => `${scope}-card-request-0001`,
  });
  const secondOptions = options(storage, {
    scope: 'diamonds-premium',
    paymentMethod: 'card',
    intent: { packageId: 'premium', quantity: 1 },
    requestIdFactory: scope => `${scope}-card-request-0002`,
  });
  const first = utility.getOrCreateCommerceRequestId(firstOptions);
  const second = utility.getOrCreateCommerceRequestId(secondOptions);
  utility.clearCommerceRequestById({
    userId: 'user-a',
    paymentMethod: 'card',
    requestId: first,
    storage,
    now: firstOptions.now,
  });
  assert.equal(utility.getOrCreateCommerceRequestId(secondOptions), second);
  assert.notEqual(utility.getOrCreateCommerceRequestId({
    ...firstOptions,
    requestIdFactory: scope => `${scope}-card-request-0003`,
  }), first);
});

test('corrupt, expired, and future-dated browser state fail safely', () => {
  const key = utility.commerceIntentStorage.key;
  const corrupt = memoryStorage({ [key]: '{bad json' });
  assert.doesNotThrow(() => utility.getOrCreateCommerceRequestId(options(corrupt)));

  const staleOptions = options(null, {
    scope: 'stale-intent',
    userId: 'stale-user',
  });
  const identity = utility.commerceIntentIdentity(staleOptions);
  const staleRecord = JSON.stringify({
    version: 1,
    records: [{
      identity,
      requestId: 'stale-request-00000001',
      userId: 'stale-user',
      paymentMethod: 'diamonds',
      createdAt: 1,
      lastUsedAt: 1,
    }],
  });
  const stale = memoryStorage({ [key]: staleRecord });
  const requestId = utility.getOrCreateCommerceRequestId({
    ...staleOptions,
    storage: stale,
    now: 1_800_000_000_000,
    requestIdFactory: scope => `${scope}-fresh-00000001`,
  });
  assert.match(requestId, /fresh-00000001$/);
});

test('every marketplace money surface reuses and clears durable client intents', async () => {
  const [storePage, cart, merch, clubDetail] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/hub/diamond-store/cart.js'),
    read('src/components/store/MerchStore.jsx'),
    read('pages/hub/club-shop/[itemId].js'),
  ]);
  for (const source of [storePage, cart, merch, clubDetail]) {
    assert.match(source, /getOrCreateCommerceRequestId/);
    assert.match(source, /clearCommerceRequest/);
    assert.doesNotMatch(source, /createCheckoutRequestId/);
  }
  assert.match(storePage, /paymentMethod: 'card'/);
  assert.match(storePage, /paymentMethod: 'diamonds'/);
  assert.match(cart, /type: payload\.type/);
  assert.match(merch, /pendingDiamondPurchase\.commerceIntent/);
  assert.match(clubDetail, /diamondCommerceIntent/);
});

test('anonymous financial requests authenticate before payload and idempotency validation', async () => {
  const [merchPurchase, clubPurchase] = await Promise.all([
    read('pages/api/store/purchase-with-diamonds.js'),
    read('pages/api/club-arena/marketplace-purchase.js'),
  ]);
  const merchAuth = merchPurchase.indexOf('getServerUserWithFallback(req, supabase)');
  assert.ok(merchAuth > -1);
  assert.ok(merchAuth < merchPurchase.indexOf('Buffer.byteLength(JSON.stringify(req.body || {})'));
  assert.ok(merchAuth < merchPurchase.indexOf('const clientKey = readPurchaseKey(req)'));

  const clubAuth = clubPurchase.indexOf('getServerUserWithFallback(req, supabase)');
  assert.ok(clubAuth > -1);
  assert.ok(clubAuth < clubPurchase.indexOf("const allowed = new Set(['clubId', 'itemId', 'expectedPrice'])"));
  assert.ok(clubAuth < clubPurchase.indexOf("const { clubId, itemId, expectedPrice } = req.body || {}"));
});

test('verified Stripe returns expose only the opaque request identity for exact cleanup', async () => {
  const [statusApi, storePage, clubDetail] = await Promise.all([
    read('pages/api/store/checkout-status.js'),
    read('pages/hub/diamond-store.js'),
    read('pages/hub/club-shop/[itemId].js'),
  ]);
  assert.match(statusApi, /requestId: session\.metadata\?\.checkout_request_id \|\| null/);
  assert.match(storePage, /clearCommerceRequestById/);
  assert.match(storePage, /checkoutReturn\.receipt\.requestId/);
  assert.match(clubDetail, /requestId: body\.data\.requestId/);
  assert.doesNotMatch(storePage, /clearCommerceRequests/);
});
