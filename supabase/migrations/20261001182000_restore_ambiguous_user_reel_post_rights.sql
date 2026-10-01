-- ============================================================================
-- 20261001182000_restore_ambiguous_user_reel_post_rights.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     one public.social_posts.rights_status value
-- IRREVERSIBLE: no
--
-- WHY:
--   The fleet topics backfill correctly normalized the final legacy SUP-07
--   source post from topics=NULL to topics={unknown}. Its UPDATE OF topics also
--   invoked the maintained video contract under the migration login, which
--   correctly demoted user_authorized to unknown. The native Reel, Storage
--   ownership, topic, identifiers, counters, and every other post byte remain
--   valid. Restore only the rights label through the maintained trigger.
-- ============================================================================

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('sup07-ambiguous-user-reel-post-rights-v3', 0));

DO $preflight$
DECLARE
  v_owner constant uuid := '47965354-0e56-43ef-931c-ddaab82af765';
  v_post constant uuid := '14f549d1-8079-436f-8c4e-c42ec0432de5';
  v_reel constant uuid := '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f';
  v_url constant text := 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm';
  v_key constant text := 'native:504c25ca805a2d6caf36cba72ae93b92';
  v_count integer;
BEGIN
  IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: session_replication_role must be origin';
  END IF;

  IF (
    SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version = '20260927154219' AND name = 'recover_historical_user_reels'
  ) <> 1 THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: recovery ledger is absent';
  END IF;
  IF (
    SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version = '20260927174555' AND name = 'restore_historical_user_reel_post_rights'
  ) <> 1 THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: prior rights ledger is absent';
  END IF;
  IF (
    SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version = '20260930182441' AND name = '20260930170100_social_post_topics_rule'
  ) <> 1 THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: topics rule ledger is absent';
  END IF;
  IF (
    SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version = '20260930182606' AND name = '20260930170200_social_post_topics_backfill'
  ) <> 1 THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: topics backfill ledger is absent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE name IN (
      'recover_historical_user_reels',
      'restore_historical_user_reel_post_rights',
      '20260930170100_social_post_topics_rule',
      '20260930170200_social_post_topics_backfill'
    ) AND (version, name) NOT IN (
      ('20260927154219', 'recover_historical_user_reels'),
      ('20260927174555', 'restore_historical_user_reel_post_rights'),
      ('20260930182441', '20260930170100_social_post_topics_rule'),
      ('20260930182606', '20260930170200_social_post_topics_backfill')
    )
  ) THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: predecessor ledger name is ambiguous';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE t.tgrelid = 'public.social_posts'::regclass
      AND t.tgname = 'trg_social_posts_video_contract_defaults'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
      AND t.tgtype::integer = 23
      AND t.tgqual IS NULL
      AND octet_length(t.tgargs) = 0
      AND n.nspname = 'public'
      AND p.proname = 'fn_social_posts_video_contract_defaults'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
      AND p.prokind = 'f'
      AND p.prorettype = 'trigger'::regtype
      AND p.prosecdef
      AND p.provolatile = 'v'
      AND p.proconfig = ARRAY['search_path=public, extensions']::text[]
      AND l.lanname = 'plpgsql'
      AND md5(p.prosrc) = 'a875fb9936c13a08ad8562af2184548f'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(t.tgattr::smallint[]) AS trigger_column(attnum)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = t.tgrelid
         AND a.attnum = trigger_column.attnum
        WHERE NOT a.attisdropped
      ) = ARRAY[
        'author_id', 'content_type', 'media_urls', 'metadata', 'origin_type',
        'playback_type', 'rights_status', 'topic', 'topics'
      ]::name[]
  ) <> 1 THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: maintained video-contract trigger drifted';
  END IF;

  PERFORM 1 FROM public.social_posts WHERE id = v_post FOR UPDATE;
  PERFORM 1 FROM public.social_reels WHERE id = v_reel FOR SHARE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_posts p
    WHERE p.id = v_post
      AND p.author_id = v_owner
      AND p.content = chr(128308) || ' Live replay: V23 Testing '
      AND p.content_type = 'video'
      AND p.media_urls = jsonb_build_array(v_url)
      AND p.created_at = '2026-05-16 14:20:29.942260+00'::timestamptz
      AND p.updated_at = '2026-05-16 14:20:29.942260+00'::timestamptz
      AND p.visibility = 'public'
      AND p.audience_mode IS NULL
      AND p.is_flagged = false
      AND p.is_deleted = false
      AND p.origin_type = 'legacy'
      AND p.playback_type = 'native'
      AND p.topic = 'unknown'
      AND p.topics = ARRAY['unknown']::text[]
      AND p.rights_status = 'unknown'
      AND p.canonical_asset_key = v_key
      AND p.source_asset_id IS NULL
      AND p.youtube_video_id IS NULL
      AND p.publication_key IS NULL
      AND p.view_count = 1
      AND p.like_count = 0
      AND p.comment_count = 0
      AND p.share_count = 0
      AND p.metadata = jsonb_build_object(
        'ended', true,
        'source', 'live_broadcast',
        'category', 'just_chatting',
        'stream_id', '9e32239c-beb7-4d3d-85d9-e3cb862d6e32',
        'description', 'Live From Fire Keepers ' || chr(128293)
      )
  ) THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: exact source-post state drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.social_reels r
    WHERE r.id = v_reel
      AND r.author_id = v_owner
      AND r.source_post_id = v_post
      AND r.video_url = v_url
      AND r.canonical_asset_key = v_key
      AND r.is_public = true
      AND r.is_deleted = false
      AND r.source_type = 'native'
      AND r.playback_type = 'native'
      AND r.origin_type = 'social_post'
      AND r.rights_status = 'user_authorized'
      AND r.media_status = 'ready'
      AND r.topic = 'unknown'
      AND r.native_processing_requested = false
      AND r.source_asset_id IS NULL
      AND r.publication_key IS NULL
      AND r.source_story_id IS NULL
      AND r.youtube_video_id IS NULL
      AND r.original_youtube_url IS NULL
  ) THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: exact Reel state drifted';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.fn_filter_valid_user_video_storage_urls(
    jsonb_build_array(jsonb_build_object('playback_url', v_url, 'author_id', v_owner))
  );
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights preflight failed: owned Storage object was not proven';
  END IF;
END
$preflight$;

CREATE TEMP TABLE _sup07_ambiguous_post_before ON COMMIT DROP AS
SELECT * FROM public.social_posts
WHERE id = '14f549d1-8079-436f-8c4e-c42ec0432de5';

CREATE TEMP TABLE _sup07_ambiguous_reel_before ON COMMIT DROP AS
SELECT * FROM public.social_reels
WHERE id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f';

SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $repair$
DECLARE
  v_updated integer;
BEGIN
  IF auth.role()::text IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights repair failed: service-role claim is not active';
  END IF;

  UPDATE public.social_posts
  SET rights_status = 'user_authorized'
  WHERE id = '14f549d1-8079-436f-8c4e-c42ec0432de5'
    AND topic = 'unknown'
    AND topics = ARRAY['unknown']::text[]
    AND playback_type = 'native'
    AND rights_status = 'unknown';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights repair failed: expected one update, wrote %', v_updated;
  END IF;
END
$repair$;

DO $postapply$
BEGIN
  IF (SELECT count(*) FROM _sup07_ambiguous_post_before) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM _sup07_ambiguous_post_before b
    JOIN public.social_posts p USING (id)
    WHERE p.rights_status = 'user_authorized'
      AND (to_jsonb(p) - 'rights_status') = (to_jsonb(b) - 'rights_status')
  ) THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights postapply failed: post bytes changed beyond rights_status';
  END IF;

  IF (SELECT count(*) FROM _sup07_ambiguous_reel_before) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM _sup07_ambiguous_reel_before b
    JOIN public.social_reels r USING (id)
    WHERE to_jsonb(r) = to_jsonb(b)
  ) THEN
    RAISE EXCEPTION 'SUP-07 ambiguous-rights postapply failed: Reel changed or disappeared';
  END IF;
END
$postapply$;

COMMIT;

-- ROLLBACK (install as a NEW migration; execute only after re-proving this state)
-- BEGIN;
-- SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- SET LOCAL lock_timeout = '5s';
-- SET LOCAL statement_timeout = '60s';
-- SELECT pg_advisory_xact_lock(hashtextextended('sup07-ambiguous-user-reel-post-rights-v3', 0));
-- DO $rollback_preflight$
-- DECLARE
--   v_owner constant uuid := '47965354-0e56-43ef-931c-ddaab82af765';
--   v_url constant text := 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm';
--   v_count integer;
-- BEGIN
--   IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' THEN
--     RAISE EXCEPTION 'SUP-07 ambiguous-rights rollback refused: session_replication_role must be origin';
--   END IF;
--   PERFORM 1 FROM public.social_posts
--   WHERE id = '14f549d1-8079-436f-8c4e-c42ec0432de5' FOR UPDATE;
--   PERFORM 1 FROM public.social_reels
--   WHERE id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f' FOR SHARE;
--   IF NOT EXISTS (
--     SELECT 1 FROM public.social_posts p
--     WHERE p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'
--       AND p.author_id = v_owner
--       AND p.content_type = 'video'
--       AND p.media_urls = jsonb_build_array(v_url)
--       AND p.visibility = 'public'
--       AND p.audience_mode IS NULL
--       AND p.is_flagged = false
--       AND p.is_deleted = false
--       AND p.origin_type = 'legacy'
--       AND p.playback_type = 'native'
--       AND p.topic = 'unknown'
--       AND p.topics = ARRAY['unknown']::text[]
--       AND p.rights_status = 'user_authorized'
--       AND p.canonical_asset_key = 'native:504c25ca805a2d6caf36cba72ae93b92'
--       AND p.source_asset_id IS NULL
--       AND p.youtube_video_id IS NULL
--       AND p.publication_key IS NULL
--   ) OR NOT EXISTS (
--     SELECT 1 FROM public.social_reels r
--     WHERE r.id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f'
--       AND r.author_id = v_owner
--       AND r.source_post_id = '14f549d1-8079-436f-8c4e-c42ec0432de5'
--       AND r.video_url = v_url
--       AND r.canonical_asset_key = 'native:504c25ca805a2d6caf36cba72ae93b92'
--       AND r.is_public = true
--       AND r.is_deleted = false
--       AND r.source_type = 'native'
--       AND r.playback_type = 'native'
--       AND r.origin_type = 'social_post'
--       AND r.rights_status = 'user_authorized'
--       AND r.media_status = 'ready'
--       AND r.topic = 'unknown'
--       AND r.native_processing_requested = false
--       AND r.source_asset_id IS NULL
--       AND r.publication_key IS NULL
--       AND r.source_story_id IS NULL
--       AND r.youtube_video_id IS NULL
--       AND r.original_youtube_url IS NULL
--   ) THEN
--     RAISE EXCEPTION 'SUP-07 ambiguous-rights rollback refused: exact corrected state drifted';
--   END IF;
--   SELECT count(*) INTO v_count
--   FROM public.fn_filter_valid_user_video_storage_urls(
--     jsonb_build_array(jsonb_build_object('playback_url', v_url, 'author_id', v_owner))
--   );
--   IF v_count <> 1 THEN
--     RAISE EXCEPTION 'SUP-07 ambiguous-rights rollback refused: owned Storage object was not proven';
--   END IF;
-- END
-- $rollback_preflight$;
-- CREATE TEMP TABLE _sup07_ambiguous_rollback_post_before ON COMMIT DROP AS
-- SELECT * FROM public.social_posts
-- WHERE id = '14f549d1-8079-436f-8c4e-c42ec0432de5';
-- CREATE TEMP TABLE _sup07_ambiguous_rollback_reel_before ON COMMIT DROP AS
-- SELECT * FROM public.social_reels
-- WHERE id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f';
-- SELECT set_config('request.jwt.claim.role', 'service_role', true);
-- DO $rollback$
-- DECLARE
--   v_updated integer;
-- BEGIN
--   IF auth.role()::text IS DISTINCT FROM 'service_role' THEN
--     RAISE EXCEPTION 'SUP-07 ambiguous-rights rollback refused: service-role claim is not active';
--   END IF;
--   UPDATE public.social_posts
--   SET rights_status = 'unknown'
--   WHERE id = '14f549d1-8079-436f-8c4e-c42ec0432de5'
--     AND topic = 'unknown'
--     AND topics = ARRAY['unknown']::text[]
--     AND playback_type = 'native'
--     AND rights_status = 'user_authorized';
--   GET DIAGNOSTICS v_updated = ROW_COUNT;
--   IF v_updated <> 1 THEN
--     RAISE EXCEPTION 'SUP-07 ambiguous-rights rollback failed: expected one update, wrote %', v_updated;
--   END IF;
-- END
-- $rollback$;
-- DO $rollback_postapply$
-- BEGIN
--   IF (SELECT count(*) FROM _sup07_ambiguous_rollback_post_before) <> 1 OR NOT EXISTS (
--     SELECT 1
--     FROM _sup07_ambiguous_rollback_post_before b
--     JOIN public.social_posts p USING (id)
--     WHERE p.rights_status = 'unknown'
--       AND (to_jsonb(p) - 'rights_status') = (to_jsonb(b) - 'rights_status')
--   ) THEN
--     RAISE EXCEPTION 'SUP-07 ambiguous-rights rollback failed: post bytes changed beyond rights_status';
--   END IF;
--   IF (SELECT count(*) FROM _sup07_ambiguous_rollback_reel_before) <> 1 OR NOT EXISTS (
--     SELECT 1
--     FROM _sup07_ambiguous_rollback_reel_before b
--     JOIN public.social_reels r USING (id)
--     WHERE to_jsonb(r) = to_jsonb(b)
--   ) THEN
--     RAISE EXCEPTION 'SUP-07 ambiguous-rights rollback failed: Reel changed or disappeared';
--   END IF;
-- END
-- $rollback_postapply$;
-- COMMIT;
