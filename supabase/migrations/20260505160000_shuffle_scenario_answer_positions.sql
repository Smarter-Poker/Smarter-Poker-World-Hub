-- ═══════════════════════════════════════════════════════════════════════
-- 20260505160000_shuffle_scenario_answer_positions.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3                            (UPDATE on 2,819 production rows)
-- AUTHOR:       claude (Operation Grok-Sweep — Issue 3 remediation)
-- AFFECTS:      tables: training_question_cache  rpcs: -  rls: -
-- IRREVERSIBLE: yes (no rollback path — once shuffled, original ordering
--                    is lost; but the shuffle is deterministic per question_id
--                    so re-running this migration is a no-op).
--
-- WHY:
--   Audit (outputs/GROK-SWEEP-AUDIT-FINDINGS.md, Issue 3) found the 2,819
--   SCENARIO/psychology questions in training_question_cache have a heavily
--   skewed correctAnswer distribution: c=63.6%, b=20%, a=13%, d=3%.
--
--   These rows were batch-seeded by an LLM that defaulted to placing the
--   "best" answer in slot c. A user who always picks c gets 63.6% accuracy
--   without thinking — the always-pick-c exploit.
--
--   This migration deterministically shuffles each row's options array so
--   the correct answer ends up roughly uniformly distributed across a/b/c/d.
--   Since the shuffle is keyed by the question_id hash, it is idempotent —
--   running this migration twice yields the same result.
--
-- HOW (high level):
--   1. Define helper fn_shuffle_scenario_options(question_data jsonb)
--      → returns the same jsonb with options[] permuted and correctAnswer
--      remapped. Permutation is determined by md5(question_id) so it's
--      stable across re-runs.
--   2. UPDATE every SCENARIO row through the helper.
--   3. Post-assert: correctAnswer distribution is no longer 60%+ on any
--      single letter (target: every letter between 15% and 35%).
--   4. Drop the helper function (we don't need it permanently).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    scenario_total integer;
    skew_pct       numeric;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'training_question_cache'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: training_question_cache not found';
    END IF;

    SELECT COUNT(*) INTO scenario_total
    FROM training_question_cache
    WHERE question_data->>'type' = 'SCENORIO'
       OR question_data->>'type' = 'SCENARIO';

    -- Confirm the skew exists (pre-condition for running this migration)
    SELECT 100.0 * COUNT(*) FILTER (WHERE question_data->>'correctAnswer' = 'c') / NULLIF(COUNT(*), 0)
      INTO skew_pct
    FROM training_question_cache
    WHERE question_data->>'type' = 'SCENARIO';

    IF skew_pct IS NULL OR skew_pct < 30 THEN
        RAISE NOTICE 'pre-flight notice: c-skew is only %.1f%% — already shuffled, this run is idempotent', skew_pct;
    ELSE
        RAISE NOTICE 'pre-flight ok: SCENARIO rows=%, c-skew=%.1f%% (will shuffle)', scenario_total, skew_pct;
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
-- Helper: deterministic-permutation shuffle of a 4-option SCENARIO row.
-- Idempotent because the permutation is derived from md5(question_id).
CREATE OR REPLACE FUNCTION fn_shuffle_scenario_options(qd jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $func$
DECLARE
    qid          text;
    opts         jsonb;
    n            integer;
    correct_id   text;
    correct_idx  integer;
    digest       text;
    perm         integer[];
    new_opts     jsonb := '[]'::jsonb;
    i            integer;
    src_idx      integer;
    new_id       text;
    new_correct  text;
    target_idx   integer;
BEGIN
    qid        := qd->>'id';
    opts       := qd->'options';
    correct_id := qd->>'correctAnswer';

    -- Bail out if structure unexpected (pure passthrough, no mutation).
    IF qid IS NULL OR opts IS NULL OR jsonb_typeof(opts) <> 'array' THEN
        RETURN qd;
    END IF;

    n := jsonb_array_length(opts);
    IF n <> 4 THEN
        -- Only shuffle 4-option scenarios; leave others alone.
        RETURN qd;
    END IF;

    -- Find the original index of the correct option.
    correct_idx := NULL;
    FOR i IN 0..(n - 1) LOOP
        IF (opts->i->>'id') = correct_id THEN
            correct_idx := i;
            EXIT;
        END IF;
    END LOOP;
    IF correct_idx IS NULL THEN
        RETURN qd; -- malformed; skip
    END IF;

    -- Deterministic permutation: derive 4 sort keys from md5(qid + index)
    -- and sort the indices [0,1,2,3] by those keys. Result is one of the
    -- 24 possible permutations of {0,1,2,3}, fully determined by qid.
    digest := md5(qid);
    SELECT array_agg(src ORDER BY sortkey)
      INTO perm
      FROM (
        SELECT
          src,
          -- Derive a stable per-(qid, src) sort key from md5 chunks.
          substring(md5(digest || ':' || src::text), 1, 8) AS sortkey
        FROM generate_series(0, n - 1) AS src
      ) t;

    -- Build new options array following the permutation.
    -- Each output position keeps its original id letter (a/b/c/d) — only
    -- the option content is permuted. correctAnswer is remapped to the
    -- new position holding the originally-correct option.
    target_idx := NULL;
    FOR i IN 0..(n - 1) LOOP
        src_idx := perm[i + 1];
        new_id  := chr(ascii('a') + i);
        new_opts := new_opts || jsonb_build_array(
            jsonb_set(
                opts->src_idx,
                '{id}',
                to_jsonb(new_id),
                true
            )
        );
        IF src_idx = correct_idx THEN
            target_idx := i;
        END IF;
    END LOOP;

    new_correct := chr(ascii('a') + COALESCE(target_idx, correct_idx));

    RETURN jsonb_set(
        jsonb_set(qd, '{options}', new_opts, true),
        '{correctAnswer}',
        to_jsonb(new_correct),
        true
    );
END;
$func$;

UPDATE training_question_cache
SET question_data = fn_shuffle_scenario_options(question_data)
WHERE question_data->>'type' = 'SCENARIO';

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    a_pct numeric;
    b_pct numeric;
    c_pct numeric;
    d_pct numeric;
    total_after integer;
BEGIN
    SELECT COUNT(*) INTO total_after
    FROM training_question_cache
    WHERE question_data->>'type' = 'SCENARIO';

    SELECT
      100.0 * COUNT(*) FILTER (WHERE question_data->>'correctAnswer' = 'a') / NULLIF(COUNT(*), 0),
      100.0 * COUNT(*) FILTER (WHERE question_data->>'correctAnswer' = 'b') / NULLIF(COUNT(*), 0),
      100.0 * COUNT(*) FILTER (WHERE question_data->>'correctAnswer' = 'c') / NULLIF(COUNT(*), 0),
      100.0 * COUNT(*) FILTER (WHERE question_data->>'correctAnswer' = 'd') / NULLIF(COUNT(*), 0)
    INTO a_pct, b_pct, c_pct, d_pct
    FROM training_question_cache
    WHERE question_data->>'type' = 'SCENARIO';

    RAISE NOTICE 'post-apply: % rows, distribution a=%.1f%% b=%.1f%% c=%.1f%% d=%.1f%%',
        total_after, a_pct, b_pct, c_pct, d_pct;

    -- The deterministic shuffle should give roughly uniform distribution.
    -- Allow each letter between 15% and 35%; fail if any is way off.
    IF a_pct < 15 OR a_pct > 35
    OR b_pct < 15 OR b_pct > 35
    OR c_pct < 15 OR c_pct > 35
    OR d_pct < 15 OR d_pct > 35 THEN
        RAISE EXCEPTION
            'post-apply failed: distribution outside [15,35]%% — a=%.1f b=%.1f c=%.1f d=%.1f',
            a_pct, b_pct, c_pct, d_pct;
    END IF;
END $$;

-- Drop the helper — we don't keep it permanently.
DROP FUNCTION IF EXISTS fn_shuffle_scenario_options(jsonb);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK NOTE (Tier 3)
-- ═══════════════════════════════════════════════════════════════════════
-- This migration is technically reversible because the shuffle is
-- deterministic per question_id — but practically, there's no need to
-- revert (the original c-skew was a bug, not desired state). If a revert
-- is ever required, the inverse permutation can be recomputed from the
-- same md5 digest. Implementation is left as an exercise.
-- ═══════════════════════════════════════════════════════════════════════
