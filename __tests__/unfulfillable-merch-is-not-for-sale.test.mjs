import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const MIGRATION = new URL(
  '../supabase/migrations/20261017122737_unfulfillable_printful_merch_is_not_for_sale.sql',
  import.meta.url
);

test('unfulfillable Printful merch is taken off sale with the mechanism every sale path filters on', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  // is_active = false, not provider_pending: provider_pending rows still sell.
  assert.match(sql, /SET is_active = false/);
  assert.doesNotMatch(sql, /'fulfillment_provider',\s*'provider_pending'/);
  // Rows and art are kept, with the reason that lets them come back.
  assert.match(sql, /'sale_paused_reason', 'no_printful_product'/);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  // Guarded: a mapped row is never taken off sale, the two fulfillable
  // products stay on sale, and exact counts are asserted.
  assert.match(sql, /carry a Printful sync_variant_id/);
  assert.match(sql, /a mapped product went off sale/);
  assert.match(sql, /expected 13 items taken off sale/);
  assert.match(sql, /expected 4 Royal Circuit Tee White variants taken off sale/);
  for (const id of ['hoodie-neural', 'tshirt-gto']) assert.match(sql, new RegExp(`'${id}'`));
});

test('every sale path filters inactive merchandise, so an off-sale row cannot be bought', async () => {
  for (const file of [
    '../pages/api/store/create-checkout-session.js',
    '../pages/api/store/merch-catalog.js',
    '../pages/api/store/purchase-with-diamonds.js',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /\.eq\('is_active', true\)/, file);
  }
});
