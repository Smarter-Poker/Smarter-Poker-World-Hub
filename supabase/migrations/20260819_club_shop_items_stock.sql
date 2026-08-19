-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_club_shop_items_stock.sql
-- Applied to production 2026-08-19 via Supabase MCP as `club_shop_items_stock`.
--
-- WHY: every shop item was infinitely purchasable. A club could not run a
-- limited drop ("10 VIP rail seats"), and the Exclusive category had no way to
-- actually be exclusive.
--
-- NULL  = unlimited (existing behaviour, and the value for every current row)
-- 0     = sold out
-- n > 0 = n remaining
--
-- Claimed atomically by fn_claim_shop_stock() so two concurrent buyers cannot
-- both take the last unit: the conditional UPDATE ... RETURNING either wins the
-- row or reports sold_out. /api/club-arena/marketplace-purchase claims BEFORE
-- debiting chips and calls fn_release_shop_stock on every failure path, so a
-- failed purchase never eats stock.
--
-- Rollback:
--   DROP FUNCTION public.fn_claim_shop_stock(uuid, uuid);
--   DROP FUNCTION public.fn_release_shop_stock(uuid, uuid);
--   ALTER TABLE club_shop_items DROP COLUMN stock;
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.club_shop_items
  ADD COLUMN IF NOT EXISTS stock integer;

ALTER TABLE public.club_shop_items
  DROP CONSTRAINT IF EXISTS club_shop_items_stock_nonneg;

ALTER TABLE public.club_shop_items
  ADD CONSTRAINT club_shop_items_stock_nonneg CHECK (stock IS NULL OR stock >= 0);

COMMENT ON COLUMN public.club_shop_items.stock IS
  'Remaining units. NULL = unlimited, 0 = sold out. Claimed via fn_claim_shop_stock.';

CREATE OR REPLACE FUNCTION public.fn_claim_shop_stock(p_club_id uuid, p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock integer;
  v_found boolean := false;
BEGIN
  SELECT stock INTO v_stock
    FROM club_shop_items
   WHERE id = p_item_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'error', 'item_not_found');
  END IF;

  IF v_stock IS NULL THEN
    RETURN jsonb_build_object('claimed', true, 'unlimited', true);
  END IF;

  UPDATE club_shop_items
     SET stock = stock - 1
   WHERE id = p_item_id
     AND club_id = p_club_id
     AND stock IS NOT NULL
     AND stock > 0
  RETURNING true INTO v_found;

  IF NOT COALESCE(v_found, false) THEN
    RETURN jsonb_build_object('claimed', false, 'error', 'sold_out');
  END IF;

  RETURN jsonb_build_object('claimed', true, 'unlimited', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_release_shop_stock(p_club_id uuid, p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE club_shop_items
     SET stock = stock + 1
   WHERE id = p_item_id AND club_id = p_club_id AND stock IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_claim_shop_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_release_shop_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_shop_stock(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_release_shop_stock(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_claim_shop_stock(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_claim_shop_stock must not be executable by authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='club_shop_items' AND column_name='stock') THEN
    RAISE EXCEPTION 'stock column missing';
  END IF;
END $$;
