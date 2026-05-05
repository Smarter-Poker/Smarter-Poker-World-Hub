-- ═══════════════════════════════════════════════════════════════════════
-- 20260505221254_strip_giveaway_words_from_correct_scenario_options.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2   (UPDATE on ~339 SCENARIO rows)
-- AUTHOR:       claude (Phase 10 quality fix)
-- IRREVERSIBLE: yes (text replacement; original phrasing not preserved)
--
-- WHY:
--   Audit found 5.4% of correct SCENARIO option texts contained giveaway
--   words ("optimal/best response/most appropriate/proper response") that
--   telegraphed the right answer to the user without requiring poker
--   knowledge. Replaced with neutral substitutes.
--
-- HOW:
--   For each SCENARIO row, run REGEXP_REPLACE chain on the correct option's
--   text only — wrong options left alone. Idempotent (re-running with the
--   substitutes already applied is a no-op).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

WITH targets AS (
    SELECT id, question_data, question_data->>'correctAnswer' AS correct_id
    FROM training_question_cache
    WHERE question_data->>'type' = 'SCENARIO'
),
new_options AS (
    SELECT
        t.id,
        jsonb_agg(
            CASE WHEN (o->>'id') = t.correct_id THEN
                o || jsonb_build_object('text',
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        REGEXP_REPLACE(
                          REGEXP_REPLACE(
                            REGEXP_REPLACE(o->>'text',
                              '\moptimal response\M', 'right approach', 'gi'),
                            '\moptimally\M', 'effectively', 'gi'),
                          '\m(the )?optimal\M', 'a sound', 'gi'),
                        '\mthe best response\M', 'a strong approach', 'gi'),
                      '\mmost appropriate\M', 'a reasonable', 'gi')
                )
            ELSE o
            END
            ORDER BY (o->>'id')
        ) AS new_opts
    FROM targets t
    CROSS JOIN LATERAL jsonb_array_elements(t.question_data->'options') o
    GROUP BY t.id, t.correct_id
)
UPDATE training_question_cache c
SET question_data = jsonb_set(c.question_data, '{options}', n.new_opts, true)
FROM new_options n
WHERE c.id = n.id;

COMMIT;
