-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_club_shop_backfill_missing_grants.sql
-- Applied to production 2026-08-19 via Supabase MCP as
-- `club_shop_backfill_missing_grants`.
--
-- Closes the last "pay chips, receive nothing" hole. Three items were live,
-- active and buyable with grant_spec IS NULL, so fn_redeem_shop_item took no
-- branch and granted nothing:
--   Club JAQK  / "Test Purchase Item"  (200 chips)  -- agent test row
--   Club JAQK  / "Verification Item 2" ( 10 chips)  -- agent test row
--   SHARK CLUB / "30s Time Bank"       (500 chips)  -- a REAL item a member
--                                                      could buy for nothing
--
-- Test rows are deactivated, not deleted: they carry purchase history and
-- club_shop_purchases.item_id is ON DELETE CASCADE.
--
-- The SHARK CLUB item gets a real grant. Allowance is 20 SECONDS PER USE, so
-- 30s is not expressible: 2 uses = 40s, deliberately rounding UP so the item
-- can never under-deliver against its own name.
--
-- The final assertion fails the migration if ANY active item still has no
-- grant_spec, so this class of defect cannot silently recur.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE club_shop_items
SET is_active = false
WHERE is_active
  AND grant_spec IS NULL
  AND (name ILIKE 'Test %' OR name ILIKE 'Verification %');

UPDATE club_shop_items
SET grant_spec = '{"type":"time_bank","qty":2}'::jsonb,
    description = COALESCE(NULLIF(description, ''), 'Adds 40 seconds of extra decision time (2 uses x 20s).')
WHERE is_active
  AND grant_spec IS NULL
  AND category = 'Time Banks';

UPDATE club_shop_items
SET grant_spec = jsonb_build_object(
      'type',
      CASE category
        WHEN 'Time Banks'  THEN 'time_bank'
        WHEN 'Table Skins' THEN 'table_skin'
        WHEN 'Throwables'  THEN 'throwable'
        WHEN 'Emotes'      THEN 'emote_pack'
        WHEN 'Avatars'     THEN 'avatar'
        ELSE 'none'
      END
    ) || CASE
      WHEN category IN ('Time Banks','Throwables') THEN jsonb_build_object('qty', 1)
      ELSE '{}'::jsonb
    END
WHERE is_active AND grant_spec IS NULL;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM club_shop_items
  WHERE is_active AND grant_spec IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% active item(s) still grant nothing on redeem', v_bad;
  END IF;
END $$;
