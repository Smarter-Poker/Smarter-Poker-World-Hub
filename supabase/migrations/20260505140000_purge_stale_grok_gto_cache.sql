-- ═══════════════════════════════════════════════════════════════════════
-- 20260505140000_purge_stale_grok_gto_cache.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2                            (additive removal of stale data)
-- AUTHOR:       claude (Operation Grok-Sweep cleanup)
-- AFFECTS:      tables: training_question_cache  rpcs: -  rls: -  triggers: -
-- IRREVERSIBLE: yes                          (deletes 27 rows; replacements
--                                             will be re-generated on demand
--                                             by the deterministic engine)
--
-- WHY:
--   Operation Grok-Sweep (commits 1bf4e2a8e7, follow-up 8dd5ed3942) removed
--   grok-3 from the training/GTO answer-explanation pipeline. Audit then
--   found 27 stale "GROK_GTO"-sourced PIO questions still in
--   training_question_cache. Each of these rows was authored by an LLM at
--   seed time; their gtoFrequencies and correctAnswer were hallucinated, not
--   solver-derived. They are served to users alongside 17,350 legitimate
--   DETERMINISTIC_SOLVER rows.
--
--   This migration purges all 27. The deterministic engine
--   (src/engines/DeterministicGTOEngine.js) repopulates the cache from
--   solved_spots_gold on first request, so worst-case any affected
--   game returns a 404 once before getting refilled with real solver data.
--
--   Audit evidence: outputs/GROK-SWEEP-AUDIT-FINDINGS.md, Issue 4.
--
-- HOW (high level):
--   - Pre-assert: training_question_cache has exactly 27 rows with
--     question_data->>'source' = 'GROK_GTO'.
--   - DELETE those rows.
--   - Post-assert: zero GROK_GTO rows remain; total row count fell by
--     exactly 27.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    grok_count   integer;
    total_before integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'training_question_cache'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.training_question_cache not found';
    END IF;

    SELECT COUNT(*) INTO grok_count
    FROM training_question_cache
    WHERE question_data->>'source' = 'GROK_GTO';

    SELECT COUNT(*) INTO total_before FROM training_question_cache;

    IF grok_count <> 27 THEN
        RAISE EXCEPTION
            'pre-flight failed: expected exactly 27 GROK_GTO rows, found %',
            grok_count;
    END IF;

    IF total_before < 21000 OR total_before > 22000 THEN
        RAISE EXCEPTION
            'pre-flight failed: training_question_cache total row count (%) outside expected band [21000,22000]',
            total_before;
    END IF;

    RAISE NOTICE 'pre-flight ok: % GROK_GTO rows queued for deletion (total before: %)',
        grok_count, total_before;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
DELETE FROM training_question_cache
WHERE question_data->>'source' = 'GROK_GTO';

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    remaining integer;
BEGIN
    SELECT COUNT(*) INTO remaining
    FROM training_question_cache
    WHERE question_data->>'source' = 'GROK_GTO';

    IF remaining <> 0 THEN
        RAISE EXCEPTION
            'post-apply failed: % GROK_GTO rows remain after delete',
            remaining;
    END IF;

    RAISE NOTICE 'post-apply ok: 0 GROK_GTO rows remain';
END $$;

COMMIT;
