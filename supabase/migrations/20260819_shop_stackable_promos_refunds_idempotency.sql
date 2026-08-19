-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_shop_stackable_promos_refunds_idempotency.sql
--
-- Applied to production 2026-08-19 via Supabase MCP as:
--   club_shop_stackable_consumables_and_limits
--   fn_refund_shop_purchase
--   api_idempotency_durable_store
--
-- 1) STACKABLE CONSUMABLES. The "one unredeemed copy" rule existed to make
--    "Owned" meaningful for permanent unlocks, but it also stopped a player
--    buying three throwable packs — which is what a consumable is for.
--    club_shop_items.stackable exempts consumables. The partial unique index is
--    NARROWED rather than dropped, so non-stackable items keep the race-proof
--    guarantee that closed the double-purchase hole. The predicate must be
--    immutable, so items.stackable is snapshotted onto the inventory row at
--    delivery time (club_shop_inventory.stackable_snapshot).
--
-- 2) PROMOS + CAPS. sale_price, available_from/until, per_user_limit,
--    sort_order. fn_shop_item_availability() answers "may this member buy this
--    now, and at what price?" in ONE call, so the storefront and the purchase
--    route cannot drift apart on the rules.
--
-- 3) REFUNDS. fn_refund_shop_purchase credits the price actually paid, flips
--    the inventory copy to 'refunded', returns the unit to stock and writes the
--    ledger row — atomically. REFUSES once redeemed: the entitlement is already
--    handed over and clawing it back is not something it can honestly promise.
--    Idempotent, so a retry cannot double-credit.
--
-- 4) DURABLE IDEMPOTENCY. The old store was a per-process Map; on serverless
--    each lambda instance has its own, so two rapid requests on different
--    instances both missed it. api_idempotency + fn_idempotency_begin/finish
--    let Postgres decide the race. 5xx is never cached, so a transient failure
--    is not replayed as a permanent one. This BACKSTOPS the schema invariants —
--    the partial unique index is still what makes a double purchase impossible,
--    because the client mints a fresh key per click.
--
-- Full applied bodies are in the MCP migrations of the names above; the DDL is
-- reproduced here so the repo can rebuild the schema from scratch.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.club_shop_items
  ADD COLUMN IF NOT EXISTS stackable       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS per_user_limit  integer,
  ADD COLUMN IF NOT EXISTS sale_price      integer,
  ADD COLUMN IF NOT EXISTS available_from  timestamptz,
  ADD COLUMN IF NOT EXISTS available_until timestamptz,
  ADD COLUMN IF NOT EXISTS sort_order      integer NOT NULL DEFAULT 0;

ALTER TABLE public.club_shop_inventory
  ADD COLUMN IF NOT EXISTS stackable_snapshot boolean NOT NULL DEFAULT false;

ALTER TABLE public.club_shop_items
  DROP CONSTRAINT IF EXISTS club_shop_items_per_user_limit_pos;
ALTER TABLE public.club_shop_items
  ADD CONSTRAINT club_shop_items_per_user_limit_pos
  CHECK (per_user_limit IS NULL OR per_user_limit > 0);

ALTER TABLE public.club_shop_items
  DROP CONSTRAINT IF EXISTS club_shop_items_sale_price_valid;
ALTER TABLE public.club_shop_items
  ADD CONSTRAINT club_shop_items_sale_price_valid
  CHECK (sale_price IS NULL OR (sale_price >= 0 AND sale_price <= price));

ALTER TABLE public.club_shop_items
  DROP CONSTRAINT IF EXISTS club_shop_items_window_valid;
ALTER TABLE public.club_shop_items
  ADD CONSTRAINT club_shop_items_window_valid
  CHECK (available_from IS NULL OR available_until IS NULL OR available_until > available_from);

UPDATE public.club_shop_items
SET stackable = true
WHERE stackable = false AND grant_spec->>'type' IN ('time_bank', 'throwable');

UPDATE public.club_shop_inventory inv
SET stackable_snapshot = COALESCE(i.stackable, false)
FROM public.club_shop_items i
WHERE i.id = inv.item_id
  AND inv.stackable_snapshot IS DISTINCT FROM COALESCE(i.stackable, false);

-- Race-proof ownership for NON-stackable items only. 'refunded' copies must not
-- block a re-purchase, hence status = 'owned' in the predicate.
DROP INDEX IF EXISTS public.uq_shop_inventory_owned_per_item;
CREATE UNIQUE INDEX uq_shop_inventory_owned_per_item
  ON public.club_shop_inventory (user_id, club_id, item_id)
  WHERE status = 'owned' AND stackable_snapshot = false;

CREATE TABLE IF NOT EXISTS public.api_idempotency (
  key        text PRIMARY KEY,
  route      text NOT NULL,
  state      text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing', 'done')),
  status     integer,
  body       jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_expiry ON public.api_idempotency (expires_at);
ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_idempotency_svc ON public.api_idempotency;
CREATE POLICY api_idempotency_svc ON public.api_idempotency
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE tablename='club_shop_inventory'
                   AND indexname='uq_shop_inventory_owned_per_item') THEN
    RAISE EXCEPTION 'ownership uniqueness index missing — the double-buy guard is gone';
  END IF;
  IF to_regclass('public.api_idempotency') IS NULL THEN
    RAISE EXCEPTION 'api_idempotency missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_refund_shop_purchase') THEN
    RAISE EXCEPTION 'fn_refund_shop_purchase missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_shop_item_availability') THEN
    RAISE EXCEPTION 'fn_shop_item_availability missing';
  END IF;
END $$;
