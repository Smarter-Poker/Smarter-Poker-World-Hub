-- ═══════════════════════════════════════════════════════════════════════
-- 20261123191000_fleet_content_cleanup_and_topics_sync.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (replaces pure IMMUTABLE function fn_social_post_topics to
--              match src/lib/socialTopics.js Phase 7 story modes, deactivates
--              non-poker slots supply rows and dead Poker.org HTML RSS row,
--              and normalizes 132 collision-free horse usernames with spaces)
-- AUTHOR:      Antigravity Fleet Content Programme closeout (2026-11-23)
-- AFFECTS:     replaced function: public.fn_social_post_topics(text, text[], text, text, jsonb)
--              rows updated:
--                - public.content_sources: 7 active category='slots' channels -> is_active=false
--                - public.content_sources: 1 dead HTML-homepage 'Poker.org' rss row -> is_active=false
--                - public.poker_clips: active category='slots' rows -> is_active=false
--                - public.profiles: active horse usernames containing spaces -> lowercase underscore handles (collision-guarded)
--              untouched: horse_post_modes, content_settings, caption_model_budget_settings,
--                trg_social_posts_zz_derive_topics, social_posts_topic_check
-- IRREVERSIBLE: no (fn_social_post_topics can be restored from 20260930182441;
--              is_active flags can be flipped back; spaced usernames are deterministic)
--
-- WHY:
--   1. public.fn_social_post_topics checked `v_phase7_mode LIKE 'story\_%'`,
--      which matched none of the real Phase 7 story modes
--      (live_tournament_story, throwback_hand, human_thread, rail_human).
--      src/lib/socialTopics.js was updated in PR #2910; this syncs the SQL
--      trigger function to exact parity so live_tournament_story derives
--      {poker,tournament,story} and the other three derive {poker,story}.
--   2. Seven slots YouTube channels in content_sources and 1,147 active slots
--      rows in poker_clips remained active in the database despite code-level
--      exclusions (PR #217). Deactivating them keeps raw SQL metrics and
--      supply tables clean.
--   3. Poker.org in content_sources points to https://www.poker.org/ (Next.js
--      HTML homepage; /feed/, /rss/, /news/rss/ return 404 and /rss.xml returns
--      403). Deactivating it stops recurring feed-parse errors.
--   4. 132 horse profiles carried spaces in profiles.username, preventing valid
--      @handle mentions. All 132 normalize cleanly with zero collisions.
--
-- HOW:
--   - Single transaction with pre-flight verification of fn_social_post_topics.
--   - CREATE OR REPLACE FUNCTION public.fn_social_post_topics keeping exact
--     signature, IMMUTABLE PARALLEL SAFE, SET search_path = 'public', and
--     EXECUTE grants for anon, authenticated, service_role.
--   - Idempotent UPDATE statements guarded by explicit WHERE predicates.
--   - Post-apply assertions verify IMMUTABLE volatility, grants, Phase 7 story
--     derivation, zero active slots sources/clips, and zero spaced horse handles.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT
DO $$
BEGIN
  IF to_regprocedure('public.fn_social_post_topics(text, text[], text, text, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.fn_social_post_topics(text, text[], text, text, jsonb) does not exist';
  END IF;
END
$$;

-- 2. SYNC fn_social_post_topics WITH src/lib/socialTopics.js (PR #2910)
CREATE OR REPLACE FUNCTION public.fn_social_post_topics(
  p_topic text,
  p_topics text[],
  p_content_type text,
  p_content text,
  p_metadata jsonb
)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
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
  v_declared_topic text;
  v_clip_type text;
  v_out text[];
BEGIN
  -- Step 1: primary from p_topic.
  IF v_primary IN ('cash', 'tournament') THEN
    v_facets := v_facets || v_primary;
    v_primary := 'poker';
  ELSIF v_primary NOT IN ('unknown', 'poker', 'slots', 'sports', 'other') THEN
    v_primary := 'unknown';
  END IF;

  -- Step 2: supplied topics fill unknown primary and keep recognized facets.
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

  -- Step 3: facets from metadata.
  v_grounded_type := lower(btrim(COALESCE(v_meta ->> 'grounded_type', '')));
  v_phase7_mode := lower(btrim(COALESCE(v_meta ->> 'phase7_mode', '')));
  v_phase6_mode := lower(btrim(COALESCE(v_meta ->> 'phase6_mode', '')));
  v_news_box := btrim(COALESCE(v_meta ->> 'news_box', ''));
  v_news_type := btrim(COALESCE(v_meta ->> 'news_type', ''));
  v_source := lower(btrim(COALESCE(v_meta ->> 'source', '')));
  v_video_type := lower(btrim(COALESCE(v_meta ->> 'video_type', '')));
  v_shared_reel_topic := lower(btrim(COALESCE(v_meta ->> 'shared_reel_topic', '')));
  v_declared_topic := lower(btrim(COALESCE(v_meta ->> 'topic', '')));
  v_clip_type := lower(btrim(COALESCE(v_meta ->> 'clip_type', '')));

  IF v_grounded_type = 'hand' THEN
    v_facets := array_append(v_facets, 'hand'::text);
  ELSIF v_grounded_type = 'session' THEN
    v_facets := array_append(v_facets, 'session'::text);
  END IF;
  IF v_meta ? 'puzzle' OR v_phase7_mode LIKE 'puzzle\_%' THEN
    v_facets := v_facets || ARRAY['hand', 'puzzle'];
  END IF;
  IF v_phase7_mode LIKE 'story\_%'
     OR v_phase7_mode IN ('live_tournament_story', 'throwback_hand', 'human_thread', 'rail_human') THEN
    v_facets := array_append(v_facets, 'story'::text);
    IF v_phase7_mode = 'live_tournament_story' THEN
      v_facets := array_append(v_facets, 'tournament'::text);
    END IF;
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
  IF v_primary = 'unknown' THEN
    IF v_declared_topic IN ('poker', 'slots', 'sports', 'other') THEN
      v_primary := v_declared_topic;
    ELSIF v_declared_topic IN ('cash', 'tournament') THEN
      v_primary := 'poker';
      v_facets := v_facets || v_declared_topic;
    ELSIF v_clip_type IN ('poker', 'sports') THEN
      v_primary := v_clip_type;
    END IF;
  END IF;

  -- Step 4: facets from content.
  IF p_content ~ '\[\[sp-card:[2-9TJQKA][cdhs]\]\]' THEN
    v_facets := array_append(v_facets, 'hand'::text);
  END IF;

  -- Step 5: facets from content_type.
  IF v_content_type = 'tournament_tip' THEN
    v_facets := v_facets || ARRAY['tournament', 'strategy'];
  ELSIF v_content_type IN ('article', 'gto_concept', 'poker_math', 'hand_reading', 'quick_tip', 'strategy_tip') THEN
    v_facets := array_append(v_facets, 'strategy'::text);
  END IF;

  -- Step 6: poker facets imply poker primary when unknown.
  IF v_primary = 'unknown' AND cardinality(v_facets) > 0 THEN
    v_primary := 'poker';
  END IF;

  -- Step 7: [primary, distinct facets in fixed order], max 4 elements.
  v_out := ARRAY[v_primary] || ARRAY(
    SELECT f.name
      FROM unnest(ARRAY['cash', 'tournament', 'hand', 'session', 'puzzle', 'story',
                        'news', 'club', 'local', 'strategy']) WITH ORDINALITY AS f(name, ord)
     WHERE f.name = ANY (v_facets)
     ORDER BY f.ord);
  RETURN v_out[1:4];
EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY['unknown']::text[];
END
$function$;

COMMENT ON FUNCTION public.fn_social_post_topics(text, text[], text, text, jsonb) IS
  'Derive [primary, facets...] for social_posts. Pure IMMUTABLE mirror of src/lib/socialTopics.js including Phase 7 story modes.';

GRANT EXECUTE ON FUNCTION public.fn_social_post_topics(text, text[], text, text, jsonb)
  TO anon, authenticated, service_role;

-- 3. DEACTIVATE NON-POKER SLOTS SOURCES & CLIPS AND DEAD HTML POKER.ORG RSS ROW
UPDATE public.content_sources
   SET is_active = false
 WHERE category = 'slots'
   AND is_active = true;

UPDATE public.content_sources
   SET is_active = false
 WHERE name = 'Poker.org'
   AND kind = 'rss'
   AND feed_url = 'https://www.poker.org/'
   AND is_active = true;

UPDATE public.poker_clips
   SET is_active = false
 WHERE category = 'slots'
   AND is_active = true;

-- 4. NORMALIZE HORSE USERNAMES CONTAINING SPACES (COLLISION-GUARDED)
UPDATE public.profiles AS p
   SET username = lower(regexp_replace(btrim(p.username), '[^a-zA-Z0-9]+', '_', 'g'))
 WHERE p.is_horse = true
   AND p.username LIKE '% %'
   AND NOT EXISTS (
     SELECT 1
       FROM public.profiles AS other
      WHERE other.id <> p.id
        AND lower(other.username) = lower(regexp_replace(btrim(p.username), '[^a-zA-Z0-9]+', '_', 'g'))
   );

-- 5. POST-APPLY VERIFICATION
DO $$
DECLARE
  v_n integer;
  v_topics text[];
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p
    JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_social_post_topics' AND p.provolatile = 'i';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'post-apply: fn_social_post_topics must remain IMMUTABLE';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_social_post_topics(text, text[], text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_social_post_topics must stay executable by authenticated';
  END IF;

  v_topics := public.fn_social_post_topics('unknown', NULL, 'text', 'Live update', '{"phase7_mode":"live_tournament_story"}'::jsonb);
  IF v_topics <> ARRAY['poker', 'tournament', 'story'] THEN
    RAISE EXCEPTION 'post-apply: live_tournament_story expected {poker,tournament,story}, got %', v_topics;
  END IF;

  v_topics := public.fn_social_post_topics('unknown', NULL, 'text', 'Thread prompt', '{"phase7_mode":"human_thread"}'::jsonb);
  IF v_topics <> ARRAY['poker', 'story'] THEN
    RAISE EXCEPTION 'post-apply: human_thread expected {poker,story}, got %', v_topics;
  END IF;

  v_topics := public.fn_social_post_topics('unknown', NULL, 'text', 'Rail note', '{"phase7_mode":"rail_human"}'::jsonb);
  IF v_topics <> ARRAY['poker', 'story'] THEN
    RAISE EXCEPTION 'post-apply: rail_human expected {poker,story}, got %', v_topics;
  END IF;

  v_topics := public.fn_social_post_topics('unknown', NULL, 'text', 'Throwback', '{"phase7_mode":"throwback_hand"}'::jsonb);
  IF v_topics <> ARRAY['poker', 'story'] THEN
    RAISE EXCEPTION 'post-apply: throwback_hand expected {poker,story}, got %', v_topics;
  END IF;

  SELECT count(*) INTO v_n FROM public.content_sources WHERE category = 'slots' AND is_active = true;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'post-apply: expected 0 active slots sources, got %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.poker_clips WHERE category = 'slots' AND is_active = true;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'post-apply: expected 0 active slots clips, got %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.profiles WHERE is_horse = true AND username LIKE '% %';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'post-apply: expected 0 horse usernames with spaces, got %', v_n;
  END IF;
END
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed)
-- ═══════════════════════════════════════════════════════════════════════
-- Restore previous fn_social_post_topics body from 20260930182441_social_post_topics_rule.sql.
-- UPDATE public.content_sources SET is_active = true WHERE category = 'slots';
-- UPDATE public.poker_clips SET is_active = true WHERE category = 'slots';
