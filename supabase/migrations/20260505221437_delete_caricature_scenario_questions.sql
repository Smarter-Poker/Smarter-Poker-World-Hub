-- ═══════════════════════════════════════════════════════════════════════
-- 20260505221437_delete_caricature_scenario_questions.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (DELETE on ~35 worst-offender SCENARIO rows)
-- AUTHOR:       claude (Phase 10 quality fix)
-- IRREVERSIBLE: yes (deleted rows; bulk replacements via earlier migrations)
--
-- WHY:
--   Audit identified 35 SCENARIO questions where ALL 3 wrong options are
--   "obviously bad" caricatures (slam/vent/sarcasm/dwell/quit patterns).
--   Such questions are gameable without poker knowledge — user picks the
--   calm-mature option by tone alone. Removed.
--
--   Each affected pair drops from 25 → 24 questions (still well above any
--   threshold). 26 (game, level) pairs touched.
--
-- HOW:
--   DELETE rows where the count of "caricature-keyword wrong options" >= 3.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
    targets_count integer;
BEGIN
    SELECT COUNT(*) INTO targets_count
    FROM training_question_cache q
    WHERE q.question_data->>'type' = 'SCENARIO'
      AND (
        SELECT COUNT(*) FROM jsonb_array_elements(q.question_data->'options') o
        WHERE (o->>'id') <> (q.question_data->>'correctAnswer')
          AND (
            LOWER(o->>'text') ~ '\m(slam|vent|sarca|criticize|criticise|berate|insult|mock|trash[- ]?talk|berating|tilt|rage|quit|storm|spew|punt)\M'
            OR LOWER(o->>'text') ~ '\m(dwell|replay\s+(the\s+)?hand|rumin|obsess)\M'
            OR LOWER(o->>'text') ~ '\m(close\s+the\s+(client|game)|quit\s+the\s+session|take\s+the\s+day\s+off|stop\s+playing)\M'
          )
      ) >= 3;
    RAISE NOTICE 'pre-flight: % caricature SCENARIO questions queued for deletion', targets_count;
END $$;

DELETE FROM training_question_cache q
WHERE q.question_data->>'type' = 'SCENARIO'
  AND (
    SELECT COUNT(*) FROM jsonb_array_elements(q.question_data->'options') o
    WHERE (o->>'id') <> (q.question_data->>'correctAnswer')
      AND (
        LOWER(o->>'text') ~ '\m(slam|vent|sarca|criticize|criticise|berate|insult|mock|trash[- ]?talk|berating|tilt|rage|quit|storm|spew|punt)\M'
        OR LOWER(o->>'text') ~ '\m(dwell|replay\s+(the\s+)?hand|rumin|obsess)\M'
        OR LOWER(o->>'text') ~ '\m(close\s+the\s+(client|game)|quit\s+the\s+session|take\s+the\s+day\s+off|stop\s+playing)\M'
      )
  ) >= 3;

COMMIT;
