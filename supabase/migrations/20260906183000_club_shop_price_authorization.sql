-- TIER 3: Club Shop price authorization and package catalog hardening.
-- Author: Codex
-- Affects: Diamond package checkout and Club Shop Diamond/Card price binding.
-- Reversible: Yes, with the application release rolled back at the same time.
-- Why: keep the server-owned Diamond catalog within Stripe/integer bounds and
-- bind every Club Shop debit to the exact price the buyer approved.
--
-- The original atomic purchase function correctly serialized availability,
-- stock, wallet debit, purchase persistence, and delivery. It did not receive
-- the price shown in the confirmation UI, however. If an operator changed an
-- item's price while that confirmation (or a Stripe Checkout page) was open,
-- settlement could debit the new price. This version rejects that race before
-- stock or wallet state changes.

BEGIN;

-- This database is shared with Club Arena. Refuse to replace money-moving
-- functions unless the newer accounting foundation is present. These checks
-- run before any DDL in this migration.
DO $$
BEGIN
  IF to_regclass('public.club_shop_items') IS NULL
     OR to_regclass('public.club_shop_purchases') IS NULL
     OR to_regclass('public.club_shop_inventory') IS NULL
     OR to_regclass('public.club_members') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.diamond_purchases') IS NULL
     OR to_regclass('public.diamond_transactions') IS NULL
     OR to_regclass('public.diamond_purchase_lots') IS NULL THEN
    RAISE EXCEPTION 'Club Shop or Diamond accounting foundation is missing';
  END IF;
  IF to_regprocedure('public.fn_shop_item_availability(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.add_diamonds_to_balance(uuid,integer,text,text,text)') IS NULL
     OR to_regprocedure('public.fn_credit_chips(uuid,uuid,numeric,text,jsonb)') IS NULL
     OR to_regprocedure('public.fn_ca_diamond_incident(text,text,uuid,numeric,text,jsonb)') IS NULL
     OR to_regprocedure('public.purchase_vip_with_diamonds_atomic_v2(uuid,integer,integer,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'required Diamond accounting RPC foundation is missing';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'diamond_transactions'
          AND column_name = 'counterparty'
     ) OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'diamond_transactions'
          AND column_name = 'issuance_class'
     ) THEN
    RAISE EXCEPTION 'Diamond transaction provenance columns are missing';
  END IF;
END $$;

-- Production already has this server-owned package oracle, but its creation
-- was not represented in the migration ledger. Rebuilds and restored review
-- environments must receive the same strict Card quote dependency. Existing
-- package rows remain operator-owned and are never overwritten here.
CREATE TABLE IF NOT EXISTS public.diamond_packages (
  package_key text PRIMARY KEY,
  display_name text NOT NULL,
  diamonds integer NOT NULL CHECK (diamonds > 0),
  bonus_diamonds integer NOT NULL DEFAULT 0 CHECK (bonus_diamonds >= 0),
  price_usd numeric(10,2) NOT NULL CHECK (price_usd BETWEEN 0.50 AND 999999.99),
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS does not reconcile a pre-existing table. Refuse
-- to seed or bind checkout to a partially compatible shared schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'package_key'
       AND data_type = 'text'
       AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'display_name'
       AND data_type = 'text'
       AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'diamonds'
       AND data_type = 'integer'
       AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'bonus_diamonds'
       AND data_type = 'integer'
       AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'price_usd'
       AND data_type = 'numeric'
       AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'active'
       AND data_type = 'boolean'
       AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'sort'
       AND data_type = 'integer'
       AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'updated_at'
       AND data_type = 'timestamp with time zone'
       AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'diamond_packages schema is incompatible with the checkout contract';
  END IF;
END $$;

INSERT INTO public.diamond_packages (
  package_key, display_name, diamonds, bonus_diamonds, price_usd, active, sort
) VALUES
  ('micro', 'Micro', 100, 0, 1.00, true, 10),
  ('small', 'Small', 500, 0, 5.00, true, 20),
  ('medium', 'Medium', 1000, 0, 10.00, true, 30),
  ('standard', 'Standard', 2500, 0, 25.00, true, 40),
  ('large', 'Large', 5000, 0, 50.00, true, 50),
  ('value', 'Value', 10000, 500, 100.00, true, 60),
  ('premium', 'Premium', 25000, 1250, 250.00, true, 70),
  ('whale', 'Whale', 50000, 2500, 500.00, true, 80)
ON CONFLICT (package_key) DO NOTHING;

-- Existing production rows must already be exact cents. Refuse to round an
-- operator-authored price while bringing an older table definition forward.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.diamond_packages
     WHERE price_usd <> trunc(price_usd, 2)
  ) THEN
    RAISE EXCEPTION 'diamond_packages contains a fractional-cent price';
  END IF;
END $$;

-- Avoid taking an unnecessary table-rewrite lock in production, where this
-- column is already numeric(10,2). Restored environments with the older,
-- unconstrained numeric definition are upgraded in place.
DO $$
DECLARE
  v_precision integer;
  v_scale integer;
BEGIN
  SELECT numeric_precision, numeric_scale
    INTO v_precision, v_scale
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'diamond_packages'
     AND column_name = 'price_usd';

  IF v_precision IS DISTINCT FROM 10 OR v_scale IS DISTINCT FROM 2 THEN
    ALTER TABLE public.diamond_packages
      ALTER COLUMN price_usd TYPE numeric(10,2)
      USING price_usd::numeric(10,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.diamond_packages'::regclass
       AND conname = 'diamond_packages_key_format_chk'
  ) THEN
    ALTER TABLE public.diamond_packages ADD CONSTRAINT diamond_packages_key_format_chk
      CHECK (length(package_key) BETWEEN 1 AND 64
        AND package_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.diamond_packages'::regclass
       AND conname = 'diamond_packages_credit_bounds_chk'
  ) THEN
    ALTER TABLE public.diamond_packages ADD CONSTRAINT diamond_packages_credit_bounds_chk
      CHECK (diamonds > 0 AND bonus_diamonds >= 0
        AND diamonds::bigint + bonus_diamonds::bigint <= 2147483647) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.diamond_packages'::regclass
       AND conname = 'diamond_packages_stripe_price_chk'
  ) THEN
    ALTER TABLE public.diamond_packages ADD CONSTRAINT diamond_packages_stripe_price_chk
      CHECK (price_usd BETWEEN 0.50 AND 999999.99
        AND price_usd = trunc(price_usd, 2)) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.diamond_packages VALIDATE CONSTRAINT diamond_packages_key_format_chk;
ALTER TABLE public.diamond_packages VALIDATE CONSTRAINT diamond_packages_credit_bounds_chk;
ALTER TABLE public.diamond_packages VALIDATE CONSTRAINT diamond_packages_stripe_price_chk;

ALTER TABLE public.diamond_packages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.diamond_packages FROM PUBLIC, anon;
GRANT ALL PRIVILEGES ON TABLE public.diamond_packages TO service_role;
GRANT SELECT ON TABLE public.diamond_packages TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policy
     WHERE polrelid = 'public.diamond_packages'::regclass
       AND polname = 'diamond_packages_read_active'
  ) THEN
    CREATE POLICY diamond_packages_read_active
      ON public.diamond_packages
      FOR SELECT
      TO authenticated
      USING (active = true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_purchase_club_shop_item_diamonds_v2(
  p_club_id uuid,
  p_user_id uuid,
  p_item_id uuid,
  p_charge_reference text,
  p_expected_price integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  -- A committed retry is safe to replay. When the retry carries a price, it
  -- must still describe the purchase that owns this durable reference.
  SELECT * INTO v_existing
    FROM public.club_shop_purchases
   WHERE charge_reference = p_charge_reference;
  IF FOUND THEN
    IF v_existing.buyer_id <> p_user_id OR v_existing.club_id <> p_club_id
       OR v_existing.item_id <> p_item_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'reference_conflict');
    END IF;
    IF p_expected_price IS NOT NULL
       AND v_existing.price_paid IS DISTINCT FROM p_expected_price THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'reference_conflict',
        'expected_price', p_expected_price,
        'price', v_existing.price_paid
      );
    END IF;
    SELECT COALESCE(diamonds, 0) INTO v_balance
      FROM public.profiles WHERE id = p_user_id;
    RETURN jsonb_build_object(
      'success', true, 'duplicate', true, 'purchase_id', v_existing.id,
      'price_paid', v_existing.price_paid, 'new_balance', v_balance
    );
  END IF;

  -- New v2 purchases without an explicit confirmation price fail closed. The
  -- rollout wrapper below supplies only a server-authoritative snapshot.
  IF p_expected_price IS NULL OR p_expected_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_confirmation_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members
     WHERE club_id = p_club_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_member');
  END IF;

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
  IF v_price IS DISTINCT FROM p_expected_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'price_changed',
      'expected_price', p_expected_price,
      'price', v_price
    );
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
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- Rollout compatibility for the old API build and already-open Stripe pages.
-- New application code always calls v2 directly. The wrapper first recovers a
-- Card session's bound price; a pre-deployment session without that field, or
-- an old direct API call during the DB-first rollout window, gets one current
-- server-side availability snapshot and then enters the same atomic v2 check.
CREATE OR REPLACE FUNCTION public.fn_purchase_club_shop_item_diamonds(
  p_club_id uuid,
  p_user_id uuid,
  p_item_id uuid,
  p_charge_reference text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_purchase_id_text text;
  v_expected_price_text text;
  v_expected_price_bigint bigint;
  v_expected_price integer;
  v_availability jsonb;
BEGIN
  IF p_charge_reference LIKE 'card-redemption:%' THEN
    v_purchase_id_text := split_part(p_charge_reference, ':', 2);
    IF v_purchase_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      SELECT metadata #>> '{redemption_intent,expected_price}'
        INTO v_expected_price_text
        FROM public.diamond_purchases
       WHERE id = v_purchase_id_text::uuid
         AND user_id = p_user_id
         AND metadata #>> '{redemption_intent,club_id}' = p_club_id::text
         AND metadata #>> '{redemption_intent,item_id}' = p_item_id::text;
      IF v_expected_price_text ~ '^[0-9]{1,10}$' THEN
        v_expected_price_bigint := v_expected_price_text::bigint;
        IF v_expected_price_bigint BETWEEN 0 AND 2147483647 THEN
          v_expected_price := v_expected_price_bigint::integer;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_expected_price IS NULL THEN
    v_availability := public.fn_shop_item_availability(p_club_id, p_user_id, p_item_id);
    IF COALESCE((v_availability ->> 'ok')::boolean, false)
       AND COALESCE(v_availability ->> 'price', '') ~ '^[0-9]{1,10}$' THEN
      v_expected_price_bigint := (v_availability ->> 'price')::bigint;
      IF v_expected_price_bigint BETWEEN 0 AND 2147483647 THEN
        v_expected_price := v_expected_price_bigint::integer;
      END IF;
    END IF;
  END IF;

  RETURN public.fn_purchase_club_shop_item_diamonds_v2(
    p_club_id,
    p_user_id,
    p_item_id,
    p_charge_reference,
    v_expected_price
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_purchase_club_shop_item_diamonds_v2(uuid, uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purchase_club_shop_item_diamonds_v2(uuid, uuid, uuid, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.fn_purchase_club_shop_item_diamonds(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purchase_club_shop_item_diamonds(uuid, uuid, uuid, text)
  TO service_role;

DO $$
BEGIN
  IF to_regclass('public.diamond_packages') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.diamond_packages WHERE active) THEN
    RAISE EXCEPTION 'active Diamond package catalog is missing';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.diamond_packages
     WHERE price_usd <> trunc(price_usd, 2)
        OR diamonds <= 0
        OR bonus_diamonds < 0
        OR diamonds::bigint + bonus_diamonds::bigint > 2147483647
  ) THEN
    RAISE EXCEPTION 'Diamond package catalog violates checkout bounds';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'diamond_packages'
       AND column_name = 'price_usd'
       AND numeric_precision = 10
       AND numeric_scale = 2
  ) THEN
    RAISE EXCEPTION 'Diamond package prices are not stored as exact cents';
  END IF;
  IF (
    SELECT count(*)
      FROM pg_constraint
     WHERE conrelid = 'public.diamond_packages'::regclass
       AND conname IN (
         'diamond_packages_key_format_chk',
         'diamond_packages_credit_bounds_chk',
         'diamond_packages_stripe_price_chk'
       )
       AND convalidated
  ) <> 3 THEN
    RAISE EXCEPTION 'Diamond package constraints were not validated';
  END IF;
  IF to_regprocedure('public.fn_purchase_club_shop_item_diamonds_v2(uuid,uuid,uuid,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'price-bound Club Shop purchase RPC is missing';
  END IF;
  IF position('redemption_intent,expected_price' IN pg_get_functiondef(
       'public.fn_purchase_club_shop_item_diamonds(uuid,uuid,uuid,text)'::regprocedure
     )) = 0
     OR position('fn_purchase_club_shop_item_diamonds_v2' IN pg_get_functiondef(
       'public.fn_purchase_club_shop_item_diamonds(uuid,uuid,uuid,text)'::regprocedure
     )) = 0 THEN
    RAISE EXCEPTION 'Club Shop compatibility wrapper is not price-bound';
  END IF;
  IF position('DR7:test_mode_session_settled' IN pg_get_functiondef(
       'public.settle_diamond_card_purchase_atomic(uuid,text,text)'::regprocedure
     )) = 0
     OR position('DR8:purchase_price_disagrees_with_package' IN pg_get_functiondef(
       'public.settle_diamond_card_purchase_atomic(uuid,text,text)'::regprocedure
     )) = 0
     OR position('DR9:purchase_lot_write_failed' IN pg_get_functiondef(
       'public.settle_diamond_card_purchase_atomic(uuid,text,text)'::regprocedure
     )) = 0 THEN
    RAISE EXCEPTION 'canonical paid Diamond settlement accounting controls are missing';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.diamond_packages', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.diamond_packages', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.diamond_packages', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.diamond_packages', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.diamond_packages', 'SELECT')
     OR has_table_privilege('anon', 'public.diamond_packages', 'SELECT') THEN
    RAISE EXCEPTION 'Diamond package privileges do not preserve the shared catalog contract';
  END IF;
  IF NOT has_function_privilege(
       'service_role',
       'public.fn_purchase_club_shop_item_diamonds_v2(uuid,uuid,uuid,text,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.fn_purchase_club_shop_item_diamonds_v2(uuid,uuid,uuid,text,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.fn_purchase_club_shop_item_diamonds_v2(uuid,uuid,uuid,text,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'price-bound Club Shop RPC privileges are unsafe';
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 only: paste the SQL inside this block as a new
-- migration while rolling the application release back at the same time)
-- Exact pre-migration production function captured on 2026-09-06.
-- The package table is retained deliberately because dropping it could
-- destroy operator-authored catalog rows; only this release's constraints
-- and price-bound function changes are reversed.
-- ═══════════════════════════════════════════════════════════════════════
/*
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_purchase_club_shop_item_diamonds(p_club_id uuid, p_user_id uuid, p_item_id uuid, p_charge_reference text)
 RETURNS jsonb
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

DROP FUNCTION IF EXISTS public.fn_purchase_club_shop_item_diamonds_v2(
  uuid, uuid, uuid, text, integer
);

ALTER TABLE public.diamond_packages
  DROP CONSTRAINT IF EXISTS diamond_packages_key_format_chk,
  DROP CONSTRAINT IF EXISTS diamond_packages_credit_bounds_chk,
  DROP CONSTRAINT IF EXISTS diamond_packages_stripe_price_chk;

GRANT ALL PRIVILEGES ON TABLE public.diamond_packages TO service_role;
GRANT SELECT ON TABLE public.diamond_packages TO authenticated;

REVOKE ALL ON FUNCTION public.fn_purchase_club_shop_item_diamonds(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purchase_club_shop_item_diamonds(uuid, uuid, uuid, text)
  TO service_role;

COMMIT;
*/
