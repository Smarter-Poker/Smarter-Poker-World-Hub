import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  classifyMerchDiamondPurchaseRefusal,
  normalizeVerifiedMerchDiamondPurchase,
} from '../src/lib/store/verifiedCommerceResponse.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('Merchandise Diamond success requires a complete exact response contract', () => {
  const success = {
    success: true,
    accountId: 'fade0000-0000-4000-8000-000000000032',
    requestId: 'fade0000-0000-4000-8000-000000000036',
    idempotent: false,
    duplicate: false,
    data: {
      order_id: 'fade0000-0000-4000-8000-000000000031',
      currency: 'diamonds',
      diamonds_spent: 5999,
      new_balance: 44001,
      items_purchased: 1,
      items: [{ id: 'hoodie-neural', variantId: 'black-xl', quantity: 1 }],
      total_usd: 59.99,
      fulfillment_status: null,
      fulfillment_mode: 'manual',
    },
  };
  const expected = {
    accountId: 'fade0000-0000-4000-8000-000000000032',
    requestId: 'fade0000-0000-4000-8000-000000000036',
    units: 1,
    diamondsSpent: 5999,
    items: [{ id: 'hoodie-neural', variantId: 'black-xl', quantity: 1 }],
  };
  assert.equal(normalizeVerifiedMerchDiamondPurchase(success, expected)?.newBalance, 44001);
  assert.equal(
    normalizeVerifiedMerchDiamondPurchase({ ...success, duplicate: true }, expected),
    null
  );
  assert.equal(
    normalizeVerifiedMerchDiamondPurchase(
      {
        ...success,
        accountId: 'fade0000-0000-4000-8000-000000000033',
      },
      expected
    ),
    null
  );
  assert.equal(
    normalizeVerifiedMerchDiamondPurchase(
      {
        ...success,
        requestId: 'fade0000-0000-4000-8000-000000000037',
      },
      expected
    ),
    null
  );
  assert.equal(
    normalizeVerifiedMerchDiamondPurchase(
      {
        ...success,
        data: { ...success.data, new_balance: '44001' },
      },
      expected
    ),
    null
  );
  assert.equal(normalizeVerifiedMerchDiamondPurchase(success, { ...expected, units: 2 }), null);
  assert.equal(
    normalizeVerifiedMerchDiamondPurchase(success, {
      ...expected,
      items: [{ id: 'royal-circuit-tee', variantId: 'black-xl', quantity: 1 }],
    }),
    null
  );
  assert.equal(
    normalizeVerifiedMerchDiamondPurchase(
      {
        ...success,
        data: {
          ...success.data,
          items_purchased: 1,
          items: [{ id: 'hoodie-neural', variantId: 'black-xl', quantity: 2 }],
        },
      },
      { ...expected, units: 1 }
    ),
    null
  );
  assert.equal(
    normalizeVerifiedMerchDiamondPurchase(success, {
      ...expected,
      diamondsSpent: 6000,
    }),
    null
  );
});

test('Merchandise refusals retire keys only when no debit is proven', () => {
  const expected = {
    accountId: 'fade0000-0000-4000-8000-000000000038',
    requestId: 'fade0000-0000-4000-8000-000000000039',
  };
  const bound = { success: false, ...expected, code: 'insufficient_diamonds' };
  assert.equal(classifyMerchDiamondPurchaseRefusal(400, bound, expected).definitive, true);
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(
      400,
      {
        ...bound,
        requestId: 'fade0000-0000-4000-8000-000000000040',
      },
      expected
    ).definitive,
    false
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(
      400,
      {
        ...bound,
        success: true,
      },
      expected
    ).definitive,
    false
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(
      400,
      {
        ...expected,
        success: false,
        code: 'UNKNOWN_POST_COMMIT_CODE',
      },
      expected
    ).definitive,
    false
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(
      409,
      {
        success: false,
        ...expected,
        code: 'reference_conflict',
      },
      expected
    ).definitive,
    false
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(
      409,
      {
        success: false,
        ...expected,
        code: 'price_changed',
      },
      expected
    ).definitive,
    true
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(
      409,
      {
        success: false,
        ...expected,
        code: 'processing',
      },
      expected
    ).definitive,
    false
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(
      503,
      {
        success: false,
        ...expected,
        error: 'unavailable',
      },
      expected
    ).definitive,
    false
  );
});

test('single-card and cart purchases verify before retiring their durable request', async () => {
  const [store, cart, purchaseApi] = await Promise.all([
    read('src/components/store/MerchStore.jsx'),
    read('pages/hub/diamond-store/cart.js'),
    read('pages/api/store/purchase-with-diamonds.js'),
  ]);
  for (const source of [store, cart]) {
    assert.match(source, /normalizeVerifiedMerchDiamondPurchase/);
    const verification = source.indexOf('normalizeVerifiedMerchDiamondPurchase');
    const clearing = source.indexOf('clearCommerceRequestId', verification);
    assert.ok(clearing > verification);
  }
  assert.match(cart, /items: pendingDiamondCheckout\.items/);
  assert.match(cart, /diamondsSpent: pendingDiamondCheckout\.cost/);
  assert.match(cart, /accountId:/);
  assert.match(store, /items: \[purchaseLine\]/);
  assert.match(store, /diamondsSpent: cost/);
  assert.match(store, /accountId:/);
  assert.match(purchaseApi, /accountId: user\.id/);
  assert.match(cart, /purchasedIdentities/);
  assert.match(purchaseApi, /normalizeSuccessfulPurchaseResult/);
  assert.match(purchaseApi, /item\.quantity !== expected\.qty/);
  assert.match(purchaseApi, /totalDiamonds !== raw\.diamonds_spent/);
  assert.match(
    purchaseApi,
    /raw\?\.fulfillment_mode === null[\s\S]*?expectedFulfillmentMode === 'none'[\s\S]*?\? 'none'/
  );
  assert.match(purchaseApi, /verifiedFulfillmentMode !== expectedFulfillmentMode/);
  assert.match(purchaseApi, /code: 'PURCHASE_RESULT_UNVERIFIED'/);
  assert.doesNotMatch(purchaseApi, /const quantity = Number\(item\?\.quantity/);
});
