/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLUB SHOP ITEM RULES — regression suite
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
  ITEM_TYPE_BY_CATEGORY,
  GRANT_TYPE_BY_CATEGORY,
  GRANT_TYPES,
  MAX_GRANT_QTY,
  buildGrantSpec,
  normalizeImageUrl,
  HAS_SALES_ERROR,
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
});

describe('buildGrantSpec — an item must never silently grant nothing', () => {
  test('derives the grant from the category when the caller says nothing', () => {
    // Regression: /api/club-arena/shop-items never set grant_spec at all, so
    // every item created from the World Hub admin granted nothing on redeem.
    assert.deepEqual(buildGrantSpec('Time Banks').spec, { type: 'time_bank', qty: 1 });
    assert.deepEqual(buildGrantSpec('Emotes').spec, { type: 'emote_pack' });
  });

  test('defaults a missing quantity to 1 instead of failing the request', () => {
    // Regression: requiring grantQty 400'd the two most common categories for
    // any caller that predated grants.
    assert.equal(buildGrantSpec('Throwables').spec.qty, 1);
  });

  test('honours an explicit quantity', () => {
    assert.equal(buildGrantSpec('Throwables', 'throwable', 10).spec.qty, 10);
  });

  test('floors a fractional quantity so the DB cast cannot fail', () => {
    assert.equal(buildGrantSpec('Throwables', 'throwable', 3.9).spec.qty, 3);
  });

  test('rejects a quantity outside 1..MAX', () => {
    assert.ok(buildGrantSpec('Throwables', 'throwable', 0).error);
    assert.ok(buildGrantSpec('Throwables', 'throwable', -5).error);
    assert.ok(buildGrantSpec('Throwables', 'throwable', MAX_GRANT_QTY + 1).error);
    assert.ok(buildGrantSpec('Throwables', 'throwable', 'abc').error);
  });

  test('an explicit "none" is preserved — a club-fulfilled perk is legitimate', () => {
    assert.deepEqual(buildGrantSpec('Exclusive').spec, { type: 'none' });
    assert.deepEqual(buildGrantSpec('Time Banks', 'none').spec, { type: 'none' });
  });

  test('an UNKNOWN grant type falls back to the category, never to nothing', () => {
    // The route rejects unknown types with a 400; if it ever reaches here the
    // safe answer is the category's real grant, not a silent downgrade.
    assert.equal(buildGrantSpec('Time Banks', 'wormhole').spec.type, 'time_bank');
  });

  test('avatar and theme ids are carried through when supplied', () => {
    assert.equal(buildGrantSpec('Avatars', 'avatar', null, 'shark').spec.avatar_id, 'shark');
    assert.equal(
      buildGrantSpec('Table Skins', 'table_skin', null, 'royal_gold').spec.theme_id,
      'royal_gold'
    );
  });

  test('ids are length-capped', () => {
    const long = 'x'.repeat(500);
    assert.ok(buildGrantSpec('Avatars', 'avatar', null, long).spec.avatar_id.length <= 64);
  });

  test('quantity-less grant types do not carry a qty', () => {
    assert.equal(buildGrantSpec('Emotes').spec.qty, undefined);
    assert.equal(buildGrantSpec('Avatars', 'avatar', null, 'x').spec.qty, undefined);
  });
});

describe('normalizeImageUrl — a club admin must not be able to beacon members', () => {
  test('accepts https', () => {
    assert.equal(normalizeImageUrl('https://cdn.example.com/a.png').value, 'https://cdn.example.com/a.png');
  });

  test('accepts a same-origin absolute path', () => {
    assert.equal(normalizeImageUrl('/hub/club-arena/images/shop/a.svg').value, '/hub/club-arena/images/shop/a.svg');
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

describe('delete guard', () => {
  test('the sold-item refusal names the safe alternative', () => {
    // club_shop_purchases.item_id is ON DELETE CASCADE: deleting a sold item
    // erases the club's revenue history.
    assert.match(HAS_SALES_ERROR, /hide/i);
  });

  test('itemHasSales reports true only when a purchase row exists', async () => {
    const fake = (rows) => ({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ limit: async () => ({ data: rows }) }) }),
        }),
      }),
    });
    assert.equal(await rules.itemHasSales(fake([{ id: 1 }]), 'c', 'i'), true);
    assert.equal(await rules.itemHasSales(fake([]), 'c', 'i'), false);
    assert.equal(await rules.itemHasSales(fake(null), 'c', 'i'), false);
  });
});
