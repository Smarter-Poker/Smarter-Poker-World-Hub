import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260906183000_club_shop_price_authorization.sql',
  import.meta.url
);

const migration = await readFile(migrationUrl, 'utf8');
const [forward, rollback = ''] = migration.split(
  /-- ROLLBACK \(Tier 3 only:/
);
const v2Start = forward.indexOf(
  'CREATE OR REPLACE FUNCTION public.fn_purchase_club_shop_item_diamonds_v2'
);
const wrapperStart = forward.indexOf(
  'CREATE OR REPLACE FUNCTION public.fn_purchase_club_shop_item_diamonds('
);
const wrapper = forward.slice(wrapperStart);

test('migration stays inside the approved price-authorization boundary', () => {
  assert.ok(v2Start > -1 && wrapperStart > v2Start);
  assert.equal(
    (forward.match(/CREATE OR REPLACE FUNCTION public\./g) || []).length,
    2,
    'only the price-bound RPC and its compatibility wrapper may be replaced'
  );
  assert.doesNotMatch(forward, /CREATE OR REPLACE FUNCTION public\.settle_diamond_card_purchase_atomic/);
  assert.doesNotMatch(forward, /CREATE OR REPLACE FUNCTION public\.fn_refund_shop_purchase/);
  assert.doesNotMatch(forward, /credit_paid_diamond_purchase_atomic/);
  assert.doesNotMatch(forward, /credit_club_shop_refund_atomic/);
  assert.doesNotMatch(forward, /v_pre_credit_balance|already-negative wallet|pre_credit_debt/);
});

test('price-bound purchase rejects drift before stock and wallet mutation', () => {
  const v2 = forward.slice(v2Start, wrapperStart);
  const driftGuard = v2.indexOf('v_price IS DISTINCT FROM p_expected_price');
  const stockMutation = v2.indexOf('SET stock = stock - 1');
  const walletMutation = v2.indexOf('public.add_diamonds_to_balance');

  assert.ok(driftGuard > -1 && driftGuard < stockMutation && stockMutation < walletMutation);
  assert.match(v2, /'error', 'price_changed'/);
  assert.match(v2, /v_existing\.price_paid IS DISTINCT FROM p_expected_price/);
  assert.match(v2, /'error', 'reference_conflict'/);
});

test('Card compatibility wrapper recovers the bound price and fails safely', () => {
  assert.match(wrapper, /metadata #>> '\{redemption_intent,expected_price\}'/);
  assert.match(wrapper, /metadata #>> '\{redemption_intent,club_id\}' = p_club_id::text/);
  assert.match(wrapper, /metadata #>> '\{redemption_intent,item_id\}' = p_item_id::text/);
  assert.match(wrapper, /v_expected_price_bigint BETWEEN 0 AND 2147483647/);
  assert.match(wrapper, /public\.fn_shop_item_availability/);
  assert.match(wrapper, /public\.fn_purchase_club_shop_item_diamonds_v2/);
});

test('migration preserves the canonical settlement and refund accounting policy', () => {
  assert.match(forward, /canonical paid Diamond settlement accounting controls are missing/);
  assert.match(forward, /DR7:test_mode_session_settled/);
  assert.match(forward, /DR8:purchase_price_disagrees_with_package/);
  assert.match(forward, /DR9:purchase_lot_write_failed/);
  assert.doesNotMatch(forward, /DROP FUNCTION[^;]*(settle_diamond_card_purchase_atomic|fn_refund_shop_purchase)/);
});

test('shared package catalog access remains compatible and server writes stay privileged', () => {
  assert.match(forward, /GRANT ALL PRIVILEGES ON TABLE public\.diamond_packages TO service_role/);
  assert.match(forward, /GRANT SELECT ON TABLE public\.diamond_packages TO authenticated/);
  assert.match(forward, /REVOKE ALL ON TABLE public\.diamond_packages FROM PUBLIC, anon/);
  assert.doesNotMatch(forward, /REVOKE ALL ON TABLE public\.diamond_packages FROM PUBLIC, anon, authenticated/);
  assert.match(forward, /CREATE POLICY diamond_packages_read_active/);
  assert.match(forward, /TO authenticated[\s\S]*USING \(active = true\)/);
});

test('Tier 3 rollback restores only the previous purchase RPC contract', () => {
  assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.fn_purchase_club_shop_item_diamonds\(/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_purchase_club_shop_item_diamonds_v2/);
  assert.doesNotMatch(rollback, /CREATE OR REPLACE FUNCTION public\.settle_diamond_card_purchase_atomic/);
  assert.doesNotMatch(rollback, /CREATE OR REPLACE FUNCTION public\.fn_refund_shop_purchase/);
  assert.doesNotMatch(rollback, /credit_paid_diamond_purchase_atomic|credit_club_shop_refund_atomic/);
});
