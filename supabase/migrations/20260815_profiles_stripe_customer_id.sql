-- ═══════════════════════════════════════════════════════════════════════════
-- profiles.stripe_customer_id — the column the Stripe money path was designed
-- around but that never existed (CHECK 13 phantom-column finding).
--
-- IMPACT of its absence:
--   1. create-checkout-session selected it -> 42703 -> swallowed -> profile
--      null -> a NEW Stripe customer created on EVERY checkout (duplicate
--      customers, no payment-method reuse), then the save-back UPDATE failed
--      silently.
--   2. The stripe webhook's VIP grant UPDATE includes it and deliberately
--      THROWS on error so Stripe retries — with the column missing, a paid
--      VIP grant could never land and would retry until Stripe gave up.
--
-- Applied to production 2026-08-15 via Supabase MCP apply_migration as
-- 20260815_profiles_stripe_customer_id. This file is the auditable mirror.
--
-- Fix is additive (Tier 2): both call sites already implement the designed
-- select/save/reuse flow; zero code change needed for the customer-reuse
-- path. Backfill is not possible (no historical mapping stored anywhere).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Post-apply assertion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='stripe_customer_id'
  ) THEN
    RAISE EXCEPTION 'ABORT: profiles.stripe_customer_id missing after ALTER';
  END IF;
END $$;

-- ROLLBACK (paste-ready):
-- DROP INDEX IF EXISTS public.idx_profiles_stripe_customer_id;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_customer_id;
