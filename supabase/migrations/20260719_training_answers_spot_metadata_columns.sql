-- 2026-07-19 Training engine audit (Tier 2 migration)
-- Applied to production via Supabase MCP apply_migration on 2026-07-19.
-- Phase 14 spot-metadata columns were referenced by
-- pages/api/training/smart-practice.js and analytics.js but never added,
-- so those queries failed 42703 and position/street/mistake analytics were
-- silently dead. Additive, nullable — no existing data affected.

ALTER TABLE public.training_answers
    ADD COLUMN IF NOT EXISTS hero_position text,
    ADD COLUMN IF NOT EXISTS villain_position text,
    ADD COLUMN IF NOT EXISTS street text,
    ADD COLUMN IF NOT EXISTS classification text,
    ADD COLUMN IF NOT EXISTS ev_loss numeric,
    ADD COLUMN IF NOT EXISTS spot_type text;

-- Assertion: all six columns now exist
DO $$
BEGIN
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='training_answers'
          AND column_name IN ('hero_position','villain_position','street','classification','ev_loss','spot_type')) <> 6 THEN
        RAISE EXCEPTION 'training_answers spot-metadata columns missing after migration';
    END IF;
END $$;
