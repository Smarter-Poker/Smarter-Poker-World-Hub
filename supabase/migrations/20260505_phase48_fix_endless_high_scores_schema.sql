-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 48 — Fix endless_high_scores schema mismatch
-- ═══════════════════════════════════════════════════════════════════════════
-- Bug: pages/hub/trivia/endless.js writes columns that don't exist on the
-- endless_high_scores table:
--   - line 123: SELECT .eq('mode','random') — column missing
--   - line 590: UPSERT { mode, achieved_at } — both columns missing
--   - line 593: onConflict 'user_id,mode' — no unique constraint exists
-- Result: every endless game completion silently failed to save a high score.
-- Verified empty (0 rows) on production prior to fix → no high score had
-- ever persisted across the platform's lifetime.
--
-- Also: pages/hub/trivia/endless.js subscribes to realtime postgres_changes
-- on this table, but it was NOT in the supabase_realtime publication →
-- broadcasts never fired. Added to publication.
--
-- Applied to production via Supabase MCP on 2026-05-05.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.endless_high_scores
    ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'random',
    ADD COLUMN IF NOT EXISTS achieved_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public'
           AND tablename='endless_high_scores'
           AND indexname='endless_high_scores_user_id_mode_key'
    ) THEN
        ALTER TABLE public.endless_high_scores
            ADD CONSTRAINT endless_high_scores_user_id_mode_key UNIQUE (user_id, mode);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime'
           AND schemaname='public'
           AND tablename='endless_high_scores'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.endless_high_scores';
    END IF;
END $$;
