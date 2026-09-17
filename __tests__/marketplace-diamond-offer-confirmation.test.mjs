import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('Diamond-funded merchandise binds the reviewed offer inside locked settlement', async () => {
  const [api, store, cart, migration] = await Promise.all([
    read('pages/api/store/purchase-with-diamonds.js'),
    read('src/components/store/MerchStore.jsx'),
    read('pages/hub/diamond-store/cart.js'),
    read('supabase/migrations/20260917120000_marketplace_diamond_offer_confirmation.sql'),
  ]);

  for (const client of [store, cart]) {
    assert.match(client, /merchandiseDiamondOfferConfirmation/);
    assert.match(client, /offerConfirmation/);
  }
  assert.match(api, /exactJsonValueMatches\(req\.body\?\.offerConfirmation, offerConfirmation\)/);
  assert.match(api, /expected_price_diamonds/);
  assert.match(api, /p_expected_total_diamonds: offerConfirmation\.totalDiamonds/);
  assert.match(api, /p_legacy_request_hash: legacyRequestHash/);
  assert.match(api, /purchase_merch_with_diamonds_atomic_v2/);

  const replay = migration.indexOf('Historical exact retries must replay');
  const quote = migration.indexOf('v_quote := public.reserve_merch_order');
  const comparison = migration.indexOf("'price_changed'");
  const debit = migration.lastIndexOf('public.purchase_merch_with_diamonds_atomic(');
  assert.ok(replay >= 0 && quote > replay && comparison > quote && debit > comparison);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_priced_unit <> v_expected_unit/);
  assert.match(migration, /p_expected_total_diamonds/);
  assert.match(migration, /p_legacy_request_hash/);
});

test('Diamond-funded VIP replays exact history before rejecting current price drift', async () => {
  const [api, store] = await Promise.all([
    read('pages/api/store/purchase-vip-with-diamonds.js'),
    read('pages/hub/diamond-store.js'),
  ]);

  assert.match(store, /vipDiamondOfferConfirmation/);
  assert.match(store, /body: JSON\.stringify\(\{ plan: planKey, offerConfirmation \}\)/);
  assert.match(api, /vipDiamondOfferConfirmation/);
  assert.match(api, /cost: offerConfirmation\.cost/);
  const replay = api.indexOf('if (durableRequest)');
  const priceGuard = api.indexOf('offerConfirmation.cost !== COST');
  const settlement = api.indexOf('purchase_vip_with_diamonds_atomic_v3', priceGuard);
  assert.ok(replay >= 0 && priceGuard > replay && settlement > priceGuard);
  assert.match(api, /code: 'OFFER_PRICE_CHANGED'/);
});
