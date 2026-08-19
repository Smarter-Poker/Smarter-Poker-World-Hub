-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_club_shop_purchases_allow_repeat_buys.sql
-- Applied to production 2026-08-19 via Supabase MCP as
-- `club_shop_purchases_allow_repeat_buys`.
--
-- WHY: UNIQUE (club_id, buyer_id, item_id) made club_shop_purchases a
-- one-row-per-buyer-per-item SET rather than a purchase LEDGER. Consequence:
-- every shop item was a lifetime one-shot -- a redeemed Time Bank, Tomato Pack
-- or Snowball Pack could never be bought again. Verified live on production
-- 2026-08-19: after redeeming, the re-buy failed with 23505 and the API
-- correctly refunded the chips (balance intact), but the purchase was
-- impossible by construction. The API-level ownership fix alone was defeated
-- by this constraint.
--
-- Duplicate protection does NOT depend on this constraint:
--   1. /api/club-arena/marketplace-purchase requires X-Idempotency-Key and
--      caches the response, so double-taps replay instead of re-charging.
--   2. The same route rejects a purchase while an UNREDEEMED copy exists in
--      club_shop_inventory (status='owned') -- the real ownership rule.
--   3. Rate limiting applies per user per route.
-- club_shop_inventory keeps UNIQUE (purchase_id), so delivery stays 1:1 with
-- purchases and the trigger's ON CONFLICT (purchase_id) DO NOTHING still holds.
--
-- Verified after apply (production, test account):
--   buy -> owned -> re-buy blocked (alreadyOwned) -> redeem -> buy again OK
--   -> blocked again. 2 purchases, 2 inventory rows (1 owned, 1 redeemed).
--
-- Rollback (only safe once duplicates are removed):
--   ALTER TABLE club_shop_purchases
--     ADD CONSTRAINT uq_shop_purchase_per_buyer UNIQUE (club_id, buyer_id, item_id);
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.club_shop_purchases
  DROP CONSTRAINT IF EXISTS uq_shop_purchase_per_buyer;

-- Purchase history is queried per buyer and per item; keep those paths indexed
-- now that the unique index backing them is gone.
CREATE INDEX IF NOT EXISTS idx_club_shop_purchases_buyer
  ON public.club_shop_purchases (club_id, buyer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_shop_purchases_item
  ON public.club_shop_purchases (club_id, item_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.club_shop_purchases'::regclass
      AND conname = 'uq_shop_purchase_per_buyer'
  ) THEN
    RAISE EXCEPTION 'uq_shop_purchase_per_buyer still present -- repeat buys remain blocked';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'club_shop_inventory'
      AND indexname = 'club_shop_inventory_purchase_id_key'
  ) THEN
    RAISE EXCEPTION 'club_shop_inventory lost its unique purchase_id guard';
  END IF;
END $$;
