-- ============================================================================
-- 20260927154600_restore_historical_user_reel_post_rights.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     public.social_posts
-- IRREVERSIBLE: no
--
-- WHY:
--   The installed SUP-07 historical-Reel recovery updated topic/topics on
--   three owner-uploaded source posts. That update invoked the maintained
--   video-contract trigger under the migration login, where auth.role() is
--   empty, so the trigger correctly treated the caller as untrusted and
--   demoted rights_status from user_authorized to unknown. The Reel rows,
--   storage ownership, identifiers, counters, and media remained correct.
--
-- HOW:
--   - fail closed unless the exact prior migration and three affected posts
--     remain in the observed post-SUP-07 state;
--   - re-prove the three owner-scoped public Storage objects;
--   - supply the service-role request claim expected by the existing trigger
--     and restore only rights_status on the three exact post UUIDs;
--   - compare complete row images and refuse any change beyond rights_status.
-- ============================================================================

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('sup07-historical-user-reels-v2-post-rights', 0));

DO $preflight$
DECLARE
  v_owner constant uuid := '47965354-0e56-43ef-931c-ddaab82af765';
  v_post_ids constant uuid[] := ARRAY[
    '14f549d1-8079-436f-8c4e-c42ec0432de5',
    '7f85c90e-057f-4784-9ff6-39f16c76aa78',
    '5cab43ba-cb10-4043-955f-63415e755e63',
    '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
  ]::uuid[];
  v_reel_ids constant uuid[] := ARRAY[
    '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f',
    'b3258975-db9f-42d5-a581-6c305b180b8f',
    '2cb727a7-aee1-4e33-975c-db31bc587aea',
    '0ac10eae-0380-4836-be80-759ce93ee878',
    '46747b18-3e80-4975-abad-09c41e091155',
    '8e87782d-dec1-4a54-aab9-1251df417b92',
    '31dc2cba-a031-4b6c-9530-168fe080e118'
  ]::uuid[];
  v_count integer;
BEGIN
  IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' THEN
    RAISE EXCEPTION 'SUP-07 post-rights preflight failed: session_replication_role must be origin so the maintained trigger executes';
  END IF;

  IF (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260927154219'
      AND name = 'recover_historical_user_reels'
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE name IN (
      'recover_historical_user_reels',
      '20260927144041_recover_historical_user_reels'
    )
      AND (version, name) IS DISTINCT FROM
          ('20260927154219'::text, 'recover_historical_user_reels'::text)
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-rights preflight failed: exact prior recovery ledger is absent or ambiguous';
  END IF;

  -- This repair deliberately routes through the maintained write contract.
  -- Refuse a silently disabled, renamed, or rewired trigger: a direct update
  -- that merely happens to leave the desired bytes is not equivalent proof.
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
    RAISE EXCEPTION 'SUP-07 post-rights preflight failed: maintained video-contract trigger is absent, disabled, predicate-bound, or drifted';
  END IF;

  PERFORM 1
  FROM public.social_posts
  WHERE id = ANY(v_post_ids)
  FOR UPDATE;

  PERFORM 1
  FROM public.social_reels
  WHERE id = ANY(v_reel_ids)
  FOR SHARE;

  IF EXISTS (
    WITH expected(id, asset_key, media_url) AS (VALUES
      (
        '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid,
        'native:504c25ca805a2d6caf36cba72ae93b92'::text,
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm'::text
      ),
      (
        '7f85c90e-057f-4784-9ff6-39f16c76aa78'::uuid,
        'native:7726a4055b7753f1b8306349ce6419bd'::text,
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778431224994_vg2sab_IMG_8637.mp4'::text
      ),
      (
        '5cab43ba-cb10-4043-955f-63415e755e63',
        'native:5bde286bd5cdae63943270adcd7052b5',
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253164336_j1hq8z_IMG_8650.mp4'
      ),
      (
        '61a5aaa3-0ee7-4003-8af3-c4e64e240078',
        'native:6e9a7279c927086f2807818e63db935f',
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253042728_lbgtfe_IMG_8652.mp4'
      )
    )
    SELECT 1
    FROM expected e
    LEFT JOIN public.social_posts p ON p.id = e.id
    WHERE p.id IS NULL
       OR p.author_id IS DISTINCT FROM v_owner
       OR p.content_type IS DISTINCT FROM 'video'
       OR p.media_urls IS DISTINCT FROM jsonb_build_array(e.media_url)
       OR p.visibility IS DISTINCT FROM 'public'
       OR p.audience_mode IS NOT NULL
       OR p.is_flagged IS DISTINCT FROM false
       OR p.is_deleted IS DISTINCT FROM false
       OR p.origin_type IS DISTINCT FROM 'legacy'
       OR p.playback_type IS DISTINCT FROM 'native'
       OR p.topic IS DISTINCT FROM CASE
            WHEN p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid THEN 'unknown'
            ELSE 'poker'
          END
       OR (
            p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
            AND p.topics IS NOT NULL
          )
       OR (
            p.id <> '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
            AND p.topics IS DISTINCT FROM ARRAY['poker']::text[]
          )
       OR p.rights_status IS DISTINCT FROM CASE
            WHEN p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid THEN 'user_authorized'
            ELSE 'unknown'
          END
       OR p.canonical_asset_key IS DISTINCT FROM e.asset_key
       OR p.source_asset_id IS NOT NULL
       OR p.youtube_video_id IS NOT NULL
       OR p.publication_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-rights preflight failed: exact source-post state drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_reels r
    WHERE r.id = ANY(v_reel_ids)
      AND (
        r.author_id IS DISTINCT FROM v_owner
        OR r.topic IS DISTINCT FROM CASE
             WHEN r.id = '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f'::uuid THEN 'unknown'
             ELSE 'poker'
           END
        OR r.playback_type IS DISTINCT FROM 'native'
        OR r.source_type IS DISTINCT FROM 'native'
        OR r.origin_type IS DISTINCT FROM 'social_post'
        OR r.rights_status IS DISTINCT FROM 'user_authorized'
        OR r.media_status IS DISTINCT FROM 'ready'
        OR r.is_public IS DISTINCT FROM true
        OR r.is_deleted IS DISTINCT FROM false
      )
  ) OR (SELECT count(*) FROM public.social_reels WHERE id = ANY(v_reel_ids)) <> 7 THEN
    RAISE EXCEPTION 'SUP-07 post-rights preflight failed: repaired Reel state drifted';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.fn_filter_valid_user_video_storage_urls(
    jsonb_build_array(
      jsonb_build_object(
        'playback_url',
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778431224994_vg2sab_IMG_8637.mp4',
        'author_id', v_owner
      ),
      jsonb_build_object(
        'playback_url',
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253164336_j1hq8z_IMG_8650.mp4',
        'author_id', v_owner
      ),
      jsonb_build_object(
        'playback_url',
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253042728_lbgtfe_IMG_8652.mp4',
        'author_id', v_owner
      ),
      jsonb_build_object(
        'playback_url',
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm',
        'author_id', v_owner
      )
    )
  );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'SUP-07 post-rights preflight failed: expected four owned storage objects, found %', v_count;
  END IF;
END
$preflight$;

CREATE TEMP TABLE _sup07_post_rights_before ON COMMIT DROP AS
SELECT *
FROM public.social_posts
WHERE id IN (
  '14f549d1-8079-436f-8c4e-c42ec0432de5',
  '7f85c90e-057f-4784-9ff6-39f16c76aa78',
  '5cab43ba-cb10-4043-955f-63415e755e63',
  '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
);

CREATE TEMP TABLE _sup07_reels_unchanged ON COMMIT DROP AS
SELECT *
FROM public.social_reels
WHERE id IN (
  '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f',
  'b3258975-db9f-42d5-a581-6c305b180b8f',
  '2cb727a7-aee1-4e33-975c-db31bc587aea',
  '0ac10eae-0380-4836-be80-759ce93ee878',
  '46747b18-3e80-4975-abad-09c41e091155',
  '8e87782d-dec1-4a54-aab9-1251df417b92',
  '31dc2cba-a031-4b6c-9530-168fe080e118'
);

-- The trigger intentionally trusts this right only when the request claim is
-- service_role and the media URL passes the owner-scoped Storage proof above.
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $repair$
DECLARE
  v_updated integer;
BEGIN
  IF auth.role()::text IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SUP-07 post-rights repair failed: service-role claim is not active';
  END IF;

  UPDATE public.social_posts
  SET rights_status = 'user_authorized'
  WHERE id IN (
    '7f85c90e-057f-4784-9ff6-39f16c76aa78',
    '5cab43ba-cb10-4043-955f-63415e755e63',
    '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
  )
    AND topic = 'poker'
    AND topics = ARRAY['poker']::text[]
    AND playback_type = 'native'
    AND rights_status = 'unknown';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 3 THEN
    RAISE EXCEPTION 'SUP-07 post-rights repair failed: expected three updates, wrote %', v_updated;
  END IF;
END
$repair$;

DO $postapply$
BEGIN
  IF (SELECT count(*) FROM _sup07_post_rights_before) <> 4 OR (
    SELECT count(*)
    FROM _sup07_post_rights_before b
    JOIN public.social_posts p USING (id)
  ) <> 4 OR EXISTS (
    SELECT 1
    FROM _sup07_post_rights_before b
    LEFT JOIN public.social_posts p USING (id)
    WHERE p.id IS NULL
       OR (
            b.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
            AND to_jsonb(p) IS DISTINCT FROM to_jsonb(b)
          )
       OR (
            b.id <> '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
            AND (
              p.rights_status IS DISTINCT FROM 'user_authorized'
              OR (to_jsonb(p) - 'rights_status') IS DISTINCT FROM
                 (to_jsonb(b) - 'rights_status')
            )
          )
  ) OR (
    SELECT count(*)
    FROM public.social_posts
    WHERE id IN (
      '7f85c90e-057f-4784-9ff6-39f16c76aa78',
      '5cab43ba-cb10-4043-955f-63415e755e63',
      '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
    )
      AND rights_status = 'user_authorized'
  ) <> 3 THEN
    RAISE EXCEPTION 'SUP-07 post-rights postapply failed: post bytes changed beyond rights_status';
  END IF;

  IF (SELECT count(*) FROM _sup07_reels_unchanged) <> 7 OR (
    SELECT count(*)
    FROM _sup07_reels_unchanged b
    JOIN public.social_reels r USING (id)
  ) <> 7 OR EXISTS (
    SELECT 1
    FROM _sup07_reels_unchanged b
    LEFT JOIN public.social_reels r USING (id)
    WHERE r.id IS NULL
       OR to_jsonb(r) IS DISTINCT FROM to_jsonb(b)
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-rights postapply failed: a Reel row changed or disappeared';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_posts p
    WHERE p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'
      AND (
        p.topic IS DISTINCT FROM 'unknown'
        OR p.topics IS NOT NULL
        OR p.rights_status IS DISTINCT FROM 'user_authorized'
      )
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.social_posts p
    WHERE p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-rights postapply failed: ambiguous source post changed';
  END IF;
END
$postapply$;

COMMIT;

-- ============================================================================
-- ROLLBACK (install as a NEW migration; never edit this installed migration)
-- ============================================================================
-- BEGIN;
-- SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- SET LOCAL lock_timeout = '5s';
-- SELECT pg_advisory_xact_lock(hashtextextended('sup07-historical-user-reels-v2-post-rights', 0));
-- DO $rollback_session_mode$
-- BEGIN
--   IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' THEN
--     RAISE EXCEPTION 'SUP-07 post-rights rollback refused: session_replication_role must be origin so the maintained trigger executes';
--   END IF;
-- END
-- $rollback_session_mode$;
-- SELECT set_config('request.jwt.claim.role', 'service_role', true);
-- CREATE TEMP TABLE _sup07_post_rights_rollback_before ON COMMIT DROP AS
-- SELECT *
-- FROM public.social_posts
-- WHERE id IN (
--   '14f549d1-8079-436f-8c4e-c42ec0432de5',
--   '7f85c90e-057f-4784-9ff6-39f16c76aa78',
--   '5cab43ba-cb10-4043-955f-63415e755e63',
--   '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
-- );
-- CREATE TEMP TABLE _sup07_reels_rollback_unchanged ON COMMIT DROP AS
-- SELECT *
-- FROM public.social_reels
-- WHERE id IN (
--   '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f',
--   'b3258975-db9f-42d5-a581-6c305b180b8f',
--   '2cb727a7-aee1-4e33-975c-db31bc587aea',
--   '0ac10eae-0380-4836-be80-759ce93ee878',
--   '46747b18-3e80-4975-abad-09c41e091155',
--   '8e87782d-dec1-4a54-aab9-1251df417b92',
--   '31dc2cba-a031-4b6c-9530-168fe080e118'
-- );
-- DO $rollback$
-- DECLARE
--   v_updated integer;
-- BEGIN
--   IF EXISTS (
--     WITH expected(
--       id, content, media_url, created_at, updated_at, canonical_asset_key,
--       view_count, like_count, comment_count, share_count, metadata
--     ) AS (VALUES
--       (
--         '61a5aaa3-0ee7-4003-8af3-c4e64e240078'::uuid,
--         'JJ vs K6d '::text,
--         'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253042728_lbgtfe_IMG_8652.mp4'::text,
--         '2026-05-08 15:11:36.567241+00'::timestamptz,
--         '2026-05-09 16:00:57.123411+00'::timestamptz,
--         'native:6e9a7279c927086f2807818e63db935f'::text,
--         0::integer, 0::integer, 4::integer, 0::integer, '{}'::jsonb
--       ),
--       (
--         '5cab43ba-cb10-4043-955f-63415e755e63',
--         'Can We Quadruple Up?! ',
--         'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253164336_j1hq8z_IMG_8650.mp4',
--         '2026-05-08 15:13:32.981688+00',
--         '2026-05-08 15:13:32.981688+00',
--         'native:5bde286bd5cdae63943270adcd7052b5',
--         0, 0, 0, 0, '{}'::jsonb
--       ),
--       (
--         '7f85c90e-057f-4784-9ff6-39f16c76aa78',
--         'Can JJ Hold Up?!',
--         'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778431224994_vg2sab_IMG_8637.mp4',
--         '2026-05-10 16:41:03.542619+00',
--         '2026-05-11 16:00:55.887949+00',
--         'native:7726a4055b7753f1b8306349ce6419bd',
--         1, 0, 4, 0, '{}'::jsonb
--       ),
--       (
--         '14f549d1-8079-436f-8c4e-c42ec0432de5',
--         chr(128308) || ' Live replay: V23 Testing ',
--         'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm',
--         '2026-05-16 14:20:29.942260+00',
--         '2026-05-16 14:20:29.942260+00',
--         'native:504c25ca805a2d6caf36cba72ae93b92',
--         1, 0, 0, 0,
--         jsonb_build_object(
--           'ended', true,
--           'source', 'live_broadcast',
--           'category', 'just_chatting',
--           'stream_id', '9e32239c-beb7-4d3d-85d9-e3cb862d6e32',
--           'description', 'Live From Fire Keepers ' || chr(128293)
--         )
--       )
--     )
--     SELECT 1
--     FROM expected e
--     LEFT JOIN public.social_posts p USING (id)
--     WHERE p.id IS NULL
--        OR p.author_id IS DISTINCT FROM '47965354-0e56-43ef-931c-ddaab82af765'::uuid
--        OR p.content IS DISTINCT FROM e.content
--        OR p.content_type IS DISTINCT FROM 'video'
--        OR p.media_urls IS DISTINCT FROM jsonb_build_array(e.media_url)
--        OR p.created_at IS DISTINCT FROM e.created_at
--        OR p.updated_at IS DISTINCT FROM e.updated_at
--        OR p.visibility IS DISTINCT FROM 'public'
--        OR p.audience_mode IS NOT NULL
--        OR p.is_flagged IS DISTINCT FROM false
--        OR p.is_deleted IS DISTINCT FROM false
--        OR p.origin_type IS DISTINCT FROM 'legacy'
--        OR p.playback_type IS DISTINCT FROM 'native'
--        OR p.topic IS DISTINCT FROM CASE
--             WHEN p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid THEN 'unknown'
--             ELSE 'poker'
--           END
--        OR (
--             p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
--             AND p.topics IS NOT NULL
--           )
--        OR (
--             p.id <> '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
--             AND p.topics IS DISTINCT FROM ARRAY['poker']::text[]
--           )
--        OR p.rights_status IS DISTINCT FROM 'user_authorized'
--        OR p.canonical_asset_key IS DISTINCT FROM e.canonical_asset_key
--        OR p.source_asset_id IS NOT NULL
--        OR p.youtube_video_id IS NOT NULL
--        OR p.publication_key IS NOT NULL
--        OR p.view_count IS DISTINCT FROM e.view_count
--        OR p.like_count IS DISTINCT FROM e.like_count
--        OR p.comment_count IS DISTINCT FROM e.comment_count
--        OR p.share_count IS DISTINCT FROM e.share_count
--        OR p.metadata IS DISTINCT FROM e.metadata
--   ) OR (
--     SELECT count(*)
--     FROM public.social_posts
--     WHERE id IN (
--       '14f549d1-8079-436f-8c4e-c42ec0432de5',
--       '7f85c90e-057f-4784-9ff6-39f16c76aa78',
--       '5cab43ba-cb10-4043-955f-63415e755e63',
--       '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
--     )
--   ) <> 4 THEN
--     RAISE EXCEPTION 'SUP-07 post-rights rollback refused: exact source-post bytes drifted';
--   END IF;
--
--   UPDATE public.social_posts
--   SET rights_status = 'unknown'
--   WHERE id IN (
--     '7f85c90e-057f-4784-9ff6-39f16c76aa78',
--     '5cab43ba-cb10-4043-955f-63415e755e63',
--     '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
--   )
--     AND rights_status = 'user_authorized';
--   GET DIAGNOSTICS v_updated = ROW_COUNT;
--   IF v_updated <> 3 THEN
--     RAISE EXCEPTION 'SUP-07 post-rights rollback failed: expected three updates, wrote %', v_updated;
--   END IF;
-- END
-- $rollback$;
-- DO $rollback_postassert$
-- BEGIN
--   IF (SELECT count(*) FROM _sup07_post_rights_rollback_before) <> 4 OR (
--     SELECT count(*)
--     FROM _sup07_post_rights_rollback_before b
--     JOIN public.social_posts p USING (id)
--   ) <> 4 OR EXISTS (
--     SELECT 1
--     FROM _sup07_post_rights_rollback_before b
--     LEFT JOIN public.social_posts p USING (id)
--     WHERE p.id IS NULL
--        OR (
--             b.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
--             AND to_jsonb(p) IS DISTINCT FROM to_jsonb(b)
--           )
--        OR (
--             b.id <> '14f549d1-8079-436f-8c4e-c42ec0432de5'::uuid
--             AND (
--               p.rights_status IS DISTINCT FROM 'unknown'
--               OR (to_jsonb(p) - 'rights_status') IS DISTINCT FROM
--                  (to_jsonb(b) - 'rights_status')
--             )
--           )
--   ) OR (
--     SELECT count(*)
--     FROM public.social_posts
--     WHERE id IN (
--       '7f85c90e-057f-4784-9ff6-39f16c76aa78',
--       '5cab43ba-cb10-4043-955f-63415e755e63',
--       '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
--     )
--       AND rights_status = 'unknown'
--   ) <> 3 THEN
--     RAISE EXCEPTION 'SUP-07 post-rights rollback failed: post bytes changed beyond rights_status';
--   END IF;
--
--   IF (SELECT count(*) FROM _sup07_reels_rollback_unchanged) <> 7 OR (
--     SELECT count(*)
--     FROM _sup07_reels_rollback_unchanged b
--     JOIN public.social_reels r USING (id)
--   ) <> 7 OR EXISTS (
--     SELECT 1
--     FROM _sup07_reels_rollback_unchanged b
--     LEFT JOIN public.social_reels r USING (id)
--     WHERE r.id IS NULL
--        OR to_jsonb(r) IS DISTINCT FROM to_jsonb(b)
--   ) THEN
--     RAISE EXCEPTION 'SUP-07 post-rights rollback failed: a Reel row changed or disappeared';
--   END IF;
-- END
-- $rollback_postassert$;
-- COMMIT;
