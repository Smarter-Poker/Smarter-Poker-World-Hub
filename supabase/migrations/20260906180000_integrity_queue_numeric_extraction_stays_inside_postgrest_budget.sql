-- Phase 5 release audit: the ranked queue extracts numeric evidence fields
-- tens of thousands of times per request. Use a lower-overhead SQL helper instead
-- of paying PL/pgSQL call overhead for every field on every observation.
--
-- ROLLBACK:
-- Restore the PL/pgSQL implementation from migration 20260906101639. The
-- function is immutable and this change writes no application rows.

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_json_numeric(p_value jsonb, p_key text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $sql$
  SELECT CASE
    WHEN p_value ->> p_key ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (p_value ->> p_key)::numeric
    ELSE NULL
  END
$sql$;

REVOKE ALL ON FUNCTION public.fn_ca_integrity_json_numeric(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_json_numeric(jsonb, text) TO service_role;

