-- ═══════════════════════════════════════════════════════════════════════
-- 20260930030000_phase7_puzzles_answer_once_and_reveal_once.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (three new tables with RLS, one BEFORE INSERT trigger, two new
--              SECURITY DEFINER RPCs that write social_posts, social_comments and,
--              through award_diamonds_v2, diamond_transactions; seven mode rows)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p7-db),
--              Fleet Content Programme Phase 7 "Interactive Poker Content"
-- AFFECTS:     new tables: public.social_puzzles, public.social_puzzle_solutions,
--                public.social_puzzle_answers (RLS on all three)
--              new trigger: trg_p7_answer_guard on social_puzzle_answers
--                (function public.fn_p7_answer_guard)
--              new rpcs: public.fn_p7_publish_puzzle(...), public.fn_p7_reveal_puzzle(uuid)
--              rows: public.horse_post_modes gets seven rows, every one enabled = false
--              touched at run time only, never by this file: social_posts,
--                social_comments, profiles, content_authors, horse_post_modes,
--                diamond_transactions (only through award_diamonds_v2)
-- IRREVERSIBLE: no (the ROLLBACK block at the end drops exactly what this file
--              creates and deletes exactly the seven mode rows)
--
-- WHY:
--   Phase 7 lets a horse post a real hand as a puzzle ("what is the nuts on this
--   board", "what price was I getting", "what did I do here"), lets humans
--   answer once each, and six hours later has the same horse reveal the answer
--   and pay each correct answer once. The feed reads social_posts.metadata
--   unchanged into the browser, so the answer can never live in the post row:
--   it lives in a service-role-only table, and the public puzzle row carries a
--   sha256 commitment so anyone can verify after the reveal that the answer
--   was fixed before the first human answered. Everything is keyed so a second
--   run of any step writes nothing and pays nothing: the puzzle key is unique,
--   the post carries it in metadata.publication_key (index
--   uq_social_posts_metadata_publication_key), the reveal is guarded by the
--   puzzle row lock and revealed_at, and the diamond reference
--   social_puzzle_<user>_<puzzle> is unique in the ledger.
--
-- HOW:
--   - social_puzzles: one public row per puzzle (board, prompt, options,
--     commitment, reveal_at); correct_option and explanation stay NULL until
--     the reveal.
--   - social_puzzle_solutions: correct option, salt, explanation, proof;
--     service role only, no anon or authenticated policy, privileges revoked.
--   - social_puzzle_answers: one row per (puzzle, user); insert only as
--     yourself; a BEFORE INSERT trigger refuses the author, late answers,
--     answers after the reveal and unknown option keys.
--   - fn_p7_publish_puzzle: service role only; locks the horse identity like
--     publish_horse_video_reel; requires the puzzle_<kind> mode row to be
--     enabled; writes post + puzzle + solution in one transaction or nothing;
--     returns {"status":"duplicate"} for a key that already exists.
--   - fn_p7_reveal_puzzle: service role only; locks the puzzle row; not due /
--     already revealed / post gone are answers, not errors; writes the reveal
--     comment as the horse, grades every answer, pays correct answers of
--     rewardable puzzles once through award_diamonds_v2 after the same
--     24-hour profile-age gate fn_social_reward_award applies, and stores the
--     award JSON on the answer row.
--   - Seven horse_post_modes rows, all disabled, ON CONFLICT DO NOTHING.
--
-- EVIDENCE (production kuklfnapbkmacvwxktbh, 2026-09-29, SELECT only):
--   award_diamonds_v2(uuid, text, text, text, jsonb) returns jsonb, SECURITY
--   DEFINER, executable by postgres and service_role; refuses a repeated
--   reference with reason 'duplicate' and maps unique violations on
--   idx_diamond_transactions_reference_id / diamond_transactions_user_reference_uidx
--   to the same reason. fn_social_reward_award applies a 24-hour profile-age
--   gate and swallows the result; the reveal calls award_diamonds_v2 directly
--   so the reason is kept. publish_horse_video_reel is the pattern for the
--   service-role check, the identity lock and the error style. social_posts
--   content CHECK <= 2000, topic CHECK includes 'poker', CHECK
--   social_posts_managed_library_integrity_check keeps the publication_key
--   column NULL outside the video library, so the key lives in metadata.
--   social_comments content CHECK <= 500. pages/api/posts/delete.js deletes
--   social_posts rows outright, so the puzzle's post reference must not block
--   that delete: post_id is nullable with ON DELETE SET NULL and a reveal that
--   finds no live post closes the puzzle as post_gone. No object named
--   social_puzzle% or fn_p7% exists; none of the seven mode rows exists.
--   Design: agent-evidence/fleet-p6-closeout-20260920/agents/p7-research/design.md
--   sections 1, 2, 4, 5.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT: everything this file depends on exists, nothing it creates does.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
  n int;
BEGIN
  SELECT string_agg(required.table_name, ', ' ORDER BY required.table_name)
    INTO v_missing
    FROM (VALUES ('profiles'), ('content_authors'), ('social_posts'),
                 ('social_comments'), ('horse_post_modes'), ('diamond_transactions')) AS required(table_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = required.table_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required tables missing: %', v_missing;
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ' ORDER BY 1)
    INTO v_missing
    FROM (VALUES
      ('profiles', 'id'), ('profiles', 'created_at'), ('profiles', 'is_horse'), ('profiles', 'status'),
      ('content_authors', 'profile_id'), ('content_authors', 'is_active'),
      ('social_posts', 'id'), ('social_posts', 'author_id'), ('social_posts', 'content'),
      ('social_posts', 'content_type'), ('social_posts', 'visibility'), ('social_posts', 'topic'),
      ('social_posts', 'metadata'), ('social_posts', 'is_deleted'), ('social_posts', 'is_flagged'),
      ('social_comments', 'id'), ('social_comments', 'post_id'), ('social_comments', 'author_id'),
      ('social_comments', 'content'),
      ('horse_post_modes', 'mode'), ('horse_post_modes', 'enabled'), ('horse_post_modes', 'description'),
      ('diamond_transactions', 'id'), ('diamond_transactions', 'user_id'), ('diamond_transactions', 'reference_id')
    ) AS required(table_name, column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = required.table_name
        AND c.column_name = required.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required columns missing: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'social_posts'
       AND indexname = 'uq_social_posts_metadata_publication_key') THEN
    RAISE EXCEPTION 'pre-flight failed: uq_social_posts_metadata_publication_key is missing (20260921230421)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
     WHERE s.nspname = 'public' AND p.proname = 'award_diamonds_v2'
       AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_action_key text, p_reference_id text, p_target_id text, p_metadata jsonb'
       AND p.prosecdef) THEN
    RAISE EXCEPTION 'pre-flight failed: public.award_diamonds_v2(uuid, text, text, text, jsonb) SECURITY DEFINER not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'auth' AND p.proname = 'role')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'auth' AND p.proname = 'uid') THEN
    RAISE EXCEPTION 'pre-flight failed: auth.role() and auth.uid() are required';
  END IF;

  IF encode(sha256(convert_to('abc', 'UTF8')), 'hex')
     <> 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' THEN
    RAISE EXCEPTION 'pre-flight failed: sha256 does not produce the expected digest';
  END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public'
     AND c.relname IN ('social_puzzles', 'social_puzzle_solutions', 'social_puzzle_answers');
  IF n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: % of the three puzzle tables already exist', n;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public'
     AND p.proname IN ('fn_p7_answer_guard', 'fn_p7_publish_puzzle', 'fn_p7_reveal_puzzle');
  IF n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: % of the three fn_p7 functions already exist', n;
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------

-- One puzzle per hand and kind. The public row never holds an unrevealed answer.
CREATE TABLE public.social_puzzles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_key        text NOT NULL UNIQUE,
  kind              text NOT NULL CHECK (kind IN ('nuts', 'pot_odds', 'what_would_you_do')),
  author_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id           uuid UNIQUE REFERENCES public.social_posts(id) ON DELETE SET NULL,
  hand_id           uuid NOT NULL,
  source_review_id  bigint NOT NULL,
  game_variant      text NOT NULL,
  board             jsonb NOT NULL,
  prompt            text NOT NULL,
  options           jsonb NOT NULL,
  rewardable        boolean NOT NULL DEFAULT false,
  answer_commitment text NOT NULL,
  evaluator_version text NOT NULL,
  published_at      timestamptz NOT NULL DEFAULT now(),
  reveal_at         timestamptz NOT NULL,
  revealed_at       timestamptz,
  reveal_comment_id uuid REFERENCES public.social_comments(id) ON DELETE SET NULL,
  correct_option    text,
  explanation       text,
  closed_reason     text CHECK (closed_reason IS NULL OR closed_reason IN ('revealed', 'post_gone')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (reveal_at > published_at),
  CHECK ((revealed_at IS NULL) = (correct_option IS NULL)),
  CHECK ((revealed_at IS NULL) = (closed_reason IS NULL))
);
CREATE INDEX social_puzzles_due_idx ON public.social_puzzles (reveal_at) WHERE revealed_at IS NULL;
CREATE INDEX social_puzzles_author_idx ON public.social_puzzles (author_id, published_at DESC);

COMMENT ON TABLE public.social_puzzles IS
  'Phase 7 feed puzzles, one per hand and kind (puzzle_key p7:<kind>:<hand_id>). Public row: the answer is committed (sha256 of key:option:salt) and stays in social_puzzle_solutions until fn_p7_reveal_puzzle sets revealed_at.';
COMMENT ON COLUMN public.social_puzzles.post_id IS
  'The social_posts row that carries the prompt; NULL after the post is deleted (the reveal then closes the puzzle as post_gone).';
COMMENT ON COLUMN public.social_puzzles.answer_commitment IS
  'encode(sha256(puzzle_key || '':'' || correct_option || '':'' || salt), ''hex''); the salt and the option are published by the reveal comment.';

-- Service role only: the answer, the salt, the explanation and the proof.
CREATE TABLE public.social_puzzle_solutions (
  puzzle_id      uuid PRIMARY KEY REFERENCES public.social_puzzles(id) ON DELETE CASCADE,
  correct_option text NOT NULL,
  salt           text NOT NULL,
  explanation    text NOT NULL,
  proof          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.social_puzzle_solutions IS
  'Phase 7 puzzle answers before the reveal. Service role only: no anon or authenticated policy, privileges revoked.';

-- One answer per human per puzzle. Graded and, when rewardable, paid by the reveal.
CREATE TABLE public.social_puzzle_answers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id             uuid NOT NULL REFERENCES public.social_puzzles(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option                text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  is_correct            boolean,
  reward_reference      text,
  reward_result         jsonb,
  reward_transaction_id uuid,
  UNIQUE (puzzle_id, user_id)
);
CREATE INDEX social_puzzle_answers_user_idx ON public.social_puzzle_answers (user_id, created_at DESC);
COMMENT ON TABLE public.social_puzzle_answers IS
  'Phase 7 puzzle answers, one per (puzzle, user). is_correct, reward_reference (social_puzzle_<user>_<puzzle>), reward_result (award_diamonds_v2 JSON) and reward_transaction_id are written by fn_p7_reveal_puzzle.';

-- ---------------------------------------------------------------------------
-- 3. PRIVILEGES AND RLS (pattern: social_likes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_puzzle_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_puzzle_answers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.social_puzzles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.social_puzzles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_puzzles TO service_role;

REVOKE ALL ON TABLE public.social_puzzle_solutions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_puzzle_solutions TO service_role;

REVOKE ALL ON TABLE public.social_puzzle_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.social_puzzle_answers TO anon;
GRANT SELECT, INSERT ON TABLE public.social_puzzle_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_puzzle_answers TO service_role;

CREATE POLICY "Public read access" ON public.social_puzzles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access" ON public.social_puzzles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON public.social_puzzle_solutions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can insert their own answers" ON public.social_puzzle_answers
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Answers are readable by their author and after the reveal" ON public.social_puzzle_answers
  FOR SELECT TO anon, authenticated USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.social_puzzles p
                WHERE p.id = social_puzzle_answers.puzzle_id AND p.revealed_at IS NOT NULL));
CREATE POLICY "Service role full access" ON public.social_puzzle_answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. ANSWER GUARD: what RLS cannot say is refused in the database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_p7_answer_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_author_id uuid;
  v_reveal_at timestamptz;
  v_revealed_at timestamptz;
  v_options jsonb;
BEGIN
  NEW.option := upper(btrim(COALESCE(NEW.option, '')));
  -- Graded and reward fields belong to the reveal, never to the answer insert.
  NEW.is_correct := NULL;
  NEW.reward_reference := NULL;
  NEW.reward_result := NULL;
  NEW.reward_transaction_id := NULL;
  NEW.created_at := now();

  -- The share lock makes a reveal that is running right now finish first.
  SELECT p.author_id, p.reveal_at, p.revealed_at, p.options
    INTO v_author_id, v_reveal_at, v_revealed_at, v_options
    FROM public.social_puzzles p
   WHERE p.id = NEW.puzzle_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'answer names a puzzle that does not exist',
      CONSTRAINT = 'p7_answer_puzzle_exists';
  END IF;

  IF v_revealed_at IS NOT NULL OR now() >= v_reveal_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'answers are closed for this puzzle',
      CONSTRAINT = 'p7_answers_closed';
  END IF;

  IF NEW.user_id IS NULL OR NEW.user_id = v_author_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'the puzzle author cannot answer their own puzzle',
      CONSTRAINT = 'p7_author_cannot_answer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_options) o WHERE o ->> 'key' = NEW.option) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'answer option must be one of the puzzle option keys',
      CONSTRAINT = 'p7_answer_option_known';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_p7_answer_guard
  BEFORE INSERT ON public.social_puzzle_answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_p7_answer_guard();

COMMENT ON FUNCTION public.fn_p7_answer_guard() IS
  'BEFORE INSERT on social_puzzle_answers: the puzzle exists, is not revealed and not past reveal_at, the answerer is not the author, the option is one of the puzzle option keys; graded fields are cleared.';

-- ---------------------------------------------------------------------------
-- 5. PUBLISH: post + puzzle + solution together or not at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_p7_publish_puzzle(
  p_author_id uuid,
  p_kind text,
  p_hand_id uuid,
  p_source_review_id bigint,
  p_game_variant text,
  p_board jsonb,
  p_prompt text,
  p_options jsonb,
  p_correct_option text,
  p_salt text,
  p_explanation text,
  p_proof jsonb,
  p_evaluator_version text,
  p_rewardable boolean,
  p_reveal_hours integer,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_prompt text := btrim(COALESCE(p_prompt, ''));
  v_explanation text := btrim(COALESCE(p_explanation, ''));
  v_correct text := upper(btrim(COALESCE(p_correct_option, '')));
  v_salt text := lower(btrim(COALESCE(p_salt, '')));
  v_game_variant text := lower(btrim(COALESCE(p_game_variant, '')));
  v_evaluator_version text := btrim(COALESCE(p_evaluator_version, ''));
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_mode_enabled boolean;
  v_card jsonb;
  v_option jsonb;
  v_index integer := 0;
  v_correct_label text;
  v_key text;
  v_puzzle_id uuid;
  v_post_id uuid;
  v_existing_puzzle_id uuid;
  v_existing_post_id uuid;
  v_published_at timestamptz := now();
  v_reveal_at timestamptz;
  v_commitment text;
  v_answer_line text;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'fn_p7_publish_puzzle requires the service role';
  END IF;

  IF p_author_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'puzzle publication requires one active horse author',
      CONSTRAINT = 'p7_active_horse_author';
  END IF;

  -- Lock the identity rows so an administrative deactivation cannot commit
  -- between this check and publication (publish_horse_video_reel pattern).
  PERFORM 1
    FROM public.profiles p
    JOIN public.content_authors ca ON ca.profile_id = p.id
   WHERE p.id = p_author_id
     AND p.is_horse IS TRUE
     AND p.status = 'active'
     AND ca.is_active IS TRUE
   LIMIT 1
   FOR SHARE OF p, ca;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'puzzle publication requires one active horse author',
      CONSTRAINT = 'p7_active_horse_author';
  END IF;

  IF v_kind NOT IN ('nuts', 'pot_odds', 'what_would_you_do') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle kind must be nuts, pot_odds or what_would_you_do';
  END IF;

  -- The approval row is the owner's switch; a disabled mode publishes nothing.
  SELECT m.enabled INTO v_mode_enabled
    FROM public.horse_post_modes m
   WHERE m.mode = 'puzzle_' || v_kind
   FOR SHARE;

  IF v_mode_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format('horse post mode puzzle_%s is not enabled', v_kind);
  END IF;

  IF p_hand_id IS NULL OR p_source_review_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle publication requires the hand id and the source review id';
  END IF;

  IF v_game_variant = '' OR v_evaluator_version = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle publication requires the game variant and the evaluator version';
  END IF;

  IF p_rewardable IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle publication requires rewardable to be true or false';
  END IF;

  IF p_reveal_hours IS NULL OR p_reveal_hours < 1 OR p_reveal_hours > 168 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle reveal must be 1 to 168 hours after publication';
  END IF;

  IF char_length(v_prompt) = 0 OR char_length(v_prompt) > 2000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle prompt must contain 1 to 2000 characters';
  END IF;

  IF char_length(v_explanation) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle publication requires an explanation for the reveal';
  END IF;

  IF p_board IS NULL OR jsonb_typeof(p_board) <> 'array'
     OR jsonb_array_length(p_board) < 3 OR jsonb_array_length(p_board) > 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle board must be an array of 3 to 5 cards';
  END IF;

  FOR v_card IN SELECT value FROM jsonb_array_elements(p_board) LOOP
    IF jsonb_typeof(v_card) <> 'object'
       OR COALESCE(v_card ->> 'rank', '') NOT IN ('2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A')
       OR COALESCE(v_card ->> 'suit', '') NOT IN ('c', 'd', 'h', 's') THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'puzzle board cards must be {rank, suit} objects with letter suits';
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT (c ->> 'rank') || (c ->> 'suit')) FROM jsonb_array_elements(p_board) c)
     <> jsonb_array_length(p_board) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle board repeats a card';
  END IF;

  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array'
     OR jsonb_array_length(p_options) < 2 OR jsonb_array_length(p_options) > 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle options must be an array of 2 to 4 options';
  END IF;

  FOR v_option IN SELECT value FROM jsonb_array_elements(p_options) LOOP
    IF jsonb_typeof(v_option) <> 'object'
       OR (v_option ->> 'key') IS DISTINCT FROM chr(65 + v_index)
       OR char_length(btrim(COALESCE(v_option ->> 'label', ''))) = 0
       OR char_length(v_option ->> 'label') > 160 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'puzzle options must be {key, label} objects with keys A, B, C, D in order and labels of 1 to 160 characters';
    END IF;
    v_index := v_index + 1;
  END LOOP;

  IF (SELECT count(DISTINCT lower(btrim(o ->> 'label'))) FROM jsonb_array_elements(p_options) o)
     <> jsonb_array_length(p_options) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle option labels must be distinct';
  END IF;

  SELECT o ->> 'label' INTO v_correct_label
    FROM jsonb_array_elements(p_options) o
   WHERE o ->> 'key' = v_correct;

  IF v_correct_label IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle correct option must be one of the option keys';
  END IF;

  IF v_salt !~ '^[0-9a-f]{32,128}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle salt must be 16 to 64 random bytes as lowercase hex';
  END IF;

  -- The answer never reaches a public row before the reveal.
  IF position(lower(v_correct_label) IN lower(v_prompt)) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle prompt must not contain the correct option label';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle metadata must be a JSON object';
  END IF;

  IF v_metadata ?| ARRAY['correct_option', 'explanation', 'salt', 'solution', 'answer', 'answer_commitment', 'proof']
     OR position(lower(v_correct_label) IN lower(v_metadata::text)) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle metadata must not carry the solution';
  END IF;

  -- The reveal comment is explanation + answer line + key line, at most 500
  -- characters (social_comments_content_check). Refuse now, before any post exists.
  v_answer_line := 'Answer ' || v_correct || ': ' || v_correct_label || '.';
  IF char_length(v_explanation) + 2 + char_length(v_answer_line) + 1 + char_length('answer key ' || v_salt) > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'puzzle explanation is too long for the 500-character reveal comment with the answer and the key';
  END IF;

  v_key := 'p7:' || v_kind || ':' || p_hand_id::text;

  -- One publisher per key at a time; the second one sees the first one's rows.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fn_p7_publish_puzzle'), pg_catalog.hashtext(v_key));

  SELECT sp.id, sp.post_id INTO v_existing_puzzle_id, v_existing_post_id
    FROM public.social_puzzles sp
   WHERE sp.puzzle_key = v_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'puzzle_id', v_existing_puzzle_id,
      'post_id', v_existing_post_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.social_posts existing_post
     WHERE existing_post.metadata ->> 'publication_key' = v_key) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format('publication key %s is already carried by a post that is not a puzzle', v_key),
      CONSTRAINT = 'uq_social_posts_metadata_publication_key';
  END IF;

  v_puzzle_id := gen_random_uuid();
  v_reveal_at := v_published_at + make_interval(hours => p_reveal_hours);
  v_commitment := encode(sha256(convert_to(v_key || ':' || v_correct || ':' || v_salt, 'UTF8')), 'hex');

  INSERT INTO public.social_posts (
    author_id, content, content_type, visibility, topic, metadata
  ) VALUES (
    p_author_id,
    v_prompt,
    'text',
    'public',
    'poker',
    v_metadata || jsonb_build_object(
      'scheduler', 'phase7',
      'phase7_mode', 'puzzle_' || v_kind,
      'publication_key', v_key,
      'puzzle', jsonb_build_object(
        'id', v_puzzle_id,
        'kind', v_kind,
        'reveal_at', v_reveal_at,
        'options', p_options,
        'rewardable', p_rewardable
      )
    )
  )
  RETURNING id INTO v_post_id;

  INSERT INTO public.social_puzzles (
    id, puzzle_key, kind, author_id, post_id, hand_id, source_review_id, game_variant,
    board, prompt, options, rewardable, answer_commitment, evaluator_version,
    published_at, reveal_at
  ) VALUES (
    v_puzzle_id, v_key, v_kind, p_author_id, v_post_id, p_hand_id, p_source_review_id, v_game_variant,
    p_board, v_prompt, p_options, p_rewardable, v_commitment, v_evaluator_version,
    v_published_at, v_reveal_at
  );

  INSERT INTO public.social_puzzle_solutions (
    puzzle_id, correct_option, salt, explanation, proof
  ) VALUES (
    v_puzzle_id, v_correct, v_salt, v_explanation, COALESCE(p_proof, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'puzzle_id', v_puzzle_id,
    'post_id', v_post_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.fn_p7_publish_puzzle(
  uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_p7_publish_puzzle(
  uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb
) TO service_role;

COMMENT ON FUNCTION public.fn_p7_publish_puzzle(
  uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb
) IS
  'Service-role-only atomic Phase 7 puzzle publisher: one social_posts row (prompt, metadata.publication_key p7:<kind>:<hand_id>, metadata.puzzle), one social_puzzles row and one social_puzzle_solutions row, or nothing. Returns {"status":"created"|"duplicate","puzzle_id","post_id"}.';

-- ---------------------------------------------------------------------------
-- 6. REVEAL: comment, grade, pay once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_p7_reveal_puzzle(p_puzzle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_puzzle public.social_puzzles%ROWTYPE;
  v_solution public.social_puzzle_solutions%ROWTYPE;
  v_now timestamptz := now();
  v_live boolean;
  v_label text;
  v_comment text;
  v_tail text;
  v_comment_id uuid;
  v_answers integer := 0;
  v_correct integer := 0;
  v_paid integer := 0;
  v_refused jsonb := '{}'::jsonb;
  v_reason text;
  v_answer record;
  v_reference text;
  v_result jsonb;
  v_transaction_id uuid;
  v_profile_created_at timestamptz;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'fn_p7_reveal_puzzle requires the service role';
  END IF;

  IF p_puzzle_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'fn_p7_reveal_puzzle requires a puzzle id';
  END IF;

  -- The row lock serializes reveals of one puzzle; the second caller sees revealed_at.
  SELECT * INTO v_puzzle
    FROM public.social_puzzles sp
   WHERE sp.id = p_puzzle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('puzzle %s does not exist', p_puzzle_id);
  END IF;

  SELECT count(*)::integer,
         (count(*) FILTER (WHERE a.is_correct IS TRUE))::integer,
         (count(*) FILTER (WHERE a.reward_transaction_id IS NOT NULL))::integer
    INTO v_answers, v_correct, v_paid
    FROM public.social_puzzle_answers a
   WHERE a.puzzle_id = p_puzzle_id;

  IF v_puzzle.revealed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_revealed',
      'puzzle_id', p_puzzle_id,
      'post_id', v_puzzle.post_id,
      'answers', v_answers, 'correct', v_correct, 'paid', v_paid,
      'refused', '{}'::jsonb
    );
  END IF;

  IF v_now < v_puzzle.reveal_at THEN
    RETURN jsonb_build_object(
      'status', 'not_due',
      'puzzle_id', p_puzzle_id,
      'post_id', v_puzzle.post_id,
      'reveal_at', v_puzzle.reveal_at,
      'answers', v_answers, 'correct', 0, 'paid', 0,
      'refused', '{}'::jsonb
    );
  END IF;

  SELECT * INTO v_solution
    FROM public.social_puzzle_solutions s
   WHERE s.puzzle_id = p_puzzle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('puzzle %s has no solution row', p_puzzle_id),
      CONSTRAINT = 'p7_solution_exists';
  END IF;

  SELECT o ->> 'label' INTO v_label
    FROM jsonb_array_elements(v_puzzle.options) o
   WHERE o ->> 'key' = v_solution.correct_option;

  IF v_label IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('puzzle %s solution names an option the puzzle does not have', p_puzzle_id),
      CONSTRAINT = 'p7_solution_option_known';
  END IF;

  -- Fail closed on any tampering: the stored solution must match the public commitment.
  IF v_puzzle.answer_commitment
     <> encode(sha256(convert_to(v_puzzle.puzzle_key || ':' || v_solution.correct_option || ':' || v_solution.salt, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('puzzle %s solution does not match its answer commitment', p_puzzle_id),
      CONSTRAINT = 'p7_commitment_matches';
  END IF;

  -- Grade every answer first; a graded row is a fact whatever happens to the post.
  UPDATE public.social_puzzle_answers a
     SET is_correct = (a.option = v_solution.correct_option)
   WHERE a.puzzle_id = p_puzzle_id;

  SELECT count(*)::integer, (count(*) FILTER (WHERE a.is_correct IS TRUE))::integer
    INTO v_answers, v_correct
    FROM public.social_puzzle_answers a
   WHERE a.puzzle_id = p_puzzle_id;

  -- Liveness as the horses read it (HorseSocialEngine postLiveness).
  v_live := NULL;
  IF v_puzzle.post_id IS NOT NULL THEN
    SELECT (COALESCE(sp.is_deleted, false) = false
            AND sp.visibility = 'public'
            AND COALESCE(sp.is_flagged, false) = false)
      INTO v_live
      FROM public.social_posts sp
     WHERE sp.id = v_puzzle.post_id;
  END IF;

  IF v_live IS DISTINCT FROM true THEN
    UPDATE public.social_puzzles sp
       SET revealed_at = v_now,
           correct_option = v_solution.correct_option,
           explanation = v_solution.explanation,
           closed_reason = 'post_gone'
     WHERE sp.id = p_puzzle_id;

    RETURN jsonb_build_object(
      'status', 'closed_post_gone',
      'puzzle_id', p_puzzle_id,
      'post_id', v_puzzle.post_id,
      'answers', v_answers, 'correct', v_correct, 'paid', 0,
      'refused', CASE WHEN v_correct > 0 THEN jsonb_build_object('post_gone', v_correct) ELSE '{}'::jsonb END
    );
  END IF;

  -- The reveal comment: explanation, the answer, then the key that opens the commitment.
  v_tail := E'\n\n' || 'Answer ' || v_solution.correct_option || ': ' || v_label || '.'
            || E'\n' || 'answer key ' || v_solution.salt;
  v_comment := v_solution.explanation || v_tail;
  IF char_length(v_comment) > 500 THEN
    v_comment := rtrim(left(v_solution.explanation, 500 - char_length(v_tail))) || v_tail;
  END IF;

  INSERT INTO public.social_comments (post_id, author_id, content)
  VALUES (v_puzzle.post_id, v_puzzle.author_id, v_comment)
  RETURNING id INTO v_comment_id;

  -- Pay each correct answer once. The reference is unique in the ledger, so a
  -- retry of a committed payment is refused as 'duplicate' inside award_diamonds_v2.
  FOR v_answer IN
    SELECT a.id, a.user_id
      FROM public.social_puzzle_answers a
     WHERE a.puzzle_id = p_puzzle_id
       AND a.is_correct IS TRUE
     ORDER BY a.created_at ASC, a.id ASC
  LOOP
    v_reference := 'social_puzzle_' || v_answer.user_id::text || '_' || p_puzzle_id::text;
    v_transaction_id := NULL;

    IF v_puzzle.rewardable IS NOT TRUE THEN
      v_result := jsonb_build_object('success', false, 'awarded', 0, 'reason', 'not_rewardable', 'source', 'fn_p7_reveal_puzzle');
    ELSE
      SELECT pr.created_at INTO v_profile_created_at
        FROM public.profiles pr
       WHERE pr.id = v_answer.user_id;

      IF v_profile_created_at IS NULL THEN
        v_result := jsonb_build_object('success', false, 'awarded', 0, 'reason', 'profile_not_found', 'source', 'fn_p7_reveal_puzzle');
      ELSIF (v_now - v_profile_created_at) < interval '24 hours' THEN
        v_result := jsonb_build_object('success', false, 'awarded', 0, 'reason', 'account_too_new', 'source', 'fn_p7_reveal_puzzle');
      ELSE
        BEGIN
          v_result := public.award_diamonds_v2(
            v_answer.user_id,
            'social_post',
            v_reference,
            p_puzzle_id::text,
            jsonb_build_object('source', 'p7_puzzle_reveal', 'puzzle_id', p_puzzle_id, 'answer_id', v_answer.id)
          );
        EXCEPTION WHEN OTHERS THEN
          -- One refused ledger write must not hold every other answer hostage;
          -- the reason is stored on the row and reported, and nothing was paid.
          v_result := jsonb_build_object(
            'success', false, 'awarded', 0, 'reason', 'error',
            'sqlstate', SQLSTATE, 'message', left(SQLERRM, 200), 'source', 'fn_p7_reveal_puzzle');
        END;
      END IF;

      IF COALESCE((v_result ->> 'success')::boolean, false) THEN
        SELECT t.id INTO v_transaction_id
          FROM public.diamond_transactions t
         WHERE t.user_id = v_answer.user_id
           AND t.reference_id = v_reference
         ORDER BY t.created_at DESC
         LIMIT 1;
      END IF;
    END IF;

    UPDATE public.social_puzzle_answers a
       SET reward_reference = v_reference,
           reward_result = v_result,
           reward_transaction_id = v_transaction_id
     WHERE a.id = v_answer.id;

    IF v_transaction_id IS NOT NULL THEN
      v_paid := v_paid + 1;
    ELSE
      v_reason := CASE
        WHEN COALESCE((v_result ->> 'success')::boolean, false) THEN 'transaction_missing'
        ELSE COALESCE(NULLIF(btrim(v_result ->> 'reason'), ''), 'unknown')
      END;
      v_refused := jsonb_set(v_refused, ARRAY[v_reason], to_jsonb(COALESCE((v_refused ->> v_reason)::integer, 0) + 1), true);
    END IF;
  END LOOP;

  UPDATE public.social_puzzles sp
     SET revealed_at = v_now,
         correct_option = v_solution.correct_option,
         explanation = v_solution.explanation,
         closed_reason = 'revealed',
         reveal_comment_id = v_comment_id
   WHERE sp.id = p_puzzle_id;

  RETURN jsonb_build_object(
    'status', 'revealed',
    'puzzle_id', p_puzzle_id,
    'post_id', v_puzzle.post_id,
    'comment_id', v_comment_id,
    'answers', v_answers, 'correct', v_correct, 'paid', v_paid,
    'refused', v_refused
  );
END
$function$;

REVOKE ALL ON FUNCTION public.fn_p7_reveal_puzzle(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_p7_reveal_puzzle(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_p7_reveal_puzzle(uuid) IS
  'Service-role-only Phase 7 reveal: locks the puzzle, returns not_due / already_revealed / closed_post_gone without side effects beyond grading, otherwise writes the reveal comment as the horse, grades every answer, pays correct answers of rewardable puzzles once through award_diamonds_v2 (reference social_puzzle_<user>_<puzzle>) after the 24-hour profile-age gate, and sets revealed_at.';

-- ---------------------------------------------------------------------------
-- 7. MODE ROWS: every Phase 7 publishing way starts OFF. ON CONFLICT DO NOTHING
--    preserves any later explicit approval.
-- ---------------------------------------------------------------------------
INSERT INTO public.horse_post_modes (mode, enabled, description)
VALUES
  ('puzzle_nuts', false, 'Phase 7 puzzle: what is the nuts on this five-card board, from the horse''s own hand, answered once per player and revealed and paid once after six hours'),
  ('puzzle_pot_odds', false, 'Phase 7 puzzle: the price the horse was getting on the river bet it faced in its own hand, revealed and paid once after six hours'),
  ('puzzle_what_would_you_do', false, 'Phase 7 puzzle: what the horse did on the river in its own hand, revealed after six hours, no diamonds'),
  ('human_thread', false, 'Phase 7 story: a discussion opener in player voice, no answer key and no diamonds'),
  ('throwback_hand', false, 'Phase 7 story: the horse retells one of its own hands that is at least three weeks old'),
  ('rail_human', false, 'Phase 7 story: the horse rails a human who opted in at its tournament table, naming nobody'),
  ('live_tournament_story', false, 'Phase 7 story: the horse reports its own seat in a running tournament from the tournament rows')
ON CONFLICT (mode) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     AND c.relname IN ('social_puzzles', 'social_puzzle_solutions', 'social_puzzle_answers');
  IF n <> 3 THEN RAISE EXCEPTION 'post-apply: expected 3 puzzle tables with RLS enabled, found %', n; END IF;

  -- The solution table is unreadable outside the service role: no anon or
  -- authenticated policy and no table privilege.
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'public.social_puzzle_solutions'::regclass
     AND (polroles = '{0}'::oid[]
          OR polroles && ARRAY(SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')));
  IF n <> 0 THEN RAISE EXCEPTION 'post-apply: social_puzzle_solutions has % policies for anon or authenticated', n; END IF;
  IF has_table_privilege('anon', 'public.social_puzzle_solutions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.social_puzzle_solutions', 'SELECT') THEN
    RAISE EXCEPTION 'post-apply: anon or authenticated can select social_puzzle_solutions';
  END IF;

  SELECT count(*) INTO n FROM pg_policy WHERE polrelid = 'public.social_puzzles'::regclass;
  IF n <> 2 THEN RAISE EXCEPTION 'post-apply: expected 2 policies on social_puzzles, found %', n; END IF;
  SELECT count(*) INTO n FROM pg_policy WHERE polrelid = 'public.social_puzzle_answers'::regclass;
  IF n <> 3 THEN RAISE EXCEPTION 'post-apply: expected 3 policies on social_puzzle_answers, found %', n; END IF;
  IF has_table_privilege('anon', 'public.social_puzzle_answers', 'INSERT')
     OR has_table_privilege('authenticated', 'public.social_puzzle_answers', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.social_puzzle_answers', 'DELETE')
     OR has_table_privilege('authenticated', 'public.social_puzzles', 'INSERT') THEN
    RAISE EXCEPTION 'post-apply: a user role holds a write privilege it must not have';
  END IF;

  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.social_puzzle_answers'::regclass AND tgname = 'trg_p7_answer_guard' AND NOT tgisinternal;
  IF n <> 1 THEN RAISE EXCEPTION 'post-apply: trg_p7_answer_guard not found'; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname IN ('fn_p7_publish_puzzle', 'fn_p7_reveal_puzzle') AND p.prosecdef;
  IF n <> 2 THEN RAISE EXCEPTION 'post-apply: expected exactly 2 SECURITY DEFINER fn_p7 rpcs, found %', n; END IF;

  IF has_function_privilege('anon', 'public.fn_p7_reveal_puzzle(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_p7_reveal_puzzle(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_p7_reveal_puzzle(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_p7_reveal_puzzle execute privileges are wrong';
  END IF;
  IF has_function_privilege('anon', 'public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_p7_publish_puzzle execute privileges are wrong';
  END IF;

  -- The commitment the database computes is the one the workers compute
  -- (node:crypto sha256 hex of puzzle_key:option:salt).
  IF encode(sha256(convert_to('p7:nuts:00000000-0000-0000-0000-000000000000' || ':' || 'B' || ':' || '00', 'UTF8')), 'hex')
     <> '8b6ee03bcf81a5629e2158a0113412e65ddd68bb7f1006e5d5ec60c55c8ec3c0' THEN
    RAISE EXCEPTION 'post-apply: the commitment formula does not match the workers vector';
  END IF;

  SELECT count(*) INTO n FROM public.horse_post_modes
   WHERE mode IN ('puzzle_nuts', 'puzzle_pot_odds', 'puzzle_what_would_you_do', 'human_thread',
                  'throwback_hand', 'rail_human', 'live_tournament_story');
  IF n <> 7 THEN RAISE EXCEPTION 'post-apply: expected the 7 Phase 7 mode rows, found %', n; END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: drops exactly what this file created and
-- deletes exactly the seven mode rows it inserted)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_p7_answer_guard ON public.social_puzzle_answers;
-- DROP FUNCTION IF EXISTS public.fn_p7_answer_guard();
-- DROP FUNCTION IF EXISTS public.fn_p7_reveal_puzzle(uuid);
-- DROP FUNCTION IF EXISTS public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb);
-- DROP TABLE IF EXISTS public.social_puzzle_answers;
-- DROP TABLE IF EXISTS public.social_puzzle_solutions;
-- DROP TABLE IF EXISTS public.social_puzzles;
-- DELETE FROM public.horse_post_modes
--  WHERE mode IN ('puzzle_nuts', 'puzzle_pot_odds', 'puzzle_what_would_you_do', 'human_thread',
--                 'throwback_hand', 'rail_human', 'live_tournament_story');
-- COMMIT;
