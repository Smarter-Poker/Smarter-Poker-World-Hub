-- Migration: 20260310221300_club_arena_spin_multiplier.sql
-- Description: Adds the spin_multiplier column to club_tournaments to support Phase 1 features.
-- Idempotent: Uses DO block to check if column exists before adding.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'club_tournaments'
          AND column_name = 'spin_multiplier'
    ) THEN
        ALTER TABLE public.club_tournaments
            ADD COLUMN spin_multiplier NUMERIC(8, 2) DEFAULT NULL;
    END IF;
END $$;
