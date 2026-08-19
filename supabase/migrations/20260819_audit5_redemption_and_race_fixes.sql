-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_audit5_redemption_and_race_fixes.sql
-- Applied to production 2026-08-19 via Supabase MCP as
-- `club_shop_theme_unlocks_and_redeem_hardening` +
-- `club_shop_inventory_one_owned_copy`.
--
-- 1) TABLE SKINS GRANTED NOTHING DISTINCT. fn_redeem_shop_item wrote a generic
--    feature_purchases('theme_unlock') row and discarded grant_spec.theme_id, so
--    a club selling "Midnight Felt" and "Royal Gold" sold the same flag twice --
--    the second purchase charged full price and unlocked nothing new. New
--    public.theme_unlocks records WHICH theme (mirrors avatar_unlocks). The
--    generic row is still written so the existing VIP feature gate still works.
--    Both avatar and theme now fall back to the ITEM ID when the admin supplied
--    no id, instead of a shared constant that made every avatar collide.
--
-- 2) auth.uid() NULL FAILED OPEN. `IF v_row.user_id <> auth.uid()` evaluates to
--    NULL when auth.uid() is NULL, so the IF was skipped and the function
--    granted and redeemed SOMEONE ELSE'S inventory row. Unreachable from the
--    browser today; any future service_role caller would have bypassed it.
--
-- 3) A deleted catalogue row left v_spec NULL -> the copy was silently marked
--    redeemed, granted nothing, and returned success. Now 'item_gone'.
--
-- 4) fn_release_shop_stock had no ceiling; a release racing an admin lowering
--    stock could inflate it. Now clamped behind a FOR UPDATE read.
--
-- 5) DOUBLE PURCHASE WAS POSSIBLE. The route checked "do you already own an
--    unredeemed copy?" with a SELECT and acted on it -- a TOCTOU. The client
--    mints a fresh X-Idempotency-Key per click, so the idempotency cache never
--    de-duped a real double-buy: two tabs both passed the read, both debited,
--    both inserted. An advisory lock cannot fix this from the API layer because
--    each PostgREST call runs in its own transaction. The invariant now lives
--    in the schema as a PARTIAL unique index over status='owned' only, so
--    redeemed history still accumulates and consumables stay re-buyable.
--    On violation the delivery trigger raises, the purchase INSERT fails, and
--    the route's existing rollback refunds the chips and releases the stock.
--    Verified: zero pre-existing duplicates.
--
-- Rollback:
--   DROP INDEX public.uq_shop_inventory_owned_per_item;
--   DROP TABLE public.theme_unlocks;
--   (restore prior fn_redeem_shop_item / fn_release_shop_stock bodies)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.theme_unlocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id      text NOT NULL,
  unlock_method text,
  unlocked_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_theme_unlocks_user ON public.theme_unlocks (user_id);

ALTER TABLE public.theme_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS theme_unlocks_select_own ON public.theme_unlocks;
CREATE POLICY theme_unlocks_select_own ON public.theme_unlocks
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS theme_unlocks_svc ON public.theme_unlocks;
CREATE POLICY theme_unlocks_svc ON public.theme_unlocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.theme_unlocks IS
  'Table themes a player has unlocked. Written by fn_redeem_shop_item; mirrors avatar_unlocks.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_inventory_owned_per_item
  ON public.club_shop_inventory (user_id, club_id, item_id)
  WHERE status = 'owned';

-- Full bodies of fn_redeem_shop_item and fn_release_shop_stock as applied are
-- reproduced in the MCP migrations of the same names; see the audit doc
-- .agent/audits/2026-08-19-club-arena-marketplace-audit-pass.md (pass 5).

DO $$
BEGIN
  IF to_regclass('public.theme_unlocks') IS NULL THEN
    RAISE EXCEPTION 'theme_unlocks missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'club_shop_inventory'
      AND indexname = 'uq_shop_inventory_owned_per_item'
  ) THEN
    RAISE EXCEPTION 'partial unique index missing';
  END IF;
END $$;
