-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_club_shop_grant_spec_and_real_redemption.sql
-- Applied to production 2026-08-19 via Supabase MCP as
-- `club_shop_grant_spec_and_real_redemption` and
-- `club_shop_starter_catalog_grants`.
--
-- WHY: fn_redeem_shop_item only flipped club_shop_inventory.status to
-- 'redeemed'. It granted NOTHING. The shop was selling receipts, not goods.
-- Meanwhile the real entitlement systems already existed:
--   * time banks  -> feature_purchases(feature='time_bank_seconds'), read by
--                    fn_time_bank_allowance at 20 SECONDS PER REMAINING USE
--   * throwables  -> fn_use_throwable (charged 1 diamond/throw for non-VIP;
--                    there was no purchased-pack path at all)
--   * emote packs -> feature_purchases(feature='emoji_pack', permanent)
--   * table skins -> feature_purchases(feature='theme_unlock', permanent)
--   * avatars     -> avatar_unlocks(user_id, avatar_id, unlock_method)
--
-- 1) club_shop_items.grant_spec jsonb describes what redemption grants.
-- 2) fn_redeem_shop_item applies the grant atomically with the status flip and
--    returns it, so the UI can say "+60s of table time added".
-- 3) fn_use_throwable spends a purchased pack credit BEFORE charging diamonds
--    (the VIP free monthly allowance still takes precedence).
--
-- Because allowance is 20s per use, the two seeded Time Bank items were renamed
-- to values that are actually expressible: +60s (3 uses) and +100s (5 uses).
--
-- Verified on production with the test account:
--   redeem Snowball Pack -> {"granted":{"type":"throwable","uses":10}}
--   feature_purchases row: throwable / per_use / uses_remaining 10
--   throw as VIP    -> free monthly allowance used, pack untouched (498 left)
--   throw as non-VIP -> {"from_pack":true,"pack_remaining":9} then 8, and the
--                       diamond balance did not move
--
-- Rollback:
--   ALTER TABLE club_shop_items DROP COLUMN grant_spec;
--   (and restore the prior fn_redeem_shop_item / fn_use_throwable bodies)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.club_shop_items
  ADD COLUMN IF NOT EXISTS grant_spec jsonb;

ALTER TABLE public.club_shop_items
  DROP CONSTRAINT IF EXISTS club_shop_items_grant_spec_valid;

ALTER TABLE public.club_shop_items
  ADD CONSTRAINT club_shop_items_grant_spec_valid CHECK (
    grant_spec IS NULL
    OR (
      jsonb_typeof(grant_spec) = 'object'
      AND grant_spec->>'type' IN ('time_bank','throwable','emote_pack','table_skin','avatar','none')
      AND (
        grant_spec->'qty' IS NULL
        OR (
          jsonb_typeof(grant_spec->'qty') = 'number'
          AND (grant_spec->>'qty')::numeric > 0
          AND (grant_spec->>'qty')::numeric <= 1000
          AND (grant_spec->>'qty')::numeric = floor((grant_spec->>'qty')::numeric)
        )
      )
    )
  );

COMMENT ON COLUMN public.club_shop_items.grant_spec IS
  'What redeeming this item grants. See fn_redeem_shop_item. NULL = decorative/club-fulfilled.';

CREATE OR REPLACE FUNCTION public.fn_redeem_shop_item(p_inventory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row     club_shop_inventory;
  v_spec    jsonb;
  v_type    text;
  v_qty     integer;
  v_granted jsonb := jsonb_build_object('type', 'none');
BEGIN
  SELECT * INTO v_row FROM club_shop_inventory WHERE id = p_inventory_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_row.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF v_row.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_redeemed');
  END IF;

  SELECT grant_spec INTO v_spec FROM club_shop_items WHERE id = v_row.item_id;
  v_type := COALESCE(v_spec->>'type', 'none');
  v_qty  := GREATEST(1, LEAST(1000, COALESCE((v_spec->>'qty')::integer, 1)));

  IF v_type = 'time_bank' THEN
    INSERT INTO feature_purchases (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'time_bank_seconds', 0, 'per_use', v_qty, NULL);
    v_granted := jsonb_build_object('type', 'time_bank', 'uses', v_qty, 'seconds', v_qty * 20);

  ELSIF v_type = 'throwable' THEN
    INSERT INTO feature_purchases (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'throwable', 0, 'per_use', v_qty, NULL);
    v_granted := jsonb_build_object('type', 'throwable', 'uses', v_qty);

  ELSIF v_type = 'emote_pack' THEN
    INSERT INTO feature_purchases (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'emoji_pack', 0, 'permanent', NULL, NULL);
    v_granted := jsonb_build_object('type', 'emote_pack', 'permanent', true);

  ELSIF v_type = 'table_skin' THEN
    INSERT INTO feature_purchases (user_id, feature, cost, usage_type, uses_remaining, expires_at)
    VALUES (v_row.user_id, 'theme_unlock', 0, 'permanent', NULL, NULL);
    v_granted := jsonb_build_object('type', 'table_skin', 'permanent', true,
                                    'theme_id', v_spec->>'theme_id');

  ELSIF v_type = 'avatar' THEN
    INSERT INTO avatar_unlocks (user_id, avatar_id, unlock_method)
    VALUES (v_row.user_id, COALESCE(v_spec->>'avatar_id', v_row.item_id::text), 'club_shop')
    ON CONFLICT DO NOTHING;
    v_granted := jsonb_build_object('type', 'avatar', 'avatar_id',
                                    COALESCE(v_spec->>'avatar_id', v_row.item_id::text));
  END IF;

  UPDATE club_shop_inventory
     SET status = 'redeemed', redeemed_at = now()
   WHERE id = p_inventory_id;

  RETURN jsonb_build_object('success', true, 'item_name', v_row.item_name, 'granted', v_granted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_use_throwable(p_throwable_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_vip    boolean;
  v_used   integer;
  v_free   constant integer := 500;
  v_credit uuid;
  v_left   integer;
  v_res    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;
  IF p_throwable_id IS NULL OR length(p_throwable_id) = 0 OR length(p_throwable_id) > 64 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid throwable');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('throwable:' || v_uid::text, 0));

  SELECT COALESCE(is_vip, false)
           AND (vip_expires_at IS NULL OR vip_expires_at > now())
    INTO v_vip FROM public.profiles WHERE id = v_uid;

  IF COALESCE(v_vip, false) THEN
    SELECT count(*) INTO v_used FROM public.throw_usage
     WHERE user_id = v_uid
       AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC');
    IF v_used < v_free THEN
      INSERT INTO public.throw_usage (user_id, throwable_id, paid_diamonds)
      VALUES (v_uid, p_throwable_id, false);
      RETURN jsonb_build_object('success', true, 'paid', false,
                                'free_remaining', v_free - v_used - 1);
    END IF;
  END IF;

  -- 2026-08-19: spend a club-shop throwable pack credit before charging diamonds.
  SELECT id INTO v_credit
    FROM public.feature_purchases
   WHERE user_id = v_uid AND feature = 'throwable'
     AND COALESCE(uses_remaining, 0) > 0
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_credit IS NOT NULL THEN
    UPDATE public.feature_purchases
       SET uses_remaining = uses_remaining - 1
     WHERE id = v_credit
     RETURNING uses_remaining INTO v_left;

    INSERT INTO public.throw_usage (user_id, throwable_id, paid_diamonds)
    VALUES (v_uid, p_throwable_id, false);

    RETURN jsonb_build_object('success', true, 'paid', false,
                              'from_pack', true, 'pack_remaining', v_left);
  END IF;

  v_res := public.deduct_diamonds(
    v_uid, 1, 'Throwable: ' || p_throwable_id, 'throwable');
  IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false,
                              'error', COALESCE(v_res->>'error', 'Diamond charge failed'));
  END IF;

  INSERT INTO public.throw_usage (user_id, throwable_id, paid_diamonds)
  VALUES (v_uid, p_throwable_id, true);

  RETURN jsonb_build_object('success', true, 'paid', true,
                            'balance', (v_res->>'balance')::numeric);
END;
$function$;

-- ── Starter catalog grants (applied as club_shop_starter_catalog_grants) ──
UPDATE club_shop_items SET
  name = 'Time Bank +60s',
  description = 'Adds 60 seconds of extra decision time (3 uses x 20s). [starter]',
  grant_spec = '{"type":"time_bank","qty":3}'::jsonb
WHERE name = 'Time Bank +30s';

UPDATE club_shop_items SET
  name = 'Time Bank Bundle (+100s)',
  description = 'Five time bank uses at a bundle discount (5 x 20s = 100s). [starter]',
  grant_spec = '{"type":"time_bank","qty":5}'::jsonb
WHERE name = 'Time Bank Bundle (5x)';

UPDATE club_shop_items SET grant_spec = '{"type":"table_skin","theme_id":"midnight_felt"}'::jsonb
WHERE name = 'Midnight Felt Table Skin';
UPDATE club_shop_items SET grant_spec = '{"type":"table_skin","theme_id":"royal_gold"}'::jsonb
WHERE name = 'Royal Gold Table Skin';
UPDATE club_shop_items SET grant_spec = '{"type":"throwable","qty":10}'::jsonb
WHERE name IN ('Tomato Pack (10)', 'Snowball Pack (10)');
UPDATE club_shop_items SET grant_spec = '{"type":"throwable","qty":3}'::jsonb
WHERE name = 'Golden Egg (3)';
UPDATE club_shop_items SET grant_spec = '{"type":"emote_pack"}'::jsonb
WHERE name IN ('Classic Emote Pack', 'Premium Emote Pack');
UPDATE club_shop_items SET grant_spec = '{"type":"avatar","avatar_id":"shark"}'::jsonb
WHERE name = 'Shark Avatar';
UPDATE club_shop_items SET grant_spec = '{"type":"avatar","avatar_id":"crown"}'::jsonb
WHERE name = 'Crown Avatar';
UPDATE club_shop_items SET grant_spec = '{"type":"none"}'::jsonb
WHERE name = 'VIP Rail Seat (7 days)';

DO $$
DECLARE v_missing integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='club_shop_items' AND column_name='grant_spec') THEN
    RAISE EXCEPTION 'grant_spec column missing';
  END IF;
  SELECT count(*) INTO v_missing FROM club_shop_items
   WHERE is_active AND description LIKE '%[starter]%' AND grant_spec IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% starter item(s) still have no grant_spec', v_missing;
  END IF;
END $$;
