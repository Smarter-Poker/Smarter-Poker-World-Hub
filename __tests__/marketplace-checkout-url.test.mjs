import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  checkoutRequestReplacementRequired,
  clubCardCheckoutOfferConfirmation,
  diamondCheckoutOfferConfirmation,
  lifetimeCheckoutOfferConfirmation,
  merchandiseCheckoutOfferConfirmation,
  merchandiseDiamondOfferConfirmation,
  normalizeVerifiedCheckoutSession,
  normalizeVerifiedCheckoutStatus,
  normalizeVerifiedCheckoutUrl,
  subscriptionCheckoutOfferConfirmation,
  vipDiamondOfferConfirmation,
} from '../src/lib/store/verifiedCheckoutUrl.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('Marketplace payment navigation accepts only hosted HTTPS Stripe Checkout URLs', () => {
  assert.equal(
    normalizeVerifiedCheckoutUrl(
      'https://checkout.stripe.com/c/pay/cs_live_verified?prefilled_email=x'
    ),
    'https://checkout.stripe.com/c/pay/cs_live_verified?prefilled_email=x'
  );
  assert.equal(normalizeVerifiedCheckoutUrl('http://checkout.stripe.com/c/pay/example'), null);
  assert.equal(
    normalizeVerifiedCheckoutUrl('https://checkout.stripe.com.evil.test/c/pay/example'),
    null
  );
  assert.equal(normalizeVerifiedCheckoutUrl('javascript:alert(1)'), null);
  assert.equal(
    normalizeVerifiedCheckoutUrl({ href: 'https://checkout.stripe.com/c/pay/example' }),
    null
  );
});

test('Marketplace checkout callers remain in the current browser surface', async () => {
  const files = await Promise.all([
    read('pages/hub/diamond-store.js'),
    read('pages/hub/diamond-store/cart.js'),
    read('pages/hub/club-shop/[itemId].js'),
    read('src/components/store/MerchStore.jsx'),
    read('pages/hub/memory-games.js'),
  ]);
  for (const source of files) {
    assert.match(source, /normalizeVerifiedCheckoutSession/);
    assert.match(source, /window\.location\.assign\(checkoutSession\.url\)/);
    assert.doesNotMatch(source, /window\.open\s*\(/);
  }
});

test('client checkout offers freeze exact account-bound integer terms', () => {
  const diamonds = diamondCheckoutOfferConfirmation('account-a', [
    { packageId: 'premium', quantity: 1, priceCents: 250, diamonds: 250, bonus: 25 },
    { packageId: 'basic', quantity: 1, price: 1, diamonds: 100, bonus: 0 },
    { packageId: 'premium', quantity: 1, priceCents: 250, diamonds: 250, bonus: 25 },
  ]);
  assert.deepEqual(diamonds, {
    version: 1,
    accountId: 'account-a',
    type: 'diamonds',
    currency: 'usd',
    totalCents: 600,
    totalDiamonds: 600,
    totalBonus: 50,
    items: [
      { packageId: 'basic', quantity: 1, unitCents: 100, diamonds: 100, bonus: 0 },
      { packageId: 'premium', quantity: 2, unitCents: 250, diamonds: 250, bonus: 25 },
    ],
  });
  assert.equal(Object.isFrozen(diamonds), true);
  assert.equal(Object.isFrozen(diamonds.items), true);
  assert.equal(Object.isFrozen(diamonds.items[0]), true);
  assert.equal(
    diamondCheckoutOfferConfirmation('account-a', [
      { packageId: 'basic', quantity: 1, price: 1.001, diamonds: 100, bonus: 0 },
    ]),
    null
  );

  const monthly = subscriptionCheckoutOfferConfirmation('account-a', {
    id: 'vip-monthly',
    interval: 'month',
    price: 19.99,
  });
  assert.deepEqual(monthly, {
    version: 1,
    accountId: 'account-a',
    type: 'subscription',
    currency: 'usd',
    plan: 'monthly',
    interval: 'month',
    quantity: 1,
    unitCents: 1999,
    totalCents: 1999,
  });
  assert.equal(
    subscriptionCheckoutOfferConfirmation('account-a', {
      id: 'vip-monthly',
      interval: 'year',
      price: 19.99,
    }),
    null
  );

  const lifetime = lifetimeCheckoutOfferConfirmation('account-a', {
    id: 'vip-lifetime',
    priceUsd: 499,
  });
  assert.deepEqual(lifetime, {
    version: 1,
    accountId: 'account-a',
    type: 'vip_lifetime',
    currency: 'usd',
    plan: 'lifetime',
    quantity: 1,
    unitCents: 49900,
    totalCents: 49900,
  });

  const merchandise = merchandiseCheckoutOfferConfirmation('account-a', [
    { id: 'display-key', catalogId: 'shirt', variantId: 'large', quantity: 2, price: 31.99 },
    { id: 'cards', variantId: null, quantity: 1, priceCents: 1899 },
  ]);
  assert.deepEqual(merchandise, {
    version: 1,
    accountId: 'account-a',
    type: 'merchandise',
    currency: 'usd',
    totalCents: 8297,
    items: [
      { id: 'cards', variantId: null, quantity: 1, unitCents: 1899 },
      { id: 'shirt', variantId: 'large', quantity: 2, unitCents: 3199 },
    ],
  });
  assert.equal(Object.isFrozen(merchandise.items), true);
  assert.equal(
    merchandiseCheckoutOfferConfirmation('account-a', [
      { id: 'shirt', variantId: 'large', quantity: 1, price: 31.99 },
      { id: 'shirt', variantId: 'large', quantity: 1, price: 31.99 },
    ]),
    null
  );
  assert.equal(
    merchandiseCheckoutOfferConfirmation('account-a', [
      { id: 'shirt', variantId: 'large', quantity: 1, price: 31.999 },
    ]),
    null
  );

  const clubId = '00000000-0000-4000-8000-000000000001';
  const itemId = '00000000-0000-4000-8000-000000000002';
  const club = clubCardCheckoutOfferConfirmation(
    'account-a',
    [{ packageId: 'premium', quantity: 1, unitCents: 250, diamonds: 250, bonus: 25 }],
    { clubId, itemId, itemPriceDiamonds: 200, cardChargeCents: 250 }
  );
  assert.deepEqual(club?.redemption, {
    kind: 'club_shop',
    clubId,
    itemId,
    itemPriceDiamonds: 200,
    cardChargeCents: 250,
  });
  assert.equal(Object.isFrozen(club?.redemption), true);
  assert.equal(
    clubCardCheckoutOfferConfirmation(
      'account-a',
      [{ packageId: 'premium', quantity: 1, unitCents: 250, diamonds: 250, bonus: 25 }],
      { clubId, itemId, itemPriceDiamonds: 200, cardChargeCents: 251 }
    ),
    null
  );

  const merchandiseDiamonds = merchandiseDiamondOfferConfirmation('account-a', [
    { id: 'shirt', variantId: 'large', quantity: 2, unitDiamonds: 3199 },
    { id: 'cards', quantity: 1, priceDiamonds: 1899 },
  ]);
  assert.deepEqual(merchandiseDiamonds, {
    version: 1,
    accountId: 'account-a',
    type: 'merchandise_diamonds',
    currency: 'diamonds',
    totalDiamonds: 8297,
    items: [
      { id: 'cards', variantId: null, quantity: 1, unitDiamonds: 1899 },
      { id: 'shirt', variantId: 'large', quantity: 2, unitDiamonds: 3199 },
    ],
  });
  assert.equal(
    merchandiseDiamondOfferConfirmation('account-a', [
      { id: 'shirt', quantity: 1, unitDiamonds: 0 },
    ]),
    null
  );

  assert.deepEqual(
    vipDiamondOfferConfirmation('account-a', {
      plan: 'lifetime',
      cost: 49900,
    }),
    {
      version: 1,
      accountId: 'account-a',
      type: 'vip_diamonds',
      currency: 'diamonds',
      plan: 'lifetime',
      cost: 49900,
    }
  );
});

test('Marketplace payment navigation binds the Stripe session and URL to the exact request', () => {
  const requestId = 'merch-request-000001';
  const sessionId = 'cs_test_verified123';
  const offer = { version: 1, type: 'merchandise', totalCents: 3999 };
  const payload = {
    success: true,
    duplicate: true,
    data: {
      session_id: sessionId,
      request_id: requestId,
      url: `https://checkout.stripe.com/c/pay/${sessionId}#checkout`,
      offer,
    },
  };

  assert.deepEqual(normalizeVerifiedCheckoutSession(payload, requestId, offer), {
    requestId,
    sessionId,
    url: `https://checkout.stripe.com/c/pay/${sessionId}#checkout`,
    duplicate: true,
    offer,
  });
  assert.equal(normalizeVerifiedCheckoutSession(payload, 'merch-request-000002', offer), null);
  assert.equal(
    normalizeVerifiedCheckoutSession(
      { ...payload, data: { ...payload.data, request_id: null } },
      requestId,
      offer
    ),
    null
  );
  assert.equal(
    normalizeVerifiedCheckoutSession(
      { ...payload, data: { ...payload.data, session_id: 'session-local' } },
      requestId,
      offer
    ),
    null
  );
  assert.equal(
    normalizeVerifiedCheckoutSession(
      {
        ...payload,
        data: {
          ...payload.data,
          url: 'https://checkout.stripe.com/c/pay/cs_test_different123',
        },
      },
      requestId,
      offer
    ),
    null
  );
  assert.equal(
    normalizeVerifiedCheckoutSession({ ...payload, success: false }, requestId, offer),
    null
  );
  assert.equal(normalizeVerifiedCheckoutSession(payload, requestId), null);
  assert.equal(
    normalizeVerifiedCheckoutSession(
      { ...payload, data: { ...payload.data, offer: undefined } },
      requestId,
      offer
    ),
    null
  );
  assert.equal(
    normalizeVerifiedCheckoutSession(payload, requestId, { ...offer, totalCents: 4000 }),
    null
  );
  assert.equal(checkoutRequestReplacementRequired({ code: 'CHECKOUT_EXPIRED' }), true);
  assert.equal(checkoutRequestReplacementRequired({ code: 'IDEMPOTENCY_CONFLICT' }), false);
});

test('Marketplace checkout status accepts only an exact owner-bound terminal receipt', () => {
  const sessionId = 'cs_test_verified123';
  const accountId = 'account-verified-001';
  const data = {
    status: 'complete',
    sessionId,
    accountId,
    requestId: 'checkout-request-000001',
    type: 'diamonds',
    paymentStatus: 'paid',
    sessionStatus: 'complete',
    amountTotal: 399,
    currency: 'usd',
    label: 'First Stack',
    purchaseKind: 'diamonds',
    itemId: null,
    diamonds: 550,
    walletBalance: 10550,
    redemptionStatus: null,
    redemptionError: null,
    orderId: 'purchase-verified-001',
    orderSource: 'diamonds',
    cartItems: [{ kind: 'diamonds', id: 'starter', variantId: null, quantity: 1 }],
  };
  const payload = { success: true, data };
  const expected = { sessionId, accountId };
  const receipt = normalizeVerifiedCheckoutStatus(payload, expected);
  assert.ok(receipt);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.cartItems), true);
  assert.equal(Object.isFrozen(receipt.cartItems[0]), true);

  for (const walletBalance of [-1, -2_147_483_648, 2_147_483_647]) {
    const debtReceipt = normalizeVerifiedCheckoutStatus(
      { ...payload, data: { ...data, walletBalance } },
      expected
    );
    assert.ok(debtReceipt, `accepts Diamond wallet balance ${walletBalance}`);
    assert.equal(debtReceipt.walletBalance, walletBalance);
  }

  for (const [field, value] of [
    ['sessionId', 'cs_test_different123'],
    ['accountId', 'account-different-001'],
    ['requestId', 'short'],
    ['type', 'purchase'],
    ['status', 'settled'],
    ['paymentStatus', 'refunded'],
    ['sessionStatus', 'closed'],
    ['orderId', ''],
    ['orderSource', 'vip'],
  ]) {
    assert.equal(
      normalizeVerifiedCheckoutStatus({ ...payload, data: { ...data, [field]: value } }, expected),
      null,
      `rejects ${field}`
    );
  }

  for (const walletBalance of [
    -2_147_483_649,
    2_147_483_648,
    -1.5,
    '-1',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.equal(
      normalizeVerifiedCheckoutStatus({ ...payload, data: { ...data, walletBalance } }, expected),
      null,
      `rejects invalid Diamond wallet balance ${walletBalance}`
    );
  }

  assert.equal(
    normalizeVerifiedCheckoutStatus(
      {
        ...payload,
        data: {
          ...data,
          type: 'merchandise',
          purchaseKind: 'merchandise',
          diamonds: null,
          walletBalance: -1,
          orderSource: 'merchandise',
          cartItems: [{ kind: 'merchandise', id: 'shirt', variantId: 'large', quantity: 1 }],
        },
      },
      expected
    ),
    null,
    'rejects a negative wallet balance outside a Diamond checkout receipt'
  );
  assert.equal(
    normalizeVerifiedCheckoutStatus(
      { ...payload, data: { ...data, paymentStatus: 'unpaid' } },
      expected
    ),
    null
  );
  assert.equal(
    normalizeVerifiedCheckoutStatus({ ...payload, data: { ...data, orderId: null } }, expected),
    null
  );
  assert.equal(
    normalizeVerifiedCheckoutStatus(
      {
        ...payload,
        data: { ...data, cartItems: [{ kind: 'diamonds', id: '', variantId: null, quantity: 1 }] },
      },
      expected
    ),
    null
  );

  assert.ok(
    normalizeVerifiedCheckoutStatus(
      {
        ...payload,
        data: {
          ...data,
          status: 'pending',
          orderId: null,
          orderSource: null,
          paymentStatus: 'paid',
          sessionStatus: 'complete',
          walletBalance: null,
          cartItems: [],
        },
      },
      expected
    )
  );
  assert.ok(
    normalizeVerifiedCheckoutStatus(
      {
        ...payload,
        data: {
          ...data,
          status: 'failed',
          orderId: null,
          orderSource: null,
          paymentStatus: 'unpaid',
          sessionStatus: 'expired',
          walletBalance: null,
          cartItems: [],
        },
      },
      expected
    )
  );
});

test('Every create-checkout success and recovery response echoes its validated request id', async () => {
  const checkoutRoute = await read('pages/api/store/create-checkout-session.js');
  const responseRequestIds =
    checkoutRoute.match(
      /\n\s+request_id: (?:checkoutRequestId|existingCheckout\.requestId|activeLifetimeCheckout\.requestId|recovered\.requestId),/g
    ) || [];
  assert.equal(responseRequestIds.length, 8);
  assert.equal((checkoutRoute.match(/\n\s+offer: checkoutOffer,/g) || []).length, 8);
  assert.match(
    checkoutRoute,
    /linkedCheckoutSessionMatches[\s\S]*metadata\.checkout_request_id === requestId[\s\S]*metadata\.checkout_intent_hash === intentHash/
  );
  assert.match(checkoutRoute, /metadata\[recordMetadataKey\] === row\?\.id/);
});

test('confirmed checkout offers bind the authenticated account to exact integer terms', async () => {
  const checkoutRoute = await read('pages/api/store/create-checkout-session.js');
  const start = checkoutRoute.indexOf('function exactJsonValueMatches');
  const end = checkoutRoute.indexOf('function computeCheckoutIntentHash', start);
  assert.ok(start >= 0 && end > start);
  const helpers = vm.runInNewContext(`
    const MAX_DIAMOND_QUANTITY_PER_PACKAGE = 10;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    ${checkoutRoute.slice(start, end)}
    ({ exactJsonValueMatches, isCheckoutOfferConfirmationShape, buildCheckoutOffer });
  `);

  const diamondOffer = JSON.parse(
    JSON.stringify(
      helpers.buildCheckoutOffer(
        'diamonds',
        {
          resolvedPackages: [
            { key: 'premium', quantity: 2, priceCents: 250, diamonds: 250, bonus: 25 },
            { key: 'basic', quantity: 1, priceCents: 100, diamonds: 100, bonus: 0 },
          ],
          checkoutTotals: { cardChargeCents: 600, diamonds: 600, bonus: 50 },
        },
        'account-a'
      )
    )
  );
  assert.deepEqual(diamondOffer, {
    version: 1,
    accountId: 'account-a',
    type: 'diamonds',
    currency: 'usd',
    totalCents: 600,
    totalDiamonds: 600,
    totalBonus: 50,
    items: [
      { packageId: 'basic', quantity: 1, unitCents: 100, diamonds: 100, bonus: 0 },
      { packageId: 'premium', quantity: 2, unitCents: 250, diamonds: 250, bonus: 25 },
    ],
  });
  assert.equal(helpers.isCheckoutOfferConfirmationShape('diamonds', diamondOffer), true);
  assert.equal(helpers.exactJsonValueMatches(diamondOffer, diamondOffer), true);
  assert.equal(
    helpers.isCheckoutOfferConfirmationShape('diamonds', { ...diamondOffer, extra: true }),
    false
  );
  const repricedDiamondOffer = {
    ...diamondOffer,
    totalCents: 602,
    items: diamondOffer.items.map((item) =>
      item.packageId === 'premium' ? { ...item, unitCents: 251 } : item
    ),
  };
  assert.equal(helpers.isCheckoutOfferConfirmationShape('diamonds', repricedDiamondOffer), true);
  assert.equal(helpers.exactJsonValueMatches(repricedDiamondOffer, diamondOffer), false);
  assert.equal(
    helpers.exactJsonValueMatches({ ...diamondOffer, accountId: 'account-b' }, diamondOffer),
    false
  );
  assert.equal(
    helpers.buildCheckoutOffer(
      'diamonds',
      {
        resolvedPackages: [{ key: 'basic', quantity: 1, priceCents: 100, diamonds: 100, bonus: 0 }],
        checkoutTotals: { cardChargeCents: 100, diamonds: 101, bonus: 0 },
      },
      'account-a'
    ),
    null
  );

  const subscriptionOffer = JSON.parse(
    JSON.stringify(
      helpers.buildCheckoutOffer(
        'subscription',
        { plan: { key: 'monthly', interval: 'month', unitAmount: 1999 } },
        'account-a'
      )
    )
  );
  assert.deepEqual(subscriptionOffer, {
    version: 1,
    accountId: 'account-a',
    type: 'subscription',
    currency: 'usd',
    plan: 'monthly',
    interval: 'month',
    quantity: 1,
    unitCents: 1999,
    totalCents: 1999,
  });
  assert.equal(helpers.isCheckoutOfferConfirmationShape('subscription', subscriptionOffer), true);
  assert.equal(
    helpers.isCheckoutOfferConfirmationShape('subscription', {
      ...subscriptionOffer,
      interval: 'year',
    }),
    false
  );
  assert.equal(
    helpers.buildCheckoutOffer(
      'subscription',
      { plan: { key: 'monthly', interval: 'year', unitAmount: 1999 } },
      'account-a'
    ),
    null
  );

  const lifetimeOffer = JSON.parse(
    JSON.stringify(helpers.buildCheckoutOffer('vip_lifetime', { unitAmount: 49900 }, 'account-a'))
  );
  assert.deepEqual(lifetimeOffer, {
    version: 1,
    accountId: 'account-a',
    type: 'vip_lifetime',
    currency: 'usd',
    plan: 'lifetime',
    quantity: 1,
    unitCents: 49900,
    totalCents: 49900,
  });
  assert.equal(helpers.isCheckoutOfferConfirmationShape('vip_lifetime', lifetimeOffer), true);

  const merchandiseOffer = JSON.parse(
    JSON.stringify(
      helpers.buildCheckoutOffer(
        'merchandise',
        {
          resolvedItems: [
            { id: 'shirt', variantId: 'large', quantity: 2, priceCents: 3199 },
            { id: 'cards', variantId: null, quantity: 1, priceCents: 1899 },
          ],
          totalCents: 8297,
        },
        'account-a'
      )
    )
  );
  assert.deepEqual(merchandiseOffer, {
    version: 1,
    accountId: 'account-a',
    type: 'merchandise',
    currency: 'usd',
    totalCents: 8297,
    items: [
      { id: 'cards', variantId: null, quantity: 1, unitCents: 1899 },
      { id: 'shirt', variantId: 'large', quantity: 2, unitCents: 3199 },
    ],
  });
  assert.equal(helpers.isCheckoutOfferConfirmationShape('merchandise', merchandiseOffer), true);
  assert.equal(
    helpers.isCheckoutOfferConfirmationShape('merchandise', {
      ...merchandiseOffer,
      items: [...merchandiseOffer.items, merchandiseOffer.items[1]],
      totalCents: 11496,
    }),
    false
  );

  const clubId = '00000000-0000-4000-8000-000000000001';
  const itemId = '00000000-0000-4000-8000-000000000002';
  const clubOffer = {
    ...diamondOffer,
    redemption: {
      kind: 'club_shop',
      clubId,
      itemId,
      itemPriceDiamonds: 500,
      cardChargeCents: diamondOffer.totalCents,
    },
  };
  assert.equal(helpers.isCheckoutOfferConfirmationShape('diamonds', clubOffer), true);
  assert.equal(
    helpers.isCheckoutOfferConfirmationShape('diamonds', {
      ...clubOffer,
      redemption: { ...clubOffer.redemption, cardChargeCents: clubOffer.totalCents + 1 },
    }),
    false
  );
});

test('a supplied offer confirmation conflicts before any checkout mutation', async () => {
  const checkoutRoute = await read('pages/api/store/create-checkout-session.js');
  const prepare = checkoutRoute.indexOf('preparedCheckout = await prepareCheckout');
  const snapshot = checkoutRoute.indexOf('let checkoutOffer = buildCheckoutOffer', prepare);
  const preflight = checkoutRoute.indexOf('preflightClubShopCardRedemption(', snapshot);
  const comparison = checkoutRoute.indexOf(
    '!exactJsonValueMatches(rawOfferConfirmation, checkoutOffer)',
    snapshot
  );
  const profileRead = checkoutRoute.indexOf(".from('profiles')", snapshot);
  const mutationIndexes = [
    checkoutRoute.indexOf("'claim_vip_subscription_checkout'", comparison),
    checkoutRoute.indexOf(".from('diamond_purchases')", comparison),
    checkoutRoute.indexOf(".from('merchandise_orders')", comparison),
    checkoutRoute.indexOf('stripe.checkout.sessions.create', comparison),
  ].filter((index) => index > -1);
  const firstCheckoutMutation = Math.min(...mutationIndexes);
  assert.ok(prepare > -1 && snapshot > prepare && comparison > snapshot);
  assert.ok(profileRead > snapshot && profileRead < comparison);
  assert.ok(preflight > profileRead && preflight < comparison);
  assert.ok(mutationIndexes.length > 0);
  assert.ok(firstCheckoutMutation > comparison);
  assert.match(checkoutRoute, /code: 'OFFER_CONFIRMATION_REQUIRED'/);
  assert.ok((checkoutRoute.match(/code: 'OFFER_CONFIRMATION_MISMATCH'/g) || []).length >= 3);
  const confirmationPresence = checkoutRoute.indexOf('const offerConfirmationProvided');
  const shapeGuard = checkoutRoute.indexOf(
    'if (!isCheckoutOfferConfirmationShape(type, rawOfferConfirmation))',
    confirmationPresence
  );
  const shapeMismatch = checkoutRoute.indexOf("code: 'OFFER_CONFIRMATION_MISMATCH'", shapeGuard);
  const inputGuard = checkoutRoute.indexOf(
    'if (offerConfirmationProvided && inputError.status < 500)',
    shapeMismatch
  );
  const inputMismatch = checkoutRoute.indexOf("code: 'OFFER_CONFIRMATION_MISMATCH'", inputGuard);
  assert.ok(confirmationPresence > -1 && shapeGuard > confirmationPresence && shapeGuard < prepare);
  assert.ok(shapeMismatch > shapeGuard && inputGuard > shapeMismatch && inputMismatch > inputGuard);
});

test('Recovered one-time Checkout sessions must match their durable row and request metadata', async () => {
  const checkoutRoute = await read('pages/api/store/create-checkout-session.js');
  const start = checkoutRoute.indexOf('function linkedCheckoutSessionMatches');
  const end = checkoutRoute.indexOf('async function inspectLinkedCheckout', start);
  assert.ok(start >= 0 && end > start);
  const matches = vm.runInNewContext(
    `${checkoutRoute.slice(start, end)}\nlinkedCheckoutSessionMatches`
  );
  const row = {
    id: '00000000-0000-4000-8000-000000000001',
    stripe_checkout_session_id: 'cs_test_verified123',
  };
  const identity = { requestId: 'merch-request-000001', intentHash: 'a'.repeat(64) };
  const session = {
    id: row.stripe_checkout_session_id,
    mode: 'payment',
    metadata: {
      type: 'merchandise',
      user_id: '00000000-0000-4000-8000-000000000002',
      checkout_request_id: identity.requestId,
      checkout_intent_hash: identity.intentHash,
      order_id: row.id,
    },
  };

  assert.equal(matches('merchandise', session.metadata.user_id, row, session, identity), true);
  assert.equal(
    matches('merchandise', session.metadata.user_id, row, session, {
      ...identity,
      requestId: 'merch-request-000002',
    }),
    false
  );
  assert.equal(
    matches(
      'merchandise',
      session.metadata.user_id,
      row,
      {
        ...session,
        metadata: { ...session.metadata, order_id: '00000000-0000-4000-8000-000000000003' },
      },
      identity
    ),
    false
  );
});
