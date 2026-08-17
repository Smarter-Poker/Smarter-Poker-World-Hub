-- 2026-08-16. Answer position in trivia_questions carried the answer.
--
-- scripts/trivia-deterministic-seed.js built each option list "HIGHEST
-- FREQUENCY FIRST" from the solver, then set correct_index by looking up the
-- optimal action inside that already-sorted list. Position was therefore a
-- deterministic function of solver output. Measured over the whole pool of
-- 11,197 questions before this migration:
--
--   correct_index = 0 : 2,543 (22.7%)
--   correct_index = 1 : 6,404 (57.2%)   <-- always answer B
--   correct_index = 2 : 1,137 (10.2%)
--   correct_index = 3 : 1,113 ( 9.9%)
--
-- Answering B every time scored 57.2% platform-wide against a 25% random
-- baseline, with no poker knowledge — and 78.7% on the 6,285 questions sharing
-- the option set ["Bet 16% pot","Check","Fold","Bet 33% pot"]. A larger
-- integrity hole than the readable answer key, and it needed no exploit.
--
-- This permutes each options array and moves correct_index with it, so the
-- answer TEXT is unchanged and only its position moves. Semantics untouched.
-- The WHERE clause asserts the option at the new index still equals the option
-- at the old index, so a row is skipped rather than corrupted.
--
-- trivia_tournaments holds its own jsonb snapshot of questions, so tournaments
-- in flight are unaffected by design.
--
-- Verified after apply: 25.2 / 25.5 / 24.3 / 25.1 percent across indices 0-3,
-- and zero rows with correct_index out of range.

WITH shuffled AS (
  SELECT q.id,
         q.correct_index AS old_idx,
         perm.new_options,
         perm.new_idx
  FROM trivia_questions q
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(o.elem ORDER BY o.rnd)                                  AS new_options,
           (array_position(array_agg(o.ord ORDER BY o.rnd), q.correct_index)) - 1 AS new_idx
    FROM (
      SELECT elem, (ord - 1) AS ord, random() AS rnd
      FROM jsonb_array_elements(q.options) WITH ORDINALITY AS t(elem, ord)
    ) o
  ) perm
  WHERE jsonb_typeof(q.options) = 'array'
    AND jsonb_array_length(q.options) > 1
    AND q.correct_index IS NOT NULL
    AND q.correct_index >= 0
    AND q.correct_index < jsonb_array_length(q.options)
)
UPDATE trivia_questions t
SET options       = s.new_options,
    correct_index = s.new_idx,
    updated_at    = now()
FROM shuffled s
WHERE t.id = s.id
  AND s.new_idx IS NOT NULL
  AND s.new_options -> s.new_idx = t.options -> s.old_idx;
