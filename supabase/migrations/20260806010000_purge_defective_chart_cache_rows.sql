-- ============================================================================
-- 20260806010000_purge_defective_chart_cache_rows.sql
-- Personal Assistant data-integrity audit: purge provably-defective cached
-- training questions and sync stale display frequencies.
--
-- WHAT WAS FOUND (2026-08-06 audit, all counts verified read-only first):
--   1. buildChartQuestion() read only hand_matrix.push/.shove. BB-defence
--      charts (villain_action 'sb_push') store { call, fold }, so EVERY hand
--      in those charts graded as a 100% fold — including AA — and the node
--      was rendered as "Push or Fold?" when the chart answers "Call or Fold?".
--      120 cached rows (engine fixed in the same commit as this migration;
--      __tests__/chart-question-node.test.mjs pins it).
--   2. 196 CHART rows whose stored answer contradicts the CURRENT
--      memory_charts_gold chart for the same (game_type, position, depth,
--      hand) — e.g. "MP with AQs at 10BB: fold". The chart uuids embedded in
--      the cached ids no longer exist (charts were reseeded), so semantic
--      re-verification is the only check possible, and these rows fail it.
--   3. 264 PIO rows initially flagged as correctAnswer <> argmax of the
--      row's own gtoFrequencies. Dry-run with a STRICT predicate showed all
--      264 are exact 50/50 ties (either action is correct) — so statement 3
--      below deletes 0 rows today and stands as a guard against future
--      strictly-contradictory writes, not as a purge.
--   4. 5,048 rows where options[].frequency (display) drifted from
--      gtoFrequencies (what grading and the explanation narrate) after an
--      answer-key reconciliation updated one but not the other.
--
-- WHY DELETE RATHER THAN REWRITE (1-3): these are CACHE rows; the fixed
-- generator regenerates correct ones, and authoring poker answers in SQL
-- risks a worse class of error than a smaller pool. (4) is a purely
-- mechanical sync of numbers already present in the same row, so it IS done
-- in place.
--
-- Idempotent: every statement re-run deletes/updates nothing the second time.
-- Bounded: assertions abort if the deletes would exceed the audited counts
-- by more than a safety margin (protects against this migration running
-- against a future, different cache).
-- ============================================================================

-- ── Tier-2 pre-flight assertion: the tables this depends on exist ───────────
DO $$
BEGIN
    IF to_regclass('public.training_question_cache') IS NULL THEN
        RAISE EXCEPTION 'training_question_cache missing — wrong database?';
    END IF;
    IF to_regclass('public.memory_charts_gold') IS NULL THEN
        RAISE EXCEPTION 'memory_charts_gold missing — cannot verify chart rows';
    END IF;
END $$;

-- ── 1+2. Defective CHART rows ───────────────────────────────────────────────
WITH c AS (
    SELECT tqc.id row_id, tqc.game_type,
        tqc.question_data->'scenario'->>'heroPosition' pos,
        (tqc.question_data->'scenario'->>'stackDepth')::int depth,
        tqc.question_data->>'heroHand' hand,
        tqc.question_data->>'correctAnswer' ca
    FROM training_question_cache tqc
    WHERE tqc.engine_type = 'CHART'
), defective AS (
    SELECT c.row_id
    FROM c
    JOIN memory_charts_gold g
      ON g.hero_position = c.pos
     AND g.stack_depth = c.depth
     AND lower(g.game_type) = lower(c.game_type)
    WHERE
        -- BB-defence node rendered as Push-or-Fold: structurally wrong.
        g.villain_action = 'sb_push'
        -- Open-shove rows whose answer contradicts the current chart.
        OR (g.villain_action = 'fold_to_hero'
            AND g.hand_matrix ? c.hand
            AND c.ca <> CASE WHEN COALESCE((g.hand_matrix->c.hand->>'push')::numeric, 0) > 0.5
                             THEN 'push' ELSE 'fold' END)
), guard AS (
    SELECT count(*) AS n FROM defective
)
DELETE FROM training_question_cache
WHERE id IN (SELECT row_id FROM defective)
  AND (SELECT n FROM guard) <= 400;  -- audited: 316. Abort-by-noop above margin.

DO $$
DECLARE remaining int;
BEGIN
    -- Post-apply assertion: no CHART row may remain that a current sb_push
    -- chart claims (the structurally-wrong class must be gone).
    SELECT count(*) INTO remaining
    FROM training_question_cache tqc
    JOIN memory_charts_gold g
      ON g.hero_position = tqc.question_data->'scenario'->>'heroPosition'
     AND g.stack_depth = (tqc.question_data->'scenario'->>'stackDepth')::int
     AND lower(g.game_type) = lower(tqc.game_type)
    WHERE tqc.engine_type = 'CHART' AND g.villain_action = 'sb_push';
    IF remaining > 0 THEN
        RAISE EXCEPTION 'purge incomplete: % structurally-wrong BB chart rows remain', remaining;
    END IF;
END $$;

-- ── 3. PIO rows contradicting their own gtoFrequencies ──────────────────────
-- STRICT contradiction only: the answer's own frequency is LOWER than the
-- best option's. An exact tie (50/50 mixed strategy) is not a contradiction —
-- either action is correct — and must survive.
WITH x AS (
    SELECT id row_id,
        COALESCE((question_data->'gtoFrequencies'->>(question_data->>'correctAnswer'))::numeric, -1) AS ca_freq,
        (SELECT max(v::numeric) FROM jsonb_each_text(question_data->'gtoFrequencies') AS t(k, v)) AS best_freq
    FROM training_question_cache
    WHERE engine_type = 'PIO'
      AND jsonb_typeof(question_data->'gtoFrequencies') = 'object'
      AND question_data->>'correctAnswer' IS NOT NULL
), defective AS (
    SELECT row_id FROM x WHERE best_freq IS NOT NULL AND ca_freq < best_freq
), guard AS (
    SELECT count(*) AS n FROM defective
)
DELETE FROM training_question_cache
WHERE id IN (SELECT row_id FROM defective)
  AND (SELECT n FROM guard) <= 400;  -- dry-run audited: 0 (all flagged rows were ties).

-- ── 4. Sync stale options[].frequency to gtoFrequencies (display drift) ─────
-- Only rows where at least one option's frequency disagrees; each option's
-- frequency becomes the gtoFrequencies value for its id when present.
UPDATE training_question_cache tqc
SET question_data = jsonb_set(
    question_data,
    '{options}',
    (SELECT jsonb_agg(
        CASE WHEN (question_data->'gtoFrequencies') ? (o->>'id')
             THEN jsonb_set(o, '{frequency}',
                    to_jsonb(round((question_data->'gtoFrequencies'->>(o->>'id'))::numeric)))
             ELSE o END
        ORDER BY ord)
     FROM jsonb_array_elements(question_data->'options') WITH ORDINALITY AS t(o, ord))
)
WHERE jsonb_typeof(question_data->'gtoFrequencies') = 'object'
  AND jsonb_typeof(question_data->'options') = 'array'
  AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(question_data->'options') o
      WHERE (question_data->'gtoFrequencies') ? (o->>'id')
        AND round((question_data->'gtoFrequencies'->>(o->>'id'))::numeric)
            IS DISTINCT FROM (o->>'frequency')::numeric
  );

-- ── Post-apply assertion: no strictly self-contradictory graded rows remain ─
DO $$
DECLARE bad int;
BEGIN
    SELECT count(*) INTO bad
    FROM training_question_cache
    WHERE jsonb_typeof(question_data->'gtoFrequencies') = 'object'
      AND question_data->>'correctAnswer' IS NOT NULL
      AND COALESCE((question_data->'gtoFrequencies'->>(question_data->>'correctAnswer'))::numeric, -1)
          < (SELECT max(v::numeric) FROM jsonb_each_text(question_data->'gtoFrequencies') AS t(k, v));
    IF bad > 0 THEN
        RAISE EXCEPTION 'purge incomplete: % rows still strictly contradict their own gtoFrequencies', bad;
    END IF;
END $$;
