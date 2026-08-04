-- ============================================================================
-- 20260805000000_leak_review_state.sql
-- Spaced-repetition review state for detected leaks (Personal Assistant).
--
-- One row per (user, leak). The API at /api/assistant/leaks/review computes the
-- schedule server-side and upserts here; until this migration is applied the
-- endpoint degrades to a computed-but-unpersisted no-op, so applying it is
-- purely additive.
--
-- Idempotent and non-destructive: IF NOT EXISTS everywhere, no DROP, no data
-- rewrite. Safe to run repeatedly and safe to run over a partially created
-- table (missing columns are added, existing ones are left alone).
-- ============================================================================

-- ── table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leak_review_state (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- text, not uuid: leaks arrive from user_leaks (uuid) and from synthetic /
    -- training sources whose ids are not uuids. A uuid column would 22P02 on
    -- those instead of simply not matching.
    leak_id        text NOT NULL,
    ease           numeric(4,2) NOT NULL DEFAULT 2.5,
    interval_days  integer NOT NULL DEFAULT 0,
    due_at         timestamptz NOT NULL DEFAULT now(),
    reps           integer NOT NULL DEFAULT 0,
    lapses         integer NOT NULL DEFAULT 0,
    -- Consecutive strong sessions at the interval cap. Without this the
    -- scheduler's retirement rule can never fire: strong_streak would reset to
    -- 0 on every round-trip and a mastered leak would be re-queued forever.
    strong_streak  integer NOT NULL DEFAULT 0,
    retired        boolean NOT NULL DEFAULT false,
    -- Accuracy of the last graded session, 0..1.
    last_score     numeric(4,3),
    -- Bounded (12 entries) session log, written by the scheduler.
    history        jsonb NOT NULL DEFAULT '[]'::jsonb,
    last_outcome   jsonb NOT NULL DEFAULT '{}'::jsonb,
    schema_version integer NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── columns (repair an older/partial table without touching existing data) ──
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS user_id        uuid;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS leak_id        text;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS ease           numeric(4,2) DEFAULT 2.5;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS interval_days  integer DEFAULT 0;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS due_at         timestamptz DEFAULT now();
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS reps           integer DEFAULT 0;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS lapses         integer DEFAULT 0;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS strong_streak  integer DEFAULT 0;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS retired        boolean DEFAULT false;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS last_score     numeric(4,3);
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS history        jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS last_outcome   jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS schema_version integer DEFAULT 1;
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();
ALTER TABLE public.leak_review_state ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

COMMENT ON TABLE  public.leak_review_state              IS 'Spaced-repetition scheduling state, one row per (user, detected leak).';
COMMENT ON COLUMN public.leak_review_state.leak_id      IS 'Leak id as text; sourced from user_leaks.id or user_training_leaks.id.';
COMMENT ON COLUMN public.leak_review_state.ease         IS 'SM-2 style ease factor; the API clamps writes to the scheduler bounds (MIN_EASE..MAX_EASE).';
COMMENT ON COLUMN public.leak_review_state.strong_streak IS 'Consecutive strong sessions; drives provisional retirement (RETIRE_AFTER_STRONG).';
COMMENT ON COLUMN public.leak_review_state.retired      IS 'Provisionally mastered. Re-detection in real hands revives it.';
COMMENT ON COLUMN public.leak_review_state.last_score   IS 'Accuracy of the last graded session, 0..1.';
COMMENT ON COLUMN public.leak_review_state.history      IS 'Bounded session log: [{ at, correct, total, score, band, intervalDays, evDelta }].';
COMMENT ON COLUMN public.leak_review_state.last_outcome IS 'Sanitised last drill result: { correct, total, accuracy, evDelta?, at }.';
COMMENT ON COLUMN public.leak_review_state.schema_version IS 'Version of the scheduling maths that produced this row.';

-- ── uniqueness + read paths ─────────────────────────────────────────────────
-- The API upserts ON CONFLICT (user_id, leak_id); without this index it falls
-- back to select-then-update, so creating it is a performance/correctness win
-- rather than a hard dependency.
CREATE UNIQUE INDEX IF NOT EXISTS leak_review_state_user_leak_uniq
    ON public.leak_review_state (user_id, leak_id);

-- "what is due for me now", ordered
CREATE INDEX IF NOT EXISTS leak_review_state_user_due_idx
    ON public.leak_review_state (user_id, due_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.leak_review_state ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY has no IF NOT EXISTS, so each policy is guarded on pg_policies.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'leak_review_state'
          AND policyname = 'leak_review_state_select_own'
    ) THEN
        CREATE POLICY leak_review_state_select_own
            ON public.leak_review_state
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'leak_review_state'
          AND policyname = 'leak_review_state_insert_own'
    ) THEN
        CREATE POLICY leak_review_state_insert_own
            ON public.leak_review_state
            FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'leak_review_state'
          AND policyname = 'leak_review_state_update_own'
    ) THEN
        -- USING gates which rows are visible to the UPDATE, WITH CHECK stops a
        -- row being reassigned to another user_id on the way out.
        CREATE POLICY leak_review_state_update_own
            ON public.leak_review_state
            FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'leak_review_state'
          AND policyname = 'leak_review_state_delete_own'
    ) THEN
        CREATE POLICY leak_review_state_delete_own
            ON public.leak_review_state
            FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
-- RLS above is the actual authorisation boundary; these only make the table
-- reachable at all. The service role used by the API bypasses RLS and enforces
-- ownership in the handler.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leak_review_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leak_review_state TO service_role;
