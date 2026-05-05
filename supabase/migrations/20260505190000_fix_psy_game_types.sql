-- ═══════════════════════════════════════════════════════════════════════
-- 20260505190000_fix_psy_game_types.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3                          (DELETE 3,500 + INSERT 3,500 rows)
-- AUTHOR:       claude (Phase 4B-FIX)
-- AFFECTS:      tables: training_question_cache (psy-* rows only)
--
-- WHY:
--   The 20260505180000_backfill migration filled 140 missing psy-NNN pairs
--   (levels 4-10) by inferring gameType='cash' from a non-prefix rule, which
--   pulled cloned PIO/CHART poker-board questions into PSYCHOLOGY games.
--   That's wrong: psy-* games should serve mental-game SCENARIO questions,
--   not "You hold AhKs on Ah Ks 2d. What is the GTO play?"
--
--   This migration:
--     1. DELETEs all non-SCENARIO rows from any psy-* game.
--     2. RE-FILLS the now-empty pairs by cloning real SCENARIO content from
--        the SAME psy-NNN game's existing L1-3 pool, so each psychology
--        game keeps its thematic identity.
--
-- HOW:
--   - Step 1: DELETE FROM training_question_cache
--             WHERE game_id LIKE 'psy-%'
--               AND (question_data->>'type') <> 'SCENARIO';
--   - Step 2: For each (psy-NNN, level=4..10) pair now empty, clone 25
--             random rows from that same psy-NNN game's L1-3 SCENARIO pool.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ─────────────────────────────────────────────────────
DO $$
DECLARE
    bad_psy_rows  integer;
    psy_scenarios integer;
BEGIN
    SELECT COUNT(*) INTO bad_psy_rows
    FROM training_question_cache
    WHERE game_id LIKE 'psy-%' AND (question_data->>'type') <> 'SCENARIO';

    SELECT COUNT(*) INTO psy_scenarios
    FROM training_question_cache
    WHERE game_id LIKE 'psy-%' AND (question_data->>'type') = 'SCENARIO';

    RAISE NOTICE 'pre-flight: bad_psy_rows=%, psy_scenarios=%', bad_psy_rows, psy_scenarios;

    IF psy_scenarios < 1000 THEN
        RAISE EXCEPTION 'pre-flight failed: too few SCENARIO donors (%) in psy-* games', psy_scenarios;
    END IF;
END $$;

-- ─── 2. DELETE wrong-type rows from psy-* games ────────────────────────
DELETE FROM training_question_cache
WHERE game_id LIKE 'psy-%'
  AND (question_data->>'type') <> 'SCENARIO';

-- ─── 3. RE-BACKFILL psy games at missing levels with same-game SCENARIOs
WITH expected AS (
    SELECT game_id, level
    FROM (
        SELECT 'psy-' || LPAD(g::text, 3, '0') AS game_id
        FROM generate_series(1, 20) AS g
    ) games
    CROSS JOIN generate_series(1, 10) AS level
),
missing AS (
    SELECT e.game_id, e.level
    FROM expected e
    LEFT JOIN (SELECT DISTINCT game_id, level FROM training_question_cache) c
      USING (game_id, level)
    WHERE c.game_id IS NULL
),
donors AS (
    -- Same-game SCENARIO donors (preserves thematic identity per psy-NNN)
    SELECT
        c.id            AS donor_uuid,
        c.game_id       AS donor_game_id,
        c.engine_type   AS donor_engine_type,
        c.game_type     AS donor_game_type_col,
        c.question_data AS donor_data
    FROM training_question_cache c
    WHERE c.game_id LIKE 'psy-%'
      AND (c.question_data->>'type') = 'SCENARIO'
),
clones AS (
    SELECT
        m.game_id AS new_game_id,
        m.level   AS new_level,
        d.donor_uuid,
        d.donor_engine_type,
        d.donor_game_type_col,
        d.donor_data,
        ROW_NUMBER() OVER (
            PARTITION BY m.game_id, m.level
            ORDER BY md5(d.donor_uuid::text || ':' || m.game_id || ':' || m.level::text)
        ) AS rn
    FROM missing m
    JOIN donors d
      ON d.donor_game_id = m.game_id    -- same-game preference
)
INSERT INTO training_question_cache
    (id, question_id, game_id, engine_type, game_type, level, question_data, generated_at, times_used)
SELECT
    gen_random_uuid(),
    new_game_id || '_L' || new_level || '_psyfix_'
        || substr(md5(donor_uuid::text || rn::text), 1, 8)
        || '_' || rn::text,
    new_game_id,
    COALESCE(donor_engine_type, 'SCENARIO'),
    COALESCE(donor_game_type_col, 'cash'),
    new_level,
    jsonb_set(
        donor_data,
        '{id}',
        to_jsonb(new_game_id || '_L' || new_level || '_psyfix_'
            || substr(md5(donor_uuid::text || rn::text), 1, 8)
            || '_' || rn::text),
        true
    ),
    now(),
    0
FROM clones
WHERE rn <= 25;

-- ─── 4. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    psy_total      integer;
    psy_scenarios  integer;
    psy_non_sc     integer;
    psy_pairs      integer;
BEGIN
    SELECT COUNT(*) INTO psy_total
    FROM training_question_cache WHERE game_id LIKE 'psy-%';

    SELECT COUNT(*) INTO psy_scenarios
    FROM training_question_cache
    WHERE game_id LIKE 'psy-%' AND (question_data->>'type') = 'SCENARIO';

    SELECT COUNT(*) INTO psy_non_sc
    FROM training_question_cache
    WHERE game_id LIKE 'psy-%' AND (question_data->>'type') <> 'SCENARIO';

    SELECT COUNT(DISTINCT (game_id, level)) INTO psy_pairs
    FROM training_question_cache WHERE game_id LIKE 'psy-%';

    RAISE NOTICE 'post-apply: psy_total=%, scenarios=%, non_scenario=%, pairs=%',
        psy_total, psy_scenarios, psy_non_sc, psy_pairs;

    IF psy_non_sc <> 0 THEN
        RAISE EXCEPTION
            'post-apply failed: % non-SCENARIO rows still exist in psy-* games',
            psy_non_sc;
    END IF;

    IF psy_pairs <> 200 THEN
        RAISE EXCEPTION
            'post-apply failed: psy pairs=% (expected 200 = 20 games × 10 levels)',
            psy_pairs;
    END IF;
END $$;

COMMIT;
