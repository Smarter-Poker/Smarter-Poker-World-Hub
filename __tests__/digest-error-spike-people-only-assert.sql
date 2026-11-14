-- After 20261114163409: the harness day is no spike; people and unclassified
-- reports still raise one, and unclassified reports are never dropped.
DO $assert$
DECLARE x jsonb;
BEGIN
  IF jsonb_array_length(public.fn_sp_digest_attention('2026-11-13', '{"health":{"client_errors":3614}}')) <> 0 THEN
    RAISE EXCEPTION 'automated harness reports still raise error_spike';
  END IF;
  INSERT INTO public.client_error_events VALUES (('2026-11-13'::date + time '13:00') AT TIME ZONE 'America/Chicago', NULL, 1400);
  x := public.fn_sp_digest_attention('2026-11-13', '{}');
  IF jsonb_array_length(x) <> 1 OR (x->0->'detail'->>'unclassified')::numeric <> 1400
     OR (x->0->'detail'->>'people')::numeric <> 1320 OR (x->0->'detail'->>'automated')::numeric <> 2294
     OR (x->0->'detail'->>'avg7')::numeric <> 1305 THEN
    RAISE EXCEPTION 'unexpected error_spike after the change: %', x;
  END IF;
END $assert$;
