-- Club Shop commerce integrity hardening.
--
-- A purchase previously crossed four independent transactions: availability /
-- stock claim, diamond debit, purchase insert, and trigger delivery. The
-- advisory lock in fn_claim_shop_purchase ended with the first RPC, so a
-- second request could pass a per-user cap before the first purchase existed.
-- This migration makes the complete purchase one PostgreSQL transaction and
-- snapshots the grant that was sold so later catalog edits cannot change it.

BEGIN;

ALTER TABLE public.club_shop_purchases
  ADD COLUMN IF NOT EXISTS grant_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS charge_reference text;

ALTER TABLE public.club_shop_inventory
  ADD COLUMN IF NOT EXISTS grant_snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS club_shop_purchases_charge_reference_uidx
  ON public.club_shop_purchases (charge_reference)
  WHERE charge_reference IS NOT NULL;

UPDATE public.club_shop_purchases p
   SET grant_snapshot = i.grant_spec
  FROM public.club_shop_items i
 WHERE p.item_id = i.id
   AND p.grant_snapshot IS NULL;

UPDATE public.club_shop_inventory inv
   SET grant_snapshot = COALESCE(p.grant_snapshot, i.grant_spec)
  FROM public.club_shop_purchases p
  JOIN public.club_shop_items i ON i.id = p.item_id
 WHERE inv.purchase_id = p.id
   AND inv.grant_snapshot IS NULL;

COMMENT ON COLUMN public.club_shop_purchases.grant_snapshot IS
  'Immutable grant specification sold to the buyer at purchase time.';
COMMENT ON COLUMN public.club_shop_inventory.grant_snapshot IS
  'Immutable grant specification copied from the purchase and used on redemption.';
COMMENT ON COLUMN public.club_shop_purchases.charge_reference IS
  'Server-generated diamond ledger reference; provides purchase-level idempotency.';

CREATE OR REPLACE FUNCTION public.fn_deliver_shop_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_cat text;
  v_stackable boolean;
  v_grant jsonb;
BEGIN
  SELECT name, category, COALESCE(stackable, false), grant_spec
    INTO v_name, v_cat, v_stackable, v_grant
    FROM public.club_shop_items
   WHERE id = NEW.item_id;

  INSERT INTO public.club_shop_inventory (
    user_id, club_id, item_id, purchase_id, item_name, category, price_paid,
    stackable_snapshot, grant_snapshot
  ) VALUES (
    NEW.buyer_id, NEW.club_id, NEW.item_id, NEW.id, v_name, v_cat,
    NEW.price_paid, COALESCE(v_stackable, false),
    COALESCE(NEW.grant_snapshot, v_grant)
  )
  ON CONFLICT (purchase_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_purchase_club_shop_item_diamonds(
  p_club_id uuid,
  p_user_id uuid,
  p_item_id uuid,
  p_charge_reference text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.club_shop_items%ROWTYPE;
  v_existing public.club_shop_purchases%ROWTYPE;
  v_purchase public.club_shop_purchases%ROWTYPE;
  v_avail jsonb;
  v_debit jsonb;
  v_balance integer;
  v_price integer;
  v_stock_claimed boolean := false;
BEGIN
  IF p_charge_reference IS NULL OR length(p_charge_reference) < 16
     OR length(p_charge_reference) > 160 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reference');
  END IF;

  -- A retry after an ambiguous network response returns the committed result.
  SELECT * INTO v_existing
    FROM public.club_shop_purchases
   WHERE charge_reference = p_charge_reference;
  IF FOUND THEN
    IF v_existing.buyer_id <> p_user_id OR v_existing.club_id <> p_club_id
       OR v_existing.item_id <> p_item_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'reference_conflict');
    END IF;
    SELECT COALESCE(diamonds, 0) INTO v_balance
      FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object(
      'success', true, 'duplicate', true, 'purchase_id', v_existing.id,
      'price_paid', v_existing.price_paid, 'new_balance', v_balance
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members
     WHERE club_id = p_club_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_member');
  END IF;

  -- The user/item lock enforces ownership and per-user caps. The item row lock
  -- serializes limited stock across different users. Both last until the debit,
  -- purchase insert, and delivery trigger have committed or rolled back.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('shop_buy:' || p_user_id::text || ':' || p_item_id::text, 0)
  );

  SELECT * INTO v_item
    FROM public.club_shop_items
   WHERE id = p_item_id AND club_id = p_club_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_avail := public.fn_shop_item_availability(p_club_id, p_user_id, p_item_id);
  IF NOT COALESCE((v_avail->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'error', v_avail->>'reason') || v_avail;
  END IF;

  v_price := COALESCE((v_avail->>'price')::integer, v_item.price, 0);
  IF v_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
  END IF;

  IF v_item.stock IS NOT NULL THEN
    UPDATE public.club_shop_items
       SET stock = stock - 1
     WHERE id = p_item_id AND club_id = p_club_id AND stock > 0;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'sold_out');
    END IF;
    v_stock_claimed := true;
  END IF;

  IF v_price > 0 THEN
    v_debit := public.add_diamonds_to_balance(
      p_user_id, -v_price, 'purchase',
      'Club Shop: ' || COALESCE(v_item.name, p_item_id::text),
      p_charge_reference
    );
    IF COALESCE((v_debit->>'success')::boolean, false) IS NOT TRUE THEN
      -- Raising rolls stock back as well. Business errors are converted to a
      -- normal response by the exception block below.
      IF v_debit->>'error' = 'insufficient_diamonds' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_diamonds';
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = COALESCE(v_debit->>'error', 'diamond_debit_failed');
    END IF;
    v_balance := COALESCE((v_debit->>'new_balance')::integer, 0);
  ELSE
    SELECT COALESCE(diamonds, 0) INTO v_balance
      FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'profile_not_found';
    END IF;
  END IF;

  INSERT INTO public.club_shop_purchases (
    club_id, buyer_id, item_id, price_paid, stock_claimed, currency,
    grant_snapshot, charge_reference
  ) VALUES (
    p_club_id, p_user_id, p_item_id, v_price, v_stock_claimed, 'diamonds',
    v_item.grant_spec, p_charge_reference
  ) RETURNING * INTO v_purchase;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase.id,
    'new_balance', v_balance,
    'price_paid', v_price,
    'stock_claimed', v_stock_claimed,
    'item_name', v_item.name,
    'item_type', v_item.item_type
  );
EXCEPTION
  WHEN unique_violation THEN
    -- A non-stackable ownership race or duplicate reference rolls the whole
    -- transaction back. A subsequent idempotent retry can read the winner.
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_redeem_shop_item(p_inventory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.club_shop_inventory%ROWTYPE;
  v_spec jsonb;
  v_type text;
  v_qty integer;
  v_granted jsonb := jsonb_build_object('type', 'none');
BEGIN
  SELECT * INTO v_row FROM public.club_shop_inventory
   WHERE id = p_inventory_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_row.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF v_row.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_redeemed');
  END IF;
  IF v_row.status = 'refunded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'refunded');
  END IF;

  v_spec := COALESCE(v_row.grant_snapshot, '{}'::jsonb);
  v_type := COALESCE(v_spec->>'type', 'none');
  v_qty := GREATEST(1, LEAST(1000, COALESCE((v_spec->>'qty')::integer, 1)));

  IF v_type = 'time_bank' THEN
    INSERT INTO public.feature_purchases
      (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'time_bank_seconds', 0, 'per_use', v_qty, NULL);
    v_granted := jsonb_build_object('type', 'time_bank', 'uses', v_qty, 'seconds', v_qty * 20);
  ELSIF v_type = 'throwable' THEN
    INSERT INTO public.feature_purchases
      (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'throwable', 0, 'per_use', v_qty, NULL);
    v_granted := jsonb_build_object('type', 'throwable', 'uses', v_qty);
  ELSIF v_type = 'emote_pack' THEN
    INSERT INTO public.feature_purchases
      (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'emoji_pack', 0, 'permanent', NULL, NULL);
    v_granted := jsonb_build_object('type', 'emote_pack', 'permanent', true);
  ELSIF v_type = 'table_skin' THEN
    INSERT INTO public.feature_purchases
      (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'theme_unlock', 0, 'permanent', NULL, NULL);
    v_granted := jsonb_build_object('type', 'table_skin', 'permanent', true,
                                    'theme_id', v_spec->>'theme_id');
  ELSIF v_type = 'avatar' THEN
    INSERT INTO public.avatar_unlocks (user_id, avatar_id, unlock_method)
    VALUES (v_row.user_id, COALESCE(v_spec->>'avatar_id', v_row.item_id::text), 'club_shop')
    ON CONFLICT DO NOTHING;
    v_granted := jsonb_build_object(
      'type', 'avatar', 'avatar_id', COALESCE(v_spec->>'avatar_id', v_row.item_id::text)
    );
  END IF;

  UPDATE public.club_shop_inventory
     SET status = 'redeemed', redeemed_at = now()
   WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'success', true, 'item_name', v_row.item_name, 'granted', v_granted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_purchase_club_shop_item_diamonds(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purchase_club_shop_item_diamonds(uuid, uuid, uuid, text)
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.fn_purchase_club_shop_item_diamonds(uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'atomic Club Shop purchase RPC is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'club_shop_inventory'
       AND column_name = 'grant_snapshot'
  ) THEN
    RAISE EXCEPTION 'Club Shop grant snapshot is missing';
  END IF;
END $$;

COMMIT;
