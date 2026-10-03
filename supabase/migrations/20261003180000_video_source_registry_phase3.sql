-- Phase 3: operator-owned Video Library source registry and ingestion ledger.
-- TIER: 2 (additive columns, tables, indexes, RLS, and one service-only RPC)
-- AUTHOR: Codex
-- AFFECTS: public.content_sources; new video_source_ingestion_runs and
--          video_source_quota_usage tables; fn_record_video_source_observation
-- IRREVERSIBLE: no
--
-- Existing content_sources consumers continue using domain/kind/name/handle.
-- New ingestion fields are nullable or have conservative defaults, so the
-- application and Open Claw worker can be deployed on either side of install.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.content_sources') IS NULL THEN
    RAISE EXCEPTION 'preflight: public.content_sources is missing';
  END IF;
  IF to_regclass('public.video_library_videos') IS NULL THEN
    RAISE EXCEPTION 'preflight: public.video_library_videos is missing';
  END IF;
END $$;

ALTER TABLE public.content_sources
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS provider_source_id text,
  ADD COLUMN IF NOT EXISTS uploads_playlist_id text,
  ADD COLUMN IF NOT EXISTS ingest_topic text,
  ADD COLUMN IF NOT EXISTS ingestion_mode text NOT NULL DEFAULT 'creator_uploads',
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cadence_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS max_candidates_per_run integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS expected_daily_candidates integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS provider_category_id text,
  ADD COLUMN IF NOT EXISTS rights_status text NOT NULL DEFAULT 'embed_only',
  ADD COLUMN IF NOT EXISTS playback_mode text NOT NULL DEFAULT 'youtube_embed',
  ADD COLUMN IF NOT EXISTS attribution_url text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_new_item_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_empty_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_code text,
  ADD COLUMN IF NOT EXISTS last_candidate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_qualified_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_units_last_run integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operator_notes text;

ALTER TABLE public.video_library_videos
  ADD COLUMN IF NOT EXISTS made_for_kids boolean,
  ADD COLUMN IF NOT EXISTS provider_channel_id text,
  ADD COLUMN IF NOT EXISTS provider_retrieved_at timestamptz;

UPDATE public.content_sources
SET ingest_topic = CASE
  WHEN domain = 'sports' THEN 'sports'
  WHEN lower(coalesce(category, '')) IN ('slots', 'casino', 'gambling') THEN 'casino_slots'
  ELSE 'poker'
END
WHERE ingest_topic IS NULL;

ALTER TABLE public.content_sources
  ALTER COLUMN ingest_topic SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_ingest_topic_check') THEN
    ALTER TABLE public.content_sources ADD CONSTRAINT content_sources_ingest_topic_check
      CHECK (ingest_topic IN ('poker', 'casino_slots', 'sports')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_ingestion_mode_check') THEN
    ALTER TABLE public.content_sources ADD CONSTRAINT content_sources_ingestion_mode_check
      CHECK (ingestion_mode IN ('creator_uploads', 'sports_chart', 'rss')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_lifecycle_status_check') THEN
    ALTER TABLE public.content_sources ADD CONSTRAINT content_sources_lifecycle_status_check
      CHECK (lifecycle_status IN ('active', 'paused', 'quarantined', 'retired')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_cadence_check') THEN
    ALTER TABLE public.content_sources ADD CONSTRAINT content_sources_cadence_check
      CHECK (cadence_minutes BETWEEN 15 AND 43200 AND max_candidates_per_run BETWEEN 1 AND 500 AND expected_daily_candidates >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_rights_playback_check') THEN
    ALTER TABLE public.content_sources ADD CONSTRAINT content_sources_rights_playback_check
      CHECK (rights_status IN ('embed_only', 'owned', 'licensed') AND playback_mode IN ('youtube_embed', 'native')) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS content_sources_provider_identity_key
  ON public.content_sources (provider, provider_source_id, ingestion_mode, coalesce(region_code, ''))
  WHERE provider_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_sources_video_due_idx
  ON public.content_sources (lifecycle_status, last_checked_at NULLS FIRST)
  WHERE kind = 'youtube_channel' AND is_active;

CREATE TABLE IF NOT EXISTS public.video_source_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  source_id uuid REFERENCES public.content_sources(id) ON DELETE SET NULL,
  source_name text NOT NULL,
  topic text NOT NULL CHECK (topic IN ('poker', 'casino_slots', 'sports')),
  ingestion_mode text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'empty', 'failed', 'quota_stopped')),
  candidates integer NOT NULL DEFAULT 0 CHECK (candidates >= 0),
  qualified integer NOT NULL DEFAULT 0 CHECK (qualified >= 0),
  inserted integer NOT NULL DEFAULT 0 CHECK (inserted >= 0),
  duplicates integer NOT NULL DEFAULT 0 CHECK (duplicates >= 0),
  rejected integer NOT NULL DEFAULT 0 CHECK (rejected >= 0),
  quota_units integer NOT NULL DEFAULT 0 CHECK (quota_units >= 0),
  failure_code text,
  cursor_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  cursor_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_source_ingestion_runs_source_time_idx
  ON public.video_source_ingestion_runs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS video_source_ingestion_runs_status_time_idx
  ON public.video_source_ingestion_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS public.video_source_quota_usage (
  usage_date date PRIMARY KEY,
  units_used integer NOT NULL DEFAULT 0 CHECK (units_used >= 0),
  daily_budget integer NOT NULL DEFAULT 9000 CHECK (daily_budget BETWEEN 100 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_source_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_source_quota_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_source_ingestion_runs FROM anon, authenticated;
REVOKE ALL ON public.video_source_quota_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_record_video_source_observation(
  p_operation_id uuid,
  p_source_id uuid,
  p_status text,
  p_candidates integer,
  p_qualified integer,
  p_inserted integer,
  p_duplicates integer,
  p_rejected integer,
  p_quota_units integer,
  p_cursor_before jsonb,
  p_cursor_after jsonb,
  p_failure_code text DEFAULT NULL
) RETURNS public.video_source_ingestion_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_source public.content_sources%ROWTYPE;
  v_run public.video_source_ingestion_runs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('succeeded', 'empty', 'failed', 'quota_stopped') THEN
    RAISE EXCEPTION 'invalid terminal ingestion status';
  END IF;
  IF least(p_candidates, p_qualified, p_inserted, p_duplicates, p_rejected, p_quota_units) < 0 THEN
    RAISE EXCEPTION 'ingestion counts cannot be negative';
  END IF;

  SELECT * INTO v_run FROM public.video_source_ingestion_runs
  WHERE operation_id = p_operation_id;
  IF FOUND THEN RETURN v_run; END IF;

  SELECT * INTO v_source FROM public.content_sources WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown content source'; END IF;

  INSERT INTO public.video_source_ingestion_runs (
    operation_id, source_id, source_name, topic, ingestion_mode, status,
    candidates, qualified, inserted, duplicates, rejected, quota_units,
    failure_code, cursor_before, cursor_after, completed_at
  ) VALUES (
    p_operation_id, v_source.id, v_source.name, v_source.ingest_topic,
    v_source.ingestion_mode, p_status, p_candidates, p_qualified, p_inserted,
    p_duplicates, p_rejected, p_quota_units, p_failure_code,
    coalesce(p_cursor_before, '{}'::jsonb), coalesce(p_cursor_after, '{}'::jsonb), now()
  )
  RETURNING * INTO v_run;

  UPDATE public.content_sources SET
    provider_cursor = CASE WHEN p_status IN ('succeeded', 'empty') THEN coalesce(p_cursor_after, provider_cursor) ELSE provider_cursor END,
    last_checked_at = now(),
    last_success_at = CASE WHEN p_status IN ('succeeded', 'empty') THEN now() ELSE last_success_at END,
    last_new_item_at = CASE WHEN p_status = 'succeeded' AND p_inserted > 0 THEN now() ELSE last_new_item_at END,
    last_empty_success_at = CASE WHEN p_status = 'empty' THEN now() ELSE last_empty_success_at END,
    last_failure_at = CASE WHEN p_status = 'failed' THEN now() ELSE last_failure_at END,
    last_failure_code = CASE WHEN p_status IN ('succeeded', 'empty') THEN NULL ELSE p_failure_code END,
    consecutive_failures = CASE WHEN p_status IN ('succeeded', 'empty') THEN 0 ELSE consecutive_failures + 1 END,
    last_candidate_count = p_candidates,
    last_qualified_count = p_qualified,
    quota_units_last_run = v_run.quota_units,
    clips_found = clips_found + p_inserted,
    last_scraped_at = now(),
    last_ok_at = CASE WHEN p_status IN ('succeeded', 'empty') THEN now() ELSE last_ok_at END,
    updated_at = now()
  WHERE id = p_source_id;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_record_video_source_observation(uuid,uuid,text,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_video_source_observation(uuid,uuid,text,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_reserve_video_source_quota(p_units integer)
RETURNS public.video_source_quota_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.video_source_quota_usage%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_units < 1 OR p_units > 100 THEN
    RAISE EXCEPTION 'quota reservation must be between 1 and 100 units';
  END IF;
  INSERT INTO public.video_source_quota_usage (usage_date, units_used)
  VALUES (v_today, p_units)
  ON CONFLICT (usage_date) DO UPDATE
    SET units_used = public.video_source_quota_usage.units_used + EXCLUDED.units_used,
        updated_at = now()
    WHERE public.video_source_quota_usage.units_used + EXCLUDED.units_used
      <= public.video_source_quota_usage.daily_budget
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily YouTube quota budget exhausted' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reserve_video_source_quota(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reserve_video_source_quota(integer) TO service_role;

-- Known, current gambling/slot channels. Domain remains `poker` for backwards
-- compatibility with the legacy two-value domain constraint; ingest_topic is
-- the authoritative feed topic.
INSERT INTO public.content_sources (
  domain, kind, name, handle, category, ingest_topic, ingestion_mode,
  lifecycle_status, cadence_minutes, max_candidates_per_run,
  expected_daily_candidates, rights_status, playback_mode, attribution_url
) VALUES
  ('poker','youtube_channel','Brian Christopher Slots','@BCSlots','slots','casino_slots','creator_uploads','active',360,100,24,'embed_only','youtube_embed','https://www.youtube.com/@BCSlots'),
  ('poker','youtube_channel','The Big Jackpot','@TheBigJackpot','slots','casino_slots','creator_uploads','active',360,100,24,'embed_only','youtube_embed','https://www.youtube.com/@TheBigJackpot'),
  ('poker','youtube_channel','Lady Luck HQ','@LadyLuckHQ','slots','casino_slots','creator_uploads','active',360,100,24,'embed_only','youtube_embed','https://www.youtube.com/@LadyLuckHQ'),
  ('poker','youtube_channel','Vegas Low Roller','@VegasLowRoller','slots','casino_slots','creator_uploads','active',720,75,12,'embed_only','youtube_embed','https://www.youtube.com/@VegasLowRoller'),
  ('poker','youtube_channel','Slot Queen','@SlotQueen','slots','casino_slots','creator_uploads','active',720,75,12,'embed_only','youtube_embed','https://www.youtube.com/@SlotQueen'),
  ('poker','youtube_channel','The Slot Cats','@TheSlotCats','slots','casino_slots','creator_uploads','active',720,75,12,'embed_only','youtube_embed','https://www.youtube.com/@TheSlotCats'),
  ('poker','youtube_channel','CasinoDaddy','@CasinoDaddy','slots','casino_slots','creator_uploads','active',720,75,12,'embed_only','youtube_embed','https://www.youtube.com/@CasinoDaddy')
ON CONFLICT (domain, name) DO UPDATE SET
  ingest_topic = EXCLUDED.ingest_topic,
  ingestion_mode = EXCLUDED.ingestion_mode,
  lifecycle_status = EXCLUDED.lifecycle_status,
  cadence_minutes = EXCLUDED.cadence_minutes,
  max_candidates_per_run = EXCLUDED.max_candidates_per_run,
  expected_daily_candidates = EXCLUDED.expected_daily_candidates,
  rights_status = EXCLUDED.rights_status,
  playback_mode = EXCLUDED.playback_mode,
  attribution_url = EXCLUDED.attribution_url,
  updated_at = now();

INSERT INTO public.content_sources (
  domain, kind, name, category, sport, provider_source_id, ingest_topic,
  ingestion_mode, lifecycle_status, cadence_minutes, max_candidates_per_run,
  expected_daily_candidates, region_code, provider_category_id,
  rights_status, playback_mode, attribution_url
) VALUES
  ('sports','youtube_channel','YouTube Sports Most Popular US','most_popular','general','sports-chart-US-17','sports','sports_chart','active',180,50,50,'US','17','embed_only','youtube_embed','https://www.youtube.com/feed/trending')
ON CONFLICT (domain, name) DO UPDATE SET
  provider_source_id = EXCLUDED.provider_source_id,
  ingest_topic = EXCLUDED.ingest_topic,
  ingestion_mode = EXCLUDED.ingestion_mode,
  lifecycle_status = EXCLUDED.lifecycle_status,
  region_code = EXCLUDED.region_code,
  provider_category_id = EXCLUDED.provider_category_id,
  expected_daily_candidates = EXCLUDED.expected_daily_candidates,
  updated_at = now();

-- Existing active YouTube channels are now explicitly part of Phase 3. The
-- provider IDs are resolved once by the supported channels.list call.
UPDATE public.content_sources SET
  lifecycle_status = CASE WHEN is_active THEN 'active' ELSE 'paused' END,
  ingestion_mode = CASE WHEN kind = 'rss' THEN 'rss' ELSE ingestion_mode END,
  expected_daily_candidates = CASE
    WHEN kind = 'youtube_channel' AND expected_daily_candidates = 0 THEN 5
    ELSE expected_daily_candidates
  END,
  attribution_url = CASE
    WHEN attribution_url IS NULL AND handle IS NOT NULL
      THEN 'https://www.youtube.com/' || handle
    ELSE attribution_url
  END,
  updated_at = now()
WHERE provider = 'youtube';

DO $$
DECLARE
  v_capacity integer;
  v_slot_sources integer;
  v_chart_sources integer;
BEGIN
  SELECT coalesce(sum(expected_daily_candidates), 0) INTO v_capacity
  FROM public.content_sources
  WHERE is_active AND lifecycle_status = 'active' AND kind = 'youtube_channel';
  SELECT count(*) INTO v_slot_sources FROM public.content_sources
  WHERE is_active AND lifecycle_status = 'active' AND ingest_topic = 'casino_slots';
  SELECT count(*) INTO v_chart_sources FROM public.content_sources
  WHERE is_active AND lifecycle_status = 'active' AND ingestion_mode = 'sports_chart';
  IF v_capacity < 500 THEN RAISE EXCEPTION 'post-apply: configured daily capacity % is below 500', v_capacity; END IF;
  IF v_slot_sources < 7 THEN RAISE EXCEPTION 'post-apply: expected at least 7 casino/slot sources'; END IF;
  IF v_chart_sources < 1 THEN RAISE EXCEPTION 'post-apply: expected a sports chart source'; END IF;
END $$;

COMMIT;
