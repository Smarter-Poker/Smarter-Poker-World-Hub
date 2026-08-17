-- 2026-08-16. Retire the collapsed solver-question group, keeping a balanced core.
--
-- 6,620 source='deterministic' questions share one of two option sets built by
-- the old fixed-filler padding. Across that whole group the correct answer is
-- only ever ONE OF TWO TEXTS:
--
--   "Check"        5,209  (78.7%)
--   "Bet 16% pot"  1,411  (21.3%)
--
-- "Fold" and "Bet 33% pot" appear in every one of those questions and are NEVER
-- correct — dead decoys. So the group is not a four-way question at all: it is a
-- two-way guess weighted 79/21. Randomising answer POSITION (sibling migration
-- 20260816_trivia_randomise_answer_position.sql) removed the "always answer B"
-- exploit but cannot fix this, because the tell is the option TEXT.
--
-- Rather than delete 6,620 questions from a pool Dan wants to grow, this:
--
--   1. Down-ranks the whole group to quality_score = 3, below every serving
--      floor in triviaQuestionLoader (including the >= 4 emergency pool), so
--      they stop being served. Nothing is deleted; one UPDATE reverses it.
--   2. Restores a BALANCED core to quality_score = 6: all 1,411 "Bet 16% pot"
--      questions plus 1,411 "Check" questions chosen deterministically by id.
--      Within the retained core the two live answers are 50/50, so the group can
--      no longer be beaten by always picking "Check".
--
-- Net servable pool: 11,197 -> 7,399. The 3,798 withdrawn are surplus "Check"
-- duplicates, the very rows that made the group guessable.
--
-- Note the quality scores pointed the wrong way: these degenerate questions held
-- scores 8 and 10, the highest in the table, so the loader's descending sort
-- actively PREFERRED them. That is why they dominated play.
--
-- Real replenishment is a re-seed with the fixed generator, which now refuses to
-- emit a question unless the solver mixes >= 2 actions at >= 5% and draws decoys
-- from sibling sizings instead of a fixed list.
--
-- Verified after apply: servable 7,399; retired 3,798; retained core
-- "Bet 16% pot"=1,411 and "Check"=1,411; best guess rate within the group
-- 78.7% -> 50.0%; whole-pool answer-position balance 25.4/25.5/24.4/24.7%.

WITH sig AS (
  SELECT id,
         (SELECT string_agg(v, '|' ORDER BY v) FROM jsonb_array_elements_text(options) v) AS optset,
         options ->> correct_index AS answer_text
  FROM trivia_questions
  WHERE source = 'deterministic' AND jsonb_typeof(options) = 'array'
),
grp AS (
  SELECT optset FROM sig GROUP BY 1 HAVING count(*) > 100
),
degenerate AS (
  SELECT s.id, s.answer_text FROM sig s JOIN grp g USING (optset)
),
keep_bet AS (
  SELECT id FROM degenerate WHERE answer_text <> 'Check'
),
keep_check AS (
  SELECT id FROM degenerate WHERE answer_text = 'Check'
  ORDER BY id
  LIMIT (SELECT count(*) FROM keep_bet)
),
retire AS (
  UPDATE trivia_questions t SET quality_score = 3, updated_at = now()
  FROM degenerate d WHERE t.id = d.id
  RETURNING t.id
)
UPDATE trivia_questions t
SET quality_score = 6, updated_at = now()
WHERE t.id IN (SELECT id FROM keep_bet UNION ALL SELECT id FROM keep_check);
