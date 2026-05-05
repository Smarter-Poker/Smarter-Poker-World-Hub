-- ═══════════════════════════════════════════════════════════════════════
-- 20260505213038_fill_river_l8_l10_gaps_postflop_complete.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (INSERT 600 rows)
-- AUTHOR:       claude (Phase 7 — patches v4 strict regenerate)
--
-- WHY:
--   The strict_per_game_regenerate_v4 migration left 24 pairs unfilled
--   (8 special games × levels 8/9/10 = river street). The v4 spec used
--   `hu_cash` 80-120bb donors, but river-100bb cash content lives in
--   the `postflop_complete` game_type, not `hu_cash`. This patch fills
--   those exact gaps from postflop_complete river donors.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

WITH missing_pairs AS (
    SELECT * FROM (VALUES
        ('bluff-catcher', 8), ('bluff-catcher', 9), ('bluff-catcher', 10),
        ('cash-020', 8), ('cash-020', 9), ('cash-020', 10),
        ('final-table-sim', 8), ('final-table-sim', 9), ('final-table-sim', 10),
        ('hand-lab', 8), ('hand-lab', 9), ('hand-lab', 10),
        ('mixed-strategy-lab', 8), ('mixed-strategy-lab', 9), ('mixed-strategy-lab', 10),
        ('quiz-gauntlet', 8), ('quiz-gauntlet', 9), ('quiz-gauntlet', 10),
        ('study-group', 8), ('study-group', 9), ('study-group', 10),
        ('tournament-prep', 8), ('tournament-prep', 9), ('tournament-prep', 10)
    ) AS t(game_id, level)
),
donors AS (
    SELECT c.id AS donor_uuid, c.engine_type AS donor_engine_type,
           c.game_type AS donor_game_type_col, c.question_data AS donor_data
    FROM training_question_cache c
    WHERE c.question_data->'scenario'->>'gameType' LIKE 'postflop%'
      AND c.question_data->'scenario'->>'street' = 'river'
      AND (c.question_data->'scenario'->>'stackDepth')::int BETWEEN 80 AND 120
      AND c.question_data->>'type' = 'PIO'
      AND c.question_id NOT LIKE '%v4%' AND c.question_id NOT LIKE '%v3%'
      AND c.question_id NOT LIKE '%backfill%' AND c.question_id NOT LIKE '%refill%'
),
clones AS (
    SELECT m.game_id AS new_game_id, m.level AS new_level,
           d.donor_uuid, d.donor_engine_type, d.donor_game_type_col, d.donor_data,
           ROW_NUMBER() OVER (
               PARTITION BY m.game_id, m.level
               ORDER BY md5(d.donor_uuid::text || ':' || m.game_id || ':' || m.level::text || ':v4b')
           ) AS rn
    FROM missing_pairs m CROSS JOIN donors d
)
INSERT INTO training_question_cache
    (id, question_id, game_id, engine_type, game_type, level, question_data, generated_at, times_used)
SELECT
    gen_random_uuid(),
    new_game_id || '_L' || new_level || '_v4b_'
        || substr(md5(donor_uuid::text || rn::text), 1, 8) || '_' || rn::text,
    new_game_id, COALESCE(donor_engine_type, 'PIO'),
    COALESCE(donor_game_type_col, 'cash'), new_level,
    jsonb_set(
        donor_data, '{id}',
        to_jsonb(new_game_id || '_L' || new_level || '_v4b_'
            || substr(md5(donor_uuid::text || rn::text), 1, 8) || '_' || rn::text),
        true
    ),
    now(), 0
FROM clones WHERE rn <= 25;

COMMIT;
