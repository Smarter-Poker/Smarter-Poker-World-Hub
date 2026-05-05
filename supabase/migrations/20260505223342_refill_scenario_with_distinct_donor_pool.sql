-- ═══════════════════════════════════════════════════════════════════════
-- 20260505223342_refill_scenario_with_distinct_donor_pool.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (INSERT 481 new SCENARIO rows)
-- AUTHOR:       claude (Phase 12 refill after dedup)
--
-- WHY:
--   The within-pair dedup migration left 138 psy pairs below 25 questions.
--   This refills each gap by cloning donors from the deduplicated 1,268
--   distinct-text psy pool, ensuring no introduced row matches an existing
--   question text in the same pair.
--
-- HOW:
--   Pre-build: a temp table of one donor per distinct text (1,268 candidates,
--   indexed for fast NOT EXISTS check), and a temp table of currently-existing
--   pair texts (so we don't re-introduce duplicates).
--
--   Insert: ROW_NUMBER over (game_id, level) ordered by md5 hash for
--   deterministic per-pair selection. Take rn ≤ need per pair.
--
--   Result: 0 pairs below 25 questions, average 26.8 distinct texts per pair.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _donor_distinct ON COMMIT DROP AS
SELECT DISTINCT ON (question_data->>'question')
    id AS donor_uuid,
    engine_type AS donor_engine_type,
    game_type AS donor_game_type_col,
    question_data AS donor_data,
    question_data->>'question' AS donor_qtext
FROM training_question_cache
WHERE game_id LIKE 'psy-%' AND question_data->>'type' = 'SCENARIO'
ORDER BY question_data->>'question', id;

CREATE TEMP TABLE _gaps ON COMMIT DROP AS
SELECT game_id, level, COUNT(*) AS current_count, 25 - COUNT(*) AS need
FROM training_question_cache
WHERE question_data->>'type' = 'SCENARIO'
GROUP BY game_id, level
HAVING COUNT(*) < 25;

CREATE TEMP TABLE _existing ON COMMIT DROP AS
SELECT game_id, level, question_data->>'question' AS qtext
FROM training_question_cache
WHERE question_data->>'type' = 'SCENARIO';
CREATE INDEX _existing_idx ON _existing (game_id, level, qtext);

WITH candidate AS (
    SELECT
        g.game_id AS new_game_id,
        g.level AS new_level,
        g.need,
        d.donor_uuid, d.donor_engine_type, d.donor_game_type_col, d.donor_data,
        ROW_NUMBER() OVER (
            PARTITION BY g.game_id, g.level
            ORDER BY md5(d.donor_uuid::text || ':' || g.game_id || ':' || g.level::text || ':r')
        ) AS rn
    FROM _gaps g
    CROSS JOIN _donor_distinct d
    WHERE NOT EXISTS (
        SELECT 1 FROM _existing e
        WHERE e.game_id = g.game_id AND e.level = g.level AND e.qtext = d.donor_qtext
    )
)
INSERT INTO training_question_cache
    (id, question_id, game_id, engine_type, game_type, level, question_data, generated_at, times_used)
SELECT
    gen_random_uuid(),
    new_game_id || '_L' || new_level || '_rfl_'
        || substr(md5(donor_uuid::text || rn::text), 1, 8) || '_' || rn::text,
    new_game_id, COALESCE(donor_engine_type, 'SCENARIO'),
    COALESCE(donor_game_type_col, 'cash'), new_level,
    jsonb_set(donor_data, '{id}',
        to_jsonb(new_game_id || '_L' || new_level || '_rfl_'
            || substr(md5(donor_uuid::text || rn::text), 1, 8) || '_' || rn::text), true),
    now(), 0
FROM candidate WHERE rn <= need;

COMMIT;
