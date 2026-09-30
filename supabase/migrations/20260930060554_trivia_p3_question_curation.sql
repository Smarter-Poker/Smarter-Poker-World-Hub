-- ============================================================================
-- trivia_p3_question_curation.sql   (Trivia Casino Realism, Phase 3, part 1 of 2)
-- ============================================================================
-- TIER: 3 (paid/competitive content boundary)  OWNER: p3-questions
-- One database-owned definition of "eligible for paid/competitive play", with the
-- curation data behind it: immutable question revisions, duplicate canonicalization
-- (fingerprint -> canonical alias map; historical foreign keys untouched),
-- quarantine records (eligibility only, never a rewrite of history), review records
-- (reviewer/model/version/evidence/timestamp), a deterministic review-batch queue the
-- existing generate-trivia audit drains, and a restricted report queue with states.
-- Additive and forward-only. Browser roles get nothing new; service_role reads and
-- acts only through SECURITY DEFINER functions with pinned search_path.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

DO $$
BEGIN
    IF to_regprocedure('extensions.digest(text,text)') IS NULL
       OR to_regprocedure('extensions.hmac(text,text,text)') IS NULL THEN
        RAISE EXCEPTION 'trivia_p3: pgcrypto (extensions.digest/hmac) is required';
    END IF;
END $$;

-- ---------------------------------------------------------------- pure helpers
CREATE OR REPLACE FUNCTION public.trivia_reading_words_v1(p_question text, p_options jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
    SELECT (CASE WHEN btrim(coalesce(p_question, '')) = '' THEN 0
                 ELSE coalesce(array_length(regexp_split_to_array(btrim(p_question), '\s+'), 1), 0) END)
         + coalesce((SELECT sum(CASE WHEN btrim(e #>> '{}') = '' THEN 0
                                     ELSE array_length(regexp_split_to_array(btrim(e #>> '{}'), '\s+'), 1) END)::int
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_options) = 'array'
                                                      THEN p_options ELSE '[]'::jsonb END) e), 0)
$$;

-- Reading load -> the shortest per-question clock the question fits (4 words/s + 5 s to decide).
CREATE OR REPLACE FUNCTION public.trivia_min_timer_seconds_v1(p_question text, p_options jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
    SELECT greatest(8, ceil(public.trivia_reading_words_v1(p_question, p_options) / 4.0)::int + 5)
$$;

CREATE OR REPLACE FUNCTION public.trivia_question_structure_ok_v1(
    p_question text, p_options jsonb, p_correct_index integer, p_category text, p_difficulty text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
    SELECT CASE
        WHEN btrim(coalesce(p_question, '')) = '' THEN false
        WHEN p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN false
        WHEN jsonb_array_length(p_options) NOT BETWEEN 2 AND 6 THEN false
        WHEN p_correct_index IS NULL OR p_correct_index < 0
             OR p_correct_index >= jsonb_array_length(p_options) THEN false
        WHEN p_category IS NULL OR p_category <> ALL (ARRAY['poker_history','famous_hands','gto_theory',
             'player_profiles','tournament_facts','rule_knowledge','mtt_situations',
             'cash_game_situations','icm_chip_ev','gto_scenarios']) THEN false
        WHEN p_difficulty IS NULL OR p_difficulty <> ALL (ARRAY['easy','medium','hard']) THEN false
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(p_options) e
                      WHERE jsonb_typeof(e) <> 'string' OR btrim(e #>> '{}') = '') THEN false
        ELSE (SELECT count(DISTINCT lower(regexp_replace(btrim(e #>> '{}'), '\s+', ' ', 'g')))
                FROM jsonb_array_elements(p_options) e) = jsonb_array_length(p_options)
    END
$$;

CREATE OR REPLACE FUNCTION public.trivia_question_content_hash_v1(
    p_question text, p_options jsonb, p_correct_index integer, p_explanation text,
    p_category text, p_subcategory text, p_difficulty text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, extensions AS $$
    SELECT encode(extensions.digest(jsonb_build_object(
        'v', 'trivia-question/1', 'q', p_question, 'o', p_options, 'k', p_correct_index,
        'e', coalesce(p_explanation, ''), 'c', p_category, 's', coalesce(p_subcategory, ''),
        'd', p_difficulty)::text, 'sha256'), 'hex')
$$;

-- Explicit mode eligibility derived once per question from its category (the same map
-- the mode registry uses); ops may narrow it per question afterwards.
CREATE OR REPLACE FUNCTION public.trivia_default_modes_v1(p_category text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
    SELECT ARRAY['daily','mixed','arcade','endless','survival','time-attack','pvp','tournaments']::text[]
        || CASE p_category
            WHEN 'mtt_situations' THEN ARRAY['mtt','gto']
            WHEN 'cash_game_situations' THEN ARRAY['cash','gto']
            WHEN 'icm_chip_ev' THEN ARRAY['icm','gto']
            WHEN 'gto_theory' THEN ARRAY['gto','pro']
            WHEN 'gto_scenarios' THEN ARRAY['gto']
            WHEN 'poker_history' THEN ARRAY['history']
            WHEN 'famous_hands' THEN ARRAY['history']
            WHEN 'player_profiles' THEN ARRAY['history']
            WHEN 'rule_knowledge' THEN ARRAY['rules']
            WHEN 'tournament_facts' THEN ARRAY['pro']
            ELSE ARRAY[]::text[] END
$$;

CREATE OR REPLACE FUNCTION public.trivia_p3_forbid_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    RAISE EXCEPTION '% is append-only (trivia phase 3)', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END $$;

-- ---------------------------------------------------------------- revisions
CREATE TABLE IF NOT EXISTS public.trivia_question_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    revision_no integer NOT NULL CHECK (revision_no >= 1),
    content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    question text NOT NULL,
    options jsonb NOT NULL,
    correct_index integer NOT NULL,
    explanation text,
    category text NOT NULL,
    subcategory text,
    difficulty text NOT NULL,
    fingerprint text NOT NULL,
    content_version text NOT NULL DEFAULT 'trivia-question/1',
    source text,
    reading_words integer NOT NULL CHECK (reading_words >= 0),
    min_timer_seconds integer NOT NULL CHECK (min_timer_seconds >= 1),
    structurally_valid boolean NOT NULL,
    capture_reason text NOT NULL CHECK (capture_reason IN ('baseline','insert','content_update')),
    captured_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (question_id, revision_no),
    UNIQUE (question_id, content_hash)
);
CREATE INDEX IF NOT EXISTS trivia_question_revisions_question_idx
    ON public.trivia_question_revisions (question_id, revision_no DESC);

-- ---------------------------------------------------------------- curation state
CREATE TABLE IF NOT EXISTS public.trivia_question_curation (
    question_id uuid PRIMARY KEY REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    current_revision_id uuid NOT NULL REFERENCES public.trivia_question_revisions(id) ON DELETE RESTRICT,
    fingerprint text NOT NULL,
    canonical_question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    canonical_reason text NOT NULL CHECK (canonical_reason IN ('sole','group_canonical','alias')),
    modes text[] NOT NULL CHECK (modes <@ ARRAY['daily','history','rules','pro','arcade','mtt','cash',
        'icm','gto','mixed','endless','survival','time-attack','pvp','tournaments']::text[]),
    source text,
    provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_reviewed_at timestamptz,
    last_review_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((canonical_reason = 'alias') = (canonical_question_id <> question_id))
);
CREATE INDEX IF NOT EXISTS trivia_question_curation_canonical_idx
    ON public.trivia_question_curation (canonical_question_id);
CREATE INDEX IF NOT EXISTS trivia_question_curation_fingerprint_idx
    ON public.trivia_question_curation (fingerprint);

-- ---------------------------------------------------------------- quarantine
CREATE TABLE IF NOT EXISTS public.trivia_question_quarantine (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    reason_code text NOT NULL CHECK (reason_code ~ '^[a-z0-9_]{3,64}$'),
    source text NOT NULL CHECK (source IN ('legacy_retired','duplicate_conflict','report_threshold',
        'review','operations','structural')),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    released_by text,
    release_note text,
    CHECK ((released_at IS NULL) = (released_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS trivia_question_quarantine_active_uidx
    ON public.trivia_question_quarantine (question_id, reason_code) WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION public.trivia_quarantine_guard_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RAISE EXCEPTION 'trivia_question_quarantine records are never deleted' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL
       OR (to_jsonb(NEW) - ARRAY['released_at','released_by','release_note'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['released_at','released_by','release_note']) THEN
        RAISE EXCEPTION 'a quarantine record can only be released once' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------- review records + queue
CREATE TABLE IF NOT EXISTS public.trivia_review_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    queue_version text NOT NULL,
    reviewer text NOT NULL,
    size integer NOT NULL CHECK (size >= 0),
    status text NOT NULL CHECK (status IN ('claimed','completed','expired')),
    claimed_at timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz NOT NULL,
    completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.trivia_question_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    revision_id uuid NOT NULL REFERENCES public.trivia_question_revisions(id) ON DELETE RESTRICT,
    batch_id uuid REFERENCES public.trivia_review_batches(id) ON DELETE RESTRICT,
    reviewer text NOT NULL,
    reviewer_kind text NOT NULL CHECK (reviewer_kind IN ('model','human','system')),
    model text,
    model_version text,
    prompt_version text NOT NULL,
    verdict text NOT NULL CHECK (verdict IN ('verified','failed','inconclusive','invalid_structure')),
    confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    evidence jsonb NOT NULL,
    applied boolean NOT NULL,
    applied_effect text NOT NULL,
    reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trivia_question_reviews_batch_question_uidx
    ON public.trivia_question_reviews (batch_id, question_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trivia_question_reviews_revision_idx
    ON public.trivia_question_reviews (revision_id, verdict);
CREATE TABLE IF NOT EXISTS public.trivia_review_batch_items (
    batch_id uuid NOT NULL REFERENCES public.trivia_review_batches(id) ON DELETE RESTRICT,
    position integer NOT NULL CHECK (position >= 1),
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    revision_id uuid NOT NULL REFERENCES public.trivia_question_revisions(id) ON DELETE RESTRICT,
    review_id uuid REFERENCES public.trivia_question_reviews(id) ON DELETE RESTRICT,
    PRIMARY KEY (batch_id, position),
    UNIQUE (batch_id, question_id)
);
CREATE INDEX IF NOT EXISTS trivia_review_batch_items_question_idx
    ON public.trivia_review_batch_items (question_id) WHERE review_id IS NULL;

-- ---------------------------------------------------------------- eligibility policy
CREATE TABLE IF NOT EXISTS public.trivia_eligibility_policies (
    policy_version integer PRIMARY KEY CHECK (policy_version >= 1),
    quality_threshold integer NOT NULL CHECK (quality_threshold BETWEEN 1 AND 10),
    supported_content_versions text[] NOT NULL,
    unsupported_sources text[] NOT NULL DEFAULT '{}'::text[],
    max_review_age_days integer CHECK (max_review_age_days IS NULL OR max_review_age_days > 0),
    report_quarantine_threshold integer NOT NULL CHECK (report_quarantine_threshold >= 1),
    provisional boolean NOT NULL,
    decided_by text NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT now(),
    note text NOT NULL
);
INSERT INTO public.trivia_eligibility_policies (policy_version, quality_threshold,
    supported_content_versions, unsupported_sources, max_review_age_days,
    report_quarantine_threshold, provisional, decided_by, note)
VALUES (1, 7, ARRAY['trivia-question/1'], '{}'::text[], NULL, 3, true, 'p3-questions (provisional)',
    'Measured 2026-09-29: verified rows are graded 6 (23 legacy rows), 7 (2,504), 8 (7), 9 (12,313). '
    || '7 is the auditors'' acceptance grade and the grade the self-audit keeps on verification; '
    || '6 is the legacy below-acceptance grade. Provisional, owner may change by inserting policy 2.')
ON CONFLICT (policy_version) DO NOTHING;

-- ---------------------------------------------------------------- baseline backfill
INSERT INTO public.trivia_question_revisions (question_id, revision_no, content_hash, question, options,
    correct_index, explanation, category, subcategory, difficulty, fingerprint, source, reading_words,
    min_timer_seconds, structurally_valid, capture_reason, captured_at)
SELECT q.id, 1,
       public.trivia_question_content_hash_v1(q.question, q.options, q.correct_index, q.explanation,
           q.category, q.subcategory, q.difficulty),
       q.question, q.options, q.correct_index, q.explanation, q.category, q.subcategory, q.difficulty,
       q.question_fingerprint, q.source,
       public.trivia_reading_words_v1(q.question, q.options),
       public.trivia_min_timer_seconds_v1(q.question, q.options),
       public.trivia_question_structure_ok_v1(q.question, q.options, q.correct_index, q.category, q.difficulty),
       'baseline', now()
  FROM public.trivia_questions q
 WHERE NOT EXISTS (SELECT 1 FROM public.trivia_question_revisions r WHERE r.question_id = q.id);

-- Canonical per fingerprint group: the servable copy (at most one, enforced by
-- trivia_questions_servable_fingerprint_uidx), then verified > unset > failed, then
-- quality, then oldest, then id. Aliases keep their ids, rows and every historical FK.
WITH ranked AS (
    SELECT q.id, q.question_fingerprint AS fp, q.category, q.source, q.created_at, q.quality_score,
           q.audit_verified, q.engine_metadata, q.last_audited_at,
           first_value(q.id) OVER w AS canon,
           count(*) OVER (PARTITION BY q.question_fingerprint) AS n
      FROM public.trivia_questions q
    WINDOW w AS (PARTITION BY q.question_fingerprint
                 ORDER BY (coalesce(q.quality_score, 0) >= 6) DESC,
                          CASE WHEN q.audit_verified IS TRUE THEN 0 WHEN q.audit_verified IS NULL THEN 1 ELSE 2 END,
                          q.quality_score DESC NULLS LAST, q.created_at ASC NULLS LAST, q.id ASC)
)
INSERT INTO public.trivia_question_curation (question_id, current_revision_id, fingerprint,
    canonical_question_id, canonical_reason, modes, source, provenance, last_reviewed_at)
SELECT r.id, rv.id, r.fp, r.canon,
       CASE WHEN r.n = 1 THEN 'sole' WHEN r.id = r.canon THEN 'group_canonical' ELSE 'alias' END,
       public.trivia_default_modes_v1(r.category), r.source,
       jsonb_build_object('source', r.source, 'created_at', r.created_at,
           'baseline_quality', r.quality_score, 'baseline_audit_verified', r.audit_verified,
           'retired_reason', r.engine_metadata ->> 'retired_reason', 'captured_by', 'trivia_p3_question_curation'),
       (SELECT max(t) FROM (VALUES (r.last_audited_at),
            ((SELECT max(a.audited_at) FROM public.trivia_quality_audits a WHERE a.question_id = r.id))) v(t))
  FROM ranked r
  JOIN public.trivia_question_revisions rv ON rv.question_id = r.id AND rv.revision_no = 1
ON CONFLICT (question_id) DO NOTHING;

-- Quarantine is eligibility-only evidence: the rows themselves are untouched.
INSERT INTO public.trivia_question_quarantine (question_id, reason_code, source, detail, created_by)
SELECT q.id,
       left('legacy_' || regexp_replace(lower(q.engine_metadata ->> 'retired_reason'), '[^a-z0-9_]+', '_', 'g'), 64),
       'legacy_retired',
       jsonb_build_object('retired_reason', q.engine_metadata ->> 'retired_reason',
                          'retired_at', q.engine_metadata ->> 'retired_at'),
       'migration:trivia_p3_question_curation'
  FROM public.trivia_questions q
 WHERE coalesce(q.engine_metadata ->> 'retired_reason', '') <> ''
ON CONFLICT DO NOTHING;

-- Duplicate groups whose members disagree on the correct answer TEXT are factually
-- ambiguous: every member leaves eligibility until reviewed.
INSERT INTO public.trivia_question_quarantine (question_id, reason_code, source, detail, created_by)
SELECT q.id, 'duplicate_answer_conflict', 'duplicate_conflict',
       jsonb_build_object('fingerprint', q.question_fingerprint), 'migration:trivia_p3_question_curation'
  FROM public.trivia_questions q
 WHERE q.question_fingerprint IN (
        SELECT question_fingerprint FROM public.trivia_questions
         GROUP BY question_fingerprint
        HAVING count(DISTINCT lower(btrim(options ->> correct_index))) > 1)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- revision capture
-- Every insert and every content edit of trivia_questions gets an immutable revision;
-- the curation row always points at the revision that matches the live content.
CREATE OR REPLACE FUNCTION public.trivia_capture_question_revision_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
DECLARE
    v_hash text;
    v_latest record;
    v_rev uuid;
    v_old_fp text;
    v_canon uuid;
    v_promoted uuid;
BEGIN
    v_hash := public.trivia_question_content_hash_v1(NEW.question, NEW.options, NEW.correct_index,
        NEW.explanation, NEW.category, NEW.subcategory, NEW.difficulty);
    SELECT id, revision_no, content_hash INTO v_latest
      FROM public.trivia_question_revisions WHERE question_id = NEW.id
     ORDER BY revision_no DESC LIMIT 1;
    IF FOUND AND v_latest.content_hash = v_hash THEN
        v_rev := v_latest.id;
    ELSE
        SELECT id INTO v_rev FROM public.trivia_question_revisions
         WHERE question_id = NEW.id AND content_hash = v_hash;
        IF v_rev IS NULL THEN
            INSERT INTO public.trivia_question_revisions (question_id, revision_no, content_hash, question,
                options, correct_index, explanation, category, subcategory, difficulty, fingerprint, source,
                reading_words, min_timer_seconds, structurally_valid, capture_reason)
            VALUES (NEW.id, coalesce(v_latest.revision_no, 0) + 1, v_hash, NEW.question, NEW.options,
                NEW.correct_index, NEW.explanation, NEW.category, NEW.subcategory, NEW.difficulty,
                NEW.question_fingerprint, NEW.source,
                public.trivia_reading_words_v1(NEW.question, NEW.options),
                public.trivia_min_timer_seconds_v1(NEW.question, NEW.options),
                public.trivia_question_structure_ok_v1(NEW.question, NEW.options, NEW.correct_index,
                    NEW.category, NEW.difficulty),
                CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'content_update' END)
            RETURNING id INTO v_rev;
        END IF;
    END IF;

    SELECT fingerprint INTO v_old_fp FROM public.trivia_question_curation WHERE question_id = NEW.id;
    IF NOT FOUND THEN
        SELECT c.canonical_question_id INTO v_canon FROM public.trivia_question_curation c
         WHERE c.fingerprint = NEW.question_fingerprint AND c.canonical_reason <> 'alias'
         ORDER BY c.created_at, c.question_id LIMIT 1;
        INSERT INTO public.trivia_question_curation (question_id, current_revision_id, fingerprint,
            canonical_question_id, canonical_reason, modes, source, provenance)
        VALUES (NEW.id, v_rev, NEW.question_fingerprint, coalesce(v_canon, NEW.id),
            CASE WHEN v_canon IS NULL THEN 'sole' ELSE 'alias' END,
            public.trivia_default_modes_v1(NEW.category), NEW.source,
            jsonb_build_object('source', NEW.source, 'created_at', NEW.created_at,
                'baseline_quality', NEW.quality_score, 'captured_by', 'trivia_capture_question_revision_v1'));
        IF v_canon IS NOT NULL THEN
            UPDATE public.trivia_question_curation SET canonical_reason = 'group_canonical', updated_at = now()
             WHERE question_id = v_canon AND canonical_reason = 'sole';
        END IF;
        RETURN NULL;
    END IF;

    UPDATE public.trivia_question_curation
       SET current_revision_id = v_rev,
           modes = CASE WHEN TG_OP = 'UPDATE' AND NEW.category IS DISTINCT FROM OLD.category
                        THEN public.trivia_default_modes_v1(NEW.category) ELSE modes END,
           updated_at = now()
     WHERE question_id = NEW.id;

    IF v_old_fp IS DISTINCT FROM NEW.question_fingerprint THEN
        -- Leaving the old group: promote its best remaining member if this was canonical.
        SELECT c.question_id INTO v_promoted
          FROM public.trivia_question_curation c JOIN public.trivia_questions q ON q.id = c.question_id
         WHERE c.fingerprint = v_old_fp AND c.question_id <> NEW.id AND c.canonical_question_id = NEW.id
         ORDER BY (coalesce(q.quality_score, 0) >= 6) DESC,
                  CASE WHEN q.audit_verified IS TRUE THEN 0 WHEN q.audit_verified IS NULL THEN 1 ELSE 2 END,
                  q.quality_score DESC NULLS LAST, q.created_at ASC NULLS LAST, q.id ASC
         LIMIT 1;
        IF v_promoted IS NOT NULL THEN
            UPDATE public.trivia_question_curation
               SET canonical_question_id = v_promoted,
                   canonical_reason = CASE WHEN question_id = v_promoted THEN 'group_canonical' ELSE 'alias' END,
                   updated_at = now()
             WHERE fingerprint = v_old_fp AND question_id <> NEW.id;
            UPDATE public.trivia_question_curation SET canonical_reason = 'sole', updated_at = now()
             WHERE question_id = v_promoted
               AND NOT EXISTS (SELECT 1 FROM public.trivia_question_curation o
                                WHERE o.fingerprint = v_old_fp AND o.question_id <> v_promoted
                                  AND o.question_id <> NEW.id);
        END IF;
        -- Joining the new group (or standing alone).
        SELECT c.canonical_question_id INTO v_canon FROM public.trivia_question_curation c
         WHERE c.fingerprint = NEW.question_fingerprint AND c.question_id <> NEW.id
           AND c.canonical_reason <> 'alias'
         ORDER BY c.created_at, c.question_id LIMIT 1;
        UPDATE public.trivia_question_curation
           SET fingerprint = NEW.question_fingerprint,
               canonical_question_id = coalesce(v_canon, NEW.id),
               canonical_reason = CASE WHEN v_canon IS NULL THEN 'sole' ELSE 'alias' END,
               updated_at = now()
         WHERE question_id = NEW.id;
        IF v_canon IS NOT NULL THEN
            UPDATE public.trivia_question_curation SET canonical_reason = 'group_canonical', updated_at = now()
             WHERE question_id = v_canon AND canonical_reason = 'sole';
        END IF;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_trivia_capture_question_revision_v1 ON public.trivia_questions;
CREATE TRIGGER trg_trivia_capture_question_revision_v1
    AFTER INSERT OR UPDATE OF question, options, correct_index, explanation, category, subcategory, difficulty
    ON public.trivia_questions FOR EACH ROW EXECUTE FUNCTION public.trivia_capture_question_revision_v1();

DROP TRIGGER IF EXISTS trg_trivia_question_revisions_append_only ON public.trivia_question_revisions;
CREATE TRIGGER trg_trivia_question_revisions_append_only BEFORE UPDATE OR DELETE
    ON public.trivia_question_revisions FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();
DROP TRIGGER IF EXISTS trg_trivia_question_revisions_no_truncate ON public.trivia_question_revisions;
CREATE TRIGGER trg_trivia_question_revisions_no_truncate BEFORE TRUNCATE
    ON public.trivia_question_revisions FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p3_forbid_mutation();
DROP TRIGGER IF EXISTS trg_trivia_question_reviews_append_only ON public.trivia_question_reviews;
CREATE TRIGGER trg_trivia_question_reviews_append_only BEFORE UPDATE OR DELETE
    ON public.trivia_question_reviews FOR EACH ROW EXECUTE FUNCTION public.trivia_p3_forbid_mutation();
DROP TRIGGER IF EXISTS trg_trivia_question_quarantine_guard ON public.trivia_question_quarantine;
CREATE TRIGGER trg_trivia_question_quarantine_guard BEFORE UPDATE OR DELETE
    ON public.trivia_question_quarantine FOR EACH ROW EXECUTE FUNCTION public.trivia_quarantine_guard_v1();

-- ---------------------------------------------------------------- report queue states
ALTER TABLE public.trivia_question_reports
    ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS valid boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS session_id uuid,
    ADD COLUMN IF NOT EXISTS revision_id uuid REFERENCES public.trivia_question_revisions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS reporter_established boolean,
    ADD COLUMN IF NOT EXISTS served_to_reporter boolean,
    ADD COLUMN IF NOT EXISTS triaged_at timestamptz,
    ADD COLUMN IF NOT EXISTS triaged_by text,
    ADD COLUMN IF NOT EXISTS triage_note text;
UPDATE public.trivia_question_reports SET state = 'dismissed'
 WHERE resolved_at IS NOT NULL AND state = 'open';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trivia_question_reports_state_check') THEN
        ALTER TABLE public.trivia_question_reports ADD CONSTRAINT trivia_question_reports_state_check
            CHECK (state IN ('open','triaged','upheld','dismissed','duplicate'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS trivia_question_reports_open_valid_idx
    ON public.trivia_question_reports (question_id) WHERE state IN ('open','triaged') AND valid;
CREATE INDEX IF NOT EXISTS trivia_question_reports_user_created_idx
    ON public.trivia_question_reports (user_id, created_at DESC);

-- ---------------------------------------------------------------- THE eligibility definition
CREATE OR REPLACE VIEW public.trivia_question_eligibility_v1 WITH (security_invoker = true) AS
WITH pol AS (
    SELECT * FROM public.trivia_eligibility_policies ORDER BY policy_version DESC LIMIT 1
), rep AS (
    SELECT question_id, count(*)::int AS n FROM public.trivia_question_reports
     WHERE state IN ('open','triaged') AND valid GROUP BY question_id
), quar AS (
    SELECT DISTINCT question_id FROM public.trivia_question_quarantine WHERE released_at IS NULL
)
SELECT q.id AS question_id,
       c.current_revision_id AS revision_id,
       c.canonical_question_id,
       c.fingerprint,
       q.category, q.difficulty, q.quality_score, q.audit_verified,
       coalesce(r.structurally_valid, false) AS structurally_valid,
       r.content_version,
       r.min_timer_seconds,
       coalesce(c.modes, '{}'::text[]) AS modes,
       (c.question_id IS NOT NULL AND q.id = c.canonical_question_id) AS is_canonical,
       (quar.question_id IS NOT NULL) AS quarantined,
       coalesce(rep.n, 0) AS open_valid_reports,
       c.last_reviewed_at,
       CASE WHEN c.last_reviewed_at IS NULL THEN NULL
            ELSE floor(extract(epoch FROM (now() - c.last_reviewed_at)) / 86400)::int END AS review_age_days,
       q.source,
       pol.policy_version,
       array_remove(ARRAY[
           CASE WHEN c.question_id IS NULL OR r.id IS NULL THEN 'no_revision' END,
           CASE WHEN r.id IS NOT NULL AND NOT r.structurally_valid THEN 'invalid_structure' END,
           CASE WHEN q.audit_verified IS NULL THEN 'audit_unset' END,
           CASE WHEN q.audit_verified IS FALSE THEN 'audit_failed' END,
           CASE WHEN coalesce(q.quality_score, -1) < pol.quality_threshold THEN 'low_quality' END,
           CASE WHEN r.id IS NOT NULL AND NOT (r.content_version = ANY (pol.supported_content_versions))
                THEN 'unsupported_rules_version' END,
           CASE WHEN q.source IS NOT NULL AND q.source = ANY (pol.unsupported_sources) THEN 'unsupported_source' END,
           CASE WHEN c.question_id IS NOT NULL AND q.id <> c.canonical_question_id THEN 'duplicate_alias' END,
           CASE WHEN quar.question_id IS NOT NULL THEN 'quarantined' END,
           CASE WHEN coalesce(rep.n, 0) > 0 THEN 'open_report' END,
           CASE WHEN c.question_id IS NOT NULL AND cardinality(c.modes) = 0 THEN 'no_mode' END,
           CASE WHEN pol.max_review_age_days IS NOT NULL
                 AND (c.last_reviewed_at IS NULL
                      OR c.last_reviewed_at < now() - make_interval(days => pol.max_review_age_days))
                THEN 'review_stale' END
       ], NULL) AS reject_reasons
  FROM public.trivia_questions q
 CROSS JOIN pol
  LEFT JOIN public.trivia_question_curation c ON c.question_id = q.id
  LEFT JOIN public.trivia_question_revisions r ON r.id = c.current_revision_id
  LEFT JOIN rep ON rep.question_id = q.id
  LEFT JOIN quar ON quar.question_id = q.id;

CREATE OR REPLACE VIEW public.trivia_eligible_question_pool_v1 WITH (security_invoker = true) AS
SELECT e.question_id, e.revision_id, e.fingerprint, e.category, e.difficulty, e.quality_score,
       e.min_timer_seconds, e.modes, e.policy_version
  FROM public.trivia_question_eligibility_v1 e
 WHERE e.reject_reasons = '{}'::text[];

-- Serving columns for the legacy (pre-engine-v3) solo loader: same rows, no key.
CREATE OR REPLACE VIEW public.trivia_eligible_questions_serving_v1 WITH (security_invoker = true) AS
SELECT q.id, q.category, q.subcategory, q.difficulty, q.question, q.options, q.quality_score, q.theme,
       q.daily_date, q.order_index, q.last_used_at, p.modes
  FROM public.trivia_eligible_question_pool_v1 p
  JOIN public.trivia_questions q ON q.id = p.question_id;

-- Relaxed pool, reachable only for FREE modes behind TRIVIA_FREE_LEGACY_FALLBACK_ENABLED.
CREATE OR REPLACE VIEW public.trivia_free_fallback_questions_v1 WITH (security_invoker = true) AS
SELECT q.id, q.category, q.subcategory, q.difficulty, q.question, q.options, q.quality_score, q.theme,
       q.daily_date, q.order_index, q.last_used_at, e.modes
  FROM public.trivia_question_eligibility_v1 e
  JOIN public.trivia_questions q ON q.id = e.question_id
 WHERE e.structurally_valid AND e.is_canonical AND NOT e.quarantined AND e.open_valid_reports = 0
   AND coalesce(q.quality_score, 0) >= 6 AND q.audit_verified IS DISTINCT FROM false;

-- Deterministic review queue: unset, canonical, servable-grade, unquarantined, well-formed.
CREATE OR REPLACE VIEW public.trivia_review_queue_v1 WITH (security_invoker = true) AS
SELECT x.* FROM (
    SELECT q.id AS question_id, c.current_revision_id AS revision_id, q.category, q.difficulty,
           q.quality_score, q.created_at,
           CASE WHEN q.quality_score >= 7 THEN 1 ELSE 2 END AS priority,
           (SELECT count(*)::int FROM public.trivia_question_reviews rv
             WHERE rv.revision_id = c.current_revision_id AND rv.verdict = 'inconclusive') AS inconclusive_attempts
      FROM public.trivia_questions q
      JOIN public.trivia_question_curation c ON c.question_id = q.id
      JOIN public.trivia_question_revisions r ON r.id = c.current_revision_id
     WHERE q.audit_verified IS NULL
       AND coalesce(q.quality_score, 0) >= 6
       AND c.canonical_question_id = q.id
       AND r.structurally_valid
       AND NOT EXISTS (SELECT 1 FROM public.trivia_question_quarantine z
                        WHERE z.question_id = q.id AND z.released_at IS NULL)
) x WHERE x.inconclusive_attempts < 3;

CREATE OR REPLACE VIEW public.trivia_question_report_queue_v1 WITH (security_invoker = true) AS
SELECT r.id AS report_id, r.question_id, r.state, r.valid, r.reason, r.note, r.created_at,
       r.reporter_established, r.served_to_reporter, r.session_id, r.revision_id,
       r.triaged_at, r.triaged_by, r.triage_note,
       floor(extract(epoch FROM (now() - r.created_at)) / 3600)::int AS age_hours,
       (SELECT count(*)::int FROM public.trivia_question_reports o
         WHERE o.question_id = r.question_id AND o.state IN ('open','triaged') AND o.valid) AS open_valid_for_question,
       e.reject_reasons, q.category, q.difficulty
  FROM public.trivia_question_reports r
  JOIN public.trivia_questions q ON q.id = r.question_id
  LEFT JOIN public.trivia_question_eligibility_v1 e ON e.question_id = r.question_id
 WHERE r.state IN ('open','triaged');

CREATE OR REPLACE VIEW public.trivia_question_review_history_v1 WITH (security_invoker = true) AS
SELECT rv.question_id, rv.reviewed_at, rv.reviewer, rv.reviewer_kind, rv.model, rv.model_version,
       rv.prompt_version, rv.verdict, rv.confidence, 'trivia_question_reviews'::text AS record_source
  FROM public.trivia_question_reviews rv
UNION ALL
SELECT a.question_id, a.audited_at, 'external-audit', 'model', a.verifier_model, NULL, 'legacy-audit',
       CASE WHEN a.verified THEN 'verified' ELSE 'failed' END, a.confidence, 'trivia_quality_audits'
  FROM public.trivia_quality_audits a;

-- ---------------------------------------------------------------- quarantine actions
CREATE OR REPLACE FUNCTION public.trivia_quarantine_question_v1(
    p_question_id uuid, p_reason_code text, p_source text, p_actor text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid;
BEGIN
    IF p_question_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.trivia_questions WHERE id = p_question_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_not_found');
    END IF;
    IF p_reason_code IS NULL OR p_reason_code !~ '^[a-z0-9_]{3,64}$' OR btrim(coalesce(p_actor, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    INSERT INTO public.trivia_question_quarantine (question_id, reason_code, source, detail, created_by)
    VALUES (p_question_id, p_reason_code, p_source, coalesce(p_detail, '{}'::jsonb), p_actor)
    ON CONFLICT (question_id, reason_code) WHERE released_at IS NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.trivia_question_quarantine
         WHERE question_id = p_question_id AND reason_code = p_reason_code AND released_at IS NULL;
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'quarantine_id', v_id);
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'quarantine_id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_release_question_quarantine_v1(
    p_quarantine_id uuid, p_actor text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_row public.trivia_question_quarantine%ROWTYPE;
BEGIN
    IF btrim(coalesce(p_actor, '')) = '' OR btrim(coalesce(p_note, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'actor_and_note_required');
    END IF;
    SELECT * INTO v_row FROM public.trivia_question_quarantine WHERE id = p_quarantine_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'quarantine_not_found'); END IF;
    IF v_row.released_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'released_at', v_row.released_at);
    END IF;
    UPDATE public.trivia_question_quarantine
       SET released_at = now(), released_by = p_actor, release_note = p_note
     WHERE id = p_quarantine_id;
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'quarantine_id', p_quarantine_id);
END $$;

-- ---------------------------------------------------------------- review batch queue
CREATE OR REPLACE FUNCTION public.trivia_claim_review_batch_v1(
    p_reviewer text, p_size integer DEFAULT 25, p_lease_seconds integer DEFAULT 900)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_batch public.trivia_review_batches%ROWTYPE;
    v_size integer := least(greatest(coalesce(p_size, 25), 1), 200);
    v_resumed boolean := false;
    v_n integer;
    v_items jsonb;
BEGIN
    IF p_reviewer IS NULL OR p_reviewer !~ '^[a-z0-9][a-z0-9._/:-]{2,63}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_reviewer');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_review_queue_v1', 0));
    UPDATE public.trivia_review_batches SET status = 'expired'
     WHERE status = 'claimed' AND lease_expires_at < now();

    SELECT b.* INTO v_batch FROM public.trivia_review_batches b
     WHERE b.reviewer = p_reviewer AND b.status = 'claimed'
       AND EXISTS (SELECT 1 FROM public.trivia_review_batch_items i WHERE i.batch_id = b.id AND i.review_id IS NULL)
     ORDER BY b.batch_no LIMIT 1;
    IF FOUND THEN
        v_resumed := true;
    ELSE
        SELECT count(*) INTO v_n FROM (
            SELECT 1 FROM public.trivia_review_queue_v1 qv
             WHERE NOT EXISTS (SELECT 1 FROM public.trivia_review_batch_items i
                                 JOIN public.trivia_review_batches b ON b.id = i.batch_id
                                WHERE i.question_id = qv.question_id AND b.status = 'claimed'
                                  AND i.review_id IS NULL)
             LIMIT 1) z;
        IF v_n = 0 THEN
            RETURN jsonb_build_object('success', true, 'empty', true, 'items', '[]'::jsonb);
        END IF;
        INSERT INTO public.trivia_review_batches (queue_version, reviewer, size, status, lease_expires_at)
        VALUES ('trivia-review-queue/1', p_reviewer, 0, 'claimed',
                now() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600))))
        RETURNING * INTO v_batch;
        INSERT INTO public.trivia_review_batch_items (batch_id, position, question_id, revision_id)
        SELECT v_batch.id, row_number() OVER (ORDER BY s.priority, s.inconclusive_attempts, s.created_at, s.question_id),
               s.question_id, s.revision_id
          FROM (SELECT qv.* FROM public.trivia_review_queue_v1 qv
                 WHERE NOT EXISTS (SELECT 1 FROM public.trivia_review_batch_items i
                                     JOIN public.trivia_review_batches b ON b.id = i.batch_id
                                    WHERE i.question_id = qv.question_id AND b.status = 'claimed'
                                      AND i.review_id IS NULL)
                 ORDER BY qv.priority, qv.inconclusive_attempts, qv.created_at, qv.question_id
                 LIMIT v_size) s;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        UPDATE public.trivia_review_batches SET size = v_n WHERE id = v_batch.id RETURNING * INTO v_batch;
    END IF;

    SELECT jsonb_agg(jsonb_build_object('position', i.position, 'question_id', i.question_id,
               'revision_id', i.revision_id, 'question', r.question, 'options', r.options,
               'category', r.category, 'difficulty', r.difficulty) ORDER BY i.position)
      INTO v_items
      FROM public.trivia_review_batch_items i
      JOIN public.trivia_question_revisions r ON r.id = i.revision_id
     WHERE i.batch_id = v_batch.id AND i.review_id IS NULL;
    RETURN jsonb_build_object('success', true, 'empty', false, 'resumed', v_resumed,
        'batch_id', v_batch.id, 'batch_no', v_batch.batch_no, 'queue_version', v_batch.queue_version,
        'lease_expires_at', v_batch.lease_expires_at, 'items', coalesce(v_items, '[]'::jsonb));
END $$;

-- The verdict is computed HERE from the model's cold answers; the stored key never
-- leaves the database. prompt 'cold-answer/1': evidence {answers:[{index,confidence},x2]}.
-- prompt 'human/1': evidence {verdict:'verified'|'failed', note}.
CREATE OR REPLACE FUNCTION public.trivia_record_question_review_v1(
    p_batch_id uuid, p_question_id uuid, p_revision_id uuid, p_reviewer text, p_reviewer_kind text,
    p_model text, p_model_version text, p_prompt_version text, p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_existing public.trivia_question_reviews%ROWTYPE;
    v_rev public.trivia_question_revisions%ROWTYPE;
    v_current uuid;
    v_verdict text;
    v_conf numeric;
    v_a0 integer; v_a1 integer; v_c0 numeric; v_c1 numeric;
    v_applied boolean := false;
    v_effect text := 'none';
    v_inconclusive integer;
    v_review_id uuid;
    v_q public.trivia_questions%ROWTYPE;
BEGIN
    IF p_question_id IS NULL OR p_revision_id IS NULL OR btrim(coalesce(p_reviewer, '')) = ''
       OR p_reviewer_kind NOT IN ('model','human','system') OR p_evidence IS NULL
       OR p_prompt_version NOT IN ('cold-answer/1','human/1') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    IF p_batch_id IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.trivia_question_reviews
         WHERE batch_id = p_batch_id AND question_id = p_question_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'duplicate', true, 'review_id', v_existing.id,
                'verdict', v_existing.verdict, 'applied', v_existing.applied, 'effect', v_existing.applied_effect);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.trivia_review_batch_items
                        WHERE batch_id = p_batch_id AND question_id = p_question_id AND revision_id = p_revision_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'not_in_batch');
        END IF;
    END IF;
    SELECT * INTO v_rev FROM public.trivia_question_revisions WHERE id = p_revision_id AND question_id = p_question_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'revision_not_found'); END IF;
    SELECT * INTO v_q FROM public.trivia_questions WHERE id = p_question_id FOR UPDATE;
    SELECT current_revision_id INTO v_current FROM public.trivia_question_curation WHERE question_id = p_question_id;

    IF NOT v_rev.structurally_valid THEN
        v_verdict := 'invalid_structure';
    ELSIF p_prompt_version = 'human/1' THEN
        v_verdict := CASE WHEN p_evidence ->> 'verdict' IN ('verified','failed') THEN p_evidence ->> 'verdict' ELSE 'inconclusive' END;
    ELSE
        IF jsonb_typeof(p_evidence -> 'answers') = 'array' AND jsonb_array_length(p_evidence -> 'answers') = 2
           AND (p_evidence -> 'answers' -> 0 ->> 'index') ~ '^[0-9]+$' AND (p_evidence -> 'answers' -> 1 ->> 'index') ~ '^[0-9]+$' THEN
            v_a0 := (p_evidence -> 'answers' -> 0 ->> 'index')::int;
            v_a1 := (p_evidence -> 'answers' -> 1 ->> 'index')::int;
            v_c0 := CASE WHEN (p_evidence -> 'answers' -> 0 ->> 'confidence') ~ '^[0-9.]+$'
                         THEN least(1, (p_evidence -> 'answers' -> 0 ->> 'confidence')::numeric) END;
            v_c1 := CASE WHEN (p_evidence -> 'answers' -> 1 ->> 'confidence') ~ '^[0-9.]+$'
                         THEN least(1, (p_evidence -> 'answers' -> 1 ->> 'confidence')::numeric) END;
            v_conf := least(v_c0, v_c1);
            IF v_a0 = v_rev.correct_index AND v_a1 = v_rev.correct_index THEN
                v_verdict := 'verified';
            ELSIF v_a0 = v_a1 AND coalesce(v_c0, 0) >= 0.6 AND coalesce(v_c1, 0) >= 0.6 THEN
                v_verdict := 'failed';
            ELSE
                v_verdict := 'inconclusive';
            END IF;
        ELSE
            v_verdict := 'inconclusive';
        END IF;
    END IF;

    IF p_revision_id IS NOT DISTINCT FROM v_current THEN
        IF v_verdict = 'verified' THEN
            UPDATE public.trivia_questions
               SET audit_verified = true, last_audited_at = now(),
                   audit_confidence = coalesce(v_conf, audit_confidence)
             WHERE id = p_question_id;
            v_applied := true; v_effect := 'verified';
        ELSIF v_verdict = 'failed' THEN
            UPDATE public.trivia_questions
               SET audit_verified = false, last_audited_at = now(),
                   quality_score = least(coalesce(quality_score, 4), 4), daily_date = NULL
             WHERE id = p_question_id;
            v_applied := true; v_effect := 'failed_demoted';
        ELSIF v_verdict = 'invalid_structure' THEN
            UPDATE public.trivia_questions
               SET last_audited_at = now(), quality_score = least(coalesce(quality_score, 4), 4), daily_date = NULL
             WHERE id = p_question_id;
            PERFORM public.trivia_quarantine_question_v1(p_question_id, 'invalid_structure', 'structural',
                p_reviewer, jsonb_build_object('revision_id', p_revision_id));
            v_applied := true; v_effect := 'quarantined_structure';
        ELSE
            SELECT count(*) INTO v_inconclusive FROM public.trivia_question_reviews
             WHERE revision_id = p_revision_id AND verdict = 'inconclusive';
            IF v_inconclusive + 1 >= 3 THEN
                UPDATE public.trivia_questions
                   SET last_audited_at = now(), quality_score = least(coalesce(quality_score, 4), 4), daily_date = NULL
                 WHERE id = p_question_id;
                v_applied := true; v_effect := 'inconclusive_limit_demoted';
            ELSE
                v_effect := 'inconclusive_retry';
            END IF;
        END IF;
    ELSE
        v_effect := 'stale_revision_not_applied';
    END IF;

    INSERT INTO public.trivia_question_reviews (question_id, revision_id, batch_id, reviewer, reviewer_kind,
        model, model_version, prompt_version, verdict, confidence, evidence, applied, applied_effect)
    VALUES (p_question_id, p_revision_id, p_batch_id, p_reviewer, p_reviewer_kind, p_model, p_model_version,
        p_prompt_version, v_verdict, v_conf, p_evidence, v_applied, v_effect)
    RETURNING id INTO v_review_id;
    UPDATE public.trivia_question_curation SET last_reviewed_at = now(), last_review_id = v_review_id, updated_at = now()
     WHERE question_id = p_question_id;
    IF p_batch_id IS NOT NULL THEN
        UPDATE public.trivia_review_batch_items SET review_id = v_review_id
         WHERE batch_id = p_batch_id AND question_id = p_question_id;
        UPDATE public.trivia_review_batches SET status = 'completed', completed_at = now()
         WHERE id = p_batch_id AND status IN ('claimed','expired')
           AND NOT EXISTS (SELECT 1 FROM public.trivia_review_batch_items WHERE batch_id = p_batch_id AND review_id IS NULL);
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'review_id', v_review_id,
        'verdict', v_verdict, 'applied', v_applied, 'effect', v_effect);
END $$;

-- ---------------------------------------------------------------- report intake (spam-bounded)
-- A report is VALID only from an established human account that was actually served the
-- question (any member of its duplicate group). One valid open report removes the question
-- from paid/competitive pools; the policy threshold of distinct valid reporters quarantines
-- it everywhere. Invalid reports are stored for operations but change nothing.
CREATE OR REPLACE FUNCTION public.trivia_submit_question_report_v1(
    p_user_id uuid, p_question_id uuid, p_reason text, p_note text DEFAULT NULL, p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_existing uuid;
    v_canon uuid;
    v_rev uuid;
    v_established boolean;
    v_served boolean;
    v_valid boolean;
    v_session uuid;
    v_id uuid;
    v_threshold integer;
    v_reporters integer;
    v_quarantined boolean := false;
BEGIN
    IF p_user_id IS NULL OR p_question_id IS NULL
       OR p_reason NOT IN ('wrong_answer','unclear','duplicate','offensive','broken','other') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    IF p_note IS NOT NULL AND length(p_note) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'note_too_long');
    END IF;
    SELECT c.canonical_question_id, c.current_revision_id INTO v_canon, v_rev
      FROM public.trivia_question_curation c WHERE c.question_id = p_question_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_found'); END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_report:' || p_user_id::text, 0));

    SELECT id INTO v_existing FROM public.trivia_question_reports
     WHERE user_id = p_user_id AND question_id = p_question_id AND state IN ('open','triaged') LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'report_id', v_existing);
    END IF;
    IF (SELECT count(*) FROM public.trivia_question_reports
         WHERE user_id = p_user_id AND created_at > now() - interval '24 hours') >= 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'daily_report_limit');
    END IF;
    IF (SELECT count(*) FROM public.trivia_question_reports
         WHERE user_id = p_user_id AND state IN ('open','triaged')) >= 25 THEN
        RETURN jsonb_build_object('success', false, 'error', 'open_report_limit');
    END IF;

    SELECT (p.created_at < now() - interval '24 hours') AND coalesce(p.is_horse, false) IS FALSE
      INTO v_established FROM public.profiles p WHERE p.id = p_user_id;
    v_established := coalesce(v_established, false);
    v_served := EXISTS (SELECT 1 FROM public.trivia_user_question_history h
                          JOIN public.trivia_question_curation c ON c.question_id = h.question_id
                         WHERE h.user_id = p_user_id AND c.canonical_question_id = v_canon)
             OR EXISTS (SELECT 1 FROM public.trivia_sessions s
                         WHERE s.user_id = p_user_id AND s.question_ids && ARRAY(
                               SELECT question_id FROM public.trivia_question_curation WHERE canonical_question_id = v_canon));
    v_valid := v_established AND v_served;
    IF p_session_id IS NOT NULL THEN
        SELECT id INTO v_session FROM public.trivia_sessions WHERE id = p_session_id AND user_id = p_user_id;
    END IF;

    INSERT INTO public.trivia_question_reports (question_id, user_id, reason, note, state, valid, session_id,
        revision_id, reporter_established, served_to_reporter)
    VALUES (p_question_id, p_user_id, p_reason, nullif(btrim(coalesce(p_note, '')), ''), 'open', v_valid,
        v_session, v_rev, v_established, v_served)
    RETURNING id INTO v_id;

    IF v_valid THEN
        SELECT report_quarantine_threshold INTO v_threshold FROM public.trivia_eligibility_policies
         ORDER BY policy_version DESC LIMIT 1;
        SELECT count(DISTINCT r.user_id) INTO v_reporters
          FROM public.trivia_question_reports r
          JOIN public.trivia_question_curation c ON c.question_id = r.question_id
         WHERE c.canonical_question_id = v_canon AND r.state IN ('open','triaged') AND r.valid;
        IF v_reporters >= coalesce(v_threshold, 3) THEN
            PERFORM public.trivia_quarantine_question_v1(v_canon, 'reports_threshold', 'report_threshold',
                'trivia_submit_question_report_v1', jsonb_build_object('valid_reporters', v_reporters));
            v_quarantined := true;
        END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'report_id', v_id, 'valid', v_valid,
        'excluded_from_paid_pools', v_valid, 'quarantined', v_quarantined);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_triage_question_report_v1(
    p_report_id uuid, p_state text, p_actor text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_r public.trivia_question_reports%ROWTYPE; v_q jsonb;
BEGIN
    IF p_state NOT IN ('triaged','upheld','dismissed','duplicate') OR btrim(coalesce(p_actor, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO v_r FROM public.trivia_question_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'report_not_found'); END IF;
    IF v_r.state = p_state THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'report_id', p_report_id, 'state', v_r.state);
    END IF;
    IF v_r.state NOT IN ('open','triaged') OR (v_r.state = 'triaged' AND p_state = 'triaged') THEN
        RETURN jsonb_build_object('success', false, 'error', 'report_closed', 'state', v_r.state);
    END IF;
    UPDATE public.trivia_question_reports
       SET state = p_state, triaged_at = now(), triaged_by = p_actor,
           triage_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), triage_note),
           resolved_at = CASE WHEN p_state IN ('upheld','dismissed','duplicate') THEN now() ELSE resolved_at END,
           resolution = CASE WHEN p_state IN ('upheld','dismissed','duplicate') THEN p_state ELSE resolution END
     WHERE id = p_report_id;
    IF p_state = 'upheld' THEN
        v_q := public.trivia_quarantine_question_v1(v_r.question_id, 'report_upheld', 'operations', p_actor,
            jsonb_build_object('report_id', p_report_id));
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'report_id', p_report_id, 'state', p_state,
        'quarantine', v_q);
END $$;

-- ---------------------------------------------------------------- access control
ALTER TABLE public.trivia_question_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_question_curation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_question_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_question_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_review_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_review_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_eligibility_policies ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['trivia_question_revisions','trivia_question_curation','trivia_question_quarantine',
        'trivia_question_reviews','trivia_review_batches','trivia_review_batch_items','trivia_eligibility_policies']
    LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_read', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO service_role USING (true)', t || '_service_read', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['trivia_question_eligibility_v1','trivia_eligible_question_pool_v1',
        'trivia_eligible_questions_serving_v1','trivia_free_fallback_questions_v1','trivia_review_queue_v1',
        'trivia_question_report_queue_v1','trivia_question_review_history_v1']
    LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
    END LOOP;
END $$;

-- Browsers never write reports directly any more (intake is the rate-limited function);
-- a player may still read the non-operational columns of their own reports.
DROP POLICY IF EXISTS trivia_question_reports_user_insert ON public.trivia_question_reports;
REVOKE ALL ON TABLE public.trivia_question_reports FROM anon, authenticated;
DO $$
DECLARE c record;
BEGIN
    FOR c IN SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'trivia_question_reports'
    LOOP
        EXECUTE format('REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.trivia_question_reports FROM anon, authenticated', c.column_name);
    END LOOP;
END $$;
GRANT SELECT (id, question_id, user_id, reason, note, created_at, state, resolved_at, resolution)
    ON public.trivia_question_reports TO authenticated;

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.trivia_reading_words_v1(text,jsonb)',
        'public.trivia_min_timer_seconds_v1(text,jsonb)',
        'public.trivia_question_structure_ok_v1(text,jsonb,integer,text,text)',
        'public.trivia_question_content_hash_v1(text,jsonb,integer,text,text,text,text)',
        'public.trivia_default_modes_v1(text)',
        'public.trivia_p3_forbid_mutation()',
        'public.trivia_quarantine_guard_v1()',
        'public.trivia_capture_question_revision_v1()',
        'public.trivia_quarantine_question_v1(uuid,text,text,text,jsonb)',
        'public.trivia_release_question_quarantine_v1(uuid,text,text)',
        'public.trivia_claim_review_batch_v1(text,integer,integer)',
        'public.trivia_record_question_review_v1(uuid,uuid,uuid,text,text,text,text,text,jsonb)',
        'public.trivia_submit_question_report_v1(uuid,uuid,text,text,uuid)',
        'public.trivia_triage_question_report_v1(uuid,text,text,text)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    END LOOP;
    FOREACH f IN ARRAY ARRAY[
        'public.trivia_quarantine_question_v1(uuid,text,text,text,jsonb)',
        'public.trivia_release_question_quarantine_v1(uuid,text,text)',
        'public.trivia_claim_review_batch_v1(text,integer,integer)',
        'public.trivia_record_question_review_v1(uuid,uuid,uuid,text,text,text,text,text,jsonb)',
        'public.trivia_submit_question_report_v1(uuid,uuid,text,text,uuid)',
        'public.trivia_triage_question_report_v1(uuid,text,text,text)']
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ---------------------------------------------------------------- postconditions
DO $$
DECLARE
    v_q bigint; v_rev bigint; v_cur bigint; v_bad bigint; v_pool bigint; v_groups bigint; v_canon bigint;
BEGIN
    SELECT count(*) INTO v_q FROM public.trivia_questions;
    SELECT count(DISTINCT question_id) INTO v_rev FROM public.trivia_question_revisions;
    SELECT count(*) INTO v_cur FROM public.trivia_question_curation;
    IF v_rev <> v_q OR v_cur <> v_q THEN
        RAISE EXCEPTION 'postcondition: revisions %/curation % must cover all % questions', v_rev, v_cur, v_q;
    END IF;
    SELECT count(*) INTO v_bad FROM public.trivia_question_curation c
      JOIN public.trivia_question_revisions r ON r.id = c.current_revision_id
      JOIN public.trivia_questions q ON q.id = c.question_id
     WHERE r.content_hash <> public.trivia_question_content_hash_v1(q.question, q.options, q.correct_index,
               q.explanation, q.category, q.subcategory, q.difficulty)
        OR r.question_id <> c.question_id;
    IF v_bad > 0 THEN RAISE EXCEPTION 'postcondition: % curation rows point at a stale revision', v_bad; END IF;
    SELECT count(*) INTO v_bad FROM public.trivia_question_curation a
      JOIN public.trivia_question_curation k ON k.question_id = a.canonical_question_id
     WHERE a.fingerprint <> k.fingerprint OR k.canonical_question_id <> k.question_id;
    IF v_bad > 0 THEN RAISE EXCEPTION 'postcondition: % aliases map outside their group', v_bad; END IF;
    SELECT count(DISTINCT question_fingerprint) INTO v_groups FROM public.trivia_questions;
    SELECT count(*) INTO v_canon FROM public.trivia_question_curation WHERE canonical_question_id = question_id;
    IF v_groups <> v_canon THEN
        RAISE EXCEPTION 'postcondition: % canonical rows for % fingerprint groups', v_canon, v_groups;
    END IF;
    SELECT count(*) INTO v_pool FROM public.trivia_eligible_question_pool_v1;
    SELECT count(*) INTO v_bad FROM public.trivia_eligible_question_pool_v1 p
      JOIN public.trivia_questions q ON q.id = p.question_id
      JOIN public.trivia_question_curation c ON c.question_id = p.question_id
      JOIN public.trivia_question_revisions r ON r.id = c.current_revision_id
     WHERE q.audit_verified IS NOT TRUE OR coalesce(q.quality_score, 0) < 7 OR c.canonical_question_id <> q.id
        OR NOT r.structurally_valid
        OR EXISTS (SELECT 1 FROM public.trivia_question_quarantine z WHERE z.question_id = q.id AND z.released_at IS NULL);
    IF v_bad > 0 OR (v_q >= 5000 AND v_pool < 1000) THEN
        RAISE EXCEPTION 'postcondition: eligible pool % rows with % violations', v_pool, v_bad;
    END IF;
    IF has_table_privilege('anon', 'public.trivia_question_revisions', 'SELECT')
       OR has_table_privilege('authenticated', 'public.trivia_question_revisions', 'SELECT')
       OR has_table_privilege('authenticated', 'public.trivia_eligible_question_pool_v1', 'SELECT')
       OR has_table_privilege('service_role', 'public.trivia_question_revisions', 'INSERT')
       OR has_table_privilege('authenticated', 'public.trivia_question_reports', 'INSERT')
       OR has_column_privilege('authenticated', 'public.trivia_question_reports', 'valid', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.trivia_question_reports', 'triage_note', 'SELECT')
       OR has_function_privilege('authenticated', 'public.trivia_submit_question_report_v1(uuid,uuid,text,text,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_claim_review_batch_v1(text,integer,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'postcondition: browser or direct-write access leaked onto phase 3 objects';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_trivia_capture_question_revision_v1'
                    AND tgrelid = 'public.trivia_questions'::regclass) THEN
        RAISE EXCEPTION 'postcondition: revision capture trigger missing';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
