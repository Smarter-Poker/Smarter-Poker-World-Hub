-- ═══════════════════════════════════════════════════════════════════════
-- 20260906010000_post_briefs_and_thread_state.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive)
-- AUTHOR:      Claude (Cowork), Fleet Content Programme phase 2
-- AFFECTS:     tables: post_briefs (new), horse_thread_state (new)
--              rls: both service_role only
-- IRREVERSIBLE: no
--
-- WHY:
--   Dan, 2026-09-05: "SOME KIND OF POST REVIEW ON THE BACK END THAT CREATES A
--   SUMMARY THAT THE HORSES CAN INGEST BEFORE COMMENTING ON IT, AS WELL AS A
--   DETERMINISTIC ENGINE THAT CAN REPLY TO THE REPLIES (WHEN NEEDED, NOT AN
--   ENDLESS STREAM OF CONVERSATION ON A POST)."
--
--   `post_briefs` is that summary, made durable. The worker builds a brief
--   deterministically from the post's own fields (workers
--   src/lib/content-engine/PostBrief.ts), so the table is a CACHE and an
--   AUDIT TRAIL rather than a source of truth: it lets the admin console show
--   what a horse understood a post to be about before it commented, and it
--   lets a later model-assisted brief be stored beside the deterministic one
--   without changing any caller.
--
--   `horse_thread_state` records what the reply engine decided and why. The
--   rules themselves are pure functions over the thread's comments
--   (ReplyEngine.ts), so this table never gates a decision - it exists so
--   that "why did this horse reply twice" has an answer that does not require
--   reading source.
--
-- Production DDL policy (Club Arena CLAUDE.md s2): ONE transaction.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ─────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name IN ('post_briefs', 'horse_thread_state')) THEN
        RAISE EXCEPTION 'pre-flight failed: a phase 2 table already exists';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'social_posts') THEN
        RAISE EXCEPTION 'pre-flight failed: social_posts missing';
    END IF;
END $$;

-- ─── 2. THE CHANGES ────────────────────────────────────────────────────

CREATE TABLE public.post_briefs (
    post_id      uuid PRIMARY KEY,
    kind         text        NOT NULL,
    domain       text        NOT NULL,
    sport        text        NULL,
    title        text        NULL,
    source       text        NULL,
    people       text[]      NOT NULL DEFAULT '{}',
    teams        text[]      NOT NULL DEFAULT '{}',
    concepts     text[]      NOT NULL DEFAULT '{}',
    amounts      text[]      NOT NULL DEFAULT '{}',
    topic        text        NULL,
    tone         text        NOT NULL DEFAULT 'neutral',
    is_question  boolean     NOT NULL DEFAULT false,
    confidence   numeric(3,2) NOT NULL DEFAULT 0,
    summary      text        NULL,
    built_from   text[]      NOT NULL DEFAULT '{}',
    built_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.post_briefs IS
  'What the content engine understood a post to be about, before any horse wrote about it. Cache and audit trail; the brief is rebuilt deterministically by workers PostBrief.ts, so a missing row is never an error. Phase 2 of the Fleet Content Programme.';
COMMENT ON COLUMN public.post_briefs.confidence IS
  '0..1. How much of the subject was actually pinned down. A low value means the composer deliberately commits to less rather than inventing detail.';
CREATE INDEX post_briefs_domain_built_idx ON public.post_briefs (domain, built_at DESC);
CREATE INDEX post_briefs_confidence_idx ON public.post_briefs (confidence);

CREATE TABLE public.horse_thread_state (
    id           bigserial PRIMARY KEY,
    post_id      uuid        NOT NULL,
    horse_id     uuid        NOT NULL,
    comment_id   uuid        NULL,
    parent_id    uuid        NULL,
    reason       text        NOT NULL,
    turn_index   integer     NOT NULL DEFAULT 1,
    created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.horse_thread_state IS
  'One row per horse reply, with the reason the engine allowed it (human_unanswered, addressed, question, disagreement). The ceilings themselves live in workers ReplyEngine.ts and are computed from social_comments; this is the record, not the gate.';
CREATE INDEX horse_thread_state_post_horse_idx ON public.horse_thread_state (post_id, horse_id, created_at DESC);
CREATE INDEX horse_thread_state_reason_idx ON public.horse_thread_state (reason, created_at DESC);

ALTER TABLE public.post_briefs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horse_thread_state ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS, anon and authenticated get nothing.

-- ─── 3. POST-APPLY ASSERTIONS ──────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'post_briefs') THEN
        RAISE EXCEPTION 'post-apply failed: post_briefs missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'horse_thread_state') THEN
        RAISE EXCEPTION 'post-apply failed: horse_thread_state missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'post_briefs' AND relrowsecurity) THEN
        RAISE EXCEPTION 'post-apply failed: RLS not enabled on post_briefs';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'horse_thread_state' AND relrowsecurity) THEN
        RAISE EXCEPTION 'post-apply failed: RLS not enabled on horse_thread_state';
    END IF;
    RAISE NOTICE 'phase 2 tables ready: post_briefs, horse_thread_state';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
