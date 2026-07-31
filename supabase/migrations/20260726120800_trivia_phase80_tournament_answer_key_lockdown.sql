-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.9 — TOURNAMENT ANSWER-KEY LOCKDOWN
-- Date: 2026-07-26
--
-- ⚠⚠ APPLY THIS FILE TOGETHER WITH THE tournaments.js CHANGE BELOW. ⚠⚠
-- It is deliberately the LAST migration in the phase-80 set and is separable:
-- everything before it is unconditionally safe, this one has a client
-- prerequisite. Hold it back if the client change has not shipped.
--
-- ── THE HOLE ───────────────────────────────────────────────────────────────
-- trivia_tournaments is `CREATE POLICY "Anyone can view tournaments" FOR SELECT
-- USING (true)` (archive/20260202_trivia_87x_enhancement.sql:306) and its
-- `questions` JSONB is a snapshot of full trivia_questions rows — correct_index
-- and explanation included. pages/hub/trivia/tournaments.js:282 does
-- `.select('*')`, so the ANSWER KEY for a stake-bearing tournament is sitting
-- in the browser's network tab before the first question is rendered.
-- tournament-submit-round.js says so in its own header: "ANSWER KEY WAS PUBLIC
-- ... the honest client literally posted the correct_index back".
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--   1. trivia_tournaments_public — every column, but with correct_index and
--      explanation stripped from each element of `questions`.
--   2. Base-table SELECT is revoked from anon/authenticated and re-granted
--      COLUMN BY COLUMN, omitting `questions`. PostgreSQL requires SELECT on
--      every column for `SELECT *`, which is exactly why the client must move
--      to the view.
--   3. Server routes are unaffected — tournament-lifecycle.js,
--      tournament-round-questions.js, tournament-submit-round.js and
--      tournament-enter.js all use the service-role key.
--
-- ⚠ REQUIRED CLIENT CHANGE (cross-file request, see the fixer report):
--    pages/hub/trivia/tournaments.js — three `.from('trivia_tournaments')`
--    reads (lines 282, 324, 352) and one at 365-adjacent refresh must become
--    `.from('trivia_tournaments_public')`. And because the view no longer
--    carries correct_index, startRound()'s
--        setQuestions(shuffleOptions(activeTournament.questions.slice(0, 20)))
--    must switch to GET /api/trivia/tournament-round-questions and submit
--    `display_index` to /api/trivia/tournament-submit-round. That route already
--    exists and already permutes options per user; once every client uses it,
--    set TRIVIA_TOURNAMENT_STRICT_GRADING=1 and the self-grading vector is shut
--    for good.
--
-- SAFE TO RE-RUN.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. The key-stripped projection
-- ───────────────────────────────────────────────────────────────────────────
-- NOTE: this view is intentionally NOT security_invoker. It has to read a
-- column its callers are about to lose access to, which is the whole point —
-- the view is the ONLY sanctioned way for a client to see `questions`.
-- No RLS is bypassed by that choice: trivia_tournaments' own SELECT policy is
-- USING (true).

-- starts_at / ends_at are the GENERATED alias columns added by
-- 20260726120200_trivia_phase80_tournament_engine.sql. That migration adds them
-- inside a DO block that only WARNS on failure, so on an environment where the
-- alias could not be created this file would hard-abort with
-- 'column t.starts_at does not exist' — turning a soft warning two migrations
-- back into a failed deploy. Guarantee they exist before the view references
-- them; when the GENERATED form could not be created, fall back to plain
-- columns plus a mirroring trigger so they cannot go stale.
DO $$
DECLARE
    v_plain boolean := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='trivia_tournaments'
                      AND column_name='starts_at') THEN
        ALTER TABLE public.trivia_tournaments ADD COLUMN starts_at timestamptz;
        UPDATE public.trivia_tournaments SET starts_at = start_time WHERE starts_at IS DISTINCT FROM start_time;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='trivia_tournaments'
                      AND column_name='ends_at') THEN
        ALTER TABLE public.trivia_tournaments ADD COLUMN ends_at timestamptz;
        UPDATE public.trivia_tournaments SET ends_at = end_time WHERE ends_at IS DISTINCT FROM end_time;
    END IF;

    -- A GENERATED column maintains itself and CANNOT be assigned in a trigger,
    -- so only install the mirror when at least one alias is a plain column.
    -- bool_and, not bool_or: in a mixed state (one generated, one plain) the
    -- trigger would try to assign the generated column and every write to
    -- trivia_tournaments would fail. A stale alias is a bug; an outage is worse.
    SELECT bool_and(a.attgenerated = '')
      INTO v_plain
      FROM pg_attribute a
     WHERE a.attrelid = 'public.trivia_tournaments'::regclass
       AND a.attname IN ('starts_at', 'ends_at')
       AND a.attnum > 0 AND NOT a.attisdropped;

    IF COALESCE(v_plain, false) THEN
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION public.fn_trivia_tournament_sync_time_aliases()
            RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
            BEGIN
                NEW.starts_at := NEW.start_time;
                NEW.ends_at   := NEW.end_time;
                RETURN NEW;
            END;
            $body$;
        $fn$;
        DROP TRIGGER IF EXISTS trg_trivia_tournament_time_aliases ON public.trivia_tournaments;
        CREATE TRIGGER trg_trivia_tournament_time_aliases
            BEFORE INSERT OR UPDATE OF start_time, end_time ON public.trivia_tournaments
            FOR EACH ROW EXECUTE FUNCTION public.fn_trivia_tournament_sync_time_aliases();
    END IF;
END $$;

DROP VIEW IF EXISTS public.trivia_tournaments_public;
CREATE VIEW public.trivia_tournaments_public AS
SELECT
    t.id,
    t.name,
    t.description,
    t.start_time,
    t.end_time,
    t.starts_at,
    t.ends_at,
    t.entry_fee,
    t.prize_pool,
    t.status,
    t.created_at,
    t.tournament_type,
    t.current_round,
    t.total_rounds,
    t.round_deadline,
    t.winners,
    t.completed_at,
    t.max_players,
    t.current_players,
    CASE
        WHEN jsonb_typeof(t.questions) = 'array' THEN (
            SELECT COALESCE(
                       jsonb_agg(elem - 'correct_index' - 'explanation' ORDER BY ord),
                       '[]'::jsonb
                   )
              FROM jsonb_array_elements(t.questions) WITH ORDINALITY AS e(elem, ord)
        )
        ELSE '[]'::jsonb
    END AS questions,
    CASE
        WHEN jsonb_typeof(t.questions) = 'array' THEN jsonb_array_length(t.questions)
        ELSE 0
    END AS question_count
FROM public.trivia_tournaments t;

GRANT SELECT ON public.trivia_tournaments_public TO anon, authenticated;

COMMENT ON VIEW public.trivia_tournaments_public IS
    'Phase 80 — trivia_tournaments with the answer key stripped out of the '
    'questions snapshot (correct_index and explanation removed from every '
    'element). The client-facing replacement for the base table; clients no '
    'longer hold SELECT on trivia_tournaments.questions.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Column-level lockdown on the base table
-- ───────────────────────────────────────────────────────────────────────────
-- Column grants only take effect once the table-wide grant is removed: a
-- table-level GRANT SELECT covers every column, including ones added later.

REVOKE SELECT ON public.trivia_tournaments FROM anon, authenticated;

DO $$
DECLARE
    v_cols text;
BEGIN
    -- Build the grant from the live catalogue so a column added by a future
    -- migration is not silently locked out along with `questions`.
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'trivia_tournaments'
       AND column_name <> 'questions';

    IF v_cols IS NULL THEN
        RAISE EXCEPTION 'trivia_tournaments has no columns to grant — aborting rather than locking it out';
    END IF;

    EXECUTE format('GRANT SELECT (%s) ON public.trivia_tournaments TO anon, authenticated', v_cols);
    RAISE NOTICE '[phase80] trivia_tournaments: SELECT granted on all columns EXCEPT questions.';
END $$;

COMMENT ON COLUMN public.trivia_tournaments.questions IS
    'Snapshot of the tournament question pool INCLUDING correct_index. '
    'NOT readable by anon/authenticated (phase 80) — clients must read '
    'trivia_tournaments_public, or /api/trivia/tournament-round-questions for '
    'the per-round, per-user permuted roster.';
