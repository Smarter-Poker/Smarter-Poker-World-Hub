/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLUB SHOP ITEM RULES: regression suite
 *
 *  src/lib/club-arena/shopItemRules.js is the single validator shared by BOTH
 *  admin write paths (/api/club-arena/manage-shop and .../shop-items). Before
 *  it existed the two routes disagreed, and items created from the World Hub
 *  granted nothing, accepted any image URL, and could be hard-deleted along
 *  with their purchase history.
 *
 *  Run: node --test tests/shop-item-rules.test.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../src/lib/club-arena/shopItemRules.js');

const {
  VALID_CATEGORIES,
  PURCHASE_ENABLED_CATEGORIES,
  PURCHASE_CATEGORY_INVALID_CODE,
  ITEM_TYPE_BY_CATEGORY,
  GRANT_TYPE_BY_CATEGORY,
  GRANT_TYPES,
  MAX_GRANT_QTY,
  buildGrantSpec,
  normalizeImageUrl,
  HAS_SALES_ERROR,
  PURCHASE_HISTORY_VERIFICATION_CODE,
  ALL_THROWABLES_NAME,
  ALL_THROWABLES_DESCRIPTION,
  ALL_THROWABLES_IMAGE_URL,
  ALL_THROWABLES_GRANT_SPEC,
  THROWABLES_PLATFORM_MANAGED_CODE,
  enforceAllThrowablesMutation,
  FULFILLMENT_REQUIRED_CODE,
  isDeliverableShopItem,
  enforceFulfillableMutation,
  normalizePurchaseCategory,
} = rules;

describe('category vocabulary', () => {
  test('every category maps to an item_type and a grant type', () => {
    for (const cat of VALID_CATEGORIES) {
      assert.ok(ITEM_TYPE_BY_CATEGORY[cat], `${cat} has no item_type`);
      assert.ok(GRANT_TYPE_BY_CATEGORY[cat], `${cat} has no grant type`);
      assert.ok(
        GRANT_TYPES.includes(GRANT_TYPE_BY_CATEGORY[cat]),
        `${cat} maps to a grant type the DB CHECK would reject`
      );
    }
  });

  test('the grant vocabulary matches the club_shop_items CHECK constraint', () => {
    assert.deepEqual(
      [...GRANT_TYPES].sort(),
      ['avatar', 'emote_pack', 'none', 'table_skin', 'throwable', 'time_bank'].sort()
    );
  });

  test('only currently verified fulfillment categories are purchase enabled', () => {
    assert.deepEqual(PURCHASE_ENABLED_CATEGORIES, ['Time Banks', 'Throwables']);
  });

  test('never silently coerces a missing or unsupported purchase category', () => {
    assert.equal(normalizePurchaseCategory('Time Banks').value, 'Time Banks');
    for (const category of [undefined, '', 'Table Skins', 'Avatars']) {
      assert.equal(normalizePurchaseCategory(category).code, PURCHASE_CATEGORY_INVALID_CODE);
    }
  });
});

describe('buildGrantSpec: an item must never silently grant nothing', () => {
  test('derives the grant from the category when the caller says nothing', () => {
    // Regression: /api/club-arena/shop-items never set grant_spec at all, so
    // every item created from the World Hub admin granted nothing on redeem.
    assert.deepEqual(buildGrantSpec('Time Banks').spec, { type: 'time_bank', qty: 1 });
    assert.equal(buildGrantSpec('Emotes').code, FULFILLMENT_REQUIRED_CODE);
  });

  test('defaults a missing time-bank quantity to 1 instead of failing the request', () => {
    // Regression: requiring grantQty 400'd the two most common categories for
    // any caller that predated grants.
    assert.equal(buildGrantSpec('Time Banks').spec.qty, 1);
  });

  test('always represents throwables as the generic ten-use pack', () => {
    assert.equal(buildGrantSpec('Throwables').spec.qty, 10);
    assert.equal(buildGrantSpec('Throwables', 'throwable', 10).spec.qty, 10);
    assert.match(buildGrantSpec('Throwables', 'throwable', 3).error, /exactly 10/i);
  });

  test('honours an explicit quantity', () => {
    assert.equal(buildGrantSpec('Throwables', 'throwable', 10).spec.qty, 10);
  });

  test('rejects a fractional time-bank quantity instead of silently changing the offer', () => {
    assert.match(buildGrantSpec('Time Banks', 'time_bank', 3.9).error, /integer between/i);
  });

  test('rejects a quantity outside 1..MAX', () => {
    assert.ok(buildGrantSpec('Throwables', 'throwable', 0).error);
    assert.ok(buildGrantSpec('Throwables', 'throwable', -5).error);
    assert.ok(buildGrantSpec('Time Banks', 'time_bank', MAX_GRANT_QTY + 1).error);
    assert.ok(buildGrantSpec('Time Banks', 'time_bank', 'abc').error);
  });

  test('rejects categories and explicit grants that have no executable delivery', () => {
    for (const result of [buildGrantSpec('Exclusive'), buildGrantSpec('Time Banks', 'none')]) {
      assert.equal(result.code, FULFILLMENT_REQUIRED_CODE);
      assert.match(result.error, /executable digital grant/i);
    }
  });

  test('rejects cross-category grant mismatches', () => {
    for (const result of [
      buildGrantSpec('Time Banks', 'avatar', null, 'shark'),
      buildGrantSpec('Avatars', 'time_bank', 2),
      buildGrantSpec('Emotes', 'table_skin', null, 'royal_gold'),
    ]) {
      assert.equal(result.code, FULFILLMENT_REQUIRED_CODE);
    }
  });

  test('an unknown grant type fails closed at the shared validator', () => {
    const result = buildGrantSpec('Time Banks', 'wormhole');
    assert.equal(result.code, FULFILLMENT_REQUIRED_CODE);
    assert.match(result.error, /invalid granttype/i);
  });

  test('unverified entitlement categories remain fail closed even with a supplied ref', () => {
    for (const result of [
      buildGrantSpec('Avatars', 'avatar', null, 'shark'),
      buildGrantSpec('Table Skins', 'table_skin', null, 'royal_gold'),
      buildGrantSpec('Emotes', 'emote_pack'),
    ]) {
      assert.equal(result.code, FULFILLMENT_REQUIRED_CODE);
    }
  });
});

describe('paid item fulfillment boundary', () => {
  const valid = {
    category: 'Time Banks',
    item_type: 'time_bank',
    grant_spec: { type: 'time_bank', qty: 1 },
    is_active: true,
    stackable: true,
  };
  const historicalNoOp = {
    category: 'Exclusive',
    grant_spec: { type: 'none' },
    is_active: true,
  };

  test('accepts only a category-matched executable grant', () => {
    assert.equal(isDeliverableShopItem(valid), true);
    assert.equal(isDeliverableShopItem(historicalNoOp), false);
    assert.equal(
      isDeliverableShopItem({ category: 'Time Banks', grant_spec: { type: 'avatar' } }),
      false
    );
    assert.equal(
      isDeliverableShopItem({
        name: ALL_THROWABLES_NAME,
        category: 'Throwables',
        item_type: 'throwable',
        is_active: true,
        stackable: true,
        grant_spec: { type: 'throwable', qty: 10 },
      }),
      true
    );
    assert.equal(
      isDeliverableShopItem({
        name: 'Tomato Pack',
        category: 'Throwables',
        item_type: 'throwable',
        is_active: true,
        grant_spec: { type: 'throwable', qty: 10 },
      }),
      false
    );
    assert.equal(
      isDeliverableShopItem({
        category: 'Table Skins',
        grant_spec: { type: 'table_skin', theme_id: 'royal_gold' },
      }),
      false
    );
  });

  test('never lets another fulfillment type reuse the reserved All Throwables identity', () => {
    assert.equal(isDeliverableShopItem({ ...valid, name: ALL_THROWABLES_NAME }), false);
  });

  test('allows an active historical no-op to be hidden, but never reactivated', () => {
    assert.equal(enforceFulfillableMutation('toggle', {}, historicalNoOp).allowed, true);
    const hidden = { ...historicalNoOp, is_active: false };
    assert.equal(enforceFulfillableMutation('toggle', {}, hidden).code, FULFILLMENT_REQUIRED_CODE);
  });

  test('blocks commercial edits until a historical no-op is converted to real delivery', () => {
    assert.equal(
      enforceFulfillableMutation('update', { price: 500 }, historicalNoOp).code,
      FULFILLMENT_REQUIRED_CODE
    );
    assert.equal(
      enforceFulfillableMutation(
        'update',
        { category: 'Time Banks', grantType: 'time_bank', grantQty: 2, stackable: true },
        historicalNoOp
      ).allowed,
      true
    );
  });

  test('blocks converting a valid paid item to none, Exclusive, or a mismatched grant', () => {
    for (const mutation of [
      { grantType: 'none' },
      { category: 'Exclusive' },
      { category: 'Avatars', grantType: 'time_bank' },
    ]) {
      assert.equal(
        enforceFulfillableMutation('update', mutation, valid).code,
        FULFILLMENT_REQUIRED_CODE
      );
    }
  });

  test('rejects consumables that would become false permanent ownership', () => {
    assert.equal(isDeliverableShopItem({ ...valid, stackable: false }), false);
    assert.equal(
      enforceFulfillableMutation('update', { stackable: false }, valid).code,
      FULFILLMENT_REQUIRED_CODE
    );
  });

  test('repairs a stale canonical All Throwables row before fulfillment validation', () => {
    const staleCanonical = {
      name: ALL_THROWABLES_NAME,
      category: 'Throwables',
      item_type: null,
      grant_spec: { type: 'throwable', qty: 10 },
      is_active: true,
      stackable: false,
    };
    const platformGuard = enforceAllThrowablesMutation('update', { price: 2500 }, staleCanonical);
    assert.equal(platformGuard.managed, true);
    const normalized = { ...staleCanonical, ...platformGuard.updates };
    assert.equal(enforceFulfillableMutation('update', { price: 2500 }, normalized).allowed, true);
  });

  test('rejects a display item type that contradicts the paid grant', () => {
    assert.equal(isDeliverableShopItem({ ...valid, item_type: 'avatar' }), false);
  });
});

describe('normalizeImageUrl: a club admin must not be able to beacon members', () => {
  test('accepts https', () => {
    assert.equal(
      normalizeImageUrl('https://cdn.example.com/a.png').value,
      'https://cdn.example.com/a.png'
    );
  });

  test('accepts a same-origin absolute path', () => {
    assert.equal(
      normalizeImageUrl('/hub/club-arena/images/shop/a.svg').value,
      '/hub/club-arena/images/shop/a.svg'
    );
  });

  test('rejects a protocol-relative URL that only LOOKS same-origin', () => {
    // Regression: '//evil.example/x.gif' starts with '/' and passed the
    // same-origin branch on both client and server.
    assert.ok(normalizeImageUrl('//evil.example/x.gif').error);
  });

  test('rejects http and unparseable input', () => {
    assert.ok(normalizeImageUrl('http://evil.example/a.png').error);
    assert.ok(normalizeImageUrl('not a url').error);
  });

  test('distinguishes "not supplied" from "explicitly cleared"', () => {
    // A partial update must not blank an image the caller never mentioned.
    assert.equal(normalizeImageUrl(undefined).skip, true);
    assert.equal(normalizeImageUrl(null).value, null);
    assert.equal(normalizeImageUrl('').value, null);
    assert.equal(normalizeImageUrl('   ').value, null);
  });

  test('caps the stored length', () => {
    const long = 'https://e.com/' + 'a'.repeat(2000);
    assert.ok(normalizeImageUrl(long).value.length <= 500);
  });
});

describe('platform-owned All Throwables Pack', () => {
  const canonicalItem = {
    name: ALL_THROWABLES_NAME,
    description: ALL_THROWABLES_DESCRIPTION,
    category: 'Throwables',
    item_type: 'throwable',
    grant_spec: { ...ALL_THROWABLES_GRANT_SPEC },
    image_url: ALL_THROWABLES_IMAGE_URL,
    is_active: true,
    stackable: true,
    per_user_limit: null,
  };

  test('rejects creating any club-authored throwable offer', () => {
    for (const body of [
      { category: 'Throwables' },
      { category: 'Exclusive', grantType: 'throwable' },
      { name: ALL_THROWABLES_NAME, category: 'Time Banks' },
    ]) {
      const result = enforceAllThrowablesMutation('create', body);
      assert.equal(result.code, THROWABLES_PLATFORM_MANAGED_CODE);
      assert.match(result.error, /cannot create/i);
    }
  });

  test('rejects converting another item into a throwable offer', () => {
    const result = enforceAllThrowablesMutation(
      'update',
      { category: 'Throwables', grantQty: 10 },
      { category: 'Time Banks', item_type: 'time_bank', grant_spec: { type: 'time_bank', qty: 1 } }
    );
    assert.equal(result.code, THROWABLES_PLATFORM_MANAGED_CODE);
  });

  test('rejects renaming another item to the reserved platform identity', () => {
    const result = enforceAllThrowablesMutation(
      'update',
      { name: ALL_THROWABLES_NAME },
      {
        name: 'Time Bank',
        category: 'Time Banks',
        item_type: 'time_bank',
        grant_spec: { type: 'time_bank', qty: 1 },
      }
    );
    assert.equal(result.code, THROWABLES_PLATFORM_MANAGED_CODE);
  });

  test('rejects updating a hidden historical item-specific throwable row', () => {
    const result = enforceAllThrowablesMutation(
      'update',
      { price: 900 },
      {
        name: 'Tomato Pack (10)',
        category: 'Throwables',
        item_type: 'throwable',
        grant_spec: { type: 'throwable', qty: 10 },
        is_active: false,
      }
    );
    assert.equal(result.code, THROWABLES_PLATFORM_MANAGED_CODE);
  });

  test('normalizes canonical identity while allowing commercial fields', () => {
    const result = enforceAllThrowablesMutation(
      'update',
      { price: 1500, stock: 100, salePrice: 1250, sortOrder: 30 },
      canonicalItem
    );
    assert.equal(result.managed, true);
    assert.deepEqual(result.updates.grant_spec, { type: 'throwable', qty: 10 });
    assert.equal(result.updates.name, ALL_THROWABLES_NAME);
    assert.equal(result.updates.image_url, ALL_THROWABLES_IMAGE_URL);
    assert.equal(
      result.updates.image_url,
      '/hub/club-arena/images/marketplace/throwables/all-throwables-access-v1.png'
    );
    assert.equal(result.updates.is_active, true);
    assert.equal(result.updates.stackable, true);
    assert.equal(result.updates.per_user_limit, null);
  });

  test('rejects every item-specific identity mutation', () => {
    const conflicts = [
      { name: 'Tomato Pack (10)' },
      { description: 'Only Tomatoes.' },
      { category: 'Exclusive' },
      { imageUrl: '/tomato.png' },
      { grantType: 'throwable', grantQty: 3 },
      { grantRef: 'tomato' },
      { isActive: false },
      { stackable: false },
      { perUserLimit: 1 },
    ];
    for (const body of conflicts) {
      const result = enforceAllThrowablesMutation('update', body, canonicalItem);
      assert.equal(result.code, THROWABLES_PLATFORM_MANAGED_CODE, JSON.stringify(body));
    }
  });

  test('allows callers to repeat the exact canonical identity', () => {
    const result = enforceAllThrowablesMutation(
      'update',
      {
        name: ALL_THROWABLES_NAME,
        description: ALL_THROWABLES_DESCRIPTION,
        category: 'Throwables',
        imageUrl: ALL_THROWABLES_IMAGE_URL,
        grantType: 'throwable',
        grantQty: 10,
        grantRef: '',
        isActive: true,
        stackable: true,
        perUserLimit: null,
      },
      canonicalItem
    );
    assert.equal(result.managed, true);
    assert.deepEqual(result.updates.grant_spec, { type: 'throwable', qty: 10 });
  });

  test('rejects hiding or deleting the platform offer', () => {
    assert.equal(
      enforceAllThrowablesMutation('toggle', {}, canonicalItem).code,
      THROWABLES_PLATFORM_MANAGED_CODE
    );
    assert.equal(
      enforceAllThrowablesMutation('delete', {}, canonicalItem).code,
      THROWABLES_PLATFORM_MANAGED_CODE
    );
  });

  test('does not interfere with unrelated catalog items', () => {
    const normal = {
      category: 'Time Banks',
      item_type: 'time_bank',
      grant_spec: { type: 'time_bank' },
    };
    assert.deepEqual(enforceAllThrowablesMutation('create', { category: 'Time Banks' }), {
      managed: false,
    });
    assert.deepEqual(enforceAllThrowablesMutation('update', { price: 2000 }, normal), {
      managed: false,
    });
    assert.deepEqual(enforceAllThrowablesMutation('toggle', {}, normal), { managed: false });
    assert.deepEqual(enforceAllThrowablesMutation('delete', {}, normal), { managed: false });
  });
});

describe('delete guard', () => {
  test('the sold-item refusal names the safe alternative', () => {
    // club_shop_purchases.item_id is ON DELETE CASCADE: deleting a sold item
    // erases the club's revenue history.
    assert.match(HAS_SALES_ERROR, /hide/i);
  });

  test('itemHasSales reports true only when a verified purchase row exists', async () => {
    const fake = (rows, error = null) => ({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ limit: async () => ({ data: rows, error }) }) }),
        }),
      }),
    });
    assert.equal(await rules.itemHasSales(fake([{ id: 1 }]), 'c', 'i'), true);
    assert.equal(await rules.itemHasSales(fake([]), 'c', 'i'), false);
  });

  test('itemHasSales fails closed when purchase history cannot be verified', async () => {
    const fake = (data, error = null) => ({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ limit: async () => ({ data, error }) }) }),
        }),
      }),
    });

    for (const query of [fake(null), fake(null, { message: 'database unavailable' })]) {
      await assert.rejects(
        rules.itemHasSales(query, 'c', 'i'),
        (error) => error?.code === PURCHASE_HISTORY_VERIFICATION_CODE
      );
    }
  });
});
