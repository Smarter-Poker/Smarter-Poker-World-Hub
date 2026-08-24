-- ═══════════════════════════════════════════════════════════════════════
-- 20260824_bbj_contributions_club_created_index.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER: 2 | AUTHOR: Claude (Cowork) | IRREVERSIBLE: no
--
-- WHY:
--   fn_bbj_rollup_day scans bbj_contributions by (club_id, created_at-day).
--   The table had an index on created_at alone, and one on club_id ONLY
--   WHERE player_id IS NOT NULL — and player_id is NULL on all 652,443 rows,
--   so that partial index matches nothing. The rollup fell back to scanning
--   the whole table. One day ran; a four-day catch-up hit the statement
--   timeout.
--
--   rake_records already has the equivalent (idx_rake_records_club_created).
--   This is its missing twin.
--
-- HOW: composite (club_id, created_at). Not CONCURRENTLY — that is illegal
--      inside a migration transaction; 652k rows, brief lock.
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_bbj_contrib_club_created
  ON public.bbj_contributions (club_id, created_at);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE tablename='bbj_contributions'
                      AND indexname='idx_bbj_contrib_club_created') THEN
        RAISE EXCEPTION 'post-apply failed: index not created';
    END IF;
    RAISE NOTICE 'post-apply OK: idx_bbj_contrib_club_created present';
END $$;
