import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('Lifetime Card settlement records exact entitlement provenance and prior state', async () => {
  const migration = await read(
    'supabase/migrations/20261001170000_lifetime_vip_card_reversal_safety.sql'
  );

  assert.match(migration, /price_usd IS DISTINCT FROM 499\.00/);
  assert.match(migration, /previous_is_vip/);
  assert.match(migration, /previous_vip_tier/);
  assert.match(migration, /previous_vip_expires_at/);
  assert.match(migration, /vip_lifetime_card_purchase_id = p_purchase_id/);
  assert.match(migration, /stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id/);
  assert.match(migration, /vip_lifetime_purchases_payment_intent_uidx/);
});

test('Lifetime Card refunds and disputes are cumulative, provenance-bound, and reversible', async () => {
  const migration = await read(
    'supabase/migrations/20261001170000_lifetime_vip_card_reversal_safety.sql'
  );

  assert.match(migration, /reconcile_vip_lifetime_card_reversal_atomic/);
  assert.match(migration, /p_charge_amount_cents <> 49900/);
  assert.match(migration, /GREATEST\([\s\S]*refunded_amount_cents/);
  assert.match(migration, /v_profile\.vip_lifetime_card_purchase_id = p_purchase_id/);
  assert.match(migration, /dispute_funds_withdrawn/);
  assert.match(migration, /dispute_closed_won/);
  assert.match(migration, /dispute_closed_lost/);
  assert.match(migration, /v_should_regrant := v_purchase\.reversal_reason = 'dispute'/);
  assert.match(migration, /v_effective_refund < p_charge_amount_cents/);
  assert.match(migration, /'refund_preserved', v_effective_refund >= p_charge_amount_cents/);
  assert.match(migration, /previous_vip_expires_at/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
});

test('every later VIP writer clears stale Lifetime Card provenance automatically', async () => {
  const migration = await read(
    'supabase/migrations/20261001170000_lifetime_vip_card_reversal_safety.sql'
  );

  assert.match(migration, /clear_stale_lifetime_card_provenance/);
  assert.match(
    migration,
    /NEW\.vip_lifetime_card_purchase_id IS NOT DISTINCT FROM OLD\.vip_lifetime_card_purchase_id/
  );
  assert.match(migration, /NEW\.vip_lifetime_card_purchase_id := NULL/);
  assert.match(migration, /BEFORE UPDATE OF is_vip, vip_tier, vip_expires_at/);
});

test('Stripe refunds and disputes correlate typed Lifetime Card sessions before merchandise', async () => {
  const webhook = await read('pages/api/store/webhooks/stripe.js');
  const refundStart = webhook.indexOf('async function handleRefund');
  const merchStart = webhook.indexOf('// MERCHANDISE refunds', refundStart);
  assert.ok(refundStart > -1 && merchStart > refundStart);

  assert.match(webhook, /async function correlateLifetimePurchase/);
  assert.match(webhook, /entry\.metadata\?\.type === 'vip_lifetime'/);
  assert.match(webhook, /reconcile_vip_lifetime_card_reversal_atomic/);
  assert.match(webhook, /event: 'refund'/);
  assert.ok(
    webhook.indexOf('const lifetimePurchaseId = await correlateLifetimePurchase', refundStart)
      < merchStart,
    'Lifetime refunds must be handled before merchandise fallback'
  );
  assert.match(webhook, /dispute_closed_\$\{dispute\?\.status === 'won' \? 'won' : 'lost'\}/);
});
