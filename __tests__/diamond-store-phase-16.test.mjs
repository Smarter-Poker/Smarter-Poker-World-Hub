import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

const utilitySource = await read('src/lib/store/checkoutIntentStore.js');
const utility = await import(
  `data:text/javascript;base64,${Buffer.from(utilitySource).toString('base64')}`
);

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    value(key) {
      return values.get(key);
    },
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
    requestIdFactory: (scope) => `${scope}-request-00000001`,
    ...overrides,
  };
}

test('commerce request identity survives reload and ignores object key order', () => {
  const storage = memoryStorage();
  const first = utility.getOrCreateCommerceRequestId(options(storage));
  const second = utility.getOrCreateCommerceRequestId(
    options(storage, {
      intent: { quantity: 1, variantId: 'large', productId: 'shirt' },
      requestIdFactory: (scope) => `${scope}-request-00000002`,
    })
  );
  assert.equal(second, first);
  assert.match(storage.value(utility.commerceIntentStorage.key), /request-00000001/);
});

test('user, payment method, and exact intent are isolated financial identities', () => {
  const base = utility.commerceIntentIdentity(options(null));
  assert.notEqual(base, utility.commerceIntentIdentity(options(null, { userId: 'user-b' })));
  assert.notEqual(base, utility.commerceIntentIdentity(options(null, { paymentMethod: 'card' })));
  assert.notEqual(
    base,
    utility.commerceIntentIdentity(
      options(null, {
        intent: { productId: 'shirt', variantId: 'large', quantity: 2 },
      })
    )
  );
});

test('commerce recovery inspection is read-only and exposes an id only for exact current terms', () => {
  const storage = memoryStorage();
  const exactOptions = options(storage);
  const requestId = utility.getOrCreateCommerceRequestId(exactOptions);
  const beforeInspection = storage.value(utility.commerceIntentStorage.key);

  const exact = utility.inspectCommerceRequestRecovery(exactOptions);
  assert.equal(exact.status, 'recoverable');
  assert.equal(exact.requestId, requestId);
  assert.equal(storage.value(utility.commerceIntentStorage.key), beforeInspection);

  const changed = utility.inspectCommerceRequestRecovery(
    options(storage, {
      intent: { productId: 'shirt', variantId: 'large', quantity: 2 },
    })
  );
  assert.equal(changed.status, 'terms-changed');
  assert.equal(changed.requestId, null);

  const termsUnavailable = utility.inspectCommerceRequestRecovery({
    scope: exactOptions.scope,
    userId: exactOptions.userId,
    paymentMethod: exactOptions.paymentMethod,
    storage,
    now: exactOptions.now,
  });
  assert.equal(termsUnavailable.status, 'terms-unavailable');
  assert.equal(termsUnavailable.requestId, null);
  assert.equal(storage.value(utility.commerceIntentStorage.key), beforeInspection);
});

test('catalog-independent recovery listing stays account and rail scoped without exposing request ids', () => {
  const storage = memoryStorage();
  const entries = [
    options(storage, {
      scope: 'club-item-one',
      intent: { clubId: 'club-a', itemId: 'item-one', expectedPrice: 1200 },
      requestIdFactory: () => 'club-item-one-request-0001',
    }),
    options(storage, {
      scope: 'club-detail-item-two',
      intent: { clubId: 'club-a', itemId: 'item-two', expectedPrice: 900 },
      requestIdFactory: () => 'club-detail-request-00002',
    }),
    options(storage, {
      scope: 'club-item-three',
      userId: 'user-b',
      intent: { clubId: 'club-a', itemId: 'item-three', expectedPrice: 500 },
      requestIdFactory: () => 'club-item-three-request-003',
    }),
  ];
  entries.forEach((entry) => utility.getOrCreateCommerceRequestId(entry));
  const beforeInspection = storage.value(utility.commerceIntentStorage.key);

  const slots = utility.listCommerceRequestRecoverySlots({
    userId: 'user-a',
    paymentMethod: 'diamonds',
    scopePrefix: 'club-',
    storage,
    now: entries[0].now,
  });

  assert.deepEqual(
    slots.map((slot) => [slot.scope, slot.intent.itemId]),
    [
      ['club-detail-item-two', 'item-two'],
      ['club-item-one', 'item-one'],
    ]
  );
  assert.equal(Object.prototype.hasOwnProperty.call(slots[0], 'requestId'), false);
  assert.equal(storage.value(utility.commerceIntentStorage.key), beforeInspection);
});

test('a completed intent is cleared while unrelated recovery records survive', () => {
  const storage = memoryStorage();
  const firstOptions = options(storage);
  const otherOptions = options(storage, {
    scope: 'vip-monthly',
    intent: { plan: 'monthly' },
    requestIdFactory: (scope) => `${scope}-request-00000002`,
  });
  const first = utility.getOrCreateCommerceRequestId(firstOptions);
  const other = utility.getOrCreateCommerceRequestId(otherOptions);
  assert.equal(
    utility.clearCommerceRequestId({
      ...firstOptions,
      expectedRequestId: first,
    }),
    true
  );
  const replacement = utility.getOrCreateCommerceRequestId({
    ...firstOptions,
    requestIdFactory: (scope) => `${scope}-request-00000003`,
  });
  assert.notEqual(replacement, first);
  assert.equal(utility.getOrCreateCommerceRequestId(otherOptions), other);
});

test('a definitive refusal replaces one intent atomically and preserves unrelated records', () => {
  const storage = memoryStorage();
  const refusedOptions = options(storage);
  const otherOptions = options(storage, {
    scope: 'vip-monthly',
    intent: { plan: 'monthly' },
    requestIdFactory: (scope) => `${scope}-request-00000002`,
  });
  const refused = utility.getOrCreateCommerceRequestId(refusedOptions);
  const other = utility.getOrCreateCommerceRequestId(otherOptions);
  const replacement = utility.replaceCommerceRequestId({
    ...refusedOptions,
    expectedRequestId: refused,
    requestIdFactory: (scope) => `${scope}-request-00000003`,
  });
  assert.notEqual(replacement, refused);
  assert.equal(utility.getOrCreateCommerceRequestId(refusedOptions), replacement);
  assert.equal(utility.getOrCreateCommerceRequestId(otherOptions), other);
  const records = JSON.parse(storage.value(utility.commerceIntentStorage.key)).records;
  assert.equal(
    records.filter((record) => record.identity === utility.commerceIntentIdentity(refusedOptions))
      .length,
    1
  );
});

test('a failed replacement write leaves the refused durable identity intact', () => {
  const storage = memoryStorage();
  const refusedOptions = options(storage, {
    scope: 'write-protected-replacement',
    requestIdFactory: (scope) => `${scope}-request-00000001`,
  });
  const refused = utility.getOrCreateCommerceRequestId(refusedOptions);
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.throws(
    () =>
      utility.replaceCommerceRequestId({
        ...refusedOptions,
        expectedRequestId: refused,
        requestIdFactory: (scope) => `${scope}-request-00000002`,
      }),
    (error) => error?.code === 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE'
  );
  assert.match(storage.value(utility.commerceIntentStorage.key), new RegExp(refused));
});

test('a replacement cannot silently reuse the definitively refused request identifier', () => {
  const storage = memoryStorage();
  const refusedOptions = options(storage, {
    scope: 'colliding-replacement',
    requestIdFactory: (scope) => `${scope}-request-00000001`,
  });
  const refused = utility.getOrCreateCommerceRequestId(refusedOptions);
  assert.throws(
    () =>
      utility.replaceCommerceRequestId({
        ...refusedOptions,
        expectedRequestId: refused,
      }),
    (error) => error instanceof TypeError && /must be new/.test(error.message)
  );
  assert.equal(utility.getOrCreateCommerceRequestId(refusedOptions), refused);
  assert.match(storage.value(utility.commerceIntentStorage.key), new RegExp(refused));
});

test('a changed purchase cannot replace an unresolved request in the same recovery slot', () => {
  const storage = memoryStorage();
  const firstOptions = options(storage);
  let factoryCalls = 0;
  const first = utility.getOrCreateCommerceRequestId(firstOptions);
  assert.throws(
    () =>
      utility.getOrCreateCommerceRequestId(
        options(storage, {
          intent: { productId: 'shirt', variantId: 'large', quantity: 2 },
          requestIdFactory: () => {
            factoryCalls += 1;
            return 'changed-intent-request-000001';
          },
        })
      ),
    (error) => error?.code === 'COMMERCE_INTENT_UNRESOLVED'
  );
  assert.equal(factoryCalls, 0);
  assert.equal(utility.getOrCreateCommerceRequestId(firstOptions), first);
  assert.equal(JSON.parse(storage.value(utility.commerceIntentStorage.key)).records.length, 1);
});

test('an exact compare-and-swap is required before a refused request can rotate', () => {
  const storage = memoryStorage();
  const intentOptions = options(storage, {
    scope: 'compare-and-swap',
    requestIdFactory: (scope) => `${scope}-request-00000001`,
  });
  const first = utility.getOrCreateCommerceRequestId(intentOptions);
  for (const expectedRequestId of [undefined, 'compare-and-swap-request-stale']) {
    assert.throws(
      () =>
        utility.replaceCommerceRequestId({
          ...intentOptions,
          expectedRequestId,
          requestIdFactory: (scope) => `${scope}-request-00000002`,
        }),
      (error) => error?.code === 'COMMERCE_INTENT_UNRESOLVED'
    );
    assert.equal(utility.getOrCreateCommerceRequestId(intentOptions), first);
  }
  assert.equal(utility.clearCommerceRequestId(intentOptions), false);
  assert.equal(
    utility.clearCommerceRequestId({
      ...intentOptions,
      expectedRequestId: 'compare-and-swap-request-stale',
    }),
    false
  );
  assert.equal(utility.getOrCreateCommerceRequestId(intentOptions), first);
});

test('clearing the exact completed request releases its slot for reviewed new terms', () => {
  const storage = memoryStorage();
  const firstOptions = options(storage, {
    scope: 'reviewed-repurchase',
    requestIdFactory: (scope) => `${scope}-request-00000001`,
  });
  const first = utility.getOrCreateCommerceRequestId(firstOptions);
  assert.equal(
    utility.clearCommerceRequestId({
      ...firstOptions,
      expectedRequestId: first,
    }),
    true
  );
  const changed = utility.getOrCreateCommerceRequestId(
    options(storage, {
      scope: 'reviewed-repurchase',
      intent: { productId: 'shirt', variantId: 'large', quantity: 2 },
      requestIdFactory: (scope) => `${scope}-request-00000002`,
    })
  );
  assert.notEqual(changed, first);
});

test('different account, payment rail, or scope retains an independent recovery slot', () => {
  const storage = memoryStorage();
  const records = [
    options(storage, { requestIdFactory: () => 'independent-request-000001' }),
    options(storage, { userId: 'user-b', requestIdFactory: () => 'independent-request-000002' }),
    options(storage, {
      paymentMethod: 'card',
      requestIdFactory: () => 'independent-request-000003',
    }),
    options(storage, {
      scope: 'merch-diamonds-hat',
      requestIdFactory: () => 'independent-request-000004',
    }),
  ].map((entry) => utility.getOrCreateCommerceRequestId(entry));
  assert.equal(new Set(records).size, 4);
  assert.equal(JSON.parse(storage.value(utility.commerceIntentStorage.key)).records.length, 4);
});

test('malformed, duplicate identity, duplicate slot, and duplicate request storage fail closed', () => {
  const key = utility.commerceIntentStorage.key;
  const now = 1_800_000_000_000;
  const firstOptions = options(null, { scope: 'stored-slot' });
  const firstIdentity = utility.commerceIntentIdentity(firstOptions);
  const baseRecord = {
    identity: firstIdentity,
    requestId: 'stored-slot-request-000001',
    userId: 'user-a',
    paymentMethod: 'diamonds',
    createdAt: now,
    lastUsedAt: now,
  };
  const changedIdentity = utility.commerceIntentIdentity({
    ...firstOptions,
    intent: { productId: 'shirt', variantId: 'large', quantity: 2 },
  });
  const cases = [
    [{ ...baseRecord, identity: '{malformed' }],
    [baseRecord, { ...baseRecord }],
    [
      baseRecord,
      { ...baseRecord, identity: changedIdentity, requestId: 'stored-slot-request-000002' },
    ],
    [
      baseRecord,
      {
        ...baseRecord,
        identity: utility.commerceIntentIdentity({ ...firstOptions, scope: 'other-slot' }),
      },
    ],
  ];
  for (const records of cases) {
    const storage = memoryStorage({ [key]: JSON.stringify({ version: 1, records }) });
    assert.throws(
      () => utility.getOrCreateCommerceRequestId(options(storage, { scope: 'new-slot' })),
      (error) => error?.code === 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE'
    );
  }
});

test('full durable recovery storage refuses new work without evicting unresolved records', () => {
  const key = utility.commerceIntentStorage.key;
  const now = 1_800_000_000_000;
  const records = Array.from({ length: utility.commerceIntentStorage.maxRecords }, (_, index) => {
    const entry = options(null, { scope: `capacity-${String(index).padStart(2, '0')}` });
    return {
      identity: utility.commerceIntentIdentity(entry),
      requestId: `capacity-request-${String(index).padStart(8, '0')}`,
      userId: entry.userId,
      paymentMethod: entry.paymentMethod,
      createdAt: now,
      lastUsedAt: now,
    };
  });
  const serialized = JSON.stringify({ version: 1, records });
  const storage = memoryStorage({ [key]: serialized });
  assert.throws(
    () => utility.getOrCreateCommerceRequestId(options(storage, { scope: 'capacity-overflow' })),
    (error) => error?.code === 'COMMERCE_INTENT_CAPACITY_REACHED'
  );
  assert.equal(storage.value(key), serialized);
});

test('request identifier collisions do not corrupt the stored recovery owner', () => {
  const storage = memoryStorage();
  const first = utility.getOrCreateCommerceRequestId(
    options(storage, {
      scope: 'collision-a',
      requestIdFactory: () => 'collision-request-000001',
    })
  );
  assert.throws(
    () =>
      utility.getOrCreateCommerceRequestId(
        options(storage, {
          scope: 'collision-b',
          requestIdFactory: () => first,
        })
      ),
    (error) => error instanceof TypeError && /already in use/.test(error.message)
  );
  const records = JSON.parse(storage.value(utility.commerceIntentStorage.key)).records;
  assert.equal(records.length, 1);
  assert.equal(records[0].requestId, first);
});

test('slot identity normalizes cosmetic scope, account, and payment whitespace', () => {
  const first = utility.commerceIntentSlotIdentity({
    scope: 'Merch Card',
    userId: ' user-a ',
    paymentMethod: ' Card ',
  });
  const second = utility.commerceIntentSlotIdentity({
    scope: 'merch-card',
    userId: 'user-a',
    paymentMethod: 'card',
  });
  assert.equal(first, second);
});

test('card completion clears only the verified request and preserves another tab', () => {
  const storage = memoryStorage();
  const firstOptions = options(storage, {
    paymentMethod: 'card',
    requestIdFactory: (scope) => `${scope}-card-request-0001`,
  });
  const secondOptions = options(storage, {
    scope: 'diamonds-premium',
    paymentMethod: 'card',
    intent: { packageId: 'premium', quantity: 1 },
    requestIdFactory: (scope) => `${scope}-card-request-0002`,
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
  assert.notEqual(
    utility.getOrCreateCommerceRequestId({
      ...firstOptions,
      requestIdFactory: (scope) => `${scope}-card-request-0003`,
    }),
    first
  );
});

test('unavailable or corrupt recovery storage fails closed before checkout', () => {
  const key = utility.commerceIntentStorage.key;
  const corrupt = memoryStorage({ [key]: '{bad json' });
  assert.throws(
    () => utility.getOrCreateCommerceRequestId(options(corrupt)),
    (error) => error?.code === 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE'
  );
  assert.throws(
    () =>
      utility.getOrCreateCommerceRequestId(
        options(null, {
          scope: 'storage-unavailable',
          userId: 'storage-unavailable-user',
        })
      ),
    (error) => error?.code === 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE'
  );

  const writeFailure = memoryStorage();
  writeFailure.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.throws(
    () =>
      utility.getOrCreateCommerceRequestId(
        options(writeFailure, {
          scope: 'write-failure',
          userId: 'write-failure-user',
        })
      ),
    (error) => error?.code === 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE'
  );

  const missingReadback = memoryStorage();
  missingReadback.setItem = () => {};
  assert.throws(
    () =>
      utility.getOrCreateCommerceRequestId(
        options(missingReadback, {
          scope: 'readback-failure',
          userId: 'readback-failure-user',
        })
      ),
    (error) => error?.code === 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE'
  );

  assert.throws(
    () =>
      utility.getOrCreateCommerceRequestId(
        options(memoryStorage(), {
          scope: 'invalid-request-id',
          userId: 'invalid-request-id-user',
          requestIdFactory: () => 'invalid.request.id',
        })
      ),
    (error) => error instanceof TypeError
  );
});

test('expired recovery state rotates only after the durable replacement is verified', () => {
  const key = utility.commerceIntentStorage.key;

  const staleOptions = options(null, {
    scope: 'stale-intent',
    userId: 'stale-user',
  });
  const identity = utility.commerceIntentIdentity(staleOptions);
  const staleRecord = JSON.stringify({
    version: 1,
    records: [
      {
        identity,
        requestId: 'stale-request-00000001',
        userId: 'stale-user',
        paymentMethod: 'diamonds',
        createdAt: 1,
        lastUsedAt: 1,
      },
    ],
  });
  const stale = memoryStorage({ [key]: staleRecord });
  const requestId = utility.getOrCreateCommerceRequestId({
    ...staleOptions,
    storage: stale,
    now: 1_800_000_000_000,
    requestIdFactory: (scope) => `${scope}-fresh-00000001`,
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

test('cart and merchandise operations cannot complete into a replacement account', async () => {
  const [cart, merch, dialog] = await Promise.all([
    read('pages/hub/diamond-store/cart.js'),
    read('src/components/store/MerchStore.jsx'),
    read('src/components/store/MerchPurchaseDialog.jsx'),
  ]);

  const cardCart = cart.slice(
    cart.indexOf('const handleCheckout = async'),
    cart.indexOf('const beginDiamondCheckout = () =>')
  );
  assert.match(cart, /cardCheckoutAccountRef\.current = user\?\.id \|\| null/);
  assert.match(cart, /cardCheckoutAttemptRef\.current \+= 1/);
  assert.match(cart, /cardCheckoutAbortRef\.current\?\.abort\(\)/);
  assert.match(cart, /const synchronousAccountId = getAuthUser\(\)\?\.id \|\| null/);
  assert.match(cart, /const expectedCartOwnerId = synchronousAccountId \|\| 'guest'/);
  assert.match(
    cart,
    /const visibleCart =\s*!authChecking && cartOwnerId === expectedCartOwnerId && hydrated \? cart : \[\]/
  );
  assert.match(cart, /const diamondItems = visibleCart\.filter/);
  assert.match(cart, /const vipItems = visibleCart\.filter/);
  assert.match(cart, /const merchItems = visibleCart\.filter/);
  assert.match(
    cart,
    /if \(\s*\(loading \|\| authChecking \|\| !hydrated \|\| cartOwnerId !== expectedCartOwnerId\) &&\s*!projectedCartLoadError\s*\)/
  );
  assert.match(cart, /visibleCart\.length === 0/);
  assert.match(cart, /visibleCart\.map\(\(item\) =>/);
  assert.match(cardCart, /const controller = new AbortController\(\)/);
  assert.match(cardCart, /cardCheckoutAttemptRef\.current === attemptId/);
  assert.match(cardCart, /cardCheckoutAccountRef\.current === expectedAccountId/);
  assert.match(cardCart, /getAuthUser\(\)\?\.id === expectedAccountId/);
  assert.match(cardCart, /signal: controller\.signal/);
  assert.match(cardCart, /err\?\.name === 'AbortError' \|\| !attemptIsCurrent\(\)/);
  const cartRedirect = cardCart.indexOf('window.location.assign(checkoutSession.url)');
  assert.ok(cartRedirect > -1);
  assert.ok(cardCart.lastIndexOf('if (!attemptIsCurrent()) return', cartRedirect) > -1);

  const cardMerch = merch.slice(
    merch.indexOf('const handleBuyCard = useCallback'),
    merch.indexOf('const handleBuyDiamonds = useCallback')
  );
  assert.match(merch, /cardCheckoutAttemptRef\.current \+= 1/);
  assert.match(merch, /cardCheckoutAbortRef\.current\?\.abort\(\)/);
  assert.match(cardMerch, /const controller = new AbortController\(\)/);
  assert.match(cardMerch, /cardCheckoutAttemptRef\.current === attemptId/);
  assert.match(cardMerch, /activeAccountIdRef\.current === expectedAccountId/);
  assert.match(cardMerch, /getAuthUser\(\)\?\.id === expectedAccountId/);
  assert.match(cardMerch, /signal: controller\.signal/);
  assert.match(cardMerch, /err\?\.name === 'AbortError' \|\| !attemptIsCurrent\(\)/);
  const merchRedirect = cardMerch.indexOf('window.location.assign(checkoutSession.url)');
  assert.ok(merchRedirect > -1);
  assert.ok(cardMerch.lastIndexOf('if (!attemptIsCurrent()) return', merchRedirect) > -1);

  const wishlistMutation = merch.slice(
    merch.indexOf('const toggleWishlist = useCallback'),
    merch.indexOf('// ── Card checkout')
  );
  assert.match(merch, /wishlistMutationAttemptRef\.current \+= 1/);
  assert.match(wishlistMutation, /wishlistMutationAttemptRef\.current === attemptId/);
  assert.match(wishlistMutation, /activeAccountIdRef\.current === expectedAccountId/);
  assert.match(wishlistMutation, /getAuthUser\(\)\?\.id === expectedAccountId/);
  assert.match(wishlistMutation, /if \(!attemptIsCurrent\(\)\) return/);

  assert.match(dialog, /const purchaseIdentity = purchase/);
  assert.match(dialog, /purchase\.commerceIntent\?\.userId/);
  assert.match(dialog, /setShipping\(emptyShipping\(\)\)/);
  assert.match(dialog, /\[purchaseIdentity\]/);
});

test('private Club detail and fulfillment views clear on account transitions', async () => {
  const [clubDetail, fulfillment] = await Promise.all([
    read('pages/hub/club-shop/[itemId].js'),
    read('pages/hub/merch-store/fulfillment.js'),
  ]);

  assert.match(
    clubDetail,
    /loadRequestRef\.current \+= 1;[\s\S]{0,180}loadAbortRef\.current\?\.abort\(\)[\s\S]{0,220}setLoadedAccountId\(null\)/
  );
  assert.match(clubDetail, /const expectedAccountId = committedAccountId/);
  assert.match(clubDetail, /getAuthUser\(\)\?\.id !== expectedAccountId/);
  assert.match(clubDetail, /\[committedAccountId, itemId, loadItem, router\.isReady\]/);
  assert.match(
    clubDetail,
    /\[\s*canonical,\s*checkoutSessionId,\s*clubId,\s*committedAccountId,\s*item,\s*itemId,\s*loadItem/
  );

  assert.match(fulfillment, /supabase\.auth\.onAuthStateChange/);
  assert.match(fulfillment, /authOwnerRef\.current = nextOwnerId/);
  assert.match(fulfillment, /loadedOwnerRef\.current = null/);
  assert.match(fulfillment, /setOrders\(\[\]\)/);
  assert.match(fulfillment, /authOwnerRef\.current !== expectedAccountId/);
  assert.match(fulfillment, /loadedOwnerRef\.current !== expectedAccountId/);
  assert.match(fulfillment, /const visibleOrders = loadedOwnerId === authOwnerId \? orders : \[\]/);
  assert.match(fulfillment, /signal: controller\.signal/);
});

test('marketplace Diamond requests prove durable identity before every financial call', async () => {
  const [storePage, cart, merch, clubDetail, wallet, memoryGames] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/hub/diamond-store/cart.js'),
    read('src/components/store/MerchStore.jsx'),
    read('pages/hub/club-shop/[itemId].js'),
    read('src/components/store/DiamondWalletModal.jsx'),
    read('pages/hub/memory-games.js'),
  ]);
  const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start > -1, `missing source marker: ${startMarker}`);
    assert.ok(end > start, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
  };

  const vipPurchase = section(
    storePage,
    'const runDiamondPlanPurchase = async',
    '/** Stripe Checkout for recurring and one-time card plans. */'
  );
  const diamondCardCheckout = section(
    storePage,
    'const handleDirectCheckout = async',
    '// Monthly and yearly use Stripe subscriptions.'
  );
  const vipCardCheckout = section(
    storePage,
    'const startStripeCheckout = async',
    '// Merchandise checkout lives'
  );
  const clubPurchase = section(
    storePage,
    'const handleClubPurchase = async',
    'const handleClubCardCheckout = async'
  );
  const clubCardPurchase = section(
    storePage,
    'const handleClubCardCheckout = async',
    "useEffect(() => {\n    if (activeTab !== 'club-shop'"
  );
  const merchReview = section(
    merch,
    'const handleBuyDiamonds = useCallback',
    'const confirmDiamondPurchase = useCallback'
  );
  const merchPurchase = section(
    merch,
    'const confirmDiamondPurchase = useCallback',
    '\n  return ('
  );
  const cartReview = section(
    cart,
    'const beginDiamondCheckout = () =>',
    'const confirmDiamondCheckout = async'
  );
  const cartPurchase = section(
    cart,
    'const confirmDiamondCheckout = async',
    '\n  if (\n    (loading || authChecking || !hydrated || cartOwnerId !== expectedCartOwnerId)'
  );
  const clubDetailPurchase = section(
    clubDetail,
    'const purchaseWithDiamonds = useCallback',
    'const purchaseWithCard = async'
  );
  const clubDetailCardCheckout = section(
    clubDetail,
    'const purchaseWithCard = async',
    'useEffect(() => {\n    // Stripe return verification'
  );

  assert.match(vipPurchase, /const durableRequestId = getOrCreateCommerceRequestId/);
  assert.match(vipPurchase, /durableRequestId !== idempotencyKey/);
  assert.doesNotMatch(vipPurchase, /replaceCommerceRequestId/);
  const vipRefusal = section(
    vipPurchase,
    'if (!res.ok) {',
    'const verifiedPurchase = normalizeVerifiedVipDiamondPurchase'
  );
  assert.doesNotMatch(vipRefusal, /clearCommerceRequestId|replaceCommerceRequestId/);
  assert.match(vipPurchase, /refusalError\.definitive = refusal\.definitive/);
  assert.match(vipPurchase, /refusalError\.commerceRefusal = refusal/);
  assert.match(
    vipPurchase,
    /refusal\?\.code === 'OFFER_PRICE_CHANGED'[\s\S]{0,500}if \(purchaseWasResumed\)[\s\S]{0,500}clearCommerceRequestId\(\{[\s\S]{0,250}expectedRequestId: idempotencyKey[\s\S]{0,500}router\.reload\(\)/
  );
  assert.match(storePage, /runDiamondPlanPurchase\([\s\S]{0,220}spend\.purchaseWasResumed/);
  assert.match(
    vipPurchase,
    /if \(verifiedPurchase\.idempotent\) \{[\s\S]{0,500}\.from\('profiles'\)[\s\S]{0,500}if \(!attemptIsCurrent\(\)\) return false/
  );
  assert.match(
    vipPurchase,
    /replayProfileError\s*=\s*profileError\s*\|\|[\s\S]{0,160}!profile\s*\?\s*new Error\('Current Marketplace Profile Was Not Found\.'/
  );
  assert.match(vipPurchase, /verifiedPurchase\.historical/);
  assert.match(
    vipPurchase,
    /authUser\.id !== expectedAccountId[\s\S]*activeStoreAccountRef\.current !== expectedAccountId/
  );
  assert.ok(
    vipPurchase.indexOf('if (!confirmedAuthorization || !attemptIsCurrent())') <
      vipPurchase.indexOf('clearCommerceRequestId({')
  );
  assert.match(vipPurchase, /const controller = new AbortController\(\)/);
  assert.match(vipPurchase, /signal: controller\.signal/);
  assert.ok(
    vipPurchase.indexOf('const durableRequestId = getOrCreateCommerceRequestId') <
      vipPurchase.indexOf("boundedCommerceFetch('/api/store/purchase-vip-with-diamonds'")
  );

  assert.match(
    clubPurchase,
    /const idempotencyKey = getOrCreateCommerceRequestId\(purchaseTarget\.commerceIntent\)/
  );
  assert.match(clubPurchase, /idempotencyKey !== purchaseTarget\.purchaseRequestId/);
  assert.doesNotMatch(clubPurchase, /replaceCommerceRequestId/);
  assert.match(clubPurchase, /purchaseError\.ambiguous = true/);
  assert.match(
    clubPurchase,
    /classifyClubPurchaseRefusal\(response\.status, responseData, \{[\s\S]{0,120}accountId: expectedAccountId,[\s\S]{0,100}requestId: idempotencyKey/
  );
  assert.match(
    clubPurchase,
    /normalizeVerifiedClubPurchaseSuccess\(responseData, \{[\s\S]{0,120}accountId: expectedAccountId,[\s\S]{0,100}requestId: idempotencyKey/
  );
  assert.match(
    clubPurchase,
    /authUser\.id !== committedStoreAccountId[\s\S]*purchaseTarget\.commerceIntent\?\.userId !== authUser\.id/
  );
  assert.match(clubPurchase, /const controller = new AbortController\(\)/);
  assert.match(clubPurchase, /clubShopPurchaseAttemptRef\.current === attemptId/);
  assert.match(clubPurchase, /clubShopPurchaseOwnerRef\.current\.accountId === expectedAccountId/);
  assert.match(clubPurchase, /clubShopPurchaseOwnerRef\.current\.clubId === expectedClubId/);
  assert.match(clubPurchase, /signal: controller\.signal/);
  assert.match(
    clubPurchase,
    /if \(!attemptIsCurrent\(\) \|\| err\?\.name === 'AbortError'\) return/
  );
  assert.ok(
    clubPurchase.indexOf('authUser.id !== committedStoreAccountId') <
      clubPurchase.indexOf('setClubProcessing(true)')
  );
  assert.ok(
    clubPurchase.indexOf('const idempotencyKey = getOrCreateCommerceRequestId') <
      clubPurchase.indexOf("boundedCommerceFetch('/api/club-arena/marketplace-purchase'")
  );
  assert.match(clubCardPurchase, /const controller = new AbortController\(\)/);
  assert.match(clubCardPurchase, /clubShopCardAttemptRef\.current === attemptId/);
  assert.match(
    clubCardPurchase,
    /clubShopPurchaseOwnerRef\.current\.accountId === expectedAccountId/
  );
  assert.match(clubCardPurchase, /clubShopPurchaseOwnerRef\.current\.clubId === expectedClubId/);
  assert.match(clubCardPurchase, /signal: controller\.signal/);
  assert.match(
    clubCardPurchase,
    /if \(!attemptIsCurrent\(\) \|\| error\?\.name === 'AbortError'\) return/
  );
  const clubCardRedirect = clubCardPurchase.indexOf('window.location.assign(checkoutSession.url)');
  const clubCardFinalOwnerCheck = clubCardPurchase.lastIndexOf(
    'if (!attemptIsCurrent()) return',
    clubCardRedirect
  );
  assert.ok(clubCardRedirect > -1);
  assert.ok(clubCardFinalOwnerCheck > -1 && clubCardFinalOwnerCheck < clubCardRedirect);

  for (const [checkout, attemptRef, abortRef] of [
    [diamondCardCheckout, 'diamondCardAttemptRef', 'diamondCardAbortRef'],
    [vipCardCheckout, 'vipCardAttemptRef', 'vipCardAbortRef'],
  ]) {
    assert.match(checkout, /authUser\.id !== committedStoreAccountId/);
    assert.match(checkout, /const controller = new AbortController\(\)/);
    assert.match(checkout, new RegExp(`${attemptRef}\\.current === attemptId`));
    assert.match(checkout, /activeStoreAccountRef\.current === expectedAccountId/);
    assert.match(checkout, /signal: controller\.signal/);
    assert.match(
      checkout,
      /if \(!attemptIsCurrent\(\) \|\| (?:err|error)\?\.name === 'AbortError'\) return/
    );
    assert.match(
      checkout,
      new RegExp(
        `if \\(${abortRef}\\.current === controller\\) \\{[\\s\\S]{0,160}setStoreProcessing\\(false\\)`
      )
    );
    const redirect = checkout.indexOf('window.location.assign(checkoutSession.url)');
    const finalOwnerCheck = checkout.lastIndexOf('if (!attemptIsCurrent()) return', redirect);
    assert.ok(redirect > -1);
    assert.ok(finalOwnerCheck > -1 && finalOwnerCheck < redirect);
  }
  assert.match(
    storePage,
    /activeStoreAccountRef\.current = committedStoreAccountId;[\s\S]{0,650}diamondCardAbortRef\.current\?\.abort\(\)[\s\S]{0,650}vipCardAbortRef\.current\?\.abort\(\)/
  );
  assert.match(
    storePage,
    /setUser\(nextUser\);[\s\S]{0,350}setIsVip\(false\);[\s\S]{0,350}setDiamondBalance\(null\);[\s\S]{0,350}setCheckoutReturn\(null\)/
  );
  assert.match(
    storePage,
    /const expectedAccountId = committedStoreAccountId;[\s\S]{0,1200}activeStoreAccountRef\.current !== expectedAccountId[\s\S]{0,1200}\.eq\('id', expectedAccountId\)/
  );
  assert.match(
    storePage,
    /useEffect\(\s*\(\) => \(\) => \{[\s\S]{0,900}diamondCardAbortRef\.current\?\.abort\(\)[\s\S]{0,900}vipCardAbortRef\.current\?\.abort\(\)/
  );

  for (const review of [merchReview, cartReview]) {
    assert.match(review, /const authUser = getAuthUser\(\)/);
    assert.match(review, /authUser\.id !== user\?\.id/);
    assert.match(review, /recovery = inspectCommerceRequestRecovery\(commerceIntent\)/);
    assert.match(review, /const purchaseWasResumed = recovery\.status === 'recoverable'/);
    assert.match(
      review,
      /purchaseRequestId = purchaseWasResumed[\s\S]{0,160}getOrCreateCommerceRequestId\(commerceIntent\)/
    );
    assert.match(review, /catch \(error\) \{[\s\S]*Secure Purchase Recovery Is Unavailable/);
  }
  assert.match(merchReview, /if \(!purchaseWasResumed && Number\(balance \|\| 0\) < cost\)/);
  assert.ok(
    merchReview.indexOf('inspectCommerceRequestRecovery(commerceIntent)') <
      merchReview.indexOf('Number(balance || 0) < cost')
  );
  assert.match(cartReview, /const purchaseItems = merchItems\.map/);
  for (const purchase of [merchPurchase, cartPurchase]) {
    assert.match(purchase, /const authUser = getAuthUser\(\)/);
    assert.match(
      purchase,
      /const expectedAccountId = pendingDiamond(?:Purchase|Checkout)\.commerceIntent\?\.userId/
    );
    assert.match(
      purchase,
      /activeAccountIdRef\.current !== expectedAccountId|diamondCheckoutAccountRef\.current !== expectedAccountId/
    );
    assert.match(purchase, /const durableRequestId = getOrCreateCommerceRequestId/);
    assert.match(purchase, /durableRequestId !== pendingDiamond/);
    assert.match(
      purchase,
      /const purchaseWasResumed = pendingDiamond(?:Purchase|Checkout)\.purchaseWasResumed === true/
    );
    assert.match(purchase, /'X-Idempotency-Key': durableRequestId/);
    assert.match(purchase, /replaceCommerceRequestId\(/);
    assert.match(
      purchase,
      /if \(refusal\.definitive && !purchaseWasResumed\) \{[\s\S]{0,220}replaceCommerceRequestId\(/
    );
    assert.match(
      purchase,
      /setPendingDiamond(?:Purchase|Checkout)\([\s\S]{0,220}purchaseWasResumed: true/
    );
    assert.match(
      purchase,
      /setPendingDiamond(?:Purchase|Checkout)\(null\);\s*throw persistenceError/
    );
    assert.ok(
      purchase.indexOf('const expectedAccountId = pendingDiamond') <
        purchase.indexOf('const durableRequestId = getOrCreateCommerceRequestId')
    );
    assert.ok(
      purchase.indexOf('const durableRequestId = getOrCreateCommerceRequestId') <
        purchase.indexOf("boundedCommerceFetch('/api/store/purchase-with-diamonds'")
    );
    assert.ok(
      purchase.indexOf('normalizeVerifiedMerchDiamondPurchase') <
        purchase.indexOf('clearCommerceRequestId(')
    );
    assert.match(purchase, /const controller = new AbortController\(\)/);
    assert.match(purchase, /if \(!confirmedAuthorization \|\| !attemptIsCurrent\(\)\)/);
  }

  assert.match(
    clubDetailPurchase,
    /diamondCommerceIntent\?\.userId !== authUser\.id[\s\S]*reviewedIntent\?\.expectedPrice !== Number\(target\.price\)/
  );
  assert.ok(
    clubDetailPurchase.indexOf('diamondCommerceIntent?.userId !== authUser.id') <
      clubDetailPurchase.indexOf('processingRef.current = true')
  );
  assert.match(
    clubDetailPurchase,
    /const durableRequestId = getOrCreateCommerceRequestId\(diamondCommerceIntent\)/
  );
  assert.match(clubDetailPurchase, /durableRequestId !== reviewedRequestId/);
  assert.match(clubDetailPurchase, /'X-Idempotency-Key': durableRequestId/);
  assert.match(
    clubDetailPurchase,
    /classifyClubPurchaseRefusal\(response\.status, body, \{[\s\S]{0,120}accountId: expectedAccountId,[\s\S]{0,100}requestId: durableRequestId/
  );
  assert.match(
    clubDetailPurchase,
    /normalizeVerifiedClubPurchaseSuccess\(body, \{[\s\S]{0,120}accountId: expectedAccountId,[\s\S]{0,100}requestId: durableRequestId/
  );
  const clubDetailRefusal = section(
    clubDetailPurchase,
    'const refusal = classifyClubPurchaseRefusal',
    'const verifiedPurchase = normalizeVerifiedClubPurchaseSuccess'
  );
  assert.doesNotMatch(clubDetailPurchase, /refusal\.definitive|replaceCommerceRequestId/);
  assert.match(
    clubDetailRefusal,
    /Purchase Status Is Uncertain\. Confirm Again To Verify The Original Purchase\./
  );
  assert.match(clubDetailRefusal, /return false/);
  assert.doesNotMatch(
    clubDetailRefusal,
    /clearCommerceRequestId|setDiamondPurchaseRequestId\(null\)/
  );
  assert.ok(
    clubDetailPurchase.indexOf('const durableRequestId = getOrCreateCommerceRequestId') <
      clubDetailPurchase.indexOf("boundedCommerceFetch('/api/club-arena/marketplace-purchase'")
  );
  assert.ok(
    clubDetailPurchase.indexOf('normalizeVerifiedClubPurchaseSuccess') <
      clubDetailPurchase.indexOf('clearCommerceRequestId({')
  );
  assert.match(
    clubDetail,
    /purchaseOwnerRef\.current = \{[\s\S]{0,120}accountId: committedAccountId,[\s\S]{0,120}clubId: committedClubId/
  );
  assert.match(clubDetail, /\},\s*\[committedAccountId, committedClubId, itemId\]\);/);
  assert.match(
    clubDetail,
    /useIsomorphicLayoutEffect\(\(\) => \{[\s\S]{0,500}setLoadedAccountId\(null\)[\s\S]{0,500}\}, \[committedAccountId, itemId, requestedClubId\]\)/
  );
  assert.match(
    clubDetail,
    /const committedClubId =\s*clubId && \(!requestedClubId \|\| requestedClubId === clubId\)/
  );
  assert.match(clubDetail, /diamondPurchaseAbortRef\.current\?\.abort\(\)/);
  assert.match(clubDetail, /cardCheckoutAbortRef\.current\?\.abort\(\)/);
  assert.match(
    clubDetail,
    /useEffect\(\s*\(\) => \(\) => \{[\s\S]{0,400}diamondPurchaseAbortRef\.current\?\.abort\(\)[\s\S]{0,400}cardCheckoutAbortRef\.current\?\.abort\(\)/
  );
  assert.match(clubDetailPurchase, /const controller = new AbortController\(\)/);
  assert.match(clubDetailPurchase, /diamondPurchaseAttemptRef\.current === attemptId/);
  assert.match(clubDetailPurchase, /purchaseOwnerRef\.current\.accountId === expectedAccountId/);
  assert.match(clubDetailPurchase, /purchaseOwnerRef\.current\.clubId === expectedClubId/);
  assert.match(clubDetailPurchase, /purchaseOwnerRef\.current\.itemId !== itemId/);
  assert.match(clubDetailPurchase, /target\.id !== itemId/);
  assert.match(clubDetailPurchase, /signal: controller\.signal/);
  assert.match(
    clubDetailPurchase,
    /if \(!attemptIsCurrent\(\) \|\| error\?\.name === 'AbortError'\) return false/
  );
  assert.match(
    clubDetailPurchase,
    /if \(diamondPurchaseAbortRef\.current === controller\) \{[\s\S]{0,160}processingRef\.current = false/
  );
  assert.match(clubDetailCardCheckout, /const controller = new AbortController\(\)/);
  assert.match(clubDetailCardCheckout, /cardCheckoutAttemptRef\.current === attemptId/);
  assert.match(
    clubDetailCardCheckout,
    /purchaseOwnerRef\.current\.accountId === expectedAccountId/
  );
  assert.match(clubDetailCardCheckout, /purchaseOwnerRef\.current\.clubId === expectedClubId/);
  assert.match(clubDetailCardCheckout, /purchaseOwnerRef\.current\.itemId !== itemId/);
  assert.match(clubDetailCardCheckout, /item\.id !== itemId/);
  assert.match(clubDetailCardCheckout, /signal: controller\.signal/);
  assert.match(
    clubDetailCardCheckout,
    /if \(!attemptIsCurrent\(\) \|\| error\?\.name === 'AbortError'\) return/
  );
  assert.match(
    clubDetailCardCheckout,
    /if \(cardCheckoutAbortRef\.current === controller\) \{[\s\S]{0,160}processingRef\.current = false/
  );
  const detailCardRedirect = clubDetailCardCheckout.indexOf(
    'window.location.assign(checkoutSession.url)'
  );
  const detailCardFinalOwnerCheck = clubDetailCardCheckout.lastIndexOf(
    'if (!attemptIsCurrent()) return',
    detailCardRedirect
  );
  assert.ok(detailCardRedirect > -1);
  assert.ok(detailCardFinalOwnerCheck > -1 && detailCardFinalOwnerCheck < detailCardRedirect);
  const clubDetailReview = section(
    clubDetail,
    'const openDiamondPurchaseReview = useCallback',
    'const purchaseWithDiamonds = useCallback'
  );
  assert.match(clubDetailReview, /inspectCommerceRequestRecovery\(commerceIntent\)/);
  assert.match(clubDetailReview, /const purchaseWasResumed = recovery\.status === 'recoverable'/);
  assert.match(clubDetailReview, /if \(!purchaseWasResumed\) \{[\s\S]*item\.available !== true/);
  assert.match(clubDetailReview, /purchaseRequestId = getOrCreateCommerceRequestId/);
  assert.match(clubDetailReview, /catch \(error\) \{[\s\S]*setState\(/);

  const vipRecoveryReview = section(
    storePage,
    'const openVipDiamondReview =',
    '// Monthly and yearly use Stripe subscriptions.'
  );
  assert.match(vipRecoveryReview, /inspectCommerceRequestRecovery\(commerceIntent\)/);
  assert.match(vipRecoveryReview, /const purchaseWasResumed = recovery\.status === 'recoverable'/);
  assert.ok(
    vipRecoveryReview.indexOf("recovery.status === 'terms-changed'") <
      vipRecoveryReview.indexOf('getOrCreateCommerceRequestId(commerceIntent)')
  );
  assert.match(storePage, /Verify Purchase/);

  const transfer = section(
    wallet,
    'const handleTransfer = useCallback(async () =>',
    '\n\n  useEffect(() => {'
  );
  assert.ok(
    transfer.indexOf('const transferRequestId = getOrCreateCommerceRequestId') <
      transfer.indexOf("boundedCommerceFetch('/api/store/diamond-transfer'")
  );
  assert.match(transfer, /catch \(err\) \{\s*setTransferError\(err\.message/);

  assert.equal((memoryGames.match(/getOrCreateCommerceRequestId\(/g) || []).length, 1);
  assert.match(memoryGames, /paymentMethod: 'card'/);
});

test('exact Diamond recovery is actionable without weakening fresh-purchase gates', async () => {
  const [storePage, clubDetail] = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/hub/club-shop/[itemId].js'),
  ]);
  const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start > -1, `missing source marker: ${startMarker}`);
    assert.ok(end > start, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
  };

  const inspector = section(
    utilitySource,
    'export function inspectCommerceRequestRecovery',
    'export function getOrCreateCommerceRequestId'
  );
  assert.match(inspector, /status: 'recoverable', requestId: existing\.requestId/);
  assert.match(inspector, /status: 'terms-changed', requestId: null/);
  assert.match(inspector, /status: 'terms-unavailable', requestId: null/);
  assert.doesNotMatch(inspector, /writeRecords|persistAndVerifyRecord|createRequestId/);

  const vipReview = section(
    storePage,
    'const openVipDiamondReview =',
    '// Monthly and yearly use Stripe subscriptions.'
  );
  const vipPurchase = section(
    storePage,
    'const runDiamondPlanPurchase = async',
    '/** Stripe Checkout for recurring and one-time card plans. */'
  );
  assert.ok(
    vipReview.indexOf('inspectCommerceRequestRecovery(commerceIntent)') <
      vipReview.indexOf('if (!purchaseWasResumed && !freshAllowed)')
  );
  assert.match(
    vipReview,
    /recovery\.status === 'terms-changed'[\s\S]*PROTECTED_TERMS_CHANGED_MESSAGE/
  );
  assert.match(vipReview, /idempotencyKey = getOrCreateCommerceRequestId\(commerceIntent\)/);
  assert.doesNotMatch(vipPurchase, /replaceCommerceRequestId/);
  assert.ok(
    vipPurchase.indexOf('normalizeVerifiedVipDiamondPurchase') <
      vipPurchase.indexOf('clearCommerceRequestId({')
  );

  const clubReview = section(
    storePage,
    'const openClubPurchaseReview =',
    '// ═══ Club Shop: Purchase handler ═══'
  );
  const clubPurchase = section(
    storePage,
    'const handleClubPurchase = async',
    'const handleClubCardCheckout = async'
  );
  assert.ok(
    clubReview.indexOf('inspectCommerceRequestRecovery(commerceIntent)') <
      clubReview.indexOf('if (!purchaseWasResumed)')
  );
  assert.match(
    clubReview,
    /if \(!purchaseWasResumed\) \{[\s\S]*currentItem\.available !== true[\s\S]*shortfall > 0/
  );
  assert.match(clubPurchase, /recovery\.requestId !== purchaseTarget\.purchaseRequestId/);
  assert.match(
    clubPurchase,
    /const purchaseWasResumed = purchaseTarget\.purchaseWasResumed === true/
  );
  assert.match(
    clubPurchase,
    /if \(!purchaseWasResumed\) \{[\s\S]*purchaseTarget\.available !== true/
  );
  assert.doesNotMatch(clubPurchase, /replaceCommerceRequestId/);

  const detailReview = section(
    clubDetail,
    'const openDiamondPurchaseReview = useCallback',
    'const purchaseWithDiamonds = useCallback'
  );
  const detailPurchase = section(
    clubDetail,
    'const purchaseWithDiamonds = useCallback',
    'const purchaseWithCard = async'
  );
  assert.ok(
    detailReview.indexOf('inspectCommerceRequestRecovery(commerceIntent)') <
      detailReview.indexOf('if (!purchaseWasResumed)')
  );
  assert.match(detailPurchase, /recovery\.requestId !== reviewedRequestId/);
  assert.match(detailPurchase, /const purchaseWasResumed = diamondReviewIsRecovery === true/);
  assert.match(detailPurchase, /if \(!purchaseWasResumed\) \{[\s\S]*target\.available !== true/);
  assert.doesNotMatch(detailPurchase, /replaceCommerceRequestId/);
  assert.match(clubDetail, /PROTECTED_TERMS_UNAVAILABLE_MESSAGE/);

  assert.match(
    storePage,
    /clubShopPurchaseOwnerRef\.current = \{[\s\S]{0,120}accountId: committedStoreAccountId/
  );
  assert.match(storePage, /hasExactDiamondRecovery[\s\S]{0,6000}'Verify Purchase'/);
  assert.match(clubDetail, /hasExactDiamondRecovery[\s\S]{0,1600}'Verify Purchase'/);
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
  assert.ok(
    clubAuth <
      clubPurchase.indexOf("const allowed = new Set(['clubId', 'itemId', 'expectedPrice'])")
  );
  assert.ok(
    clubAuth < clubPurchase.indexOf('const { clubId, itemId, expectedPrice } = req.body || {}')
  );
});

test('verified Stripe returns expose only the opaque request identity for exact cleanup', async () => {
  const [statusApi, storePage, clubDetail] = await Promise.all([
    read('pages/api/store/checkout-status.js'),
    read('pages/hub/diamond-store.js'),
    read('pages/hub/club-shop/[itemId].js'),
  ]);
  assert.match(statusApi, /requestId: session\.metadata\?\.checkout_request_id \|\| null/);
  assert.match(statusApi, /accountId: user\.id/);
  assert.match(statusApi, /sessionStatus: session\.status/);
  assert.match(storePage, /const expectedAccountId = getAuthUser\(\)\?\.id \|\| null/);
  const authGuard = storePage.indexOf('getAuthUser()?.id !== expectedAccountId');
  const normalize = storePage.indexOf('normalizeVerifiedCheckoutStatus(body, {', authGuard);
  const walletMutation = storePage.indexOf(
    'setClubDiamondBalance(verifiedWalletBalance)',
    normalize
  );
  const exactCleanup = storePage.indexOf('clearCommerceRequestById({', normalize);
  assert.ok(authGuard > -1 && normalize > authGuard);
  assert.ok(walletMutation > normalize && exactCleanup > normalize);
  assert.match(storePage, /clearCommerceRequestById/);
  assert.doesNotMatch(storePage, /checkoutReturn\.receipt\.requestId/);
  assert.match(storePage, /requestId: receipt\.requestId/);
  assert.match(clubDetail, /requestId: receipt\.requestId/);
  assert.doesNotMatch(storePage, /clearCommerceRequests/);
});
