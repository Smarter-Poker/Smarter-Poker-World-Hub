-- ═══════════════════════════════════════════════════════════════════════
-- 20260927144041_recover_historical_user_reels.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     public.social_reels, public.social_posts
-- IRREVERSIBLE: no
--
-- WHY:
--   Seven historical native Reel rows backed by four still-public user video
--   posts predate the durable topic contract. Three audited poker assets have
--   duplicate Reel rows, so the canonical winners are hidden and their views
--   are stranded on the newer losers. The fourth asset is a live replay whose
--   content is not conclusively poker and must remain truthfully unclassified.
--
-- HOW:
--   - fail closed unless the exact seven Reels and four posts still match the
--     audited lineage, storage objects, counters, timestamps, and ownership;
--   - classify only the six conclusive Reel rows and their three posts as
--     poker while leaving the ambiguous live replay unchanged;
--   - move each duplicate group's existing view total to its deterministic
--     oldest canonical winner and zero the loser without touching interaction
--     rows or source-post counters;
--   - preserve every Reel and post UUID. No row is inserted or deleted.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('sup07-historical-user-reels-v1', 0));

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
DECLARE
  v_owner constant uuid := '47965354-0e56-43ef-931c-ddaab82af765';
  v_reel_ids constant uuid[] := ARRAY[
    '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f',
    'b3258975-db9f-42d5-a581-6c305b180b8f',
    '2cb727a7-aee1-4e33-975c-db31bc587aea',
    '0ac10eae-0380-4836-be80-759ce93ee878',
    '46747b18-3e80-4975-abad-09c41e091155',
    '8e87782d-dec1-4a54-aab9-1251df417b92',
    '31dc2cba-a031-4b6c-9530-168fe080e118'
  ]::uuid[];
  v_post_ids constant uuid[] := ARRAY[
    '14f549d1-8079-436f-8c4e-c42ec0432de5',
    '7f85c90e-057f-4784-9ff6-39f16c76aa78',
    '5cab43ba-cb10-4043-955f-63415e755e63',
    '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
  ]::uuid[];
  v_keys constant text[] := ARRAY[
    'native:504c25ca805a2d6caf36cba72ae93b92',
    'native:7726a4055b7753f1b8306349ce6419bd',
    'native:5bde286bd5cdae63943270adcd7052b5',
    'native:6e9a7279c927086f2807818e63db935f'
  ]::text[];
  v_count integer;
BEGIN
  IF to_regclass('public.social_reels') IS NULL
     OR to_regclass('public.social_posts') IS NULL
     OR to_regclass('public.social_likes') IS NULL
     OR to_regclass('public.social_comments') IS NULL
     OR to_regclass('public.saved_reels') IS NULL
  THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: required social tables are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_filter_valid_user_video_storage_urls'
      AND pg_get_function_identity_arguments(p.oid) = 'p_candidates jsonb'
  ) THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: storage-proof function is missing';
  END IF;

  -- Freeze the exact historical rows before inspecting or updating them.
  PERFORM 1 FROM public.social_reels WHERE id = ANY(v_reel_ids) FOR UPDATE;
  PERFORM 1 FROM public.social_posts WHERE id = ANY(v_post_ids) FOR UPDATE;

  SELECT count(*) INTO v_count
  FROM public.social_reels
  WHERE canonical_asset_key = ANY(v_keys);
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: expected 7 rows across four canonical groups, found %', v_count;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.social_reels
    WHERE canonical_asset_key = ANY(v_keys)
      AND NOT (id = ANY(v_reel_ids))
  ) THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: an unreviewed Reel joined a repair group';
  END IF;

  IF EXISTS (
    WITH expected(
      id, source_post_id, caption, video_url, created_at, updated_at,
      canonical_asset_key, view_count
    ) AS (VALUES
      (
        '8e87782d-dec1-4a54-aab9-1251df417b92'::uuid,
        '61a5aaa3-0ee7-4003-8af3-c4e64e240078'::uuid,
        'JJ vs K6d '::text,
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253042728_lbgtfe_IMG_8652.mp4'::text,
        '2026-05-08 15:11:36.567241+00'::timestamptz,
        '2026-05-08 15:12:01.142652+00'::timestamptz,
        'native:6e9a7279c927086f2807818e63db935f'::text,
        0::integer
      ),
      ('31dc2cba-a031-4b6c-9530-168fe080e118', '61a5aaa3-0ee7-4003-8af3-c4e64e240078', 'JJ vs K6d ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253042728_lbgtfe_IMG_8652.mp4', '2026-05-08 15:11:36.775502+00', '2026-09-13 17:52:43.210667+00', 'native:6e9a7279c927086f2807818e63db935f', 5),
      ('0ac10eae-0380-4836-be80-759ce93ee878', '5cab43ba-cb10-4043-955f-63415e755e63', 'Can We Quadruple Up?! ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253164336_j1hq8z_IMG_8650.mp4', '2026-05-08 15:13:32.981688+00', '2026-05-08 15:14:11.699965+00', 'native:5bde286bd5cdae63943270adcd7052b5', 0),
      ('46747b18-3e80-4975-abad-09c41e091155', '5cab43ba-cb10-4043-955f-63415e755e63', 'Can We Quadruple Up?! ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253164336_j1hq8z_IMG_8650.mp4', '2026-05-08 15:13:33.107728+00', '2026-09-13 17:51:46.592006+00', 'native:5bde286bd5cdae63943270adcd7052b5', 10),
      ('b3258975-db9f-42d5-a581-6c305b180b8f', '7f85c90e-057f-4784-9ff6-39f16c76aa78', 'Can JJ Hold Up?!', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778431224994_vg2sab_IMG_8637.mp4', '2026-05-10 16:41:03.542619+00', '2026-05-10 16:42:05.861792+00', 'native:7726a4055b7753f1b8306349ce6419bd', 0),
      ('2cb727a7-aee1-4e33-975c-db31bc587aea', '7f85c90e-057f-4784-9ff6-39f16c76aa78', 'Can JJ Hold Up?!', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778431224994_vg2sab_IMG_8637.mp4', '2026-05-10 16:41:03.884911+00', '2026-09-26 14:14:53.518103+00', 'native:7726a4055b7753f1b8306349ce6419bd', 63),
      ('9f65fa3e-9023-4697-8b15-c8f5c4c1c82f', '14f549d1-8079-436f-8c4e-c42ec0432de5', chr(128308) || ' Live replay: V23 Testing ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm', '2026-06-17 13:22:26.947384+00', '2026-09-26 14:14:52.667727+00', 'native:504c25ca805a2d6caf36cba72ae93b92', 100)
    )
    SELECT 1
    FROM expected e
    LEFT JOIN public.social_reels r ON r.id = e.id
    WHERE r.id IS NULL
       OR r.author_id IS DISTINCT FROM v_owner
       OR r.source_post_id IS DISTINCT FROM e.source_post_id
       OR r.caption IS DISTINCT FROM e.caption
       OR r.video_url IS DISTINCT FROM e.video_url
       OR r.created_at IS DISTINCT FROM e.created_at
       OR r.updated_at IS DISTINCT FROM e.updated_at
       OR r.canonical_asset_key IS DISTINCT FROM e.canonical_asset_key
       OR r.view_count IS DISTINCT FROM e.view_count
       OR r.is_public IS DISTINCT FROM true
       OR r.is_deleted IS DISTINCT FROM false
       OR r.source_type IS DISTINCT FROM 'native'
       OR r.origin_type IS DISTINCT FROM 'social_post'
       OR r.playback_type IS DISTINCT FROM 'native'
       OR r.topic IS DISTINCT FROM 'unknown'
       OR r.rights_status IS DISTINCT FROM 'user_authorized'
       OR r.media_status IS DISTINCT FROM 'ready'
       OR r.native_processing_requested IS DISTINCT FROM false
       OR r.source_asset_id IS NOT NULL
       OR r.publication_key IS NOT NULL
       OR r.source_story_id IS NOT NULL
       OR r.youtube_video_id IS NOT NULL
       OR r.original_youtube_url IS NOT NULL
       OR r.like_count IS DISTINCT FROM 0
       OR r.comment_count IS DISTINCT FROM 0
       OR r.share_count IS DISTINCT FROM 0
  ) THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: exact Reel inventory drifted';
  END IF;

  IF EXISTS (
    WITH expected(
      id, content, media_url, created_at, updated_at, canonical_asset_key,
      view_count, like_count, comment_count, share_count, metadata
    ) AS (VALUES
      (
        '61a5aaa3-0ee7-4003-8af3-c4e64e240078'::uuid,
        'JJ vs K6d '::text,
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253042728_lbgtfe_IMG_8652.mp4'::text,
        '2026-05-08 15:11:36.567241+00'::timestamptz,
        '2026-05-09 16:00:57.123411+00'::timestamptz,
        'native:6e9a7279c927086f2807818e63db935f'::text,
        0::integer, 0::integer, 4::integer, 0::integer,
        '{}'::jsonb
      ),
      ('5cab43ba-cb10-4043-955f-63415e755e63', 'Can We Quadruple Up?! ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253164336_j1hq8z_IMG_8650.mp4', '2026-05-08 15:13:32.981688+00', '2026-05-08 15:13:32.981688+00', 'native:5bde286bd5cdae63943270adcd7052b5', 0, 0, 0, 0, '{}'::jsonb),
      ('7f85c90e-057f-4784-9ff6-39f16c76aa78', 'Can JJ Hold Up?!', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778431224994_vg2sab_IMG_8637.mp4', '2026-05-10 16:41:03.542619+00', '2026-05-11 16:00:55.887949+00', 'native:7726a4055b7753f1b8306349ce6419bd', 1, 0, 4, 0, '{}'::jsonb),
      ('14f549d1-8079-436f-8c4e-c42ec0432de5', chr(128308) || ' Live replay: V23 Testing ', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm', '2026-05-16 14:20:29.942260+00', '2026-05-16 14:20:29.942260+00', 'native:504c25ca805a2d6caf36cba72ae93b92', 1, 0, 0, 0,
        jsonb_build_object(
          'ended', true,
          'source', 'live_broadcast',
          'category', 'just_chatting',
          'stream_id', '9e32239c-beb7-4d3d-85d9-e3cb862d6e32',
          'description', 'Live From Fire Keepers ' || chr(128293)
        )
      )
    )
    SELECT 1
    FROM expected e
    LEFT JOIN public.social_posts p ON p.id = e.id
    WHERE p.id IS NULL
       OR p.author_id IS DISTINCT FROM v_owner
       OR p.content IS DISTINCT FROM e.content
       OR p.content_type IS DISTINCT FROM 'video'
       OR p.media_urls IS DISTINCT FROM jsonb_build_array(e.media_url)
       OR p.created_at IS DISTINCT FROM e.created_at
       OR p.updated_at IS DISTINCT FROM e.updated_at
       OR p.visibility IS DISTINCT FROM 'public'
       OR p.audience_mode IS NOT NULL
       OR p.is_flagged IS DISTINCT FROM false
       OR p.is_deleted IS DISTINCT FROM false
       OR p.origin_type IS DISTINCT FROM 'legacy'
       OR p.playback_type IS DISTINCT FROM 'native'
       OR p.topic IS DISTINCT FROM 'unknown'
       OR p.topics IS NOT NULL
       OR p.rights_status IS DISTINCT FROM 'user_authorized'
       OR p.source_asset_id IS NOT NULL
       OR p.youtube_video_id IS NOT NULL
       OR p.canonical_asset_key IS DISTINCT FROM e.canonical_asset_key
       OR p.publication_key IS NOT NULL
       OR p.view_count IS DISTINCT FROM e.view_count
       OR p.like_count IS DISTINCT FROM e.like_count
       OR p.comment_count IS DISTINCT FROM e.comment_count
       OR p.share_count IS DISTINCT FROM e.share_count
       OR p.metadata IS DISTINCT FROM e.metadata
  ) THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: exact source-post inventory drifted';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.fn_filter_valid_user_video_storage_urls(
    jsonb_build_array(
      jsonb_build_object('playback_url', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253042728_lbgtfe_IMG_8652.mp4', 'author_id', v_owner),
      jsonb_build_object('playback_url', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778253164336_j1hq8z_IMG_8650.mp4', 'author_id', v_owner),
      jsonb_build_object('playback_url', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/47965354-0e56-43ef-931c-ddaab82af765/1778431224994_vg2sab_IMG_8637.mp4', 'author_id', v_owner),
      jsonb_build_object('playback_url', 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/live-recordings/47965354-0e56-43ef-931c-ddaab82af765/9e32239c-beb7-4d3d-85d9-e3cb862d6e32.webm', 'author_id', v_owner)
    )
  );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: expected four live owned storage objects, found %', v_count;
  END IF;

  IF EXISTS (SELECT 1 FROM public.social_likes WHERE post_id = ANY(v_reel_ids))
     OR EXISTS (SELECT 1 FROM public.social_comments WHERE post_id = ANY(v_reel_ids))
     OR EXISTS (SELECT 1 FROM public.saved_reels WHERE reel_id = ANY(v_reel_ids))
  THEN
    RAISE EXCEPTION 'SUP-07 pre-flight failed: duplicate Reel aliases gained interactions; manual reconciliation required';
  END IF;
END
$preflight$;

CREATE TEMP TABLE _sup07_reels_before ON COMMIT DROP AS
SELECT id, canonical_asset_key, source_post_id, topic, view_count,
       like_count, comment_count, share_count
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

CREATE TEMP TABLE _sup07_posts_before ON COMMIT DROP AS
SELECT id, topic, topics, view_count, like_count, comment_count, share_count
FROM public.social_posts
WHERE id IN (
  '14f549d1-8079-436f-8c4e-c42ec0432de5',
  '7f85c90e-057f-4784-9ff6-39f16c76aa78',
  '5cab43ba-cb10-4043-955f-63415e755e63',
  '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
);

-- 2. GUARDED REPAIR
DO $repair$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.social_posts
  SET topic = 'poker',
      topics = ARRAY['poker']::text[]
  WHERE id IN (
    '7f85c90e-057f-4784-9ff6-39f16c76aa78',
    '5cab43ba-cb10-4043-955f-63415e755e63',
    '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
  )
    AND topic = 'unknown'
    AND topics IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 3 THEN
    RAISE EXCEPTION 'SUP-07 repair failed: expected three source-post updates, wrote %', v_updated;
  END IF;

  WITH groups(canonical_asset_key, winner_id, target_ids) AS (VALUES
    (
      'native:7726a4055b7753f1b8306349ce6419bd'::text,
      'b3258975-db9f-42d5-a581-6c305b180b8f'::uuid,
      ARRAY[
        'b3258975-db9f-42d5-a581-6c305b180b8f',
        '2cb727a7-aee1-4e33-975c-db31bc587aea'
      ]::uuid[]
    ),
    (
      'native:5bde286bd5cdae63943270adcd7052b5'::text,
      '0ac10eae-0380-4836-be80-759ce93ee878'::uuid,
      ARRAY[
        '0ac10eae-0380-4836-be80-759ce93ee878',
        '46747b18-3e80-4975-abad-09c41e091155'
      ]::uuid[]
    ),
    (
      'native:6e9a7279c927086f2807818e63db935f'::text,
      '8e87782d-dec1-4a54-aab9-1251df417b92'::uuid,
      ARRAY[
        '8e87782d-dec1-4a54-aab9-1251df417b92',
        '31dc2cba-a031-4b6c-9530-168fe080e118'
      ]::uuid[]
    )
  ), totals AS (
    SELECT b.canonical_asset_key, sum(b.view_count)::integer AS view_total
    FROM _sup07_reels_before b
    JOIN groups g USING (canonical_asset_key)
    GROUP BY b.canonical_asset_key
  )
  UPDATE public.social_reels r
  SET topic = 'poker',
      view_count = CASE WHEN r.id = g.winner_id THEN t.view_total ELSE 0 END
  FROM groups g
  JOIN totals t USING (canonical_asset_key)
  WHERE r.canonical_asset_key = g.canonical_asset_key
    AND r.id = ANY(g.target_ids);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 6 THEN
    RAISE EXCEPTION 'SUP-07 repair failed: expected six Reel updates, wrote %', v_updated;
  END IF;
END
$repair$;

-- 3. POST-APPLY ASSERTIONS
DO $postapply$
DECLARE
  v_reel_ids constant uuid[] := ARRAY[
    '9f65fa3e-9023-4697-8b15-c8f5c4c1c82f',
    'b3258975-db9f-42d5-a581-6c305b180b8f',
    '2cb727a7-aee1-4e33-975c-db31bc587aea',
    '0ac10eae-0380-4836-be80-759ce93ee878',
    '46747b18-3e80-4975-abad-09c41e091155',
    '8e87782d-dec1-4a54-aab9-1251df417b92',
    '31dc2cba-a031-4b6c-9530-168fe080e118'
  ]::uuid[];
BEGIN
  IF (SELECT count(*) FROM public.social_reels WHERE id = ANY(v_reel_ids)) <> 7 THEN
    RAISE EXCEPTION 'SUP-07 post-apply failed: Reel IDs were not preserved';
  END IF;

  IF EXISTS (
    WITH expected(id, topic, view_count) AS (VALUES
      ('b3258975-db9f-42d5-a581-6c305b180b8f'::uuid, 'poker'::text, 63::integer),
      ('2cb727a7-aee1-4e33-975c-db31bc587aea'::uuid, 'poker'::text, 0::integer),
      ('0ac10eae-0380-4836-be80-759ce93ee878'::uuid, 'poker'::text, 10::integer),
      ('46747b18-3e80-4975-abad-09c41e091155'::uuid, 'poker'::text, 0::integer),
      ('8e87782d-dec1-4a54-aab9-1251df417b92'::uuid, 'poker'::text, 5::integer),
      ('31dc2cba-a031-4b6c-9530-168fe080e118'::uuid, 'poker'::text, 0::integer),
      ('9f65fa3e-9023-4697-8b15-c8f5c4c1c82f'::uuid, 'unknown'::text, 100::integer)
    )
    SELECT 1
    FROM expected e
    LEFT JOIN public.social_reels r USING (id)
    WHERE r.id IS NULL
       OR r.topic IS DISTINCT FROM e.topic
       OR r.view_count IS DISTINCT FROM e.view_count
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-apply failed: topic or canonical view placement is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT canonical_asset_key, sum(view_count)::integer AS views
      FROM _sup07_reels_before
      GROUP BY canonical_asset_key
    ) before_totals
    JOIN (
      SELECT canonical_asset_key, sum(view_count)::integer AS views
      FROM public.social_reels
      WHERE id = ANY(v_reel_ids)
      GROUP BY canonical_asset_key
    ) after_totals USING (canonical_asset_key)
    WHERE before_totals.views IS DISTINCT FROM after_totals.views
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-apply failed: a canonical group view total changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _sup07_reels_before b
    JOIN public.social_reels r USING (id)
    WHERE r.canonical_asset_key IS DISTINCT FROM b.canonical_asset_key
       OR r.source_post_id IS DISTINCT FROM b.source_post_id
       OR r.like_count IS DISTINCT FROM b.like_count
       OR r.comment_count IS DISTINCT FROM b.comment_count
       OR r.share_count IS DISTINCT FROM b.share_count
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-apply failed: Reel lineage or non-view engagement changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _sup07_posts_before b
    JOIN public.social_posts p USING (id)
    WHERE p.view_count IS DISTINCT FROM b.view_count
       OR p.like_count IS DISTINCT FROM b.like_count
       OR p.comment_count IS DISTINCT FROM b.comment_count
       OR p.share_count IS DISTINCT FROM b.share_count
       OR (
         p.id = '14f549d1-8079-436f-8c4e-c42ec0432de5'
         AND (p.topic IS DISTINCT FROM 'unknown' OR p.topics IS NOT NULL)
       )
       OR (
         p.id <> '14f549d1-8079-436f-8c4e-c42ec0432de5'
         AND (p.topic IS DISTINCT FROM 'poker' OR p.topics IS DISTINCT FROM ARRAY['poker']::text[])
       )
  ) THEN
    RAISE EXCEPTION 'SUP-07 post-apply failed: source-post classification or engagement changed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.social_likes WHERE post_id = ANY(v_reel_ids))
     OR EXISTS (SELECT 1 FROM public.social_comments WHERE post_id = ANY(v_reel_ids))
     OR EXISTS (SELECT 1 FROM public.saved_reels WHERE reel_id = ANY(v_reel_ids))
  THEN
    RAISE EXCEPTION 'SUP-07 post-apply failed: duplicate Reel interaction rows changed';
  END IF;
END
$postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 only — install as a NEW migration; never edit this file)
-- This preserves views accrued after the repair by moving only the original
-- 63/10/5 historical amounts back to their former loser rows.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- SET LOCAL lock_timeout = '5s';
-- SET LOCAL statement_timeout = '60s';
-- SELECT pg_advisory_xact_lock(hashtextextended('sup07-historical-user-reels-v1', 0));
-- DO $rollback$
-- DECLARE
--   v_updated integer;
-- BEGIN
--   PERFORM 1 FROM public.social_reels
--   WHERE id IN (
--     'b3258975-db9f-42d5-a581-6c305b180b8f', '2cb727a7-aee1-4e33-975c-db31bc587aea',
--     '0ac10eae-0380-4836-be80-759ce93ee878', '46747b18-3e80-4975-abad-09c41e091155',
--     '8e87782d-dec1-4a54-aab9-1251df417b92', '31dc2cba-a031-4b6c-9530-168fe080e118'
--   ) FOR UPDATE;
--   PERFORM 1 FROM public.social_posts
--   WHERE id IN (
--     '7f85c90e-057f-4784-9ff6-39f16c76aa78',
--     '5cab43ba-cb10-4043-955f-63415e755e63',
--     '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
--   ) FOR UPDATE;
--
--   IF EXISTS (
--     SELECT 1 FROM public.social_reels
--     WHERE id IN (
--       'b3258975-db9f-42d5-a581-6c305b180b8f', '0ac10eae-0380-4836-be80-759ce93ee878',
--       '8e87782d-dec1-4a54-aab9-1251df417b92'
--     )
--       AND (topic <> 'poker' OR view_count < CASE id
--         WHEN 'b3258975-db9f-42d5-a581-6c305b180b8f' THEN 63
--         WHEN '0ac10eae-0380-4836-be80-759ce93ee878' THEN 10
--         WHEN '8e87782d-dec1-4a54-aab9-1251df417b92' THEN 5
--       END)
--   ) OR EXISTS (
--     SELECT 1 FROM public.social_reels
--     WHERE id IN (
--       '2cb727a7-aee1-4e33-975c-db31bc587aea',
--       '46747b18-3e80-4975-abad-09c41e091155',
--       '31dc2cba-a031-4b6c-9530-168fe080e118'
--     )
--       AND (topic <> 'poker' OR view_count <> 0)
--   ) THEN
--     RAISE EXCEPTION 'SUP-07 rollback refused: repaired Reel state drifted';
--   END IF;
--
--   UPDATE public.social_posts
--   SET topic = 'unknown', topics = NULL
--   WHERE id IN (
--     '7f85c90e-057f-4784-9ff6-39f16c76aa78',
--     '5cab43ba-cb10-4043-955f-63415e755e63',
--     '61a5aaa3-0ee7-4003-8af3-c4e64e240078'
--   ) AND topic = 'poker' AND topics = ARRAY['poker']::text[];
--   GET DIAGNOSTICS v_updated = ROW_COUNT;
--   IF v_updated <> 3 THEN
--     RAISE EXCEPTION 'SUP-07 rollback refused: expected three source posts, found %', v_updated;
--   END IF;
--
--   UPDATE public.social_reels
--   SET topic = 'unknown',
--       view_count = CASE id
--         WHEN 'b3258975-db9f-42d5-a581-6c305b180b8f' THEN view_count - 63
--         WHEN '2cb727a7-aee1-4e33-975c-db31bc587aea' THEN 63
--         WHEN '0ac10eae-0380-4836-be80-759ce93ee878' THEN view_count - 10
--         WHEN '46747b18-3e80-4975-abad-09c41e091155' THEN 10
--         WHEN '8e87782d-dec1-4a54-aab9-1251df417b92' THEN view_count - 5
--         WHEN '31dc2cba-a031-4b6c-9530-168fe080e118' THEN 5
--       END
--   WHERE id IN (
--     'b3258975-db9f-42d5-a581-6c305b180b8f', '2cb727a7-aee1-4e33-975c-db31bc587aea',
--     '0ac10eae-0380-4836-be80-759ce93ee878', '46747b18-3e80-4975-abad-09c41e091155',
--     '8e87782d-dec1-4a54-aab9-1251df417b92', '31dc2cba-a031-4b6c-9530-168fe080e118'
--   );
--   GET DIAGNOSTICS v_updated = ROW_COUNT;
--   IF v_updated <> 6 THEN
--     RAISE EXCEPTION 'SUP-07 rollback refused: expected six Reels, found %', v_updated;
--   END IF;
-- END
-- $rollback$;
-- COMMIT;
