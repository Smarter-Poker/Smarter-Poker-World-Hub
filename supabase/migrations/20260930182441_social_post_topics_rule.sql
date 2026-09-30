-- ═══════════════════════════════════════════════════════════════════════
-- 20260930170100_social_post_topics_rule.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (two new pure/trigger functions, one BEFORE ROW trigger on the
--              live social_posts table, one CREATE OR REPLACE of an installed
--              service-role RPC whose body changes by one INSERT column)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p8-data),
--              Fleet Content Programme Phase 8 "Discovery and the feed"
-- AFFECTS:     new function: public.fn_social_post_topics(text, text[], text, text, jsonb)
--              new function: public.fn_social_posts_derive_topics() (trigger)
--              new trigger:  trg_social_posts_zz_derive_topics on public.social_posts
--                BEFORE INSERT OR UPDATE OF topic, topics, content, metadata, content_type
--              replaced rpc: public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text,
--                jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb)
--                (identical body; its social_posts INSERT gains
--                topics = ARRAY[poker, hand, puzzle])
--              rows: none (existing rows are backfilled by 20260930170200)
--              untouched: publish_horse_video_reel, publish_video_library_reel,
--                publish_user_video_reel, fn_infer_video_topic,
--                trg_social_posts_video_contract_defaults, the CHECK
--                social_posts_topic_check, content_settings, horse_post_modes
-- IRREVERSIBLE: no (the ROLLBACK block at the end drops the trigger and the two
--              functions; fn_p7_publish_puzzle is restored by re-running the
--              CREATE OR REPLACE FUNCTION block of 20260930052057)
--
-- WHY:
--   social_posts.topic (CHECK unknown|poker|cash|tournament|slots|sports|other)
--   is the single primary domain of a post and social_posts.topics (text[]) is
--   the primary plus zero or more facets (cash, tournament, hand, session,
--   puzzle, story, news, club, local, strategy). Today only the three video
--   RPCs fill topics; every text and link writer (human composer, fleet text,
--   fleet news, Phase 6, Phase 7, news scraper, auto-post, shares) leaves it
--   NULL, so the feed cannot offer a Hands tab or a topic filter. Twelve
--   writers in two repositories cannot each be taught the rule; one derivation
--   function and one BEFORE trigger make every writer, present and future,
--   correct by default, and the backfill (20260930170200) runs the same
--   function over the existing rows.
--
-- HOW:
--   - fn_social_post_topics(p_topic, p_topics, p_content_type, p_content,
--     p_metadata) RETURNS text[] IMMUTABLE, never raises: the primary comes
--     from p_topic (cash and tournament become a facet under poker; anything
--     outside the CHECK list becomes unknown), then from p_topics when still
--     unknown (poker|cash|tournament -> poker, slots -> slots, sports ->
--     sports, the fn_infer_video_topic order); facets come from the supplied
--     topics, metadata (grounded_type, puzzle, phase7_mode, phase6_mode,
--     news_box, news_type, source, video_type, shared_reel_topic), the content
--     ([[sp-card:Xy]] tokens mean a real hand) and content_type
--     (tournament_tip, article and the strategy family); an unknown primary
--     with any poker facet becomes poker; the result is [primary, facets...],
--     distinct, lower-case, at most 4 elements, element 1 always the primary.
--   - fn_social_posts_derive_topics(): NEW.topics := fn_social_post_topics(...);
--     NEW.topic := NEW.topics[1].
--   - trg_social_posts_zz_derive_topics: BEFORE INSERT OR UPDATE OF topic,
--     topics, content, metadata, content_type. Postgres fires BEFORE ROW
--     triggers in name order, so the zz prefix runs it after
--     trg_social_posts_video_contract_defaults (which sets topic for video
--     rows) and the derive step only adds facets and fills topics.
--   - fn_p7_publish_puzzle: the installed body (pg_get_functiondef, md5 of
--     prosrc 3fd6a04d4d5652e486e005846a201ad3) with topics =
--     ARRAY[poker, hand, puzzle] added to its social_posts INSERT and
--     nothing else changed; the pre-flight refuses to replace any other body.
--   - Horses are players: nothing here reads is_horse, origin_type or
--     metadata.scheduler; a topic is derived from what the post carries.
--
-- EVIDENCE (production kuklfnapbkmacvwxktbh, 2026-09-30, SELECT only):
--   social_posts.topic text NOT NULL DEFAULT unknown with CHECK
--   social_posts_topic_check (unknown, poker, cash, tournament, slots, sports,
--   other); social_posts.topics text[] NULL, no default, no index.
--   BEFORE ROW triggers on social_posts today: tr_queue_video_transcode,
--   trg_social_posts_legacy_transition_marker_guard,
--   trg_social_posts_managed_lineage_guard, trg_social_posts_managed_provenance_guard,
--   trg_social_posts_managed_visibility_guard, trg_social_posts_video_contract_defaults
--   (UPDATE OF ... topics ... topic ...), trg_social_posts_zz_video_library_official_author;
--   no trigger derives topics. fn_infer_video_topic(jsonb, text[]) is IMMUTABLE
--   with EXECUTE for anon, authenticated and service_role;
--   fn_social_posts_video_contract_defaults has EXECUTE for service_role only
--   and still fires for every writer (trigger execution does not check EXECUTE),
--   which is the grant pattern used here. fn_p7_publish_puzzle inserts
--   author_id, content, content_type, visibility, topic, metadata with topic
--   poker and no topics. Distribution: 6,200 rows, topics NULL on 3,941;
--   {poker,cash} 1,176, {slots} 688, {poker,tournament} 246, {poker} 127,
--   {sports} 22 (all from the video RPCs, never more than two values).
--   Design: agent-evidence/fleet-p6-closeout-20260920/agents/p8-research/design.md
--   sections 1.5, 1.6, 7.4 and 9.
-- ═══════════════════════════════════════════════════════════════════════

-- CREATE TRIGGER takes a share-row-exclusive lock on social_posts, a table the
-- engine writes every second; a bounded wait turns a busy moment into a clean,
-- retryable failure instead of a queue behind a long transaction.
SET lock_timeout = '10s';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT: everything this file depends on exists, nothing it creates does.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
  v_body_md5 text;
  n int;
BEGIN
  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
    INTO v_missing
    FROM (VALUES ('id'), ('author_id'), ('content'), ('content_type'),
                 ('metadata'), ('topic'), ('topics')) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'social_posts'
        AND c.column_name = required.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: social_posts columns missing: %', v_missing;
  END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.social_posts'::regclass
     AND conname = 'social_posts_topic_check'
     AND contype = 'c';
  IF n <> 1 THEN
    RAISE EXCEPTION 'pre-flight failed: CHECK social_posts_topic_check is missing (20260906235959)';
  END IF;

  IF to_regprocedure('public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.fn_p7_publish_puzzle is missing (20260930052057)';
  END IF;

  -- The replacement below carries the installed body plus one INSERT column.
  -- A different installed body means someone changed the RPC after this file
  -- was written; refuse rather than silently undo their change.
  SELECT md5(p.prosrc) INTO v_body_md5
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb)');
  IF v_body_md5 IS DISTINCT FROM '3fd6a04d4d5652e486e005846a201ad3' THEN
    RAISE EXCEPTION 'pre-flight failed: fn_p7_publish_puzzle body is % (expected 3fd6a04d4d5652e486e005846a201ad3); re-derive the replacement from pg_get_functiondef before applying', v_body_md5;
  END IF;

  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.social_posts'::regclass
     AND tgname = 'trg_social_posts_zz_derive_topics'
     AND NOT tgisinternal;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: trg_social_posts_zz_derive_topics already exists';
  END IF;

  IF to_regprocedure('public.fn_social_post_topics(text, text[], text, text, jsonb)') IS NOT NULL
     OR to_regprocedure('public.fn_social_posts_derive_topics()') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: a fn_social_post_topics or fn_social_posts_derive_topics function already exists';
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. THE ONE RULE: fn_social_post_topics (pure, IMMUTABLE, never raises)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_social_post_topics(
  p_topic text,
  p_topics text[],
  p_content_type text,
  p_content text,
  p_metadata jsonb
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
DECLARE
  v_primary text := lower(btrim(COALESCE(p_topic, '')));
  v_content_type text := lower(btrim(COALESCE(p_content_type, '')));
  v_meta jsonb := CASE WHEN jsonb_typeof(p_metadata) = 'object' THEN p_metadata ELSE '{}'::jsonb END;
  v_supplied text[] := ARRAY(
    SELECT lower(btrim(s.value))
      FROM unnest(COALESCE(p_topics, ARRAY[]::text[])) AS s(value)
     WHERE s.value IS NOT NULL);
  v_facets text[] := ARRAY[]::text[];
  v_grounded_type text;
  v_phase7_mode text;
  v_phase6_mode text;
  v_news_box text;
  v_news_type text;
  v_source text;
  v_video_type text;
  v_shared_reel_topic text;
  v_out text[];
BEGIN
  -- Step 1: the primary comes from p_topic. cash and tournament are format
  -- facets under poker; a value outside the CHECK list is unknown, never an error.
  IF v_primary IN ('cash', 'tournament') THEN
    v_facets := v_facets || v_primary;
    v_primary := 'poker';
  ELSIF v_primary NOT IN ('unknown', 'poker', 'slots', 'sports', 'other') THEN
    v_primary := 'unknown';
  END IF;

  -- Step 2: an unknown primary takes the domain of the supplied topics, in the
  -- order fn_infer_video_topic uses. Supplied facets are kept (the video RPCs
  -- already write {poker,cash}; the workers pass what they know).
  IF v_primary = 'unknown' THEN
    IF v_supplied && ARRAY['poker', 'cash', 'tournament'] THEN
      v_primary := 'poker';
    ELSIF v_supplied && ARRAY['slots'] THEN
      v_primary := 'slots';
    ELSIF v_supplied && ARRAY['sports'] THEN
      v_primary := 'sports';
    END IF;
  END IF;
  v_facets := v_facets || ARRAY(
    SELECT s.value FROM unnest(v_supplied) AS s(value)
     WHERE s.value IN ('cash', 'tournament', 'hand', 'session', 'puzzle', 'story',
                       'news', 'club', 'local', 'strategy'));

  -- Step 3: facets from metadata (what the writer recorded about the post).
  v_grounded_type := lower(btrim(COALESCE(v_meta ->> 'grounded_type', '')));
  v_phase7_mode := lower(btrim(COALESCE(v_meta ->> 'phase7_mode', '')));
  v_phase6_mode := lower(btrim(COALESCE(v_meta ->> 'phase6_mode', '')));
  v_news_box := btrim(COALESCE(v_meta ->> 'news_box', ''));
  v_news_type := btrim(COALESCE(v_meta ->> 'news_type', ''));
  v_source := lower(btrim(COALESCE(v_meta ->> 'source', '')));
  v_video_type := lower(btrim(COALESCE(v_meta ->> 'video_type', '')));
  v_shared_reel_topic := lower(btrim(COALESCE(v_meta ->> 'shared_reel_topic', '')));

  IF v_grounded_type = 'hand' THEN
    v_facets := array_append(v_facets, 'hand'::text);
  ELSIF v_grounded_type = 'session' THEN
    v_facets := array_append(v_facets, 'session'::text);
  END IF;
  IF v_meta ? 'puzzle' OR v_phase7_mode LIKE 'puzzle\_%' THEN
    v_facets := v_facets || ARRAY['hand', 'puzzle'];
  END IF;
  IF v_phase7_mode LIKE 'story\_%' THEN
    v_facets := array_append(v_facets, 'story'::text);
  END IF;
  IF v_phase6_mode = 'club_data_digest' THEN
    v_facets := array_append(v_facets, 'club'::text);
  END IF;
  IF v_phase6_mode IN ('local_event', 'seasonal_local') THEN
    v_facets := array_append(v_facets, 'local'::text);
  END IF;
  IF v_news_box <> '' OR v_news_type <> '' OR v_content_type = 'news' THEN
    v_facets := array_append(v_facets, 'news'::text);
  END IF;
  IF v_news_box IN ('2', '4') THEN
    v_facets := array_append(v_facets, 'tournament'::text);
  END IF;
  IF v_source = 'social_page_post' THEN
    v_facets := array_append(v_facets, 'club'::text);
  END IF;
  IF v_video_type IN ('cash', 'tournament') THEN
    v_facets := v_facets || v_video_type;
  END IF;
  IF v_primary = 'unknown' THEN
    IF v_shared_reel_topic IN ('poker', 'slots', 'sports', 'other') THEN
      v_primary := v_shared_reel_topic;
    ELSIF v_shared_reel_topic IN ('cash', 'tournament') THEN
      v_primary := 'poker';
      v_facets := v_facets || v_shared_reel_topic;
    END IF;
  END IF;

  -- Step 4: facets from the content: a card token means the post carries a real hand.
  IF p_content ~ '\[\[sp-card:[2-9TJQKA][cdhs]\]\]' THEN
    v_facets := array_append(v_facets, 'hand'::text);
  END IF;

  -- Step 5: facets from content_type (the legacy strategy family).
  IF v_content_type = 'tournament_tip' THEN
    v_facets := v_facets || ARRAY['tournament', 'strategy'];
  ELSIF v_content_type IN ('article', 'gto_concept', 'poker_math', 'hand_reading', 'quick_tip', 'strategy_tip') THEN
    v_facets := array_append(v_facets, 'strategy'::text);
  END IF;

  -- Step 6: every facet above is a poker facet on this platform.
  IF v_primary = 'unknown' AND cardinality(v_facets) > 0 THEN
    v_primary := 'poker';
  END IF;

  -- Step 7: the primary first, then the distinct facets in a fixed order, at most 4 elements.
  v_out := ARRAY[v_primary] || ARRAY(
    SELECT f.name
      FROM unnest(ARRAY['cash', 'tournament', 'hand', 'session', 'puzzle', 'story',
                        'news', 'club', 'local', 'strategy']) WITH ORDINALITY AS f(name, ord)
     WHERE f.name = ANY (v_facets)
     ORDER BY f.ord);
  RETURN v_out[1:4];
EXCEPTION WHEN OTHERS THEN
  -- A derivation must never fail a write. Nothing above can fail on text and
  -- jsonb inputs, and if something ever does the row keeps a legal primary.
  RETURN ARRAY['unknown']::text[];
END
$function$;

COMMENT ON FUNCTION public.fn_social_post_topics(text, text[], text, text, jsonb) IS
  'Phase 8 topics rule: [primary, facets...] for a social post from its topic, supplied topics, content_type, content and metadata. Pure, never raises; element 1 is always a legal social_posts.topic value.';

GRANT EXECUTE ON FUNCTION public.fn_social_post_topics(text, text[], text, text, jsonb)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. THE TRIGGER: every insert and every relevant update derives topics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_social_posts_derive_topics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.topics := public.fn_social_post_topics(NEW.topic, NEW.topics, NEW.content_type, NEW.content, NEW.metadata);
  NEW.topic := NEW.topics[1];
  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.fn_social_posts_derive_topics() IS
  'BEFORE ROW trigger body for social_posts: topics := fn_social_post_topics(...), topic := topics[1]. Never raises.';

-- Same grant shape as fn_social_posts_video_contract_defaults: a trigger runs for
-- every writer regardless of EXECUTE, and nobody calls this through the API.
REVOKE ALL ON FUNCTION public.fn_social_posts_derive_topics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_social_posts_derive_topics() TO service_role;

-- The zz prefix orders this trigger after trg_social_posts_video_contract_defaults
-- (BEFORE ROW triggers fire in name order), so a video row arrives here with the
-- topic that trigger inferred and only gains facets and a filled topics array.
CREATE TRIGGER trg_social_posts_zz_derive_topics
  BEFORE INSERT OR UPDATE OF topic, topics, content, metadata, content_type
  ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_social_posts_derive_topics();

-- ---------------------------------------------------------------------------
-- 4. fn_p7_publish_puzzle: the installed body plus topics on its INSERT
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

  -- The answer never reaches a public row before the reveal. The label test
  -- applies to the puzzles with a deterministic, rewarded answer (nuts, pot
  -- odds), whose labels name a hand or a price; a "what would you do" puzzle
  -- has ordinary poker verbs for options (Fold, Call, Bet) that a prompt can
  -- legitimately contain ("it is 2007 to call"), and it pays nothing.
  IF p_rewardable AND position(lower(v_correct_label) IN lower(v_prompt)) > 0 THEN
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
     OR (p_rewardable AND position(lower(v_correct_label) IN lower(v_metadata::text)) > 0) THEN
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
    author_id, content, content_type, visibility, topic, topics, metadata
  ) VALUES (
    p_author_id,
    v_prompt,
    'text',
    'public',
    'poker',
    ARRAY['poker', 'hand', 'puzzle']::text[],
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

-- ---------------------------------------------------------------------------
-- 5. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  n int;
  v_topics text[];
  v_src text;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.social_posts'::regclass
     AND tgname = 'trg_social_posts_zz_derive_topics'
     AND NOT tgisinternal
     AND tgtype = 23;  -- ROW (1) + BEFORE (2) + INSERT (4) + UPDATE (16)
  IF n <> 1 THEN RAISE EXCEPTION 'post-apply: trg_social_posts_zz_derive_topics (BEFORE ROW INSERT OR UPDATE) not found'; END IF;

  -- BEFORE ROW triggers fire in name order: the derive step must follow the video contract.
  IF NOT ('trg_social_posts_zz_derive_topics' > 'trg_social_posts_video_contract_defaults' COLLATE "C") THEN
    RAISE EXCEPTION 'post-apply: the derive trigger would fire before trg_social_posts_video_contract_defaults';
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_social_post_topics' AND p.provolatile = 'i';
  IF n <> 1 THEN RAISE EXCEPTION 'post-apply: fn_social_post_topics must be IMMUTABLE'; END IF;

  v_topics := public.fn_social_post_topics('unknown', NULL, 'text', 'Board [[sp-card:Ac]]', '{}'::jsonb);
  IF v_topics IS DISTINCT FROM ARRAY['poker', 'hand']::text[] THEN
    RAISE EXCEPTION 'post-apply: a card token must derive {poker,hand}, got %', v_topics;
  END IF;

  v_topics := public.fn_social_post_topics('bogus', NULL, NULL, NULL, NULL);
  IF v_topics IS DISTINCT FROM ARRAY['unknown']::text[] THEN
    RAISE EXCEPTION 'post-apply: a value outside the CHECK must derive {unknown}, got %', v_topics;
  END IF;

  v_topics := public.fn_social_post_topics('poker', ARRAY['poker', 'cash'], 'video', 'clip', '{"video_type":"cash"}'::jsonb);
  IF v_topics IS DISTINCT FROM ARRAY['poker', 'cash']::text[] THEN
    RAISE EXCEPTION 'post-apply: a video library row must keep {poker,cash}, got %', v_topics;
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.fn_p7_publish_puzzle(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb)');
  IF v_src IS NULL
     OR position('author_id, content, content_type, visibility, topic, topics, metadata' IN v_src) = 0
     OR position($q$ARRAY['poker', 'hand', 'puzzle']::text[]$q$ IN v_src) = 0 THEN
    RAISE EXCEPTION 'post-apply: fn_p7_publish_puzzle does not insert topics = {poker,hand,puzzle}';
  END IF;

  IF has_function_privilege('anon', 'public.fn_social_posts_derive_topics()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_social_posts_derive_topics()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_social_posts_derive_topics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_social_posts_derive_topics execute privileges are wrong';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_social_post_topics(text, text[], text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_social_post_topics must stay executable by every writer role';
  END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: drops exactly what this file created;
-- fn_p7_publish_puzzle goes back to its previous body by re-running the
-- CREATE OR REPLACE FUNCTION block of
-- 20260930052057_phase7_puzzles_answer_once_and_reveal_once.sql)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_social_posts_zz_derive_topics ON public.social_posts;
-- DROP FUNCTION IF EXISTS public.fn_social_posts_derive_topics();
-- DROP FUNCTION IF EXISTS public.fn_social_post_topics(text, text[], text, text, jsonb);
-- COMMIT;
