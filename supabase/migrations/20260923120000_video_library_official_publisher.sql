-- 20260923120000_video_library_official_publisher.sql
-- Video Library Reels are published by the official Smarter.Poker account.
-- TIER:         2 (new guard functions and triggers, one config row update)
-- AUTHOR:       Smarter-Poker (delegated migration helper, 2026-09-23)
-- AFFECTS:      video_reels_pipeline_config (row + trigger),
--               social_posts (trigger), social_reels (trigger),
--               new functions fn_video_library_publisher_is_eligible,
--               fn_guard_video_library_publisher_config,
--               fn_guard_video_library_row_author
-- IRREVERSIBLE: no (triggers and functions can be dropped; see ROLLBACK)
--
-- WHY (owner decision, Dan, 23 Sep 2026, explicit):
--   Video Library Reels publish ONLY as the official Smarter.Poker system
--   account, profile 00000000-0000-0000-0000-000000000001, never as a horse
--   and never as a content_authors persona. Publication stays gated by the
--   dedicated video_reels_pipeline_controls switches
--   (video_library_reel_creation + video_library_reel_publication), not by the
--   horse-fleet switch content_settings.engine_enabled.
--
--   Installed migration 20260906235959_video_reels_integrity_foundation
--   inferred the publisher from historical library rows and production ended
--   up with video_library_publisher_profile_id =
--   4f7f8abb-ba34-464c-9ecb-0ab7a972a978, which is a horse (is_horse = true,
--   with a content_authors row). publish_video_library_reel only checks that
--   p_author_id equals the configured publisher, so the configuration row is
--   the single source of the publishing identity and must never name a horse.
--
--   This is an identity rule for the official publisher account. It does not
--   exclude horses from anything a player receives (CLAUDE.md section 10.5):
--   no horse loses a post, a reward, a count or a seat. Horses simply are not
--   the Smarter.Poker brand account.
--
-- HOW:
--   1. Pre-flight: the foundation objects exist, and profile 0001 exists,
--      has is_horse = false and has no content_authors row. Otherwise the
--      whole migration aborts before changing anything.
--   2. fn_video_library_publisher_is_eligible(uuid): one definition of an
--      eligible publisher (existing profile, is_horse IS FALSE, no
--      content_authors.profile_id row). NULL is never eligible.
--   3. BEFORE INSERT OR UPDATE trigger on video_reels_pipeline_config that
--      rejects an ineligible video_library_publisher_profile_id (check_violation,
--      constraint name video_library_publisher_official_account).
--   4. Point the singleton row at 0001 (idempotent upsert).
--   5. Defence in depth at the write boundary: a BEFORE INSERT OR UPDATE
--      trigger on social_posts and on social_reels, WHEN origin_type =
--      'video_library', rejects a new row, a change of author, or a move into
--      video_library whose author is not eligible (check_violation, constraint
--      name video_library_author_official_account). The triggers are named
--      trg_<table>_zz_... so they sort after every existing BEFORE trigger and
--      judge the final NEW row (Postgres fires same-event triggers by name).
--      Updates that leave author_id and origin_type unchanged (counters, view
--      stats, visibility) are not re-judged, so engagement writes can never
--      fail because a profile flag changed later.
--      publish_video_library_reel (installed, ~9.5k chars) is deliberately NOT
--      replaced: it already requires p_author_id = configured publisher, the
--      config trigger makes that publisher eligible, and the row triggers cover
--      every other writer (service-role scripts, mirrors, repairs) too.
--   6. Post-apply assertions: config points at 0001, all three triggers exist
--      and are enabled, the functions are SECURITY DEFINER with a fixed
--      search_path, and PUBLIC/anon/authenticated cannot execute them.
--
-- NEVER REPLAY: once recorded in supabase_migrations.schema_migrations this
-- file must not be re-run or edited; write a new forward migration instead.
-- It is written to be idempotent only so a failed first attempt can be
-- retried safely. It never replays or modifies installed migrations
-- 20260906235959 / 20260907000000.
-- Apply outside the hourly break window (:50-:03 UTC, CLAUDE.md 1.2).

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Pre-flight assertions (fail fast, change nothing)
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_official constant uuid := '00000000-0000-0000-0000-000000000001';
  v_is_horse boolean;
BEGIN
  IF to_regclass('public.video_reels_pipeline_config') IS NULL
     OR to_regclass('public.social_posts') IS NULL
     OR to_regclass('public.social_reels') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.content_authors') IS NULL
  THEN
    RAISE EXCEPTION 'pre-flight failed: a required relation is missing (video_reels_pipeline_config, social_posts, social_reels, profiles, content_authors)';
  END IF;

  IF (
    SELECT count(*)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND (c.table_name, c.column_name) IN (
        ('video_reels_pipeline_config', 'video_library_publisher_profile_id'),
        ('social_posts', 'author_id'),
        ('social_posts', 'origin_type'),
        ('social_reels', 'author_id'),
        ('social_reels', 'origin_type'),
        ('profiles', 'is_horse'),
        ('content_authors', 'profile_id')
      )
  ) <> 7 THEN
    RAISE EXCEPTION 'pre-flight failed: expected publisher/author/origin/is_horse/profile_id columns are missing';
  END IF;

  IF to_regprocedure('public.publish_video_library_reel(text, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: publish_video_library_reel(text, uuid, text) is not installed';
  END IF;

  SELECT p.is_horse
  INTO v_is_horse
  FROM public.profiles p
  WHERE p.id = v_official;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pre-flight failed: official Smarter.Poker profile % does not exist', v_official;
  END IF;

  IF v_is_horse IS NOT FALSE THEN
    RAISE EXCEPTION 'pre-flight failed: official profile % has is_horse = % (must be false)',
      v_official, COALESCE(v_is_horse::text, 'NULL');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.content_authors ca WHERE ca.profile_id = v_official
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: official profile % has a content_authors row', v_official;
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. One definition of an eligible Video Library publisher
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_video_library_publisher_is_eligible(
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  SELECT p_profile_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = p_profile_id
         AND p.is_horse IS FALSE
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.content_authors ca
       WHERE ca.profile_id = p_profile_id
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_video_library_publisher_is_eligible(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_video_library_publisher_is_eligible(uuid) IS
  'True only for an existing profile with is_horse = false and no content_authors row. The canonical Video Library publisher is the official Smarter.Poker account 00000000-0000-0000-0000-000000000001 (owner decision 2026-09-23).';

-- ---------------------------------------------------------------------------
-- 3. The configured publisher can never be a horse or a content author
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_video_library_publisher_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  IF NOT public.fn_video_library_publisher_is_eligible(
    NEW.video_library_publisher_profile_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'video_library_publisher_official_account',
      MESSAGE = 'video_library_publisher_profile_id must be an existing non-horse profile with no content_authors row',
      DETAIL = format(
        'rejected video_library_publisher_profile_id = %s',
        COALESCE(NEW.video_library_publisher_profile_id::text, 'NULL')
      ),
      HINT = 'The canonical Video Library publisher is the official Smarter.Poker account 00000000-0000-0000-0000-000000000001.';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_guard_video_library_publisher_config()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_video_reels_pipeline_config_publisher_guard
  ON public.video_reels_pipeline_config;
CREATE TRIGGER trg_video_reels_pipeline_config_publisher_guard
  BEFORE INSERT OR UPDATE ON public.video_reels_pipeline_config
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_video_library_publisher_config();

-- ---------------------------------------------------------------------------
-- 4. Point the singleton at the official Smarter.Poker account
-- ---------------------------------------------------------------------------
INSERT INTO public.video_reels_pipeline_config (
  singleton_key,
  video_library_publisher_profile_id
)
VALUES ('video_library', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (singleton_key) DO UPDATE
SET video_library_publisher_profile_id = EXCLUDED.video_library_publisher_profile_id,
    updated_at = now()
WHERE public.video_reels_pipeline_config.video_library_publisher_profile_id
      IS DISTINCT FROM EXCLUDED.video_library_publisher_profile_id;

-- ---------------------------------------------------------------------------
-- 5. No video_library post or Reel is ever written with an ineligible author
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_video_library_row_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  IF NEW.origin_type = 'video_library'
     AND (
       TG_OP = 'INSERT'
       OR NEW.author_id IS DISTINCT FROM OLD.author_id
       OR OLD.origin_type IS DISTINCT FROM 'video_library'
     )
     AND NOT public.fn_video_library_publisher_is_eligible(NEW.author_id)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'video_library_author_official_account',
      MESSAGE = format(
        'video_library %s rows must be authored by an existing non-horse profile with no content_authors row',
        TG_TABLE_NAME
      ),
      DETAIL = format(
        'rejected author_id = %s',
        COALESCE(NEW.author_id::text, 'NULL')
      ),
      HINT = 'Publish Video Library Reels through publish_video_library_reel as the official Smarter.Poker account 00000000-0000-0000-0000-000000000001.';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_guard_video_library_row_author()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_social_posts_zz_video_library_official_author
  ON public.social_posts;
CREATE TRIGGER trg_social_posts_zz_video_library_official_author
  BEFORE INSERT OR UPDATE ON public.social_posts
  FOR EACH ROW
  WHEN (NEW.origin_type = 'video_library')
  EXECUTE FUNCTION public.fn_guard_video_library_row_author();

DROP TRIGGER IF EXISTS trg_social_reels_zz_video_library_official_author
  ON public.social_reels;
CREATE TRIGGER trg_social_reels_zz_video_library_official_author
  BEFORE INSERT OR UPDATE ON public.social_reels
  FOR EACH ROW
  WHEN (NEW.origin_type = 'video_library')
  EXECUTE FUNCTION public.fn_guard_video_library_row_author();

-- ---------------------------------------------------------------------------
-- 6. Post-apply assertions
-- ---------------------------------------------------------------------------
DO $postflight$
DECLARE
  v_official constant uuid := '00000000-0000-0000-0000-000000000001';
  v_publisher uuid;
  v_fn regprocedure;
  v_trigger record;
BEGIN
  SELECT c.video_library_publisher_profile_id
  INTO v_publisher
  FROM public.video_reels_pipeline_config c
  WHERE c.singleton_key = 'video_library';

  IF v_publisher IS DISTINCT FROM v_official THEN
    RAISE EXCEPTION 'post-apply failed: video_library publisher is %, expected %',
      COALESCE(v_publisher::text, 'NULL'), v_official;
  END IF;

  IF NOT public.fn_video_library_publisher_is_eligible(v_publisher) THEN
    RAISE EXCEPTION 'post-apply failed: configured publisher % is not eligible', v_publisher;
  END IF;

  FOR v_trigger IN
    SELECT *
    FROM (VALUES
      ('public.video_reels_pipeline_config'::regclass,
       'trg_video_reels_pipeline_config_publisher_guard'),
      ('public.social_posts'::regclass,
       'trg_social_posts_zz_video_library_official_author'),
      ('public.social_reels'::regclass,
       'trg_social_reels_zz_video_library_official_author')
    ) AS expected(relid, tgname)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      WHERE t.tgrelid = v_trigger.relid
        AND t.tgname = v_trigger.tgname
        AND NOT t.tgisinternal
        AND t.tgenabled IN ('O', 'A')
    ) THEN
      RAISE EXCEPTION 'post-apply failed: trigger % on % is missing or disabled',
        v_trigger.tgname, v_trigger.relid;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_video_library_publisher_is_eligible(uuid)'::regprocedure,
    'public.fn_guard_video_library_publisher_config()'::regprocedure,
    'public.fn_guard_video_library_row_author()'::regprocedure
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      WHERE p.oid = v_fn
        AND p.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
          WHERE cfg.setting LIKE 'search_path=%'
        )
    ) THEN
      RAISE EXCEPTION 'post-apply failed: % must be SECURITY DEFINER with a fixed search_path', v_fn;
    END IF;

    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR EXISTS (
         SELECT 1
         FROM pg_proc p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_fn
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
       )
    THEN
      RAISE EXCEPTION 'post-apply failed: % is executable by PUBLIC, anon or authenticated', v_fn;
    END IF;
  END LOOP;

  IF public.fn_video_library_publisher_is_eligible(NULL) THEN
    RAISE EXCEPTION 'post-apply failed: NULL must never be an eligible publisher';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.is_horse IS NOT FALSE
      AND public.fn_video_library_publisher_is_eligible(p.id)
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'post-apply failed: a horse profile is reported as an eligible publisher';
  END IF;
END
$postflight$;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (paste into a NEW forward migration only if these guards must be
-- removed; this deliberately does NOT restore a horse as the publisher)
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_social_reels_zz_video_library_official_author ON public.social_reels;
-- DROP TRIGGER IF EXISTS trg_social_posts_zz_video_library_official_author ON public.social_posts;
-- DROP TRIGGER IF EXISTS trg_video_reels_pipeline_config_publisher_guard ON public.video_reels_pipeline_config;
-- DROP FUNCTION IF EXISTS public.fn_guard_video_library_row_author();
-- DROP FUNCTION IF EXISTS public.fn_guard_video_library_publisher_config();
-- DROP FUNCTION IF EXISTS public.fn_video_library_publisher_is_eligible(uuid);
-- COMMIT;
