import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260829130000_club_shop_atomic_purchase.sql');
const endpoint = read('pages/api/club-arena/marketplace-purchase.js');
const manageShop = read('pages/api/club-arena/manage-shop.js');
const purchaseLedger = read('pages/api/club-arena/shop-purchases.js');
const require = createRequire(import.meta.url);
const { scopedKey } = require('../src/lib/club-arena/durableIdempotency.js');

test('Club Shop purchase is a single database transaction', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_purchase_club_shop_item_diamonds/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /FROM public\.club_shop_items[\s\S]*FOR UPDATE/);
  assert.match(migration, /public\.add_diamonds_to_balance\(/);
  assert.match(migration, /INSERT INTO public\.club_shop_purchases/);
  assert.match(migration, /RETURNING \* INTO v_purchase/);
  assert.match(endpoint, /fn_purchase_club_shop_item_diamonds/);
  assert.doesNotMatch(endpoint, /\.from\('club_shop_purchases'\)[\s\S]*?\.insert/);
});

test('sold grants are immutable and redemption uses the inventory snapshot', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS grant_snapshot jsonb/);
  assert.match(migration, /COALESCE\(NEW\.grant_snapshot, v_grant\)/);
  assert.match(migration, /v_spec := COALESCE\(v_row\.grant_snapshot/);
  assert.doesNotMatch(
    migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_redeem_shop_item')),
    /SELECT grant_spec INTO v_spec FROM public\.club_shop_items/
  );
});

test('database permissions keep the atomic purchase service-only', () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.fn_purchase_club_shop_item_diamonds\(uuid, uuid, uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated/
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.fn_purchase_club_shop_item_diamonds\(uuid, uuid, uuid, text\)[\s\S]*TO service_role/
  );
});

test('admin reporting excludes refunds from net revenue and searches before pagination', () => {
  assert.match(manageShop, /\.select\('item_id, price_paid, refunded_at'\)/);
  assert.match(manageShop, /grossRevenue - refundedRevenue/);
  assert.match(manageShop, /refunded_revenue/);
  const searchIndex = purchaseLedger.indexOf('if (q) {');
  const rangeIndex = purchaseLedger.indexOf('.range(offset, offset + limit - 1)');
  assert.ok(searchIndex > -1 && rangeIndex > searchIndex);
  assert.doesNotMatch(purchaseLedger.slice(rangeIndex), /result = result\.filter/);
});

test('durable idempotency cannot replay a key across users or routes', () => {
  const raw = 'same-client-key';
  const first = scopedKey('marketplace-purchase:user-a', raw);
  const second = scopedKey('marketplace-purchase:user-b', raw);
  const refund = scopedKey('refund-purchase:user-a', raw);
  assert.equal(first.length, 64);
  assert.notEqual(first, second);
  assert.notEqual(first, refund);
  assert.equal(first, scopedKey('marketplace-purchase:user-a', raw));
});
