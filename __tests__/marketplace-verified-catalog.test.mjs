import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  classifyVipDiamondPurchaseRefusal,
  normalizeVerifiedDiamondPackages,
  normalizeVerifiedVipDiamondPurchase,
} from '../src/lib/store/verifiedStoreCatalog.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('Diamond package verification rejects coerced, drifted, and duplicate offers', () => {
  const offer = {
    id: 'starter',
    name: 'Starter Diamonds',
    diamonds: 1000,
    bonus: 0,
    price: 10,
    priceCents: 1000,
    popular: false,
    hasDiscount: false,
    cardCheckoutReady: true,
    diamondCheckoutReady: false,
  };
  assert.equal(normalizeVerifiedDiamondPackages([offer])?.length, 1);
  assert.equal(normalizeVerifiedDiamondPackages([{ ...offer, diamonds: '1000' }]), null);
  assert.equal(normalizeVerifiedDiamondPackages([{ ...offer, priceCents: 999 }]), null);
  assert.equal(normalizeVerifiedDiamondPackages([{ ...offer, hasDiscount: true }]), null);
  assert.equal(normalizeVerifiedDiamondPackages([offer, offer]), null);
});

test('strict catalog drift is refused by both the API and Marketplace client', async () => {
  const [api, store] = await Promise.all([
    read('pages/api/club-arena/store-catalog.js'),
    read('pages/hub/diamond-store.js'),
  ]);
  assert.match(api, /if \(strict\)[\s\S]*STORE_CATALOG_DRIFT/);
  assert.match(store, /body\.warnings\.length > 0/);
  assert.match(store, /normalizeVerifiedDiamondPackages\(body\.diamondPackages\)/);
});

test('VIP Diamond settlement success stays bound to the confirmed plan and price', () => {
  const now = Date.parse('2026-09-15T12:00:00.000Z');
  const accountId = 'fade0000-0000-4000-8000-000000000034';
  const requestId = 'fade0000-0000-4000-8000-000000000041';
  const expected = { plan: 'monthly', cost: 1999, accountId, requestId };
  const success = {
    success: true,
    accountId,
    requestId,
    isVip: true,
    plan: 'monthly',
    tier: 'monthly',
    cost: 1999,
    daysAdded: 30,
    expiresAt: '2026-10-15T12:00:00.000Z',
    newBalance: 8001,
    duplicate: false,
    idempotent: false,
  };
  const normalize = (raw) => normalizeVerifiedVipDiamondPurchase(raw, expected, now);
  assert.equal(normalize(success)?.newBalance, 8001);
  assert.equal(normalize({ ...success, cost: 1998 }), null);
  assert.equal(normalize({ ...success, newBalance: '8001' }), null);
  assert.equal(normalize({ ...success, duplicate: true }), null);
  assert.equal(
    normalize({
      ...success,
      accountId: 'fade0000-0000-4000-8000-000000000035',
    }),
    null
  );
  assert.equal(
    normalize({
      ...success,
      requestId: 'fade0000-0000-4000-8000-000000000042',
    }),
    null
  );
  assert.equal(normalize({ ...success, tier: 'yearly' })?.tier, 'yearly');
  assert.equal(normalize({ ...success, tier: 'lifetime', expiresAt: null }), null);
  assert.equal(
    normalizeVerifiedVipDiamondPurchase(
      {
        ...success,
        plan: 'yearly',
        tier: 'monthly',
        cost: 19999,
        daysAdded: 365,
      },
      { ...expected, plan: 'yearly', cost: 19999 },
      now
    ),
    null
  );
  assert.equal(
    normalize({
      ...success,
      expiresAt: '2026-09-14T12:00:00.000Z',
    }),
    null
  );
  const historicalReplay = normalize({
    ...success,
    expiresAt: '2026-09-14T12:00:00.000Z',
    duplicate: true,
    idempotent: true,
  });
  assert.equal(historicalReplay?.historical, true);
  assert.equal(
    classifyVipDiamondPurchaseRefusal(
      409,
      {
        success: false,
        ...expected,
        code: 'IDEMPOTENCY_CONFLICT',
      },
      expected
    ).definitive,
    false
  );
  assert.equal(
    classifyVipDiamondPurchaseRefusal(
      409,
      {
        success: false,
        ...expected,
        code: 'ALREADY_LIFETIME',
      },
      expected
    ).definitive,
    true
  );
  assert.equal(
    classifyVipDiamondPurchaseRefusal(
      409,
      {
        success: false,
        ...expected,
        code: 'OFFER_PRICE_CHANGED',
      },
      expected
    ).definitive,
    true
  );
  assert.equal(
    classifyVipDiamondPurchaseRefusal(
      409,
      {
        success: false,
        ...expected,
        requestId: 'fade0000-0000-4000-8000-000000000043',
        code: 'ALREADY_LIFETIME',
      },
      expected
    ).definitive,
    false
  );
  assert.equal(
    classifyVipDiamondPurchaseRefusal(
      503,
      {
        success: false,
        ...expected,
        code: 'VIP_ELIGIBILITY_UNAVAILABLE',
      },
      expected
    ).definitive,
    false
  );
});
