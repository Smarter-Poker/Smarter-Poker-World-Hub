import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const MIGRATION = new URL(
  '../supabase/migrations/20261017123820_merch_with_no_fulfilment_path_is_not_for_sale.sql',
  import.meta.url
);

test('merch nothing can fulfil is taken off sale, never sold into a manual queue', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /SET is_active = false/);
  assert.match(sql, /'sale_paused_reason', 'no_fulfilment_provider'/);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  for (const id of [
    'circuit-breaker-playing-cards',
    'final-table-mirror-sunglasses',
    'neural-steel-card-protector',
    'range-grid-desk-mat',
    'river-read-polarized-sunglasses',
    'chip-set-100',
    'chip-set-500',
    'card-protector-gold',
    'card-protector-black',
    'deck-premium',
  ]) {
    assert.match(sql, new RegExp(`'${id}'`), id);
  }
  // Guarded: a Printful row is never a target, the count is exact, and the
  // only items left on sale are mapped Printful products.
  assert.match(sql, /refusing: a target item has a Printful provider or mapping/);
  assert.match(sql, /expected 10 items taken off sale/);
  assert.match(sql, /an active item still has no fulfilment provider/);
  assert.match(sql, /a mapped Printful product went off sale/);
});
