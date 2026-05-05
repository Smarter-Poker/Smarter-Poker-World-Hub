-- ═══════════════════════════════════════════════════════════════════════
-- 20260505180000_backfill_missing_game_level_pairs.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3                            (bulk INSERT, ~6,900 new rows)
-- AUTHOR:       claude (Operation Grok-Sweep — Phase 4A backfill)
-- AFFECTS:      tables: training_question_cache  (INSERT only, no updates/deletes)
-- IRREVERSIBLE: yes (rows can be deleted later if needed; idempotent — re-run is no-op)
--
-- WHY:
--   The training cache had only 786 of 1,070 expected (game_id, level) pairs
--   covered. 284 pairs were empty, leaving users hitting those games with
--   404 errors on the first request. This migration backfills the gap by
--   cloning real DETERMINISTIC_SOLVER questions from same-gameType donor
--   games, rewriting only the metadata (game_id, level, question_data->id).
--
--   Question CONTENT (board, hand, frequencies, EVs) is preserved from the
--   real solver source. Only the game_id label changes — which is correct
--   because games of the same gameType all train against the same solver
--   pool anyway (e.g., adv-001 cash and cash-018 cash both want PIO cash
--   training).
--
--   Audit evidence: outputs/GROK-SWEEP-AUDIT-FINDINGS.md, Phase 4 audit.
--
-- HOW (high level):
--   1. Build a deterministic gameType map from game_id prefix:
--        mtt-*    → tournament
--        spins-*  → sng
--        all else → cash
--   2. Enumerate all (game_id × level 1..10) expected pairs from the master
--      game list.
--   3. LEFT JOIN against current cache; surface the missing pairs.
--   4. For each missing pair, pick 25 random donor questions from a same-
--      gameType same-level pair that has ≥25 questions. Use
--      tablesample / random ordering for variety.
--   5. INSERT clones with new game_id, level, and question_id. The
--      question_data->>'id' field is rewritten to reflect the new
--      game_id/level so it stays unique.
--   6. Idempotency: skip pairs that already have ≥1 cached question. Re-
--      running the migration is a no-op for already-filled pairs.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    cache_total integer;
    distinct_pairs integer;
BEGIN
    SELECT COUNT(*) INTO cache_total FROM training_question_cache;
    SELECT COUNT(DISTINCT (game_id, level)) INTO distinct_pairs FROM training_question_cache;

    RAISE NOTICE 'pre-flight: cache_total=%, distinct_pairs=%', cache_total, distinct_pairs;

    IF cache_total < 20000 OR cache_total > 30000 THEN
        RAISE EXCEPTION 'pre-flight failed: cache_total (%) outside expected band [20000,30000]', cache_total;
    END IF;
END $$;

-- ─── 2. THE ACTUAL BACKFILL ───────────────────────────────────────────
-- The full master game list (107 games × 10 levels = 1,070 expected pairs).
WITH master_games(game_id) AS (
    VALUES
        ('adv-001'),('adv-002'),('adv-003'),('adv-004'),('adv-005'),
        ('adv-006'),('adv-007'),('adv-008'),('adv-009'),('adv-010'),
        ('adv-011'),('adv-012'),('adv-013'),('adv-014'),('adv-015'),
        ('adv-016'),('adv-017'),('adv-018'),('adv-019'),('adv-020'),
        ('cash-001'),('cash-002'),('cash-003'),('cash-004'),('cash-005'),
        ('cash-006'),('cash-007'),('cash-008'),('cash-009'),('cash-010'),
        ('cash-011'),('cash-012'),('cash-013'),('cash-014'),('cash-015'),
        ('cash-016'),('cash-017'),('cash-018'),('cash-019'),('cash-020'),
        ('cash-021'),('cash-022'),('cash-023'),('cash-024'),('cash-025'),
        ('mtt-001'),('mtt-002'),('mtt-003'),('mtt-004'),('mtt-005'),
        ('mtt-006'),('mtt-007'),('mtt-008'),('mtt-009'),('mtt-010'),
        ('mtt-011'),('mtt-012'),('mtt-013'),('mtt-014'),('mtt-015'),
        ('mtt-016'),('mtt-017'),('mtt-018'),('mtt-019'),('mtt-020'),
        ('mtt-021'),('mtt-022'),('mtt-023'),('mtt-024'),('mtt-025'),
        ('psy-001'),('psy-002'),('psy-003'),('psy-004'),('psy-005'),
        ('psy-006'),('psy-007'),('psy-008'),('psy-009'),('psy-010'),
        ('psy-011'),('psy-012'),('psy-013'),('psy-014'),('psy-015'),
        ('psy-016'),('psy-017'),('psy-018'),('psy-019'),('psy-020'),
        ('spins-001'),('spins-002'),('spins-003'),('spins-004'),('spins-005'),
        ('spins-006'),('spins-007'),('spins-008'),('spins-009'),('spins-010'),
        ('bluff-catcher'),('final-table-sim'),('hand-lab'),
        ('mixed-strategy-lab'),('quiz-gauntlet'),('study-group'),
        ('tournament-prep')
),
expected_pairs AS (
    SELECT
        m.game_id,
        l.level,
        CASE
            WHEN m.game_id LIKE 'mtt-%'   THEN 'tournament'
            WHEN m.game_id LIKE 'spins-%' THEN 'sng'
            ELSE 'cash'
        END AS game_type
    FROM master_games m
    CROSS JOIN generate_series(1, 10) AS l(level)
),
missing_pairs AS (
    SELECT ep.game_id, ep.level, ep.game_type
    FROM expected_pairs ep
    LEFT JOIN (
        SELECT DISTINCT game_id, level FROM training_question_cache
    ) c USING (game_id, level)
    WHERE c.game_id IS NULL
),
-- For each missing pair, pick 25 random donor questions of same gameType+level
donor_pool AS (
    SELECT
        c.id            AS donor_uuid,
        c.question_id   AS donor_question_id,
        c.game_id       AS donor_game_id,
        c.engine_type   AS donor_engine_type,
        c.game_type     AS donor_game_type_col,
        c.level         AS donor_level,
        c.question_data AS donor_data,
        CASE
            WHEN c.game_id LIKE 'mtt-%'   THEN 'tournament'
            WHEN c.game_id LIKE 'spins-%' THEN 'sng'
            ELSE 'cash'
        END AS inferred_game_type
    FROM training_question_cache c
),
ranked_clones AS (
    SELECT
        mp.game_id    AS new_game_id,
        mp.level      AS new_level,
        mp.game_type  AS new_game_type,
        d.donor_uuid,
        d.donor_question_id,
        d.donor_data,
        d.donor_engine_type,
        d.donor_game_type_col,
        ROW_NUMBER() OVER (
            PARTITION BY mp.game_id, mp.level
            ORDER BY md5(d.donor_uuid::text || ':' || mp.game_id || ':' || mp.level::text)
        ) AS rn
    FROM missing_pairs mp
    JOIN donor_pool d
      ON d.inferred_game_type = mp.game_type
     AND d.donor_level        = mp.level
)
INSERT INTO training_question_cache
    (id, question_id, game_id, engine_type, game_type, level, question_data, generated_at, times_used)
SELECT
    gen_random_uuid()                                                 AS id,
    new_game_id || '_L' || new_level || '_backfill_'
        || substr(md5(donor_uuid::text || rn::text), 1, 8)
        || '_' || rn::text                                            AS question_id,
    new_game_id                                                       AS game_id,
    COALESCE(donor_engine_type, 'PIO')                                AS engine_type,
    COALESCE(donor_game_type_col, new_game_type)                      AS game_type,
    new_level                                                         AS level,
    -- Rewrite the embedded id field so it reflects the new game_id/level.
    -- All other content (board, hand, frequencies, EVs) is preserved.
    jsonb_set(
        donor_data,
        '{id}',
        to_jsonb(
            new_game_id || '_L' || new_level || '_backfill_'
            || substr(md5(donor_uuid::text || rn::text), 1, 8)
            || '_' || rn::text
        ),
        true
    )                                                                 AS question_data,
    now()                                                             AS generated_at,
    0                                                                 AS times_used
FROM ranked_clones
WHERE rn <= 25;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    new_total           integer;
    new_distinct_pairs  integer;
    expected_pairs      integer := 1070;
    coverage_pct        numeric;
BEGIN
    SELECT COUNT(*) INTO new_total FROM training_question_cache;
    SELECT COUNT(DISTINCT (game_id, level)) INTO new_distinct_pairs
    FROM training_question_cache;

    coverage_pct := ROUND(100.0 * new_distinct_pairs / expected_pairs, 1);

    RAISE NOTICE 'post-apply: cache_total=%, distinct_pairs=%/%, coverage=%%%',
        new_total, new_distinct_pairs, expected_pairs, coverage_pct;

    -- Coverage should now be ≥99% (small slack for any donor-pool gaps).
    IF coverage_pct < 99 THEN
        RAISE EXCEPTION
            'post-apply failed: coverage % is below 99%% threshold',
            coverage_pct;
    END IF;
END $$;

COMMIT;
