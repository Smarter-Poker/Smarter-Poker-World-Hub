-- ===========================================================================
-- 20260926143400_horse_video_reels_atomic_publisher.sql
-- ===========================================================================
-- TIER:        3 (new SECURITY DEFINER publication boundary)
-- AUTHOR:      Codex, Reels supply recovery
-- AFFECTS:     table: horse_semantic_ledger (new)
--              rpc: publish_horse_video_reel (new)
--              privileges/RLS: horse_semantic_ledger and the new RPC
-- IRREVERSIBLE: no
--
-- WHY:
--   Horse video publication previously inserted social_posts directly and
--   trusted a best-effort legacy mirror to create social_reels. The mirror
--   intentionally swallows errors for non-library posts, while the asset and
--   caption ledgers were written in later independent requests. A dropped
--   response or one failed write could therefore leave an orphan post, a Reel
--   with unsafe playback provenance, or reusable content that the fleet had
--   already published. Social Media then had no trustworthy horse Reel supply.
--
-- HOW:
--   - Add a service-role-only semantic ledger so subject reuse is durable.
--   - Add one service-role-only RPC that validates the active horse, approved
--     video mode, exact YouTube identity and fresh shared embed verification.
--   - Serialize the horse cadence and asset/phrase/semantic identities, return
--     the existing complete pair on retry, enforce all reuse windows, insert
--     one post, validate its mirrored Reel, then write every ledger row.
--   - Raise on every incomplete or inconsistent state. PostgreSQL rolls the
--     post, Reel and ledgers back together.
--
-- PREREQUISITES:
--   20260905120000_content_ledgers_the_fleet_remembers_what_it_posted.sql
--   20260906235959_video_reels_integrity_foundation.sql
--
-- This is a forward-only migration. Once installed it must not be re-run or
-- edited; any correction must be a new migration.
-- See .agent/workflows/migration-safety.md.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
  v_fn regprocedure;
  v_secdef boolean;
  v_config text[];
BEGIN
  SELECT string_agg(required.table_name, ', ' ORDER BY required.table_name)
  INTO v_missing
  FROM (
    VALUES
      ('profiles'),
      ('content_authors'),
      ('horse_post_modes'),
      ('content_asset_use'),
      ('horse_phrase_ledger'),
      ('social_posts'),
      ('social_reels')
  ) AS required(table_name)
  WHERE to_regclass('public.' || required.table_name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required tables missing: %', v_missing;
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', '
                    ORDER BY required.table_name, required.column_name)
  INTO v_missing
  FROM (
    VALUES
      ('profiles', 'id'),
      ('profiles', 'is_horse'),
      ('profiles', 'status'),
      ('content_authors', 'profile_id'),
      ('content_authors', 'is_active'),
      ('horse_post_modes', 'mode'),
      ('horse_post_modes', 'enabled'),
      ('content_asset_use', 'asset_key'),
      ('content_asset_use', 'horse_id'),
      ('content_asset_use', 'post_id'),
      ('content_asset_use', 'used_at'),
      ('horse_phrase_ledger', 'phrase_norm'),
      ('horse_phrase_ledger', 'horse_id'),
      ('horse_phrase_ledger', 'post_id'),
      ('horse_phrase_ledger', 'used_at'),
      ('social_posts', 'origin_type'),
      ('social_posts', 'id'),
      ('social_posts', 'author_id'),
      ('social_posts', 'content'),
      ('social_posts', 'content_type'),
      ('social_posts', 'media_urls'),
      ('social_posts', 'visibility'),
      ('social_posts', 'audience_mode'),
      ('social_posts', 'metadata'),
      ('social_posts', 'topics'),
      ('social_posts', 'playback_type'),
      ('social_posts', 'topic'),
      ('social_posts', 'rights_status'),
      ('social_posts', 'youtube_video_id'),
      ('social_posts', 'canonical_asset_key'),
      ('social_posts', 'created_at'),
      ('social_posts', 'is_deleted'),
      ('social_posts', 'link_url'),
      ('social_reels', 'id'),
      ('social_reels', 'source_post_id'),
      ('social_reels', 'author_id'),
      ('social_reels', 'video_url'),
      ('social_reels', 'original_youtube_url'),
      ('social_reels', 'created_at'),
      ('social_reels', 'origin_type'),
      ('social_reels', 'source_type'),
      ('social_reels', 'playback_type'),
      ('social_reels', 'topic'),
      ('social_reels', 'rights_status'),
      ('social_reels', 'youtube_video_id'),
      ('social_reels', 'canonical_asset_key'),
      ('social_reels', 'media_status'),
      ('social_reels', 'is_public'),
      ('social_reels', 'is_deleted'),
      ('social_reels', 'native_processing_requested'),
      ('social_reels', 'source_asset_id'),
      ('social_reels', 'publication_key')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = required.table_name
      AND c.column_name = required.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required columns missing: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indexrelid =
          to_regclass('public.content_asset_use_horse_asset_uniq')
      AND i.indrelid = 'public.content_asset_use'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indpred IS NULL
      AND i.indnkeyatts = 2
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'asset_key'
      AND pg_get_indexdef(i.indexrelid, 2, true) = 'horse_id'
  ) THEN
    RAISE EXCEPTION
      'pre-flight failed: the forever-per-horse asset unique index is required';
  END IF;

  IF to_regclass('public.horse_semantic_ledger') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.horse_semantic_ledger already exists';
  END IF;

  IF to_regprocedure(
    'public.publish_horse_video_reel(uuid,text,text,text,text,text,text,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: publish_horse_video_reel already exists';
  END IF;

  IF to_regprocedure('public.fn_extract_youtube_video_id(text)') IS NULL
     OR to_regprocedure(
       'public.fn_has_fresh_public_youtube_verification(text)'
     ) IS NULL
     OR to_regprocedure('public.fn_social_posts_video_to_reel_mirror()') IS NULL
  THEN
    RAISE EXCEPTION
      'pre-flight failed: the installed YouTube verifier and post/Reel mirror are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'social_posts'
      AND t.tgname = 'trg_social_posts_video_to_reel_mirror'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND t.tgtype = 5
      AND t.tgfoid =
        'public.fn_social_posts_video_to_reel_mirror()'::regprocedure
  ) THEN
    RAISE EXCEPTION
      'pre-flight failed: trg_social_posts_video_to_reel_mirror is not enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.horse_post_modes m
    WHERE m.mode = 'poker_video'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.horse_post_modes m
    WHERE m.mode = 'sports_video'
  ) THEN
    RAISE EXCEPTION
      'pre-flight failed: poker_video and sports_video mode rows are required';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_has_fresh_public_youtube_verification(text)'::regprocedure,
    'public.fn_social_posts_video_to_reel_mirror()'::regprocedure
  ]
  LOOP
    SELECT p.prosecdef, p.proconfig
    INTO v_secdef, v_config
    FROM pg_proc p
    WHERE p.oid = v_fn;

    IF v_secdef IS DISTINCT FROM true
       OR NOT COALESCE(v_config, ARRAY[]::text[])
         @> ARRAY['search_path=public, extensions']::text[]
    THEN
      RAISE EXCEPTION
        'pre-flight failed: % must be SECURITY DEFINER with a fixed search_path',
        v_fn::text;
    END IF;
  END LOOP;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. DURABLE SEMANTIC MEMORY
-- ---------------------------------------------------------------------------
CREATE TABLE public.horse_semantic_ledger (
  id           bigserial PRIMARY KEY,
  semantic_key text        NOT NULL,
  horse_id     uuid        NOT NULL,
  post_id      uuid        NOT NULL,
  used_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horse_semantic_ledger_key_length_check
    CHECK (octet_length(semantic_key) BETWEEN 1 AND 4096),
  CONSTRAINT horse_semantic_ledger_exact_use_uniq
    UNIQUE (semantic_key, horse_id, post_id)
);

COMMENT ON TABLE public.horse_semantic_ledger IS
  'Service-role-only memory of the semantic opening used by a horse post. The atomic horse video publisher enforces the 48-hour platform and 90-day per-horse reuse windows before inserting.';

CREATE INDEX horse_semantic_ledger_key_used_idx
  ON public.horse_semantic_ledger (semantic_key, used_at DESC);
CREATE INDEX horse_semantic_ledger_horse_used_idx
  ON public.horse_semantic_ledger (horse_id, used_at DESC);

ALTER TABLE public.horse_semantic_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.horse_semantic_ledger
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.horse_semantic_ledger_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.horse_semantic_ledger
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.horse_semantic_ledger_id_seq
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. ONE ATOMIC HORSE VIDEO PUBLICATION BOUNDARY
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_horse_video_reel(
  p_author_id uuid,
  p_video_url text,
  p_caption text,
  p_topic text,
  p_asset_key text,
  p_phrase_norm text,
  p_semantic_key text,
  p_metadata jsonb
)
RETURNS TABLE (
  social_post_id uuid,
  social_reel_id uuid,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_author_id uuid := p_author_id;
  v_video_url text := btrim(COALESCE(p_video_url, ''));
  v_caption text := btrim(COALESCE(p_caption, ''));
  v_topic text := lower(btrim(COALESCE(p_topic, '')));
  v_asset_key text := btrim(COALESCE(p_asset_key, ''));
  v_phrase_norm text := btrim(COALESCE(p_phrase_norm, ''));
  v_semantic_key text := NULLIF(btrim(COALESCE(p_semantic_key, '')), '');
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_youtube_id text;
  v_canonical_url text;
  v_canonical_key text;
  v_computed_phrase text;
  v_post_id uuid;
  v_reel_id uuid;
  v_post_count integer := 0;
  v_reel_count integer := 0;
  v_mode_enabled boolean;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'publish_horse_video_reel requires the service role';
  END IF;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'horse video publication requires one active horse author',
      CONSTRAINT = 'horse_video_active_author';
  END IF;

  -- Lock the selected identity rows so an administrative deactivation cannot
  -- commit between this check and publication.
  PERFORM 1
  FROM public.profiles p
  JOIN public.content_authors ca
    ON ca.profile_id = p.id
  WHERE p.id = v_author_id
    AND p.is_horse IS TRUE
    AND p.status = 'active'
    AND ca.is_active IS TRUE
  LIMIT 1
  FOR SHARE OF p, ca;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'horse video publication requires one active horse author',
      CONSTRAINT = 'horse_video_active_author';
  END IF;

  IF v_topic NOT IN ('poker', 'sports') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video topic must be poker or sports';
  END IF;

  SELECT m.enabled
  INTO v_mode_enabled
  FROM public.horse_post_modes m
  WHERE m.mode = v_topic || '_video'
  FOR SHARE;

  IF v_mode_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format('horse post mode %s_video is not enabled', v_topic);
  END IF;

  IF char_length(v_caption) = 0 OR char_length(v_caption) > 2000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video caption must contain 1 to 2000 characters';
  END IF;

  IF octet_length(v_video_url) = 0
     OR octet_length(v_video_url) > 4096
     OR v_video_url !~* '^https://'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video publication requires an HTTPS YouTube URL';
  END IF;

  v_youtube_id := public.fn_extract_youtube_video_id(v_video_url);
  IF v_youtube_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video publication accepts YouTube embeds only';
  END IF;

  IF v_asset_key IS DISTINCT FROM 'yt:' || v_youtube_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video asset key does not match the YouTube identity';
  END IF;

  v_canonical_url := 'https://www.youtube.com/watch?v=' || v_youtube_id;
  v_canonical_key := 'youtube:' || v_youtube_id;

  v_computed_phrase := btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(split_part(v_caption, E'\n', 1)),
          'https?://\S+',
          '',
          'gi'
        ),
        '[^a-z0-9\s]',
        '',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );

  IF v_phrase_norm = ''
     OR v_phrase_norm IS DISTINCT FROM v_computed_phrase
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video phrase key does not match the normalized caption';
  END IF;

  IF v_semantic_key IS NULL
     OR octet_length(v_semantic_key) > 4096
     OR v_semantic_key ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video semantic key is invalid';
  END IF;

  IF jsonb_typeof(v_metadata) IS DISTINCT FROM 'object'
     OR octet_length(v_metadata::text) > 32768
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'horse video metadata must be a bounded JSON object';
  END IF;

  -- One lock owns the cadence for this horse. A second lock owns this asset
  -- platform-wide, so two horses cannot both pass the 30-day check. Phrase
  -- and semantic locks close the equivalent cross-horse check/insert races.
  -- These namespaces serialize this isolated video RPC. The mixed publisher
  -- is globally disabled; Phase 2 must retire or move every remaining legacy
  -- direct horse-post path onto the same protocol before it is re-enabled.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'publish-horse-video-author:' || v_author_id::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'publish-horse-video-asset:' || v_asset_key,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'publish-horse-video-phrase:' || v_phrase_norm,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'publish-horse-video-semantic:' || v_semantic_key,
      0
    )
  );

  -- A response can be lost after COMMIT. The canonical author/asset pair is
  -- the operation identity. A retry returns the existing fully-linked object
  -- before cadence or reuse windows can reject the already-completed write.
  SELECT count(*)::integer
  INTO v_post_count
  FROM public.social_posts existing_post
  WHERE existing_post.author_id = v_author_id
    AND existing_post.origin_type = 'horse'
    AND existing_post.content_type = 'video'
    AND COALESCE(existing_post.is_deleted, false) = false
    AND existing_post.canonical_asset_key = v_canonical_key
    AND existing_post.youtube_video_id = v_youtube_id
    AND existing_post.metadata ->> 'publication_contract'
      = 'horse_video_reel_v1';

  IF v_post_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'horse video retry found multiple canonical Social posts';
  END IF;

  SELECT existing_post.id
  INTO v_post_id
  FROM public.social_posts existing_post
  WHERE existing_post.author_id = v_author_id
    AND existing_post.origin_type = 'horse'
    AND existing_post.content_type = 'video'
    AND COALESCE(existing_post.is_deleted, false) = false
    AND existing_post.canonical_asset_key = v_canonical_key
    AND existing_post.youtube_video_id = v_youtube_id
    AND existing_post.metadata ->> 'publication_contract'
      = 'horse_video_reel_v1'
  ORDER BY existing_post.created_at ASC NULLS LAST, existing_post.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_post_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.social_posts existing_post
      WHERE existing_post.id = v_post_id
        AND existing_post.author_id = v_author_id
        AND existing_post.origin_type = 'horse'
        AND existing_post.content_type = 'video'
        AND existing_post.visibility = 'public'
        AND existing_post.audience_mode = 'public'
        AND existing_post.playback_type = 'youtube_embed'
        AND existing_post.topic = v_topic
        AND existing_post.rights_status = 'embed_only'
        AND existing_post.youtube_video_id = v_youtube_id
        AND existing_post.canonical_asset_key = v_canonical_key
        AND existing_post.metadata ->> 'asset_key' = v_asset_key
        AND NULLIF(existing_post.metadata ->> 'phrase_norm', '') IS NOT NULL
        AND NULLIF(existing_post.metadata ->> 'semantic_key', '') IS NOT NULL
        AND existing_post.metadata ->> 'youtube_video_id' = v_youtube_id
        AND existing_post.metadata ->> 'topic' = v_topic
        AND public.fn_extract_youtube_video_id(
          NULLIF(existing_post.media_urls ->> 0, '')
        ) = v_youtube_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'horse video retry found a conflicting canonical Social post';
    END IF;

    SELECT count(*)::integer,
           (array_agg(
             existing_reel.id
             ORDER BY existing_reel.created_at ASC NULLS LAST,
                      existing_reel.id ASC
           ))[1]
    INTO v_reel_count, v_reel_id
    FROM public.social_reels existing_reel
    WHERE existing_reel.source_post_id = v_post_id;

    IF v_reel_count <> 1
       OR v_reel_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.social_reels existing_reel
         WHERE existing_reel.id = v_reel_id
           AND existing_reel.source_post_id = v_post_id
           AND existing_reel.author_id = v_author_id
           AND existing_reel.origin_type = 'horse'
           AND existing_reel.source_type = 'youtube'
           AND existing_reel.playback_type = 'youtube_embed'
           AND existing_reel.topic = v_topic
           AND existing_reel.rights_status = 'embed_only'
           AND existing_reel.youtube_video_id = v_youtube_id
           AND existing_reel.canonical_asset_key = v_canonical_key
           AND existing_reel.video_url = v_canonical_url
           AND existing_reel.original_youtube_url = v_canonical_url
           AND existing_reel.media_status = 'ready'
           AND existing_reel.is_public IS TRUE
           AND COALESCE(existing_reel.is_deleted, false) = false
           AND existing_reel.native_processing_requested IS FALSE
           AND existing_reel.source_asset_id IS NULL
           AND existing_reel.publication_key IS NULL
       )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'horse video retry found no single valid linked Reel';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.content_asset_use asset_ledger
      WHERE asset_ledger.asset_key = v_asset_key
        AND asset_ledger.horse_id = v_author_id
        AND asset_ledger.post_id = v_post_id
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.horse_phrase_ledger phrase_ledger
      WHERE phrase_ledger.horse_id = v_author_id
        AND phrase_ledger.post_id = v_post_id
        AND phrase_ledger.phrase_norm = (
          SELECT existing_post.metadata ->> 'phrase_norm'
          FROM public.social_posts existing_post
          WHERE existing_post.id = v_post_id
        )
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.horse_semantic_ledger semantic_ledger
      WHERE semantic_ledger.horse_id = v_author_id
        AND semantic_ledger.post_id = v_post_id
        AND semantic_ledger.semantic_key = (
          SELECT existing_post.metadata ->> 'semantic_key'
          FROM public.social_posts existing_post
          WHERE existing_post.id = v_post_id
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'horse video retry found incomplete publication ledgers';
    END IF;

    RETURN QUERY SELECT v_post_id, v_reel_id, false;
    RETURN;
  END IF;

  IF NOT public.fn_has_fresh_public_youtube_verification(v_youtube_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'horse video publication requires fresh shared YouTube verification',
      CONSTRAINT = 'horse_video_fresh_youtube_verification';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_posts recent_post
    WHERE recent_post.author_id = v_author_id
      AND COALESCE(recent_post.is_deleted, false) = false
      AND recent_post.created_at >= now() - interval '20 hours'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'horse has already published inside the 20-hour cadence guard',
      CONSTRAINT = 'horse_video_recent_post_guard';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.content_asset_use mine
    WHERE mine.asset_key = v_asset_key
      AND mine.horse_id = v_author_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'horse has already used this video asset';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.content_asset_use recent_asset
    WHERE recent_asset.asset_key = v_asset_key
      AND recent_asset.used_at >= now() - interval '30 days'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'video asset was already used platform-wide inside 30 days',
      CONSTRAINT = 'horse_video_asset_global_window';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.horse_phrase_ledger recent_phrase
    WHERE recent_phrase.phrase_norm = v_phrase_norm
      AND recent_phrase.used_at >= now() - interval '48 hours'
  ) OR EXISTS (
    SELECT 1
    FROM public.horse_phrase_ledger horse_phrase
    WHERE horse_phrase.phrase_norm = v_phrase_norm
      AND horse_phrase.horse_id = v_author_id
      AND horse_phrase.used_at >= now() - interval '90 days'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'horse video caption violates the phrase reuse window',
      CONSTRAINT = 'horse_video_phrase_reuse_window';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.horse_semantic_ledger recent_semantic
    WHERE recent_semantic.semantic_key = v_semantic_key
      AND recent_semantic.used_at >= now() - interval '48 hours'
  ) OR EXISTS (
    SELECT 1
    FROM public.horse_semantic_ledger horse_semantic
    WHERE horse_semantic.semantic_key = v_semantic_key
      AND horse_semantic.horse_id = v_author_id
      AND horse_semantic.used_at >= now() - interval '90 days'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'horse video caption violates the semantic reuse window',
      CONSTRAINT = 'horse_video_semantic_reuse_window';
  END IF;

  INSERT INTO public.social_posts (
    author_id,
    content,
    content_type,
    media_urls,
    visibility,
    audience_mode,
    metadata,
    topics,
    origin_type,
    playback_type,
    topic,
    rights_status,
    youtube_video_id,
    canonical_asset_key
  ) VALUES (
    v_author_id,
    v_caption,
    'video',
    jsonb_build_array(v_canonical_url),
    'public',
    'public',
    v_metadata || jsonb_build_object(
      'publication_contract', 'horse_video_reel_v1',
      'asset_key', v_asset_key,
      'phrase_norm', v_phrase_norm,
      'semantic_key', v_semantic_key,
      'youtube_video_id', v_youtube_id,
      'topic', v_topic,
      'verification_source', 'shared_youtube_registry'
    ),
    ARRAY[v_topic]::text[],
    'horse',
    'youtube_embed',
    v_topic,
    'embed_only',
    v_youtube_id,
    v_canonical_key
  )
  RETURNING id INTO v_post_id;

  -- The maintained AFTER INSERT trigger owns Reel construction. It is legacy
  -- best effort for horse posts, so its output is not trusted until every
  -- required identity, rights and playback field is checked here.
  SELECT count(*)::integer,
         (array_agg(
           mirrored_reel.id
           ORDER BY mirrored_reel.created_at ASC NULLS LAST,
                    mirrored_reel.id ASC
         ))[1]
  INTO v_reel_count, v_reel_id
  FROM public.social_reels mirrored_reel
  WHERE mirrored_reel.source_post_id = v_post_id;

  IF v_reel_count <> 1
     OR v_reel_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.social_reels mirrored_reel
       WHERE mirrored_reel.id = v_reel_id
         AND mirrored_reel.source_post_id = v_post_id
         AND mirrored_reel.author_id = v_author_id
         AND mirrored_reel.origin_type = 'horse'
         AND mirrored_reel.source_type = 'youtube'
         AND mirrored_reel.playback_type = 'youtube_embed'
         AND mirrored_reel.topic = v_topic
         AND mirrored_reel.rights_status = 'embed_only'
         AND mirrored_reel.youtube_video_id = v_youtube_id
         AND mirrored_reel.canonical_asset_key = v_canonical_key
         AND mirrored_reel.video_url = v_canonical_url
         AND mirrored_reel.original_youtube_url = v_canonical_url
         AND mirrored_reel.media_status = 'ready'
         AND mirrored_reel.is_public IS TRUE
         AND COALESCE(mirrored_reel.is_deleted, false) = false
         AND mirrored_reel.native_processing_requested IS FALSE
         AND mirrored_reel.source_asset_id IS NULL
         AND mirrored_reel.publication_key IS NULL
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'atomic horse video publication did not create one valid linked Reel',
      CONSTRAINT = 'horse_video_linked_reel_contract';
  END IF;

  UPDATE public.social_posts published_post
  SET link_url = '/hub/reels?id=' || v_reel_id::text
  WHERE published_post.id = v_post_id
    AND published_post.link_url IS DISTINCT FROM
      '/hub/reels?id=' || v_reel_id::text;

  INSERT INTO public.content_asset_use (
    asset_key, horse_id, post_id, used_at
  ) VALUES (v_asset_key, v_author_id, v_post_id, now());

  INSERT INTO public.horse_phrase_ledger (
    phrase_norm, horse_id, post_id, used_at
  ) VALUES (v_phrase_norm, v_author_id, v_post_id, now());

  INSERT INTO public.horse_semantic_ledger (
    semantic_key, horse_id, post_id, used_at
  ) VALUES (v_semantic_key, v_author_id, v_post_id, now());

  RETURN QUERY SELECT v_post_id, v_reel_id, true;
END
$function$;

REVOKE ALL ON FUNCTION public.publish_horse_video_reel(
  uuid, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_horse_video_reel(
  uuid, text, text, text, text, text, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.publish_horse_video_reel(
  uuid, text, text, text, text, text, text, jsonb
) IS
  'Service-role-only atomic horse video publisher. Returns one durable Social post/Reel pair and writes asset, phrase and semantic reuse ledgers in the same transaction.';

-- ---------------------------------------------------------------------------
-- 4. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
  v_fn regprocedure :=
    'public.publish_horse_video_reel(uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  v_owner oid;
  v_acl aclitem[];
  v_public_execute boolean;
  v_index_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'horse_semantic_ledger'
      AND c.relkind = 'r'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'post-apply failed: horse_semantic_ledger is missing or RLS is disabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'horse_semantic_ledger'
  ) THEN
    RAISE EXCEPTION
      'post-apply failed: horse_semantic_ledger must expose no RLS policies';
  END IF;

  IF has_table_privilege(
       'anon', 'public.horse_semantic_ledger',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.horse_semantic_ledger',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR NOT has_table_privilege(
       'service_role', 'public.horse_semantic_ledger', 'SELECT'
     )
     OR NOT has_table_privilege(
       'service_role', 'public.horse_semantic_ledger', 'INSERT'
     )
     OR has_table_privilege(
       'service_role', 'public.horse_semantic_ledger',
       'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
  THEN
    RAISE EXCEPTION
      'post-apply failed: horse_semantic_ledger privileges are not service-role-only';
  END IF;

  IF to_regclass('public.horse_semantic_ledger_id_seq') IS NULL
     OR has_sequence_privilege(
       'anon', 'public.horse_semantic_ledger_id_seq', 'USAGE,SELECT,UPDATE'
     )
     OR has_sequence_privilege(
       'authenticated', 'public.horse_semantic_ledger_id_seq',
       'USAGE,SELECT,UPDATE'
     )
     OR NOT has_sequence_privilege(
       'service_role', 'public.horse_semantic_ledger_id_seq', 'USAGE'
     )
     OR NOT has_sequence_privilege(
       'service_role', 'public.horse_semantic_ledger_id_seq', 'SELECT'
     )
     OR has_sequence_privilege(
       'service_role', 'public.horse_semantic_ledger_id_seq', 'UPDATE'
     )
  THEN
    RAISE EXCEPTION
      'post-apply failed: horse_semantic_ledger sequence privileges are incorrect';
  END IF;

  SELECT count(*)::integer
  INTO v_index_count
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.tablename = 'horse_semantic_ledger'
    AND i.indexname IN (
      'horse_semantic_ledger_key_used_idx',
      'horse_semantic_ledger_horse_used_idx',
      'horse_semantic_ledger_exact_use_uniq'
    );

  IF v_index_count <> 3 THEN
    RAISE EXCEPTION
      'post-apply failed: horse_semantic_ledger indexes are incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'publish_horse_video_reel'
  ) <> 1 THEN
    RAISE EXCEPTION
      'post-apply failed: publish_horse_video_reel must have one overload';
  END IF;

  SELECT p.proowner, p.proacl
  INTO v_owner, v_acl
  FROM pg_proc p
  WHERE p.oid = v_fn
    AND p.prosecdef
    AND COALESCE(p.proconfig, ARRAY[]::text[])
      @> ARRAY['search_path=public, extensions']::text[];

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'post-apply failed: RPC is not SECURITY DEFINER with a fixed search_path';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(v_acl, acldefault('f', v_owner))) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
  INTO v_public_execute;

  IF v_public_execute
     OR has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
  THEN
    RAISE EXCEPTION
      'post-apply failed: publish_horse_video_reel privileges are incorrect';
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ===========================================================================
-- ROLLBACK (Tier 3; copy into a NEW _revert_ migration, never edit this file)
-- ===========================================================================
-- BEGIN;
-- DROP FUNCTION public.publish_horse_video_reel(
--   uuid, text, text, text, text, text, text, jsonb
-- );
-- DROP TABLE public.horse_semantic_ledger;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
