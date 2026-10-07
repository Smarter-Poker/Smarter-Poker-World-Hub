-- =======================================================================
-- 20261006165759_fleet_content_metrics.sql
-- =======================================================================
-- TIER:        3 (one new SECURITY DEFINER function, service_role only; no
--              table, column, index, policy, trigger or row is created or
--              changed by this file, and the function itself never writes)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p10a),
--              Fleet Content Programme Phase 10 "one engine, measured"
-- AFFECTS:     new function: public.fn_fleet_content_metrics(integer)
--                RETURNS jsonb, STABLE, SECURITY DEFINER, search_path public
--                and extensions; EXECUTE for service_role only (REVOKE from
--                PUBLIC, anon, authenticated; OWNER postgres)
--              read at run time, never written: public.social_posts,
--                public.profiles, public.social_likes, public.social_comments,
--                public.content_authors, public.cron_execution_log,
--                public.horse_phrase_ledger, public.content_asset_use and
--                public.fn_horses_not_social_ready()
--              public.content_settings is counted once by the post-apply
--                block and never written; public.horse_post_modes is not
--                read or written (the owner's hold on both stays intact)
-- IRREVERSIBLE: no (the ROLLBACK block at the end drops exactly the one
--              function this file creates)
--
-- WHY:
--   Phase 10 puts five measured numbers on the horses admin page (Stats tab,
--   "Content Engine") and the same five in the Monday digest mail: horse
--   share of the feed, human reactions per horse post, distinct caption rate,
--   fleet coverage, and the drift detector count. Until now the page read a
--   stale JavaScript mirror of the engine (src/content-engine, deleted in the
--   next PR) that computed from horse_analytics, a table nothing live writes,
--   so every figure it showed was empty. One database function that both the
--   page and the digest call means the number on the screen and the number
--   in the mail cannot disagree, and neither consumer invents a key.
--
-- HOW:
--   - fn_fleet_content_metrics(p_days): p_days is clamped to 1..365 (a bad
--     value is clamped, never an error); the window is [now() - p_days days,
--     now()). Every count is an integer, every *_pct is numeric rounded to
--     one decimal, every per_* is numeric rounded to three decimals, and a
--     division by zero yields 0 (never null) so every consumer can print it.
--   - A horse post is a social_posts row whose author_id has profiles.is_horse
--     = true. The feed denominator counts every post the public feed would
--     show, horses included: horses are players (CLAUDE.md 10.5). is_horse
--     only ever identifies a horse here; it never removes one from a count a
--     human is in.
--   - Human reactions are social_likes and non-deleted social_comments created
--     in the window by accounts whose profile is not a horse, on any
--     horse-authored post, divided by horse posts published in the window.
--   - Distinct captions use the phrase ledger's own key: the first line,
--     lower-cased, punctuation stripped.
--   - Fleet coverage uses the engine's own fleet (workers Fleet.ts):
--     content_authors.is_active with a profile_id, joined to profiles that are
--     horses with an avatar_url; horses_posted is the distinct fleet authors
--     with a non-deleted post in the window; coverage_pct_of_1000 is the
--     programme's own wording of the same numerator.
--   - readiness is the raw count(*) of fn_horses_not_social_ready(), which is
--     not changed by this file. Caveat the page carries: that function has no
--     profiles.status filter, so horses benched on 2026-10-06 (is_active =
--     false, status = 'deleted') are counted until it is amended separately.
--   - runs: one element per fleet job_name, always eight, always in the same
--     order, zeros when the window holds no row, from cron_execution_log.
--   - ledger: the phrase ledger by key kind (caption, meaning, frame; always
--     three elements in that order) and the asset ledger, both in the window.
--   - Grants follow 20261005112820_operator_rake_aggregate_reports.sql: the
--     operator route (/api/horses/analytics, console.read) and the workers
--     digest both hold the service role; nothing in a browser can call this.
--
-- EVIDENCE (repository as of 2026-10-06, HEAD 549350d; the pre-flight block
--   below re-proves every column against the live catalogue before anything
--   is created, because no production query was run to write this file):
--   social_posts.author_id, content, visibility, is_deleted, created_at:
--     supabase/migrations/20260926143400_horse_video_reels_atomic_publisher.sql
--     lines 95 to 105 (pre-flight list), pages/api/social/feed.js lines 482
--     to 483 (the public feed filter: visibility public or null, not deleted).
--   profiles.is_horse, avatar_url: workers src/lib/content-engine/Fleet.ts
--     lines 61 to 78 (postingReadyHorseIds).
--   social_likes.post_id, user_id, created_at: workers
--     src/lib/content-engine/HorseSocialEngine.ts lines 129 to 132 and 941 to
--     946; pages/api/social/interactions.js lines 242 to 271.
--   social_comments.post_id, author_id, created_at, is_deleted:
--     supabase/migrations/20260929224541_post_comment_counts_match_their_visible_comments.sql
--     line 28; pages/api/social/interactions.js line 73.
--   content_authors.profile_id, is_active: Fleet.ts lines 32 to 50.
--   cron_execution_log.job_name, status, started_at, result:
--     supabase/migrations/20260314_phantom_tables.sql lines 158 to 167;
--     the eight fleet job names are the workers route paths registered in
--     workers src/index.ts lines 277 to 288 and 323 to 335.
--   horse_phrase_ledger.phrase_norm, used_at and content_asset_use.asset_key,
--     used_at: supabase/migrations/20260905120000_content_ledgers_the_fleet_remembers_what_it_posted.sql
--     lines 51 to 74; the caption key expression is that file's lines 111
--     to 112; the meaning: and frame: prefixes are workers ContentLedger.ts
--     lines 97 to 102 and HorsePublisher.ts lines 1078 and 1149.
--   fn_horses_not_social_ready(): supabase/migrations/20260905121000_every_horse_is_born_social.sql
--     lines 217 to 240.
--   Grant pattern: supabase/migrations/20261005112820_operator_rake_aggregate_reports.sql
--     lines 169 to 181.
--   Contract both consumers build to: agent-evidence p10/rpc-contract.md.
-- =======================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT ASSERTIONS: every column and function this file reads exists,
--    and the roles it grants to or revokes from exist. Nothing is created yet.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required.table_name || '.' || required.column_name, ', '
                    ORDER BY required.table_name, required.column_name)
    INTO v_missing
    FROM (VALUES
      ('social_posts', 'id'), ('social_posts', 'author_id'), ('social_posts', 'content'),
      ('social_posts', 'visibility'), ('social_posts', 'is_deleted'), ('social_posts', 'created_at'),
      ('profiles', 'id'), ('profiles', 'is_horse'), ('profiles', 'avatar_url'),
      ('social_likes', 'post_id'), ('social_likes', 'user_id'), ('social_likes', 'created_at'),
      ('social_comments', 'post_id'), ('social_comments', 'author_id'),
      ('social_comments', 'is_deleted'), ('social_comments', 'created_at'),
      ('content_authors', 'profile_id'), ('content_authors', 'is_active'),
      ('cron_execution_log', 'job_name'), ('cron_execution_log', 'status'),
      ('cron_execution_log', 'started_at'), ('cron_execution_log', 'result'),
      ('horse_phrase_ledger', 'phrase_norm'), ('horse_phrase_ledger', 'used_at'),
      ('content_asset_use', 'asset_key'), ('content_asset_use', 'used_at'),
      ('content_settings', 'engine_enabled')
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
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_horses_not_social_ready' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: public.fn_horses_not_social_ready() not found';
  END IF;

  SELECT string_agg(required.rolname, ', ' ORDER BY required.rolname)
    INTO v_missing
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS required(rolname)
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = required.rolname);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: roles missing: %', v_missing;
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. THE FUNCTION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fleet_content_metrics(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '15000ms'
AS $function$
DECLARE
  -- A bad window is clamped, never an error: 0 reads as 1 day, 9999 as 365.
  v_days          integer := LEAST(GREATEST(coalesce(p_days, 7), 1), 365);
  v_until         timestamptz := now();
  v_since         timestamptz;
  v_feed          jsonb;
  v_horse_posts   bigint;
  v_horses_posted bigint;
  v_likes         bigint;
  v_comments      bigint;
  v_captions      jsonb;
  v_fleet_size    bigint;
  v_fleet_posted  bigint;
  v_not_ready     bigint;
  v_runs          jsonb;
  v_phrases       jsonb;
  v_assets        jsonb;
BEGIN
  v_since := v_until - make_interval(days => v_days);

  -- 1. Horse share of the feed. The denominator is every post the public feed
  --    would show in the window, horses included with everyone else: horses
  --    are players (CLAUDE.md 10.5). is_horse identifies the numerator only.
  SELECT jsonb_build_object(
           'horse_posts',     count(*) FILTER (WHERE p.is_horse IS TRUE),
           'feed_posts',      count(*),
           'horse_share_pct', coalesce(
             round(100.0 * (count(*) FILTER (WHERE p.is_horse IS TRUE)) / nullif(count(*), 0), 1),
             0.0))
    INTO v_feed
    FROM public.social_posts sp
    LEFT JOIN public.profiles p ON p.id = sp.author_id
   WHERE sp.created_at >= v_since AND sp.created_at < v_until
     AND sp.is_deleted IS NOT TRUE
     AND (sp.visibility = 'public' OR sp.visibility IS NULL);

  -- 2. Horse posts published in the window, and the distinct horses that
  --    wrote them (the "posts" block, and the reactions denominator).
  SELECT count(*), count(DISTINCT sp.author_id)
    INTO v_horse_posts, v_horses_posted
    FROM public.social_posts sp
    JOIN public.profiles p ON p.id = sp.author_id
   WHERE p.is_horse IS TRUE
     AND sp.created_at >= v_since AND sp.created_at < v_until
     AND sp.is_deleted IS NOT TRUE;

  -- 3. Human reactions on horse posts: likes and non-deleted comments created
  --    in the window by accounts whose profile is not a horse (a reactor with
  --    no profile row counts as a person), on any horse-authored post.
  SELECT count(*)
    INTO v_likes
    FROM public.social_likes l
    JOIN public.social_posts sp ON sp.id = l.post_id
    JOIN public.profiles a ON a.id = sp.author_id
    LEFT JOIN public.profiles u ON u.id = l.user_id
   WHERE l.created_at >= v_since AND l.created_at < v_until
     AND a.is_horse IS TRUE
     AND u.is_horse IS NOT TRUE;

  SELECT count(*)
    INTO v_comments
    FROM public.social_comments c
    JOIN public.social_posts sp ON sp.id = c.post_id
    JOIN public.profiles a ON a.id = sp.author_id
    LEFT JOIN public.profiles u ON u.id = c.author_id
   WHERE c.created_at >= v_since AND c.created_at < v_until
     AND c.is_deleted IS NOT TRUE
     AND a.is_horse IS TRUE
     AND u.is_horse IS NOT TRUE;

  -- 4. Distinct caption rate: the first line of every non-empty horse caption
  --    in the window, lower-cased with punctuation stripped (the ledger key),
  --    over horse posts with a caption.
  SELECT jsonb_build_object(
           'horse_posts',          count(*),
           'distinct_captions',    count(DISTINCT lower(regexp_replace(split_part(sp.content, E'\n', 1), '[^a-z0-9 ]', '', 'gi'))),
           'distinct_caption_pct', coalesce(
             round(100.0 * count(DISTINCT lower(regexp_replace(split_part(sp.content, E'\n', 1), '[^a-z0-9 ]', '', 'gi')))
                   / nullif(count(*), 0), 1),
             0.0))
    INTO v_captions
    FROM public.social_posts sp
    JOIN public.profiles p ON p.id = sp.author_id
   WHERE p.is_horse IS TRUE
     AND sp.created_at >= v_since AND sp.created_at < v_until
     AND sp.is_deleted IS NOT TRUE
     AND coalesce(sp.content, '') <> '';

  -- 5. Fleet coverage. The fleet is what the engine can schedule (workers
  --    Fleet.ts): an active content_authors row with a profile that is a
  --    horse with an avatar. horses_posted is the distinct fleet authors with
  --    a non-deleted post in the window.
  SELECT count(DISTINCT ca.profile_id)
    INTO v_fleet_size
    FROM public.content_authors ca
    JOIN public.profiles p ON p.id = ca.profile_id
   WHERE ca.is_active IS TRUE
     AND ca.profile_id IS NOT NULL
     AND p.is_horse IS TRUE
     AND p.avatar_url IS NOT NULL;

  SELECT count(DISTINCT sp.author_id)
    INTO v_fleet_posted
    FROM public.social_posts sp
    JOIN public.content_authors ca ON ca.profile_id = sp.author_id
    JOIN public.profiles p ON p.id = sp.author_id
   WHERE ca.is_active IS TRUE
     AND p.is_horse IS TRUE
     AND p.avatar_url IS NOT NULL
     AND sp.created_at >= v_since AND sp.created_at < v_until
     AND sp.is_deleted IS NOT TRUE;

  -- 6. The drift detector, raw: every row fn_horses_not_social_ready() lists.
  SELECT count(*)
    INTO v_not_ready
    FROM public.fn_horses_not_social_ready();

  -- 7. Fleet runs: one element per job, always eight, always in this order,
  --    zeros when the window holds no row. A skipped run writes result.skipped
  --    as a string (horses-social-all writes an array of step names on a
  --    normal run, which is not a skipped run). The numeric keys are summed
  --    only where the stored value is a JSON number.
  SELECT jsonb_agg(jsonb_build_object(
           'job_name',        j.job_name,
           'runs',            coalesce(r.runs, 0),
           'succeeded',       coalesce(r.succeeded, 0),
           'errored',         coalesce(r.errored, 0),
           'killed',          coalesce(r.killed, 0),
           'skipped_runs',    coalesce(r.skipped_runs, 0),
           'engine_off_runs', coalesce(r.engine_off_runs, 0),
           'due',             coalesce(r.due, 0),
           'posted',          coalesce(r.posted, 0),
           'failed',          coalesce(r.failed, 0),
           'collided',        coalesce(r.collided, 0),
           'enqueued',        coalesce(r.enqueued, 0)
         ) ORDER BY j.ord)
    INTO v_runs
    FROM (VALUES
           (1, '/cron/horse-posts'),
           (2, '/cron/horse-video-reels'),
           (3, '/cron/horses-social-all'),
           (4, '/cron/horses-social-friends'),
           (5, '/cron/horses-stories'),
           (6, '/cron/phase6-content'),
           (7, '/cron/phase7-content'),
           (8, '/cron/phase9-content')
         ) AS j(ord, job_name)
    LEFT JOIN (
      SELECT l.job_name,
             count(*)                                                                AS runs,
             count(*) FILTER (WHERE l.status = 'success')                            AS succeeded,
             count(*) FILTER (WHERE l.status = 'error')                              AS errored,
             count(*) FILTER (WHERE l.status = 'killed')                             AS killed,
             count(*) FILTER (WHERE jsonb_typeof(l.result -> 'skipped') = 'string')  AS skipped_runs,
             count(*) FILTER (WHERE l.result ->> 'skipped' = 'engine_disabled')      AS engine_off_runs,
             coalesce(sum((l.result ->> 'due')::numeric)
                      FILTER (WHERE jsonb_typeof(l.result -> 'due') = 'number'), 0)::bigint      AS due,
             coalesce(sum((l.result ->> 'posted')::numeric)
                      FILTER (WHERE jsonb_typeof(l.result -> 'posted') = 'number'), 0)::bigint   AS posted,
             coalesce(sum((l.result ->> 'failed')::numeric)
                      FILTER (WHERE jsonb_typeof(l.result -> 'failed') = 'number'), 0)::bigint   AS failed,
             coalesce(sum((l.result ->> 'collided')::numeric)
                      FILTER (WHERE jsonb_typeof(l.result -> 'collided') = 'number'), 0)::bigint AS collided,
             coalesce(sum((l.result ->> 'enqueued')::numeric)
                      FILTER (WHERE jsonb_typeof(l.result -> 'enqueued') = 'number'), 0)::bigint AS enqueued
        FROM public.cron_execution_log l
       WHERE l.started_at >= v_since AND l.started_at < v_until
         AND l.job_name IN ('/cron/horse-posts', '/cron/horse-video-reels', '/cron/horses-social-all',
                            '/cron/horses-social-friends', '/cron/horses-stories',
                            '/cron/phase6-content', '/cron/phase7-content', '/cron/phase9-content')
       GROUP BY l.job_name
    ) r ON r.job_name = j.job_name;

  -- 8. The phrase ledger by key kind, always three elements in this order.
  --    rows_that_repeat is the rows whose key occurs more than once in the
  --    window; a frame repeating after its global window is by design, which
  --    is why frames are reported apart from captions.
  SELECT jsonb_agg(jsonb_build_object(
           'kind',             k.kind,
           'rows_written',     coalesce(s.rows_written, 0),
           'distinct_keys',    coalesce(s.distinct_keys, 0),
           'rows_that_repeat', coalesce(s.rows_that_repeat, 0)
         ) ORDER BY k.ord)
    INTO v_phrases
    FROM (VALUES (1, 'caption'), (2, 'meaning'), (3, 'frame')) AS k(ord, kind)
    LEFT JOIN (
      SELECT CASE WHEN l.phrase_norm LIKE 'frame:%'   THEN 'frame'
                  WHEN l.phrase_norm LIKE 'meaning:%' THEN 'meaning'
                  ELSE 'caption' END               AS kind,
             count(*)                              AS rows_written,
             count(DISTINCT l.phrase_norm)         AS distinct_keys,
             count(*) FILTER (WHERE l.n > 1)       AS rows_that_repeat
        FROM (SELECT phrase_norm, count(*) OVER (PARTITION BY phrase_norm) AS n
                FROM public.horse_phrase_ledger
               WHERE used_at >= v_since AND used_at < v_until) l
       GROUP BY 1
    ) s ON s.kind = k.kind;

  -- 9. The asset ledger in the window.
  SELECT jsonb_build_object('rows', count(*), 'distinct', count(DISTINCT asset_key))
    INTO v_assets
    FROM public.content_asset_use
   WHERE used_at >= v_since AND used_at < v_until;

  RETURN jsonb_build_object(
    'window',    jsonb_build_object('days', v_days, 'since', v_since, 'until', v_until),
    'feed',      v_feed,
    'reactions', jsonb_build_object(
                   'human_likes',    v_likes,
                   'human_comments', v_comments,
                   'horse_posts',    v_horse_posts,
                   'per_horse_post', coalesce(
                     round((v_likes + v_comments)::numeric / nullif(v_horse_posts, 0), 3),
                     0.000)),
    'captions',  v_captions,
    'coverage',  jsonb_build_object(
                   'horses_posted',        v_fleet_posted,
                   'fleet_size',           v_fleet_size,
                   'coverage_pct',         coalesce(round(100.0 * v_fleet_posted / nullif(v_fleet_size, 0), 1), 0.0),
                   'coverage_pct_of_1000', round(100.0 * v_fleet_posted / 1000, 1)),
    'readiness', jsonb_build_object('horses_not_social_ready', v_not_ready),
    'posts',     jsonb_build_object('horse_posts', v_horse_posts, 'horses_posted', v_horses_posted),
    'runs',      v_runs,
    'ledger',    jsonb_build_object('phrases', v_phrases, 'assets', v_assets)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fleet_content_metrics(integer)
  FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.fn_fleet_content_metrics(integer)
  OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_fleet_content_metrics(integer)
  TO service_role;

COMMENT ON FUNCTION public.fn_fleet_content_metrics(integer)
  IS 'Read-only Phase 10 fleet content metrics for the horses admin page and the weekly digest: feed share, human reactions, distinct captions, fleet coverage, drift count, fleet runs and ledgers over the last p_days days (clamped 1..365). Horses count in every denominator. Service role only.';

-- ---------------------------------------------------------------------------
-- 3. POST-APPLY ASSERTIONS: the contract both consumers build to holds on
--    this database, before anything commits.
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  v jsonb;
  n integer;
  k text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
     WHERE s.nspname = 'public' AND p.proname = 'fn_fleet_content_metrics'
       AND p.pronargs = 1 AND p.prosecdef AND p.provolatile = 's'
       AND pg_get_userbyid(p.proowner) = 'postgres'
       AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=public%')
  ) THEN
    RAISE EXCEPTION 'post-apply failed: fn_fleet_content_metrics ownership, volatility or security contract differs';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.fn_fleet_content_metrics(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_fleet_content_metrics(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_fleet_content_metrics(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: fn_fleet_content_metrics grants differ';
  END IF;

  -- The engine switch the fleet reads is one row; a second row would mean two
  -- switches, and this function reports on the fleet that row controls.
  SELECT count(*) INTO n FROM public.content_settings;
  IF n <> 1 THEN
    RAISE EXCEPTION 'post-apply failed: content_settings must hold exactly one row, found %', n;
  END IF;

  v := public.fn_fleet_content_metrics(7);
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
    RAISE EXCEPTION 'post-apply failed: fn_fleet_content_metrics(7) did not return an object';
  END IF;
  FOREACH k IN ARRAY ARRAY['window', 'feed', 'reactions', 'captions', 'coverage',
                           'readiness', 'posts', 'runs', 'ledger'] LOOP
    IF (v -> k) IS NULL THEN
      RAISE EXCEPTION 'post-apply failed: key % is missing from fn_fleet_content_metrics(7)', k;
    END IF;
  END LOOP;
  IF (v -> 'window' ->> 'days')::integer IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'post-apply failed: window.days must echo 7, found %', v -> 'window' ->> 'days';
  END IF;
  IF jsonb_typeof(v -> 'runs') IS DISTINCT FROM 'array' OR jsonb_array_length(v -> 'runs') IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'post-apply failed: runs must carry eight job elements';
  END IF;
  IF (v -> 'runs' -> 0 ->> 'job_name') IS DISTINCT FROM '/cron/horse-posts'
     OR (v -> 'runs' -> 7 ->> 'job_name') IS DISTINCT FROM '/cron/phase9-content' THEN
    RAISE EXCEPTION 'post-apply failed: runs are not in the contract order';
  END IF;
  IF jsonb_typeof(v -> 'ledger' -> 'phrases') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v -> 'ledger' -> 'phrases') IS DISTINCT FROM 3
     OR (v -> 'ledger' -> 'phrases' -> 0 ->> 'kind') IS DISTINCT FROM 'caption'
     OR (v -> 'ledger' -> 'phrases' -> 1 ->> 'kind') IS DISTINCT FROM 'meaning'
     OR (v -> 'ledger' -> 'phrases' -> 2 ->> 'kind') IS DISTINCT FROM 'frame' THEN
    RAISE EXCEPTION 'post-apply failed: ledger.phrases must carry caption, meaning, frame in that order';
  END IF;
  IF (v -> 'feed' ->> 'horse_share_pct') IS NULL
     OR (v -> 'reactions' ->> 'per_horse_post') IS NULL
     OR (v -> 'captions' ->> 'distinct_caption_pct') IS NULL
     OR (v -> 'coverage' ->> 'coverage_pct') IS NULL
     OR (v -> 'readiness' ->> 'horses_not_social_ready') IS NULL THEN
    RAISE EXCEPTION 'post-apply failed: a metric came back null; the contract says zero, never null';
  END IF;

  -- The clamp: 0 reads as one day, 400 as the 365-day ceiling the route allows.
  IF (public.fn_fleet_content_metrics(0) -> 'window' ->> 'days')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'post-apply failed: p_days below 1 must clamp to 1';
  END IF;
  IF (public.fn_fleet_content_metrics(400) -> 'window' ->> 'days')::integer IS DISTINCT FROM 365 THEN
    RAISE EXCEPTION 'post-apply failed: p_days above 365 must clamp to 365';
  END IF;
END $postapply$;

COMMIT;

-- =======================================================================
-- ROLLBACK (manual, if ever needed: drops exactly what this file created)
-- =======================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_fleet_content_metrics(integer);
-- COMMIT;
