-- PNM Phase 10: complete the indexed integrity refresh with cross-row duplicates.
-- TIER: 2 (additive function replacement and state refresh)
BEGIN;

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

  WITH identities AS (
    SELECT
      id,
      lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', '', 'g'))
        || '|' || lower(trim(coalesce(city, '')))
        || '|' || upper(trim(coalesce(state, ''))) AS identity_key
    FROM public.poker_venues
    WHERE coalesce(is_active, true) IS TRUE
      AND coalesce(is_suppressed, false) IS FALSE
      AND venue_type NOT IN ('series', 'tour', 'home_game')
      AND nullif(trim(name), '') IS NOT NULL
      AND nullif(trim(city), '') IS NOT NULL
      AND nullif(trim(state), '') IS NOT NULL
  ), duplicate_groups AS (
    SELECT identity_key, array_agg(id ORDER BY id) AS venue_ids
    FROM identities
    GROUP BY identity_key
    HAVING count(*) > 1
  ), members AS (
    SELECT identity.id AS venue_id,
      array_remove(duplicate_group.venue_ids, identity.id) AS related_ids
    FROM identities identity
    JOIN duplicate_groups duplicate_group USING (identity_key)
  )
  UPDATE public.venue_location_integrity_state state
  SET issue_types = (
        SELECT array_agg(DISTINCT issue)
        FROM unnest(array_append(state.issue_types, 'duplicate')) issue
      ),
      related_ids = members.related_ids,
      updated_at = now()
  FROM members
  WHERE state.venue_id = members.venue_id;

  UPDATE public.venue_location_integrity_state
  SET primary_issue = public.pnm_primary_venue_issue(issue_types),
      priority = CASE public.pnm_primary_venue_issue(issue_types)
        WHEN 'conflict' THEN 0 WHEN 'missing' THEN 1 WHEN 'duplicate' THEN 2
        WHEN 'unverified' THEN 3 WHEN 'incomplete' THEN 4 WHEN 'stale' THEN 5 ELSE 99
      END,
      updated_at = now();

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pnm_refresh_venue_integrity_state_basics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pnm_refresh_venue_integrity_state_basics() TO service_role;

SELECT public.pnm_refresh_venue_integrity_state_basics();

DO $$
DECLARE
  v_expected bigint;
  v_indexed bigint;
BEGIN
  WITH identities AS (
    SELECT lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', '', 'g'))
      || '|' || lower(trim(coalesce(city, '')))
      || '|' || upper(trim(coalesce(state, ''))) AS identity_key,
      count(*) AS row_count
    FROM public.poker_venues
    WHERE coalesce(is_active, true) IS TRUE
      AND coalesce(is_suppressed, false) IS FALSE
      AND venue_type NOT IN ('series', 'tour', 'home_game')
      AND nullif(trim(name), '') IS NOT NULL
      AND nullif(trim(city), '') IS NOT NULL
      AND nullif(trim(state), '') IS NOT NULL
    GROUP BY 1
  )
  SELECT coalesce(sum(row_count), 0) INTO v_expected FROM identities WHERE row_count > 1;

  SELECT count(*) INTO v_indexed
  FROM public.venue_location_integrity_state
  WHERE 'duplicate' = ANY(issue_types);

  IF v_expected <> v_indexed THEN
    RAISE EXCEPTION 'duplicate state mismatch: expected %, indexed %', v_expected, v_indexed;
  END IF;
END $$;

COMMIT;
