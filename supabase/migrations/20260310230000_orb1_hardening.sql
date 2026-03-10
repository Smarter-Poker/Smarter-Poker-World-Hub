-- ═══════════════════════════════════════════════════════════════════════
-- Idempotency Key Cleanup + Marketplace Unique Constraint
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Automated idempotency key cleanup function
--    Deletes keys older than 48 hours to prevent table bloat.
CREATE OR REPLACE FUNCTION public.cleanup_idempotency_keys()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.orb1_idempotency_keys
    WHERE created_at < NOW() - INTERVAL '48 hours';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 2. Schedule via pg_cron (runs daily at 3 AM UTC)
--    If pg_cron is not enabled, this will silently fail.
DO $$
BEGIN
    PERFORM cron.schedule(
        'cleanup-idempotency-keys',
        '0 3 * * *',
        'SELECT public.cleanup_idempotency_keys()'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — skipping scheduled job. Run cleanup_idempotency_keys() manually or via API cron.';
END $$;

-- 3. Marketplace: Prevent duplicate purchases of the same item by the same buyer.
--    This is a database-level safety net that prevents malicious API abuse.
CREATE TABLE IF NOT EXISTS public.club_shop_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL,
    buyer_id UUID NOT NULL REFERENCES auth.users(id),
    item_id UUID NOT NULL,
    price_paid NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add the unique constraint (idempotent — safe to re-run)
DO $$
BEGIN
    ALTER TABLE public.club_shop_purchases
        ADD CONSTRAINT uq_shop_purchase_per_buyer
        UNIQUE (club_id, buyer_id, item_id);
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Unique constraint uq_shop_purchase_per_buyer already exists.';
END $$;

-- 4. Add index for fast ownership lookups
CREATE INDEX IF NOT EXISTS idx_shop_purchases_buyer
    ON public.club_shop_purchases(club_id, buyer_id);

-- 5. Add balance_after column to chip_transactions if missing
DO $$
BEGIN
    ALTER TABLE public.chip_transactions
        ADD COLUMN IF NOT EXISTS balance_after NUMERIC DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
