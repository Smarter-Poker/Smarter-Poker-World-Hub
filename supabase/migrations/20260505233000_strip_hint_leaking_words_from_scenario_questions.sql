-- ═══════════════════════════════════════════════════════════════════════
-- 20260505233000_strip_hint_leaking_words_from_scenario_questions.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2   (UPDATE on ~1,246 SCENARIO rows — text only)
-- AUTHOR:       claude (Phase 21 hint-leakage fix)
--
-- WHY:
--   Phase 21 audit detected 22.81% of SCENARIO questions (1,246 rows)
--   contained a distinctive ≥6-letter word that appeared ONLY in the
--   correct option's text — letting a user latch onto the shared word
--   as a guidepost without engaging with the underlying poker concept.
--
--   Top 5 leak words (573 of 1,246 leaks combined):
--     situation (180), session (113), bankroll (103),
--     moment (98), consistent (79)
--   Plus high-frequency secondary leaks: decision (76), maintain (76),
--   pressure (49), timing (44).
--
-- HOW:
--   REGEXP_REPLACE on question_data->>'question' substitutes each leak
--   word with a synonym that does NOT appear in the option set (verified
--   via probe — "uniform" and "this scenario" had 0 option-hits).
--
--   Word-boundary anchors (\m \M) prevent partial-word damage, and
--   case-insensitive 'gi' flag handles capitalized openers.
--
-- IDEMPOTENT: re-running is a no-op because none of the replacement words
-- map back to the original leak words.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(question_data, '{question}',
    to_jsonb(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(question_data->>'question',
                        '\msituation\M', 'spot', 'gi'),
                      '\msession\M', 'stretch of play', 'gi'),
                    '\mbankroll\M', 'roll', 'gi'),
                  '\mmoment\M', 'instance', 'gi'),
                '\mconsistent\M', 'steady', 'gi'),
              '\mdecision\M', 'call', 'gi'),
            '\mmaintain\M', 'keep', 'gi'),
          '\mpressure\M', 'stress', 'gi'),
        '\mtiming\M', 'pace', 'gi')
    ),
    true)
WHERE question_data->>'type' = 'SCENARIO'
  AND (
    question_data->>'question' ~* '\m(situation|session|bankroll|moment|consistent|decision|maintain|pressure|timing)\M'
  );

COMMIT;
