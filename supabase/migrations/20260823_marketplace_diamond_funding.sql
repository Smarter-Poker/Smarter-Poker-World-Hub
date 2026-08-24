-- ═══════════════════════════════════════════════════════════════════════════
-- 20260823_marketplace_diamond_funding.sql
-- Tier 2 migration (additive column + function replace). Rollback at bottom.
--
-- PRODUCT RULE (Dan, 2026-08-23): the Club Arena marketplace is funded by
-- DIAMONDS, never chips. Club shop purchases now debit the buyer's global
-- diamond wallet (profiles.diamonds) instead of the per-club chip balance.
--
-- What this migration does:
--   1. club_shop_purchases.currency  — 'chips' (legacy rows) | 'diamonds'.
--      Every pre-existing row was paid in chips; the default backfills them.
--   2. fn_refund_shop_purchase       — currency-aware refund: diamond
--      purchases are refunded in diamonds (via add_diamonds_to_balance with a
--      per-purchase reference_id so a double refund cannot double credit);
--      legacy chip purchases keep refunding chips via fn_credit_chips.
--
-- The purchase-side debit lives in the API route
-- (pages/api/club-arena/marketplace-purchase.js) which calls
-- add_diamonds_to_balance(-price, 'purchase', ...). No chip RPC is touched.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-flight assertions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'club_shop_purchases') THEN
    RAISE EXCEPTION 'club_shop_purchases does not exist — aborting';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance'
  ) THEN
    RAISE EXCEPTION 'add_diamonds_to_balance does not exist — aborting';
  END IF;
END $$;

-- 1. Currency column (additive, backfills legacy rows as chips)
ALTER TABLE club_shop_purchases
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'chips';

ALTER TABLE club_shop_purchases
  DROP CONSTRAINT IF EXISTS club_shop_purchases_currency_valid;
ALTER TABLE club_shop_purchases
  ADD CONSTRAINT club_shop_purchases_currency_valid
  CHECK (currency IN ('chips', 'diamonds'));

COMMENT ON COLUMN club_shop_purchases.currency IS
  'What the buyer paid with. diamonds = global wallet (profiles.diamonds), chips = legacy per-club balance (pre-2026-08-23 purchases only).';

-- 2. Currency-aware refund
CREATE OR REPLACE FUNCTION public.fn_refund_shop_purchase(
  p_club_id uuid, p_purchase_id uuid, p_actor_id uuid, p_reason text DEFAULT NULL::text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase club_shop_purchases;
  v_inv      club_shop_inventory;
  v_credit   jsonb;
BEGIN
  SELECT * INTO v_purchase FROM club_shop_purchases
   WHERE id = p_purchase_id AND club_id = p_club_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found');
  END IF;

  -- Authoritative idempotency marker: lives on the row we just locked, so it
  -- works even when no inventory copy was ever delivered.
  IF v_purchase.refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_refunded', true,
                              'amount', v_purchase.price_paid);
  END IF;

  SELECT * INTO v_inv FROM club_shop_inventory
   WHERE purchase_id = p_purchase_id FOR UPDATE;

  IF NOT FOUND THEN
    -- No delivered copy: refunding would credit against nothing, and there
    -- would be no artefact to revoke.
    RETURN jsonb_build_object('success', false, 'error', 'not_delivered');
  END IF;

  IF v_inv.status = 'redeemed' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'already_redeemed',
      'detail', 'The member has already used this item; the granted benefit cannot be taken back automatically.');
  END IF;

  IF v_inv.status <> 'refunded' THEN
    -- redeemed_at is NOT touched: a refund is not a redemption.
    UPDATE club_shop_inventory SET status = 'refunded' WHERE id = v_inv.id;
  END IF;

  IF v_purchase.currency = 'diamonds' THEN
    -- Diamond purchase: credit the buyer's global wallet. 'refund' is on the
    -- multiplier-exempt list, and the per-purchase reference_id means a raced
    -- double call credits exactly once (the loser sees duplicate=true, which
    -- is success from the buyer's point of view).
    v_credit := add_diamonds_to_balance(
      v_purchase.buyer_id, v_purchase.price_paid, 'refund',
      COALESCE(NULLIF(p_reason, ''), 'Club Shop Purchase Refund'),
      'ca-shop-refund-' || p_purchase_id::text);

    IF COALESCE((v_credit->>'success')::boolean, false) IS NOT TRUE
       AND COALESCE((v_credit->>'duplicate')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'diamond refund credit failed: %',
        COALESCE(v_credit->>'error', 'unknown');
    END IF;
  ELSE
    -- Legacy chip purchase (pre-2026-08-23): chips go back to the club balance.
    v_credit := fn_credit_chips(
      p_club_id, v_purchase.buyer_id, v_purchase.price_paid,
      COALESCE(NULLIF(p_reason, ''), 'Shop purchase refund'),
      jsonb_build_object('transaction_type', 'refund', 'purchase_id', p_purchase_id,
                         'refunded_by', p_actor_id));

    IF COALESCE((v_credit->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'refund credit failed: %', COALESCE(v_credit->>'error', 'unknown');
    END IF;
  END IF;

  UPDATE club_shop_purchases SET refunded_at = now() WHERE id = p_purchase_id;

  -- Return exactly what this purchase took, never inventing a unit.
  IF v_purchase.stock_claimed THEN
    UPDATE club_shop_items SET stock = stock + 1
     WHERE id = v_purchase.item_id AND club_id = p_club_id AND stock IS NOT NULL;
  END IF;

  RETURN jsonb_build_object('success', true, 'amount', v_purchase.price_paid,
                            'currency', v_purchase.currency,
                            'buyer_id', v_purchase.buyer_id,
                            'balance_after', COALESCE(v_credit->'new_balance', v_credit->'balance_after'));
END;
$function$;

-- Post-apply assertions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_shop_purchases' AND column_name = 'currency'
  ) THEN
    RAISE EXCEPTION 'currency column missing after apply';
  END IF;
END $$;

-- ROLLBACK (manual):
--   ALTER TABLE club_shop_purchases DROP CONSTRAINT IF EXISTS club_shop_purchases_currency_valid;
--   ALTER TABLE club_shop_purchases DROP COLUMN IF EXISTS currency;
--   Re-apply the previous fn_refund_shop_purchase body (chips-only) from
--   git history of this file (it credited chips unconditionally).
