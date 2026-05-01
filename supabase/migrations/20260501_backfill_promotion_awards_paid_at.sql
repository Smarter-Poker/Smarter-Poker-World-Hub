-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_backfill_promotion_awards_paid_at.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data-only backfill)
-- AUTHOR:      Cowork agent (deep audit pass)
-- AFFECTS:     commander_promotion_awards.paid_at
-- IRREVERSIBLE: no — re-running is a no-op (WHERE filter excludes already-set rows)
--
-- WHY:
--   Audit pass found 20 commander_promotion_awards rows with the
--   inconsistent state (status='paid' AND paid_at IS NULL). All 20 are
--   seed/test data from 2026-01-18 → 2026-02-15:
--     - Stylized player_names like "Short Stack Steve", "Wild Card Wendy"
--     - venue_id = NULL on every row
--     - approved_at = NULL
--     - player_id maps to either horse profiles or `test_dev_agent`
--   Not real money owed to real users.
--
--   But the inconsistent state breaks any report that filters
--   `WHERE paid_at IS NOT NULL` to find paid-out promotions. Backfill
--   paid_at = created_at so the data is internally consistent without
--   making any economic claim.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count FROM commander_promotion_awards
    WHERE status = 'paid' AND paid_at IS NULL;
    RAISE NOTICE 'Pre-flight: % awards in inconsistent state', v_count;
    IF v_count = 0 THEN
        RAISE NOTICE 'Pre-flight: 0 inconsistencies — already cleaned (idempotent re-run)';
        RETURN;
    END IF;
END $$;

UPDATE commander_promotion_awards
SET paid_at = created_at
WHERE status = 'paid' AND paid_at IS NULL;

DO $$
DECLARE v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count FROM commander_promotion_awards
    WHERE status = 'paid' AND paid_at IS NULL;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Post-apply: % inconsistencies still remain', v_count;
    END IF;
END $$;
