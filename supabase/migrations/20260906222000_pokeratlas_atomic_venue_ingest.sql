-- ============================================================================
-- PokerAtlas venue identity uniqueness + atomic batch ingest
-- Migration: 20260906222000_pokeratlas_atomic_venue_ingest.sql
-- ============================================================================
-- TIER:        2
-- AUTHOR:      Codex Poker Near Me data-truth audit
-- AFFECTS:     poker_venues, data_audit_log, fn_pokeratlas_ingest_venues
-- IRREVERSIBLE: the duplicate retirement is an intentional audited data change;
--               rollback guidance removes only the new write path/invariant.
--
-- WHY:
--   The watchdog previously performed one read followed by one insert per room.
--   Two concurrent runs could both observe a missing slug, and a failure late in
--   a batch left earlier venue inserts committed. The database had no unique
--   invariant on PokerAtlas identity.
--
-- PRE-APPLY READ-ONLY CHECK (must return exactly the one adjudicated pair):
--   SELECT lower(btrim(pokeratlas_slug)) AS normalized_pokeratlas_slug,
--          count(*) AS duplicate_count,
--          array_agg(id ORDER BY id) AS venue_ids,
--          array_agg(name ORDER BY id) AS venue_names
--     FROM public.poker_venues
--    WHERE nullif(btrim(pokeratlas_slug), '') IS NOT NULL
--      AND canonical_venue_id IS NULL
--    GROUP BY lower(btrim(pokeratlas_slug))
--   HAVING count(*) > 1
--    ORDER BY duplicate_count DESC, normalized_pokeratlas_slug;
-- Expected:
--   harrahs-cherokee-cherokee | 2 | {1878,3428} |
--   {"Harrah's Cherokee","Harrahs Cherokee"}
--
-- Exact-state check (must match the values asserted below):
--   SELECT id, name, city, state, country, is_active, is_suppressed,
--          data_quality, scrape_status, canonical_venue_id, retired_at,
--          retired_by, retired_reason, pokeratlas_slug
--     FROM public.poker_venues
--    WHERE id IN (1878, 2912, 3428)
--    ORDER BY id;
-- The migration aborts rather than guessing if either known row has drifted.
--
-- The table is a small directory, so this migration deliberately takes one
-- short SHARE ROW EXCLUSIVE lock and builds the index transactionally. That
-- closes the race between duplicate preflight and index creation; CONCURRENTLY
-- cannot provide that all-or-nothing migration contract inside BEGIN/COMMIT.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  v_column text;
BEGIN
  IF to_regclass('public.poker_venues') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.poker_venues not found';
  END IF;
  IF to_regclass('public.data_audit_log') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.data_audit_log not found';
  END IF;
  IF to_regclass('public.venue_duplicate_retirement_log') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.venue_duplicate_retirement_log not found';
  END IF;
  IF to_regclass('public.uq_poker_venues_pokeratlas_slug_normalized_canonical') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: migration-owned PokerAtlas slug index already exists';
  END IF;
  IF to_regprocedure('public.fn_pokeratlas_ingest_venues(jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: migration-owned PokerAtlas ingest RPC already exists';
  END IF;

  FOREACH v_column IN ARRAY ARRAY[
    'id', 'name', 'address', 'city', 'state', 'country', 'zip', 'phone',
    'website', 'latitude', 'longitude', 'slug', 'pokeratlas_slug',
    'pokeratlas_url', 'data_quality', 'scrape_url', 'scrape_html_hash',
    'scrape_timestamp', 'scrape_source', 'scrape_batch_id', 'scrape_status',
    'canonical_venue_id', 'is_active', 'is_suppressed', 'retired_at',
    'retired_by', 'retired_reason', 'location_integrity_revision'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'poker_venues'
         AND column_name = v_column
    ) THEN
      RAISE EXCEPTION 'pre-flight failed: public.poker_venues.% not found', v_column;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM (
        VALUES
          ('data_audit_log', 'id', 'uuid', 'NO'),
          ('data_audit_log', 'table_name', 'text', 'NO'),
          ('data_audit_log', 'record_id', 'text', 'NO'),
          ('data_audit_log', 'action', 'text', 'NO'),
          ('data_audit_log', 'new_data', 'jsonb', 'YES'),
          ('data_audit_log', 'scrape_proof', 'jsonb', 'YES'),
          ('data_audit_log', 'batch_id', 'uuid', 'YES'),
          ('data_audit_log', 'agent_id', 'text', 'YES'),
          ('venue_duplicate_retirement_log', 'retired_venue_id', 'int4', 'NO'),
          ('venue_duplicate_retirement_log', 'canonical_venue_id', 'int4', 'NO'),
          ('venue_duplicate_retirement_log', 'actor_id', 'uuid', 'YES'),
          ('venue_duplicate_retirement_log', 'reason', 'text', 'NO'),
          ('venue_duplicate_retirement_log', 'before_record', 'jsonb', 'NO')
      ) AS expected(table_name, column_name, udt_name, is_nullable)
      LEFT JOIN information_schema.columns actual
        ON actual.table_schema = 'public'
       AND actual.table_name = expected.table_name
       AND actual.column_name = expected.column_name
     WHERE actual.column_name IS NULL
        OR actual.udt_name IS DISTINCT FROM expected.udt_name
        OR actual.is_nullable IS DISTINCT FROM expected.is_nullable
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: audit-table column contract drifted';
  END IF;
END
$$;

LOCK TABLE public.poker_venues IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_source public.poker_venues%ROWTYPE;
  v_target public.poker_venues%ROWTYPE;
  v_non_us public.poker_venues%ROWTYPE;
  v_non_us_before jsonb;
  v_duplicates jsonb;
  v_reason constant text :=
    'Retired exact suppressed PokerAtlas duplicate during canonical-slug uniqueness migration.';
  v_non_us_reason constant text :=
    'Retired verified non-US PokerAtlas room incorrectly persisted as a US venue; no canonical US target exists.';
BEGIN
  SELECT jsonb_agg(to_jsonb(d) ORDER BY d.normalized_pokeratlas_slug)
    INTO v_duplicates
    FROM (
      SELECT lower(btrim(pokeratlas_slug)) AS normalized_pokeratlas_slug,
             count(*) AS duplicate_count,
             array_agg(id ORDER BY id) AS venue_ids
       FROM public.poker_venues
       WHERE nullif(btrim(pokeratlas_slug), '') IS NOT NULL
         AND canonical_venue_id IS NULL
       GROUP BY lower(btrim(pokeratlas_slug))
      HAVING count(*) > 1
    ) AS d;

  IF v_duplicates IS DISTINCT FROM jsonb_build_array(jsonb_build_object(
    'normalized_pokeratlas_slug', 'harrahs-cherokee-cherokee',
    'duplicate_count', 2,
    'venue_ids', to_jsonb(ARRAY[1878, 3428]::integer[])
  )) THEN
    RAISE EXCEPTION 'pre-flight failed: canonical PokerAtlas duplicates differ from the one adjudicated pair: %',
      v_duplicates USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_target
    FROM public.poker_venues
   WHERE id = 1878
   FOR UPDATE;
  SELECT * INTO v_source
    FROM public.poker_venues
   WHERE id = 3428
   FOR UPDATE;
  SELECT * INTO v_non_us
    FROM public.poker_venues
   WHERE id = 2912
   FOR UPDATE;

  IF v_target.id IS NULL OR v_source.id IS NULL OR v_non_us.id IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: adjudicated venues 1878, 2912, and 3428 must all exist';
  END IF;

  IF v_target.name IS DISTINCT FROM 'Harrah''s Cherokee'
     OR v_target.city IS DISTINCT FROM 'Cherokee'
     OR v_target.state IS DISTINCT FROM 'NC'
     OR v_target.country IS DISTINCT FROM 'US'
     OR v_target.is_active IS DISTINCT FROM true
     OR v_target.is_suppressed IS DISTINCT FROM false
     OR v_target.data_quality IS DISTINCT FROM 'scraped_verified'
     OR v_target.scrape_status IS DISTINCT FROM 'complete'
     OR v_target.canonical_venue_id IS NOT NULL
     OR v_target.retired_at IS NOT NULL
     OR v_target.retired_by IS NOT NULL
     OR v_target.retired_reason IS NOT NULL
     OR v_target.pokeratlas_slug IS DISTINCT FROM 'harrahs-cherokee-cherokee' THEN
    RAISE EXCEPTION 'pre-flight failed: canonical venue 1878 no longer matches the adjudicated live snapshot';
  END IF;

  IF v_source.name IS DISTINCT FROM 'Harrahs Cherokee'
     OR v_source.city IS DISTINCT FROM 'Cherokee'
     OR v_source.state IS DISTINCT FROM 'NC'
     OR v_source.country IS DISTINCT FROM 'US'
     OR v_source.is_active IS DISTINCT FROM true
     OR v_source.is_suppressed IS DISTINCT FROM true
     OR v_source.data_quality IS DISTINCT FROM 'unverified'
     OR v_source.scrape_status IS DISTINCT FROM 'no_data'
     OR v_source.canonical_venue_id IS NOT NULL
     OR v_source.retired_at IS NOT NULL
     OR v_source.retired_by IS NOT NULL
     OR v_source.retired_reason IS NOT NULL
     OR v_source.pokeratlas_slug IS DISTINCT FROM 'harrahs-cherokee-cherokee' THEN
    RAISE EXCEPTION 'pre-flight failed: suppressed venue 3428 no longer matches the adjudicated live snapshot';
  END IF;

  IF lower(regexp_replace(v_source.name, '[^a-zA-Z0-9]+', '', 'g'))
       IS DISTINCT FROM
     lower(regexp_replace(v_target.name, '[^a-zA-Z0-9]+', '', 'g')) THEN
    RAISE EXCEPTION 'pre-flight failed: adjudicated venues no longer share a normalized identity';
  END IF;

  IF v_non_us.name IS DISTINCT FROM 'Club Montmartre'
     OR v_non_us.city IS DISTINCT FROM 'Paris'
     OR v_non_us.state IS DISTINCT FROM 'Paris'
     OR v_non_us.country IS DISTINCT FROM 'US'
     OR v_non_us.is_active IS DISTINCT FROM true
     OR v_non_us.is_suppressed IS DISTINCT FROM false
     OR v_non_us.data_quality IS DISTINCT FROM 'scraped_verified'
     OR v_non_us.scrape_status IS DISTINCT FROM 'no_data'
     OR v_non_us.canonical_venue_id IS NOT NULL
     OR v_non_us.retired_at IS NOT NULL
     OR v_non_us.retired_by IS NOT NULL
     OR v_non_us.retired_reason IS NOT NULL
     OR v_non_us.pokeratlas_slug IS DISTINCT FROM 'club-montmartre-paris' THEN
    RAISE EXCEPTION 'pre-flight failed: non-US venue 2912 no longer matches the adjudicated live snapshot';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.venue_duplicate_retirement_log
     WHERE retired_venue_id = 3428
        OR canonical_venue_id = 3428
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: venue 3428 already participates in a retirement audit';
  END IF;

  INSERT INTO public.venue_duplicate_retirement_log (
    retired_venue_id, canonical_venue_id, actor_id, reason, before_record
  ) VALUES (
    3428, 1878, NULL, v_reason, to_jsonb(v_source)
  );

  UPDATE public.poker_venues
     SET canonical_venue_id = 1878,
         is_active = false,
         is_suppressed = true,
         retired_at = now(),
         retired_by = NULL,
         retired_reason = v_reason,
         location_integrity_revision = clock_timestamp()
   WHERE id = 3428;

  -- This is a non-US tombstone, not a duplicate redirect. Keep canonical_id
  -- NULL so no unrelated US venue is presented as its identity replacement;
  -- retaining the PokerAtlas slug also makes the unique index fail closed if
  -- a buggy scraper ever attempts to ingest it again.
  v_non_us_before := to_jsonb(v_non_us);
  UPDATE public.poker_venues
     SET is_active = false,
         is_suppressed = true,
         retired_at = now(),
         retired_by = NULL,
         retired_reason = v_non_us_reason,
         location_integrity_revision = clock_timestamp()
   WHERE id = 2912
  RETURNING * INTO v_non_us;

  INSERT INTO public.data_audit_log (
    table_name, record_id, action, old_data, new_data, scrape_proof,
    batch_id, agent_id, created_at
  ) VALUES (
    'poker_venues',
    '2912',
    'UPDATE',
    v_non_us_before,
    to_jsonb(v_non_us),
    jsonb_build_object(
      'finding', 'non_us_location',
      'source', 'pokeratlas',
      'pokeratlas_slug', 'club-montmartre-paris',
      'verified_city_country', 'Paris, France',
      'canonical_venue_id', NULL::integer
    ),
    NULL,
    'migration:pokeratlas_atomic_venue_ingest',
    now()
  );

  IF EXISTS (
    SELECT 1
      FROM public.poker_venues
     WHERE id = 3428
       AND (
         canonical_venue_id IS DISTINCT FROM 1878
         OR is_active IS DISTINCT FROM false
         OR is_suppressed IS DISTINCT FROM true
         OR retired_at IS NULL
         OR retired_by IS NOT NULL
         OR retired_reason IS DISTINCT FROM v_reason
       )
  ) THEN
    RAISE EXCEPTION 'postcondition failed: venue 3428 was not retired to venue 1878';
  END IF;

  IF v_non_us.canonical_venue_id IS NOT NULL
     OR v_non_us.is_active IS DISTINCT FROM false
     OR v_non_us.is_suppressed IS DISTINCT FROM true
     OR v_non_us.retired_at IS NULL
     OR v_non_us.retired_by IS NOT NULL
     OR v_non_us.retired_reason IS DISTINCT FROM v_non_us_reason THEN
    RAISE EXCEPTION 'postcondition failed: non-US venue 2912 was not suppressed as a canonical-free tombstone';
  END IF;

  SELECT jsonb_agg(to_jsonb(d) ORDER BY d.normalized_pokeratlas_slug)
    INTO v_duplicates
    FROM (
      SELECT lower(btrim(pokeratlas_slug)) AS normalized_pokeratlas_slug,
             count(*) AS duplicate_count,
             array_agg(id ORDER BY id) AS venue_ids
        FROM public.poker_venues
       WHERE nullif(btrim(pokeratlas_slug), '') IS NOT NULL
         AND canonical_venue_id IS NULL
       GROUP BY lower(btrim(pokeratlas_slug))
      HAVING count(*) > 1
    ) AS d;

  IF v_duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'postcondition failed: duplicate canonical PokerAtlas slugs remain: %',
      v_duplicates USING ERRCODE = '23505';
  END IF;
END
$$;

CREATE UNIQUE INDEX uq_poker_venues_pokeratlas_slug_normalized_canonical
  ON public.poker_venues ((lower(btrim(pokeratlas_slug))))
  WHERE nullif(btrim(pokeratlas_slug), '') IS NOT NULL
    AND canonical_venue_id IS NULL;

CREATE OR REPLACE FUNCTION public.fn_pokeratlas_ingest_venues(
  p_rows jsonb,
  p_batch_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_slug text;
  v_name text;
  v_state text;
  v_country text;
  v_unknown_keys text;
  v_duplicate_input text;
  v_scrape_timestamp timestamptz;
  v_row_batch_id uuid;
  v_latitude double precision;
  v_longitude double precision;
  v_input_count integer;
  v_result_count integer;
  v_input_slugs text[] := ARRAY[]::text[];
  v_input_contract jsonb := '[]'::jsonb;
  v_inserted_slugs text[] := ARRAY[]::text[];
  v_result_rows jsonb := '[]'::jsonb;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'batch id is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  -- Serialize only exact replays of the same batch. Different batches still
  -- run concurrently and arbitrate shared identities through the unique index.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_batch_id::text, 0));

  v_input_count := jsonb_array_length(p_rows);
  IF v_input_count > 500 THEN
    RAISE EXCEPTION 'at most 500 PokerAtlas venues may be ingested per batch'
      USING ERRCODE = '22023';
  END IF;

  -- Validate the entire payload before the INSERT statement is reached. Any
  -- exception aborts the RPC statement and therefore the whole batch.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS e(value) LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'every venue row must be a JSON object' USING ERRCODE = '22023';
    END IF;

    SELECT string_agg(k.key, ', ' ORDER BY k.key)
      INTO v_unknown_keys
      FROM jsonb_object_keys(v_row) AS k(key)
     WHERE k.key <> ALL (ARRAY[
       'name', 'address', 'city', 'state', 'country', 'zip', 'phone',
       'website', 'latitude', 'longitude', 'slug', 'pokeratlas_slug',
       'pokeratlas_url', 'data_quality', 'scrape_url', 'scrape_html_hash',
       'scrape_timestamp', 'scrape_source', 'scrape_batch_id', 'scrape_status'
     ]::text[]);
    IF v_unknown_keys IS NOT NULL THEN
      RAISE EXCEPTION 'unsupported PokerAtlas venue fields: %', v_unknown_keys
        USING ERRCODE = '22023';
    END IF;

    v_slug := btrim(coalesce(v_row ->> 'pokeratlas_slug', ''));
    v_name := btrim(coalesce(v_row ->> 'name', ''));
    v_state := upper(btrim(coalesce(v_row ->> 'state', '')));
    v_country := upper(replace(btrim(coalesce(v_row ->> 'country', '')), '.', ''));

    IF v_slug !~ '^[a-z0-9][a-z0-9-]*$' OR v_slug <> lower(v_slug) THEN
      RAISE EXCEPTION 'invalid canonical PokerAtlas slug: %', v_slug
        USING ERRCODE = '22023';
    END IF;
    IF v_row ->> 'slug' IS DISTINCT FROM v_slug THEN
      RAISE EXCEPTION 'directory slug must match PokerAtlas slug: %', v_slug
        USING ERRCODE = '22023';
    END IF;
    IF v_row ->> 'pokeratlas_url' IS DISTINCT FROM
       'https://www.pokeratlas.com/poker-room/' || v_slug THEN
      RAISE EXCEPTION 'PokerAtlas URL does not identify requested room: %', v_slug
        USING ERRCODE = '22023';
    END IF;
    IF v_row ->> 'scrape_url' IS DISTINCT FROM
       'https://www.pokeratlas.com/poker-room/' || v_slug THEN
      RAISE EXCEPTION 'scrape URL does not identify requested room: %', v_slug
        USING ERRCODE = '22023';
    END IF;

    IF char_length(v_name) < 3 OR char_length(v_name) > 300 THEN
      RAISE EXCEPTION 'invalid venue name for PokerAtlas slug %', v_slug
        USING ERRCODE = '22023';
    END IF;
    IF lower(v_name) LIKE ANY (ARRAY[
      '%view live info%', '%wait list registration%', '%waitlist registration%',
      '%register for wait list%', '% favorited %', '% minutes ago%', '% minute ago%'
    ]) THEN
      RAISE EXCEPTION 'activity/navigation copy cannot be a venue name: %', v_name
        USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(v_row ->> 'address'), '') IS NULL
       OR char_length(btrim(v_row ->> 'address')) > 500
       OR nullif(btrim(v_row ->> 'city'), '') IS NULL
       OR char_length(btrim(v_row ->> 'city')) > 200 THEN
      RAISE EXCEPTION 'verified address and city are required for %', v_slug
        USING ERRCODE = '22023';
    END IF;

    IF v_country NOT IN ('US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA') THEN
      RAISE EXCEPTION 'verified US country is required for %', v_slug
        USING ERRCODE = '22023';
    END IF;
    IF v_state <> ALL (ARRAY[
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
      'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
      'VA','WA','WV','WI','WY','DC'
    ]::text[]) THEN
      RAISE EXCEPTION 'canonical two-letter US state is required for %: %', v_slug, v_state
        USING ERRCODE = '22023';
    END IF;

    IF v_row ->> 'data_quality' IS DISTINCT FROM 'scraped_verified'
       OR v_row ->> 'scrape_source' IS DISTINCT FROM 'pokeratlas'
       OR v_row ->> 'scrape_status' IS DISTINCT FROM 'ready' THEN
      RAISE EXCEPTION 'invalid PokerAtlas provenance labels for %', v_slug
        USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_row ->> 'scrape_html_hash', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'valid source HTML hash is required for %', v_slug
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_scrape_timestamp := (v_row ->> 'scrape_timestamp')::timestamptz;
      v_row_batch_id := (v_row ->> 'scrape_batch_id')::uuid;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'invalid scrape timestamp or batch id for %', v_slug
        USING ERRCODE = '22023';
    END;
    IF v_scrape_timestamp IS NULL OR v_scrape_timestamp > now() + interval '5 minutes'
       OR v_row_batch_id IS DISTINCT FROM p_batch_id THEN
      RAISE EXCEPTION 'scrape provenance does not match batch for %', v_slug
        USING ERRCODE = '22023';
    END IF;

    IF (v_row ? 'latitude') <> (v_row ? 'longitude') THEN
      RAISE EXCEPTION 'latitude and longitude must be supplied together for %', v_slug
        USING ERRCODE = '22023';
    END IF;
    IF v_row ? 'latitude' THEN
      BEGIN
        v_latitude := (v_row ->> 'latitude')::double precision;
        v_longitude := (v_row ->> 'longitude')::double precision;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid coordinates for %', v_slug USING ERRCODE = '22023';
      END;
      IF v_latitude NOT BETWEEN -90 AND 90 OR v_longitude NOT BETWEEN -180 AND 180 THEN
        RAISE EXCEPTION 'coordinates outside valid range for %', v_slug
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  SELECT string_agg(d.slug, ', ' ORDER BY d.slug)
    INTO v_duplicate_input
    FROM (
      SELECT lower(btrim(value ->> 'pokeratlas_slug')) AS slug
        FROM jsonb_array_elements(p_rows)
       GROUP BY lower(btrim(value ->> 'pokeratlas_slug'))
      HAVING count(*) > 1
    ) AS d;
  IF v_duplicate_input IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate PokerAtlas slugs in one batch: %', v_duplicate_input
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(lower(btrim(value ->> 'pokeratlas_slug')) ORDER BY
                            lower(btrim(value ->> 'pokeratlas_slug'))), ARRAY[]::text[])
    INTO v_input_slugs
    FROM jsonb_array_elements(p_rows);

  SELECT coalesce(
           jsonb_agg(value ORDER BY lower(btrim(value ->> 'pokeratlas_slug'))),
           '[]'::jsonb
         )
    INTO v_input_contract
    FROM jsonb_array_elements(p_rows);

  WITH input_rows AS (
    SELECT value AS row
      FROM jsonb_array_elements(p_rows)
  ), inserted AS (
    INSERT INTO public.poker_venues (
      name, address, city, state, country, zip, phone, website,
      latitude, longitude, slug, pokeratlas_slug, pokeratlas_url,
      data_quality, scrape_url, scrape_html_hash, scrape_timestamp,
      scrape_source, scrape_batch_id, scrape_status
    )
    SELECT
      btrim(row ->> 'name'),
      btrim(row ->> 'address'),
      btrim(row ->> 'city'),
      upper(btrim(row ->> 'state')),
      'US',
      nullif(btrim(row ->> 'zip'), ''),
      nullif(btrim(row ->> 'phone'), ''),
      nullif(btrim(row ->> 'website'), ''),
      CASE WHEN row ? 'latitude' THEN (row ->> 'latitude')::double precision END,
      CASE WHEN row ? 'longitude' THEN (row ->> 'longitude')::double precision END,
      row ->> 'slug',
      row ->> 'pokeratlas_slug',
      row ->> 'pokeratlas_url',
      'scraped_verified',
      row ->> 'scrape_url',
      row ->> 'scrape_html_hash',
      (row ->> 'scrape_timestamp')::timestamptz,
      'pokeratlas',
      p_batch_id,
      'ready'
    FROM input_rows
    ON CONFLICT ((lower(btrim(pokeratlas_slug))))
      WHERE nullif(btrim(pokeratlas_slug), '') IS NOT NULL
        AND canonical_venue_id IS NULL
    DO NOTHING
    RETURNING lower(btrim(pokeratlas_slug)) AS normalized_slug
  )
  SELECT coalesce(array_agg(normalized_slug ORDER BY normalized_slug), ARRAY[]::text[])
    INTO v_inserted_slugs
    FROM inserted;

  SELECT count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', pv.id,
               'pokeratlas_slug', lower(btrim(pv.pokeratlas_slug)),
               'canonical_venue_id', pv.canonical_venue_id
             ) ORDER BY lower(btrim(pv.pokeratlas_slug))
           ),
           '[]'::jsonb
         )
    INTO v_result_count, v_result_rows
    FROM public.poker_venues AS pv
   WHERE lower(btrim(pv.pokeratlas_slug)) = ANY (v_input_slugs)
     AND pv.canonical_venue_id IS NULL
     AND coalesce(pv.is_active, true)
     AND NOT coalesce(pv.is_suppressed, false);

  IF v_result_count <> v_input_count THEN
    RAISE EXCEPTION 'postcondition failed: only %/% PokerAtlas identities resolved',
      v_result_count, v_input_count USING ERRCODE = 'P0001';
  END IF;

  -- Use the batch UUID as the immutable aggregate-audit ID. Replaying the same
  -- batch cannot create duplicate audit rows; reusing it with different input
  -- is rejected below.
  INSERT INTO public.data_audit_log (
    id, table_name, record_id, action, new_data, scrape_proof,
    batch_id, agent_id, created_at
  ) VALUES (
    p_batch_id,
    'poker_venues',
    'batch:' || p_batch_id::text,
    'INSERT',
    jsonb_build_object(
      'input_count', v_input_count,
      'inserted_count', cardinality(v_inserted_slugs),
      'existing_count', v_input_count - cardinality(v_inserted_slugs),
      'input_slugs', to_jsonb(v_input_slugs),
      'input_rows', v_input_contract
    ),
    jsonb_build_object('source', 'pokeratlas', 'contract', 2),
    p_batch_id,
    'scripts/ingest_missing_pa_venues.py',
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
      FROM public.data_audit_log AS a
     WHERE a.id = p_batch_id
       AND a.table_name = 'poker_venues'
       AND a.record_id = 'batch:' || p_batch_id::text
       AND a.batch_id = p_batch_id
       AND a.agent_id = 'scripts/ingest_missing_pa_venues.py'
       AND a.new_data -> 'input_slugs' = to_jsonb(v_input_slugs)
       AND a.new_data -> 'input_rows' = v_input_contract
       AND a.scrape_proof = jsonb_build_object('source', 'pokeratlas', 'contract', 2)
  ) THEN
    RAISE EXCEPTION 'batch id was already used for a different audit contract'
      USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'input_count', v_input_count,
    'inserted_count', cardinality(v_inserted_slugs),
    'existing_count', v_input_count - cardinality(v_inserted_slugs),
    'input_slugs', to_jsonb(v_input_slugs),
    'inserted_slugs', to_jsonb(v_inserted_slugs),
    'venues', v_result_rows
  );
END
$$;

REVOKE ALL ON FUNCTION public.fn_pokeratlas_ingest_venues(jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pokeratlas_ingest_venues(jsonb, uuid)
  TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.oid = 'public.uq_poker_venues_pokeratlas_slug_normalized_canonical'::regclass
       AND i.indisunique
       AND i.indisvalid
       AND i.indisready
       AND pg_get_expr(i.indpred, i.indrelid) LIKE '%canonical_venue_id IS NULL%'
  ) THEN
    RAISE EXCEPTION 'post-assert failed: normalized PokerAtlas slug unique index is not valid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'fn_pokeratlas_ingest_venues'
       AND pg_get_function_identity_arguments(p.oid) = 'p_rows jsonb, p_batch_id uuid'
       AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'post-assert failed: atomic PokerAtlas ingest RPC is missing or not security definer';
  END IF;
END
$$;

COMMIT;

-- ROLLBACK GUIDANCE (apply as a new forward migration after the caller has
-- been rolled back):
--   REVOKE ALL ON FUNCTION public.fn_pokeratlas_ingest_venues(jsonb, uuid)
--     FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION public.fn_pokeratlas_ingest_venues(jsonb, uuid);
--   DROP INDEX public.uq_poker_venues_pokeratlas_slug_normalized_canonical;
-- Venues 2912/3428 and their immutable audit records are intentionally
-- retained; do not reactivate either without a separately reviewed
-- compensating migration. Venue 2912 must remain canonical-target-free.
