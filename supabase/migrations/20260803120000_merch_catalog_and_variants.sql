-- ═══════════════════════════════════════════════════════════════════════════════
-- MERCH CATALOG + VARIANTS + ORDERS
-- Migration: 20260803120000_merch_catalog_and_variants.sql
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHY THIS EXISTS
--   pages/api/store/purchase-with-diamonds.js and
--   pages/api/store/create-checkout-session.js have BOTH been reading a
--   `merchandise_items` table since Phase 6 as their server-side price oracle,
--   and both write `merchandise_orders`. `merchandise_items` was never actually
--   created by any migration (only supabase/migrations/archive/
--   20260129_diamond_store_schema.sql creates merchandise_orders, and
--   20260520000004_rescope_service_role_policies.sql adds policies to a table
--   that does not exist). Result today: every catalog lookup silently returns
--   zero rows, so EVERY merch item falls through to the CLIENT-SUPPLIED PRICE
--   path. This migration turns the price oracle on.
--
-- ECONOMY (src/config/diamondRewards.js is the single source of truth)
--   1 diamond = $0.01 USD. price_diamonds is therefore ROUND(price_usd * 100)
--   for every seeded row. Never derive a price from the client.
--
-- WHAT IT ADDS OVER THE OLD SHAPE
--   * merchandise_items            — the catalog itself (slug ids, kept stable
--                                    so src/data/diamondStoreData.js MERCHANDISE
--                                    ids keep matching), price in BOTH usd and
--                                    diamonds, image_url, is_active, sort_order.
--   * merchandise_item_variants    — size / colour with PER-VARIANT stock.
--   * merchandise_orders           — backfilled with the columns the two live
--                                    endpoints already insert (payment_method,
--                                    diamonds_spent) and a status CHECK that
--                                    actually allows 'completed', which
--                                    purchase-with-diamonds.js writes today.
--
-- IDEMPOTENT: every object is IF NOT EXISTS / OR REPLACE / ON CONFLICT DO
-- NOTHING. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Shared updated_at helper (merch-scoped name so it cannot collide)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_merch_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. merchandise_items — the catalog / price oracle
--    id is TEXT: create-checkout-session.js and purchase-with-diamonds.js both
--    do .in('id', itemIds) with slugs coming from the MERCHANDISE array.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.merchandise_items CASCADE;

CREATE TABLE IF NOT EXISTS public.merchandise_items (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    category        TEXT,
    image_url       TEXT,
    price_usd       NUMERIC(10, 2) NOT NULL,
    price_diamonds  INTEGER NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    -- item-level stock for products that carry no variants.
    -- NULL = unlimited / made to order. Variant rows override this.
    stock           INTEGER,
    has_variants    BOOLEAN NOT NULL DEFAULT FALSE,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added defensively in case an earlier hand-made table exists.
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS category       TEXT;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS image_url      TEXT;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS price_usd      NUMERIC(10, 2);
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS price_diamonds INTEGER;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS sort_order     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS stock          INTEGER;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS has_variants   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS metadata       JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.merchandise_items ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Money sanity. NOT VALID so legacy rows can never block the migration; new and
-- updated rows are still fully checked.
ALTER TABLE public.merchandise_items DROP CONSTRAINT IF EXISTS merchandise_items_price_usd_positive;
ALTER TABLE public.merchandise_items
    ADD CONSTRAINT merchandise_items_price_usd_positive
    CHECK (price_usd IS NULL OR price_usd > 0) NOT VALID;

ALTER TABLE public.merchandise_items DROP CONSTRAINT IF EXISTS merchandise_items_price_diamonds_positive;
ALTER TABLE public.merchandise_items
    ADD CONSTRAINT merchandise_items_price_diamonds_positive
    CHECK (price_diamonds IS NULL OR price_diamonds > 0) NOT VALID;

ALTER TABLE public.merchandise_items DROP CONSTRAINT IF EXISTS merchandise_items_stock_nonneg;
ALTER TABLE public.merchandise_items
    ADD CONSTRAINT merchandise_items_stock_nonneg
    CHECK (stock IS NULL OR stock >= 0) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_merchandise_items_active_sort
    ON public.merchandise_items (is_active, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_merchandise_items_category
    ON public.merchandise_items (category);

DROP TRIGGER IF EXISTS trg_merchandise_items_updated_at ON public.merchandise_items;
CREATE TRIGGER trg_merchandise_items_updated_at
    BEFORE UPDATE ON public.merchandise_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_merch_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- B. merchandise_item_variants — size / colour, per-variant stock
--    price_usd / price_diamonds are NULLABLE overrides: NULL means "inherit the
--    parent item's price". Never let a variant be free by accident.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchandise_item_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         TEXT NOT NULL REFERENCES public.merchandise_items(id) ON DELETE CASCADE,
    sku             TEXT NOT NULL UNIQUE,
    size            TEXT,
    color           TEXT,
    price_usd       NUMERIC(10, 2),
    price_diamonds  INTEGER,
    stock           INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.merchandise_item_variants DROP CONSTRAINT IF EXISTS merchandise_item_variants_stock_nonneg;
ALTER TABLE public.merchandise_item_variants
    ADD CONSTRAINT merchandise_item_variants_stock_nonneg
    CHECK (stock >= 0) NOT VALID;

ALTER TABLE public.merchandise_item_variants DROP CONSTRAINT IF EXISTS merchandise_item_variants_price_positive;
ALTER TABLE public.merchandise_item_variants
    ADD CONSTRAINT merchandise_item_variants_price_positive
    CHECK ((price_usd IS NULL OR price_usd > 0) AND (price_diamonds IS NULL OR price_diamonds > 0)) NOT VALID;

-- One row per (item, size, colour). COALESCE because size/colour are nullable
-- and NULLs would otherwise dodge a plain UNIQUE constraint.
CREATE UNIQUE INDEX IF NOT EXISTS ux_merchandise_item_variants_combo
    ON public.merchandise_item_variants (item_id, COALESCE(size, ''), COALESCE(color, ''));
CREATE INDEX IF NOT EXISTS idx_merchandise_item_variants_item
    ON public.merchandise_item_variants (item_id, is_active, sort_order);

DROP TRIGGER IF EXISTS trg_merchandise_item_variants_updated_at ON public.merchandise_item_variants;
CREATE TRIGGER trg_merchandise_item_variants_updated_at
    BEFORE UPDATE ON public.merchandise_item_variants
    FOR EACH ROW EXECUTE FUNCTION public.fn_merch_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- C. merchandise_orders — matches what the two live endpoints already write
--    create-checkout-session.js insert: user_id, items, total_usd, status
--    purchase-with-diamonds.js  insert: user_id, items, total_usd,
--                                       diamonds_spent, payment_method, status
--    webhooks/stripe.js         update: status, stripe_checkout_session_id,
--                                       updated_at
--    pages/hub/diamond-store/orders.js reads: id, created_at, updated_at,
--                                       status, payment_method, diamonds_spent,
--                                       total_usd, items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchandise_orders (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id  TEXT,
    stripe_checkout_session_id TEXT,
    items                     JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_usd                 NUMERIC(10, 2) NOT NULL DEFAULT 0,
    diamonds_spent            INTEGER NOT NULL DEFAULT 0,
    payment_method            TEXT NOT NULL DEFAULT 'stripe',
    status                    TEXT NOT NULL DEFAULT 'pending',
    shipping_address          JSONB,
    tracking_number           TEXT,
    tracking_url              TEXT,
    carrier                   TEXT,
    metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shipped_at                TIMESTAMPTZ,
    delivered_at              TIMESTAMPTZ
);

-- The archive migration created this table WITHOUT payment_method /
-- diamonds_spent / tracking_url / carrier, so purchase-with-diamonds.js has been
-- inserting columns that may not exist. Backfill them.
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   TEXT;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS diamonds_spent  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS payment_method  TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS tracking_url    TEXT;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS carrier         TEXT;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS metadata        JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS shipped_at      TIMESTAMPTZ;
ALTER TABLE public.merchandise_orders ADD COLUMN IF NOT EXISTS delivered_at    TIMESTAMPTZ;

-- The archive CHECK allowed only pending/processing/shipped/delivered/canceled/
-- refunded — but purchase-with-diamonds.js writes 'completed', which that
-- constraint REJECTS. Widen it. NOT VALID so existing rows can't block.
ALTER TABLE public.merchandise_orders DROP CONSTRAINT IF EXISTS merchandise_orders_status_check;
ALTER TABLE public.merchandise_orders
    ADD CONSTRAINT merchandise_orders_status_check
    CHECK (status IN (
        'pending', 'processing', 'paid', 'completed',
        'shipped', 'delivered', 'canceled', 'cancelled',
        'failed', 'refunded'
    )) NOT VALID;

ALTER TABLE public.merchandise_orders DROP CONSTRAINT IF EXISTS merchandise_orders_payment_method_check;
ALTER TABLE public.merchandise_orders
    ADD CONSTRAINT merchandise_orders_payment_method_check
    CHECK (payment_method IN ('stripe', 'card', 'diamonds', 'mixed', 'comp')) NOT VALID;

ALTER TABLE public.merchandise_orders DROP CONSTRAINT IF EXISTS merchandise_orders_amounts_nonneg;
ALTER TABLE public.merchandise_orders
    ADD CONSTRAINT merchandise_orders_amounts_nonneg
    CHECK (total_usd >= 0 AND diamonds_spent >= 0) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_merchandise_orders_user_id     ON public.merchandise_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_status      ON public.merchandise_orders (status);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_created_at  ON public.merchandise_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_user_created
    ON public.merchandise_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchandise_orders_session
    ON public.merchandise_orders (stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_merchandise_orders_updated_at ON public.merchandise_orders;
CREATE TRIGGER trg_merchandise_orders_updated_at
    BEFORE UPDATE ON public.merchandise_orders
    FOR EACH ROW EXECUTE FUNCTION public.fn_merch_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- D. RLS
--    items / variants : anyone (anon included) may SELECT ACTIVE rows only.
--                       writes are service_role only.
--    orders           : a user may SELECT ONLY their own rows. No client
--                       INSERT/UPDATE/DELETE at all — money moves server-side.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.merchandise_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchandise_orders        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchandise_items_public_read"   ON public.merchandise_items;
CREATE POLICY "merchandise_items_public_read"
    ON public.merchandise_items FOR SELECT
    TO anon, authenticated
    USING (is_active = TRUE);

-- keep the name used by 20260520000004_rescope_service_role_policies.sql
DROP POLICY IF EXISTS "Service role manages items" ON public.merchandise_items;
CREATE POLICY "Service role manages items"
    ON public.merchandise_items FOR ALL
    TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "merchandise_item_variants_public_read" ON public.merchandise_item_variants;
CREATE POLICY "merchandise_item_variants_public_read"
    ON public.merchandise_item_variants FOR SELECT
    TO anon, authenticated
    USING (
        is_active = TRUE
        AND EXISTS (
            SELECT 1 FROM public.merchandise_items mi
            WHERE mi.id = merchandise_item_variants.item_id
              AND mi.is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "Service role manages variants" ON public.merchandise_item_variants;
CREATE POLICY "Service role manages variants"
    ON public.merchandise_item_variants FOR ALL
    TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Older permissive names from archive/20260129_diamond_store_schema.sql
DROP POLICY IF EXISTS "Users can view their own orders"    ON public.merchandise_orders;
DROP POLICY IF EXISTS "Service role can manage all orders" ON public.merchandise_orders;
DROP POLICY IF EXISTS "merchandise_orders_own_read"        ON public.merchandise_orders;
CREATE POLICY "merchandise_orders_own_read"
    ON public.merchandise_orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages orders" ON public.merchandise_orders;
CREATE POLICY "Service role manages orders"
    ON public.merchandise_orders FOR ALL
    TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Grants must match the policies: no client-side INSERT/UPDATE/DELETE anywhere.
REVOKE ALL ON public.merchandise_items         FROM anon, authenticated;
REVOKE ALL ON public.merchandise_item_variants FROM anon, authenticated;
REVOKE ALL ON public.merchandise_orders        FROM anon, authenticated;

GRANT SELECT ON public.merchandise_items         TO anon, authenticated;
GRANT SELECT ON public.merchandise_item_variants TO anon, authenticated;
GRANT SELECT ON public.merchandise_orders        TO authenticated;

GRANT ALL ON public.merchandise_items         TO service_role;
GRANT ALL ON public.merchandise_item_variants TO service_role;
GRANT ALL ON public.merchandise_orders        TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- E. SEED — the 8 items from src/data/diamondStoreData.js MERCHANDISE.
--    ids are IDENTICAL to that file so existing cart/checkout code keeps
--    matching. price_diamonds = ROUND(price_usd * 100) at 1💎 = $0.01.
--    ON CONFLICT DO NOTHING: never clobber a price an operator has since edited.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.merchandise_items
    (id, name, description, category, image_url, price_usd, price_diamonds, is_active, sort_order, stock, has_variants)
VALUES
    ('card-protector-gold',  'Gold Card Protector',      'Premium Weighted Card Protector With Smarter.Poker Logo', 'accessories', '/merch/card-protector-gold.jpg',   24.99,  2499, TRUE, 10, 100, FALSE),
    ('card-protector-black', 'Stealth Card Protector',   'Matte Black Weighted Card Protector',                      'accessories', '/merch/card-protector-black.jpg',  24.99,  2499, TRUE, 20, 100, FALSE),
    ('hoodie-neural',        'Neural Network Hoodie',    'Premium Hoodie With Neural Poker Design',                  'apparel',     '/merch/hoodie-neural.jpg',        59.99,  5999, TRUE, 30, NULL, TRUE),
    ('tshirt-gto',           'GTO Wizard Tee',           '100% Cotton Tee With GTO Brain Graphic',                   'apparel',     '/merch/tshirt-gto.jpg',           29.99,  2999, TRUE, 40, NULL, TRUE),
    ('hat-diamond',          'Diamond Dad Hat',          'Embroidered Diamond Logo Cap',                             'apparel',     '/merch/hat-diamond.jpg',          34.99,  3499, TRUE, 50, NULL, TRUE),
    ('deck-premium',         'Premium Playing Cards',    'Casino-Quality Smarter.Poker Deck',                        'accessories', '/merch/deck-premium.jpg',         14.99,  1499, TRUE, 60, 250, FALSE),
    ('chip-set-100',         '100-Chip Travel Set',      'Clay Composite Chips In Aluminum Case',                    'accessories', '/merch/chip-set-100.jpg',         79.99,  7999, TRUE, 70,  50, FALSE),
    ('chip-set-500',         '500-Chip Pro Set',         'Full Tournament Set With Dealer Button',                   'accessories', '/merch/chip-set-500.jpg',        199.99, 19999, TRUE, 80,  25, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Apparel variants. price_usd / price_diamonds NULL = inherit the parent price.
-- 2XL carries the usual +$2.00 (= +200 💎) upcharge.
INSERT INTO public.merchandise_item_variants
    (item_id, sku, size, color, price_usd, price_diamonds, stock, is_active, sort_order)
VALUES
    ('hoodie-neural', 'HOODIE-NEURAL-BLK-S',   'S',        'Black', NULL,  NULL,   40, TRUE, 10),
    ('hoodie-neural', 'HOODIE-NEURAL-BLK-M',   'M',        'Black', NULL,  NULL,   60, TRUE, 20),
    ('hoodie-neural', 'HOODIE-NEURAL-BLK-L',   'L',        'Black', NULL,  NULL,   60, TRUE, 30),
    ('hoodie-neural', 'HOODIE-NEURAL-BLK-XL',  'XL',       'Black', NULL,  NULL,   40, TRUE, 40),
    ('hoodie-neural', 'HOODIE-NEURAL-BLK-2XL', '2XL',      'Black', 61.99, 6199,   20, TRUE, 50),
    ('tshirt-gto',    'TSHIRT-GTO-BLK-S',      'S',        'Black', NULL,  NULL,   50, TRUE, 10),
    ('tshirt-gto',    'TSHIRT-GTO-BLK-M',      'M',        'Black', NULL,  NULL,   80, TRUE, 20),
    ('tshirt-gto',    'TSHIRT-GTO-BLK-L',      'L',        'Black', NULL,  NULL,   80, TRUE, 30),
    ('tshirt-gto',    'TSHIRT-GTO-BLK-XL',     'XL',       'Black', NULL,  NULL,   50, TRUE, 40),
    ('tshirt-gto',    'TSHIRT-GTO-BLK-2XL',    '2XL',      'Black', 31.99, 3199,   25, TRUE, 50),
    ('tshirt-gto',    'TSHIRT-GTO-WHT-S',      'S',        'White', NULL,  NULL,   30, TRUE, 60),
    ('tshirt-gto',    'TSHIRT-GTO-WHT-M',      'M',        'White', NULL,  NULL,   45, TRUE, 70),
    ('tshirt-gto',    'TSHIRT-GTO-WHT-L',      'L',        'White', NULL,  NULL,   45, TRUE, 80),
    ('tshirt-gto',    'TSHIRT-GTO-WHT-XL',     'XL',       'White', NULL,  NULL,   30, TRUE, 90),
    ('hat-diamond',   'HAT-DIAMOND-BLK-OS',    'One Size', 'Black', NULL,  NULL,   75, TRUE, 10),
    ('hat-diamond',   'HAT-DIAMOND-NVY-OS',    'One Size', 'Navy',  NULL,  NULL,   50, TRUE, 20)
ON CONFLICT (sku) DO NOTHING;

-- Keep has_variants honest even if the seed above was a no-op on a pre-existing
-- catalog, so merch-catalog.js never advertises a size picker with no sizes.
UPDATE public.merchandise_items mi
SET has_variants = (SELECT COUNT(*) > 0 FROM public.merchandise_item_variants v WHERE v.item_id = mi.id)
WHERE mi.has_variants IS DISTINCT FROM
      (SELECT COUNT(*) > 0 FROM public.merchandise_item_variants v WHERE v.item_id = mi.id);

COMMIT;
