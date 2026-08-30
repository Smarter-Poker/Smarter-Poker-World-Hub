-- ============================================================================
-- 20260830210000_pnm_phase10_directory_operations.sql
-- ============================================================================
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     poker_venues, venue_location_integrity_state,
--              venue_directory_enrichment_log, venue_duplicate_retirement_log,
--              functions and triggers
-- IRREVERSIBLE: no
--
-- WHY:
--   Poker Near Me operator requests currently read every active venue and
--   recompute location polygons inside a serverless request. Public location
--   pages also download the full venue payload. This migration adds an indexed,
--   invalidation-aware integrity state and safe operator write paths so those
--   requests can be filtered and paged in PostgreSQL without deleting venue
--   history or bypassing optimistic concurrency.
--
-- HOW:
--   - Persist location, completeness, freshness, and duplicate signals.
--   - Invalidate exact location assessments when source coordinates change.
--   - Add immutable enrichment and duplicate-retirement audit trails.
--   - Retire duplicate records through a canonical redirect instead of delete.
--   - Add revision-safe, service-role-only enrichment and retirement RPCs.
-- ============================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $$
BEGIN
  IF to_regclass('public.poker_venues') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.poker_venues not found';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.profiles not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'poker_venues'
      AND column_name = 'location_integrity_revision'
      AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: poker_venues.location_integrity_revision not found';
  END IF;
END $$;

ALTER TABLE public.poker_venues
  ADD COLUMN IF NOT EXISTS canonical_venue_id integer REFERENCES public.poker_venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.poker_venues'::regclass
      AND conname = 'poker_venues_canonical_not_self'
  ) THEN
    ALTER TABLE public.poker_venues
      ADD CONSTRAINT poker_venues_canonical_not_self
      CHECK (canonical_venue_id IS NULL OR canonical_venue_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_poker_venues_active_directory
  ON public.poker_venues (state, city, is_featured DESC, trust_score DESC, id)
  WHERE is_active IS TRUE AND is_suppressed IS FALSE;

CREATE INDEX IF NOT EXISTS idx_poker_venues_directory_coordinates
  ON public.poker_venues (latitude, longitude)
  WHERE is_active IS TRUE
    AND is_suppressed IS FALSE
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poker_venues_canonical_venue_id
  ON public.poker_venues (canonical_venue_id)
  WHERE canonical_venue_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.venue_location_integrity_state (
  venue_id integer PRIMARY KEY REFERENCES public.poker_venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  venue_type text,
  address text,
  city text NOT NULL,
  state text NOT NULL,
  latitude double precision,
  longitude double precision,
  revision timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  location_status text NOT NULL CHECK (
    location_status IN ('verified', 'border', 'approximate', 'missing', 'conflict', 'unverified')
  ),
  location_reason text NOT NULL,
  mappable boolean NOT NULL DEFAULT false,
  issue_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  primary_issue text CHECK (
    primary_issue IS NULL OR primary_issue IN ('conflict', 'missing', 'duplicate', 'unverified', 'incomplete', 'stale')
  ),
  priority smallint NOT NULL DEFAULT 99,
  related_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  missing_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  completeness_score smallint NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  last_scraped_at timestamptz,
  data_quality text,
  scrape_status text,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' || coalesce(address, '') || ' ' ||
      coalesce(city, '') || ' ' || coalesce(state, '') || ' ' || venue_id::text
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_venue_integrity_state_queue
  ON public.venue_location_integrity_state (active, priority, state, city, venue_id)
  WHERE active IS TRUE AND primary_issue IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venue_integrity_state_issues
  ON public.venue_location_integrity_state USING gin (issue_types);

CREATE INDEX IF NOT EXISTS idx_venue_integrity_state_search
  ON public.venue_location_integrity_state USING gin (search_vector);

ALTER TABLE public.venue_location_integrity_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_integrity_state_admin_read ON public.venue_location_integrity_state;
CREATE POLICY venue_integrity_state_admin_read
  ON public.venue_location_integrity_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text IN ('admin', 'superadmin', 'god')
    )
  );

CREATE TABLE IF NOT EXISTS public.venue_directory_enrichment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id integer NOT NULL REFERENCES public.poker_venues(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
  source_url text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  before_record jsonb NOT NULL,
  after_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_directory_enrichment_log_venue_created
  ON public.venue_directory_enrichment_log (venue_id, created_at DESC);

ALTER TABLE public.venue_directory_enrichment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_directory_enrichment_log_admin_read ON public.venue_directory_enrichment_log;
CREATE POLICY venue_directory_enrichment_log_admin_read
  ON public.venue_directory_enrichment_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text IN ('admin', 'superadmin', 'god')
    )
  );

CREATE TABLE IF NOT EXISTS public.venue_duplicate_retirement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retired_venue_id integer NOT NULL REFERENCES public.poker_venues(id) ON DELETE RESTRICT,
  canonical_venue_id integer NOT NULL REFERENCES public.poker_venues(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
  before_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (retired_venue_id <> canonical_venue_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_duplicate_retirement_log_created
  ON public.venue_duplicate_retirement_log (created_at DESC);

ALTER TABLE public.venue_duplicate_retirement_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_duplicate_retirement_log_admin_read ON public.venue_duplicate_retirement_log;
CREATE POLICY venue_duplicate_retirement_log_admin_read
  ON public.venue_duplicate_retirement_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role::text IN ('admin', 'superadmin', 'god')
    )
  );

CREATE OR REPLACE FUNCTION public.pnm_primary_venue_issue(p_issues text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT issue
  FROM unnest(ARRAY['conflict', 'missing', 'duplicate', 'unverified', 'incomplete', 'stale']) issue
  WHERE issue = ANY(coalesce(p_issues, ARRAY[]::text[]))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pnm_venue_missing_fields(p_row public.poker_venues)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN nullif(trim(p_row.address), '') IS NULL THEN 'address' END,
    CASE WHEN nullif(trim(p_row.phone), '') IS NULL THEN 'phone' END,
    CASE WHEN nullif(trim(p_row.website), '') IS NULL THEN 'website' END,
    CASE WHEN coalesce(
      nullif(trim(p_row.profile_photo_url), ''),
      nullif(trim(p_row.cover_photo_url), ''),
      nullif(trim(p_row.logo_url), '')
    ) IS NULL THEN 'artwork' END,
    CASE WHEN coalesce(p_row.latitude, p_row.lat) IS NULL
           OR coalesce(p_row.longitude, p_row.lng) IS NULL THEN 'coordinates' END
  ]::text[], NULL);
$$;

CREATE OR REPLACE FUNCTION public.pnm_basic_location_status(p_row public.poker_venues)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_row.venue_type = 'home_game' THEN 'approximate'
    WHEN coalesce(p_row.latitude, p_row.lat) IS NULL
      OR coalesce(p_row.longitude, p_row.lng) IS NULL THEN 'missing'
    WHEN coalesce(p_row.latitude, p_row.lat)::double precision NOT BETWEEN -90 AND 90
      OR coalesce(p_row.longitude, p_row.lng)::double precision NOT BETWEEN -180 AND 180 THEN 'conflict'
    ELSE 'unverified'
  END;
$$;

CREATE OR REPLACE FUNCTION public.pnm_sync_venue_integrity_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.venue_location_integrity_state%ROWTYPE;
  v_active boolean;
  v_location_changed boolean;
  v_location_status text;
  v_location_reason text;
  v_mappable boolean;
  v_missing_fields text[];
  v_issue_types text[] := ARRAY[]::text[];
  v_primary_issue text;
  v_last_scraped_at timestamptz;
  v_related_ids integer[] := ARRAY[]::integer[];
BEGIN
  SELECT * INTO v_existing
  FROM public.venue_location_integrity_state
  WHERE venue_id = NEW.id;

  v_active := coalesce(NEW.is_active, true) AND NOT coalesce(NEW.is_suppressed, false);
  IF TG_OP = 'INSERT' THEN
    v_location_changed := true;
  ELSE
    v_location_changed := OLD.address IS DISTINCT FROM NEW.address
      OR OLD.city IS DISTINCT FROM NEW.city
      OR OLD.state IS DISTINCT FROM NEW.state
      OR OLD.latitude IS DISTINCT FROM NEW.latitude
      OR OLD.longitude IS DISTINCT FROM NEW.longitude
      OR OLD.lat IS DISTINCT FROM NEW.lat
      OR OLD.lng IS DISTINCT FROM NEW.lng;
  END IF;

  IF v_location_changed OR v_existing.venue_id IS NULL THEN
    v_location_status := public.pnm_basic_location_status(NEW);
    v_location_reason := CASE v_location_status
      WHEN 'missing' THEN 'coordinates_missing'
      WHEN 'conflict' THEN 'coordinates_invalid'
      WHEN 'approximate' THEN 'privacy_protected'
      ELSE 'location_changed_pending_assessment'
    END;
    v_mappable := v_location_status IN ('verified', 'border', 'approximate', 'unverified');
  ELSE
    v_location_status := v_existing.location_status;
    v_location_reason := v_existing.location_reason;
    v_mappable := v_existing.mappable;
    IF 'duplicate' = ANY(v_existing.issue_types) THEN
      v_issue_types := array_append(v_issue_types, 'duplicate');
      v_related_ids := v_existing.related_ids;
    END IF;
  END IF;

  v_missing_fields := public.pnm_venue_missing_fields(NEW);
  v_last_scraped_at := coalesce(NEW.last_scraped_at, NEW.last_scraped);

  IF v_active THEN
    IF v_location_status IN ('missing', 'conflict', 'unverified') THEN
      v_issue_types := array_append(v_issue_types, v_location_status);
    END IF;
    IF cardinality(v_missing_fields) > 0 THEN
      v_issue_types := array_append(v_issue_types, 'incomplete');
    END IF;
    IF v_last_scraped_at IS NULL OR v_last_scraped_at < now() - interval '30 days' THEN
      v_issue_types := array_append(v_issue_types, 'stale');
    END IF;
  ELSE
    v_issue_types := ARRAY[]::text[];
    v_related_ids := ARRAY[]::integer[];
  END IF;

  SELECT coalesce(array_agg(DISTINCT issue), ARRAY[]::text[])
    INTO v_issue_types
  FROM unnest(v_issue_types) issue;
  v_primary_issue := public.pnm_primary_venue_issue(v_issue_types);

  INSERT INTO public.venue_location_integrity_state (
    venue_id, name, venue_type, address, city, state, latitude, longitude,
    revision, active, location_status, location_reason, mappable, issue_types,
    primary_issue, priority, related_ids, missing_fields, completeness_score,
    last_scraped_at, data_quality, scrape_status, assessed_at, updated_at
  ) VALUES (
    NEW.id, NEW.name, NEW.venue_type, NEW.address, NEW.city, NEW.state,
    coalesce(NEW.latitude, NEW.lat)::double precision,
    coalesce(NEW.longitude, NEW.lng)::double precision,
    NEW.location_integrity_revision, v_active, v_location_status,
    v_location_reason, v_mappable, v_issue_types, v_primary_issue,
    CASE v_primary_issue
      WHEN 'conflict' THEN 0 WHEN 'missing' THEN 1 WHEN 'duplicate' THEN 2
      WHEN 'unverified' THEN 3 WHEN 'incomplete' THEN 4 WHEN 'stale' THEN 5 ELSE 99
    END,
    v_related_ids, v_missing_fields,
    greatest(0, 100 - cardinality(v_missing_fields) * 20),
    v_last_scraped_at, NEW.data_quality, NEW.scrape_status, now(), now()
  )
  ON CONFLICT (venue_id) DO UPDATE SET
    name = EXCLUDED.name,
    venue_type = EXCLUDED.venue_type,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    revision = EXCLUDED.revision,
    active = EXCLUDED.active,
    location_status = EXCLUDED.location_status,
    location_reason = EXCLUDED.location_reason,
    mappable = EXCLUDED.mappable,
    issue_types = EXCLUDED.issue_types,
    primary_issue = EXCLUDED.primary_issue,
    priority = EXCLUDED.priority,
    related_ids = EXCLUDED.related_ids,
    missing_fields = EXCLUDED.missing_fields,
    completeness_score = EXCLUDED.completeness_score,
    last_scraped_at = EXCLUDED.last_scraped_at,
    data_quality = EXCLUDED.data_quality,
    scrape_status = EXCLUDED.scrape_status,
    assessed_at = EXCLUDED.assessed_at,
    updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pnm_bump_venue_directory_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.location_integrity_revision IS NOT DISTINCT FROM OLD.location_integrity_revision THEN
    NEW.location_integrity_revision := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pnm_bump_venue_directory_revision ON public.poker_venues;
CREATE TRIGGER trg_pnm_bump_venue_directory_revision
  BEFORE UPDATE OF address, city, state, latitude, longitude, lat, lng,
    phone, website, profile_photo_url, cover_photo_url, logo_url,
    is_active, is_suppressed
  ON public.poker_venues
  FOR EACH ROW
  EXECUTE FUNCTION public.pnm_bump_venue_directory_revision();

DROP TRIGGER IF EXISTS trg_pnm_sync_venue_integrity_state ON public.poker_venues;
CREATE TRIGGER trg_pnm_sync_venue_integrity_state
  AFTER INSERT OR UPDATE OF name, venue_type, address, city, state, latitude,
    longitude, lat, lng, phone, website, profile_photo_url, cover_photo_url,
    logo_url, is_active, is_suppressed, last_scraped_at, last_scraped,
    data_quality, scrape_status, location_integrity_revision
  ON public.poker_venues
  FOR EACH ROW
  EXECUTE FUNCTION public.pnm_sync_venue_integrity_state();

-- The row helper mirrors the trigger for initial/recovery backfills without
-- manufacturing an UPDATE on poker_venues or changing venue revisions.
CREATE OR REPLACE FUNCTION public.pnm_sync_venue_integrity_state_from_row(p_row public.poker_venues)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active boolean;
  v_location_status text;
  v_missing_fields text[];
  v_issue_types text[] := ARRAY[]::text[];
  v_primary_issue text;
  v_last_scraped_at timestamptz;
BEGIN
  v_active := coalesce(p_row.is_active, true) AND NOT coalesce(p_row.is_suppressed, false);
  v_location_status := public.pnm_basic_location_status(p_row);
  v_missing_fields := public.pnm_venue_missing_fields(p_row);
  v_last_scraped_at := coalesce(p_row.last_scraped_at, p_row.last_scraped);
  IF v_active THEN
    IF v_location_status IN ('missing', 'conflict', 'unverified') THEN
      v_issue_types := array_append(v_issue_types, v_location_status);
    END IF;
    IF cardinality(v_missing_fields) > 0 THEN
      v_issue_types := array_append(v_issue_types, 'incomplete');
    END IF;
    IF v_last_scraped_at IS NULL OR v_last_scraped_at < now() - interval '30 days' THEN
      v_issue_types := array_append(v_issue_types, 'stale');
    END IF;
  END IF;
  v_primary_issue := public.pnm_primary_venue_issue(v_issue_types);

  INSERT INTO public.venue_location_integrity_state (
    venue_id, name, venue_type, address, city, state, latitude, longitude,
    revision, active, location_status, location_reason, mappable, issue_types,
    primary_issue, priority, related_ids, missing_fields, completeness_score,
    last_scraped_at, data_quality, scrape_status, assessed_at, updated_at
  ) VALUES (
    p_row.id, p_row.name, p_row.venue_type, p_row.address, p_row.city, p_row.state,
    coalesce(p_row.latitude, p_row.lat)::double precision,
    coalesce(p_row.longitude, p_row.lng)::double precision,
    p_row.location_integrity_revision, v_active, v_location_status,
    CASE v_location_status
      WHEN 'missing' THEN 'coordinates_missing'
      WHEN 'conflict' THEN 'coordinates_invalid'
      WHEN 'approximate' THEN 'privacy_protected'
      ELSE 'initial_assessment_pending'
    END,
    v_location_status IN ('verified', 'border', 'approximate', 'unverified'),
    v_issue_types, v_primary_issue,
    CASE v_primary_issue
      WHEN 'conflict' THEN 0 WHEN 'missing' THEN 1 WHEN 'duplicate' THEN 2
      WHEN 'unverified' THEN 3 WHEN 'incomplete' THEN 4 WHEN 'stale' THEN 5 ELSE 99
    END,
    ARRAY[]::integer[], v_missing_fields,
    greatest(0, 100 - cardinality(v_missing_fields) * 20),
    v_last_scraped_at, p_row.data_quality, p_row.scrape_status, now(), now()
  )
  ON CONFLICT (venue_id) DO UPDATE SET
    name = EXCLUDED.name,
    venue_type = EXCLUDED.venue_type,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    revision = EXCLUDED.revision,
    active = EXCLUDED.active,
    location_status = EXCLUDED.location_status,
    location_reason = EXCLUDED.location_reason,
    mappable = EXCLUDED.mappable,
    issue_types = EXCLUDED.issue_types,
    primary_issue = EXCLUDED.primary_issue,
    priority = EXCLUDED.priority,
    related_ids = EXCLUDED.related_ids,
    missing_fields = EXCLUDED.missing_fields,
    completeness_score = EXCLUDED.completeness_score,
    last_scraped_at = EXCLUDED.last_scraped_at,
    data_quality = EXCLUDED.data_quality,
    scrape_status = EXCLUDED.scrape_status,
    assessed_at = EXCLUDED.assessed_at,
    updated_at = now();
END;
$$;

-- Recreate the refresh wrapper after its dependency exists. PostgreSQL parses
-- PL/pgSQL bodies lazily, but keeping the final definition ordered makes schema
-- dumps and future edits unambiguous.
CREATE OR REPLACE FUNCTION public.pnm_refresh_venue_integrity_state_basics()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.poker_venues%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM public.poker_venues LOOP
    PERFORM public.pnm_sync_venue_integrity_state_from_row(v_row);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_venue_directory_enrichment(
  p_venue_id integer,
  p_expected_revision timestamptz,
  p_phone text,
  p_website text,
  p_profile_photo_url text,
  p_cover_photo_url text,
  p_logo_url text,
  p_source_url text,
  p_confidence numeric,
  p_reason text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before public.poker_venues%ROWTYPE;
  v_after public.poker_venues%ROWTYPE;
  v_actor_role text;
BEGIN
  SELECT role::text INTO v_actor_role FROM public.profiles WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'superadmin', 'god') THEN
    RAISE EXCEPTION 'platform admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected venue revision required' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(coalesce(p_reason, ''))) < 12 OR char_length(trim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'audit reason must contain 12 to 500 characters' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(p_source_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'source URL required' USING ERRCODE = '22023';
  END IF;
  IF p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1 THEN
    RAISE EXCEPTION 'confidence must be between 0 and 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before FROM public.poker_venues WHERE id = p_venue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.location_integrity_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'venue revision changed' USING ERRCODE = '40001';
  END IF;

  UPDATE public.poker_venues
  SET phone = nullif(trim(p_phone), ''),
      website = nullif(trim(p_website), ''),
      profile_photo_url = nullif(trim(p_profile_photo_url), ''),
      cover_photo_url = nullif(trim(p_cover_photo_url), ''),
      logo_url = nullif(trim(p_logo_url), ''),
      last_verified_at = now(),
      location_integrity_revision = clock_timestamp()
  WHERE id = p_venue_id
  RETURNING * INTO v_after;

  INSERT INTO public.venue_directory_enrichment_log (
    venue_id, actor_id, reason, source_url, confidence, before_record, after_record
  ) VALUES (
    p_venue_id, p_actor_id, trim(p_reason), trim(p_source_url), p_confidence,
    jsonb_build_object(
      'phone', v_before.phone,
      'website', v_before.website,
      'profile_photo_url', v_before.profile_photo_url,
      'cover_photo_url', v_before.cover_photo_url,
      'logo_url', v_before.logo_url,
      'revision', v_before.location_integrity_revision
    ),
    jsonb_build_object(
      'phone', v_after.phone,
      'website', v_after.website,
      'profile_photo_url', v_after.profile_photo_url,
      'cover_photo_url', v_after.cover_photo_url,
      'logo_url', v_after.logo_url,
      'revision', v_after.location_integrity_revision
    )
  );

  RETURN jsonb_build_object(
    'venue_id', v_after.id,
    'name', v_after.name,
    'revision', v_after.location_integrity_revision
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_duplicate_poker_venue(
  p_venue_id integer,
  p_canonical_venue_id integer,
  p_expected_revision timestamptz,
  p_reason text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.poker_venues%ROWTYPE;
  v_target public.poker_venues%ROWTYPE;
  v_actor_role text;
  v_source_identity text;
  v_target_identity text;
BEGIN
  SELECT role::text INTO v_actor_role FROM public.profiles WHERE id = p_actor_id;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'superadmin', 'god') THEN
    RAISE EXCEPTION 'platform admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_venue_id = p_canonical_venue_id THEN
    RAISE EXCEPTION 'canonical venue must differ from retired venue' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(coalesce(p_reason, ''))) < 12 OR char_length(trim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'audit reason must contain 12 to 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source FROM public.poker_venues WHERE id = p_venue_id FOR UPDATE;
  SELECT * INTO v_target FROM public.poker_venues WHERE id = p_canonical_venue_id FOR UPDATE;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'source or canonical venue not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_source.location_integrity_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'venue revision changed' USING ERRCODE = '40001';
  END IF;
  IF coalesce(v_target.is_active, true) IS NOT TRUE OR coalesce(v_target.is_suppressed, false) IS TRUE THEN
    RAISE EXCEPTION 'canonical venue must be active and public' USING ERRCODE = '22023';
  END IF;

  v_source_identity := lower(regexp_replace(coalesce(v_source.name, ''), '[^a-zA-Z0-9]+', '', 'g'))
    || '|' || lower(trim(coalesce(v_source.city, ''))) || '|' || upper(trim(coalesce(v_source.state, '')));
  v_target_identity := lower(regexp_replace(coalesce(v_target.name, ''), '[^a-zA-Z0-9]+', '', 'g'))
    || '|' || lower(trim(coalesce(v_target.city, ''))) || '|' || upper(trim(coalesce(v_target.state, '')));
  IF v_source_identity IS DISTINCT FROM v_target_identity THEN
    RAISE EXCEPTION 'venues do not share the same normalized identity' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.venue_duplicate_retirement_log (
    retired_venue_id, canonical_venue_id, actor_id, reason, before_record
  ) VALUES (
    v_source.id, v_target.id, p_actor_id, trim(p_reason),
    jsonb_build_object(
      'name', v_source.name,
      'city', v_source.city,
      'state', v_source.state,
      'is_active', v_source.is_active,
      'is_suppressed', v_source.is_suppressed,
      'revision', v_source.location_integrity_revision
    )
  );

  UPDATE public.poker_venues
  SET canonical_venue_id = v_target.id,
      is_active = false,
      is_suppressed = true,
      retired_at = now(),
      retired_by = p_actor_id,
      retired_reason = trim(p_reason),
      location_integrity_revision = clock_timestamp()
  WHERE id = v_source.id;

  RETURN jsonb_build_object(
    'retired_venue_id', v_source.id,
    'canonical_venue_id', v_target.id,
    'canonical_name', v_target.name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_venue_directory_enrichment(
  integer, timestamptz, text, text, text, text, text, text, numeric, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_venue_directory_enrichment(
  integer, timestamptz, text, text, text, text, text, text, numeric, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.retire_duplicate_poker_venue(
  integer, integer, timestamptz, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_duplicate_poker_venue(
  integer, integer, timestamptz, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.pnm_refresh_venue_integrity_state_basics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pnm_refresh_venue_integrity_state_basics() TO service_role;

REVOKE ALL ON FUNCTION public.pnm_sync_venue_integrity_state_from_row(public.poker_venues) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pnm_sync_venue_integrity_state_from_row(public.poker_venues) TO service_role;

SELECT public.pnm_refresh_venue_integrity_state_basics();

-- 3. POST-APPLY ASSERTIONS
DO $$
DECLARE
  v_venue_count bigint;
  v_state_count bigint;
BEGIN
  SELECT count(*) INTO v_venue_count FROM public.poker_venues;
  SELECT count(*) INTO v_state_count FROM public.venue_location_integrity_state;
  IF v_state_count <> v_venue_count THEN
    RAISE EXCEPTION 'post-apply assertion failed: integrity state % does not match venue count %', v_state_count, v_venue_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_poker_venues_active_directory'
  ) THEN
    RAISE EXCEPTION 'post-apply assertion failed: directory index missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.poker_venues'::regclass
      AND tgname = 'trg_pnm_sync_venue_integrity_state'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'post-apply assertion failed: integrity trigger missing';
  END IF;
END $$;

COMMENT ON TABLE public.venue_location_integrity_state IS
  'Indexed Poker Near Me location, completeness, freshness, and duplicate assessment state.';
COMMENT ON TABLE public.venue_directory_enrichment_log IS
  'Immutable source and before/after evidence for operator-approved venue directory enrichment.';
COMMENT ON TABLE public.venue_duplicate_retirement_log IS
  'Immutable record of duplicate venue retirement into a canonical venue without deleting referenced history.';
COMMENT ON COLUMN public.poker_venues.canonical_venue_id IS
  'Canonical venue for a safely retired duplicate; old IDs redirect instead of being deleted.';

COMMIT;
