-- 2026-08-20: get_current_settlement_period was manufacturing orphans.
--
-- Its INSERT set neither club_id nor union_id. A period owned by nobody can
-- never be settled, and it poisons every "current open period" lookup, because
-- the function's own first branch returns the most recent OPEN period
-- regardless of who it belongs to.
--
-- This is the same row deleted this morning by
-- settlement_period_hygiene_invariants, which also added the
-- settlement_period_orphan invariant precisely to catch a recurrence. It
-- recurred within hours: deleting the orphan removed the only open period, so
-- the very next call created a fresh one. Self-perpetuating -- and it was the
-- invariant, not a person, that noticed.
--
-- The caller cannot simply be handed nothing -- Club Arena's SettlementService
-- treats an empty result as a backend failure and throws, and its own comment
-- says it refuses to "fabricate an orphaned period". So the fix is to create an
-- OWNED period, not to stop creating.
--
-- Ownership goes to the union when exactly one exists, which is the platform's
-- shape today. With zero or several unions the owner is not obvious, so it
-- creates nothing and lets the caller fail loudly rather than guess -- guessing
-- an owner is how the orphan arrived in the first place.
--
-- Signature, volatility, SECURITY DEFINER and search_path are preserved exactly
-- (the OUT names are period_start/period_end/total_rake, which the SPA reads by
-- name; a first attempt renaming them to start_at/end_at was rejected by
-- Postgres with "cannot change return type of existing function").
--
-- VERIFIED, each test rolled back:
--   * the existing period is still returned unchanged, so the SPA contract holds
--   * retiring every open period and re-calling creates a period owned by
--     fade0000-0000-0000-0000-000000000001 with orphans_created = 0
--   * settlement_period_orphan invariant: 1 -> 0, governance critical 1 -> 0
--
-- Applied to production via Supabase MCP apply_migration as
-- 'settlement_period_must_have_an_owner' on 2026-08-20.

CREATE OR REPLACE FUNCTION public.get_current_settlement_period()
RETURNS TABLE(id uuid, period_start timestamptz, period_end timestamptz,
              status text, total_rake numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_start timestamptz;
  v_end timestamptz;
  v_union uuid;
  v_union_count int;
BEGIN
  -- Existing open period wins.
  RETURN QUERY SELECT sp.id, sp.start_at, sp.end_at, sp.status::text,
                      COALESCE(sp.total_rake_collected, 0)
    FROM settlement_periods sp WHERE sp.status = 'open'
   ORDER BY sp.start_at DESC LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- None open: create one, WITH AN OWNER. A period belonging to nobody can
  -- never be settled and poisons the lookup above for everybody.
  SELECT count(*) INTO v_union_count FROM unions;
  IF v_union_count <> 1 THEN
    RETURN;  -- no single obvious owner; create nothing rather than guess
  END IF;
  SELECT u.id INTO v_union FROM unions u LIMIT 1;

  v_start := date_trunc('week', v_now) - interval '1 day';
  v_end := v_start + interval '7 days';
  INSERT INTO settlement_periods (id, union_id, start_at, end_at, status,
                                  total_rake_collected, period_number, year)
  VALUES (gen_random_uuid(), v_union, v_start, v_end, 'open', 0,
          EXTRACT(week FROM v_start)::int, EXTRACT(isoyear FROM v_start)::int)
  ON CONFLICT DO NOTHING;

  -- Re-select (works whether our insert won or a concurrent one did).
  RETURN QUERY SELECT sp.id, sp.start_at, sp.end_at, sp.status::text,
                      COALESCE(sp.total_rake_collected, 0)
    FROM settlement_periods sp WHERE sp.status = 'open'
   ORDER BY sp.start_at DESC LIMIT 1;
END;
$function$;

-- Adopt the orphan this function already created rather than deleting it: it is
-- the current open week and may already be referenced. Scoped to unowned rows,
-- and only while exactly one union exists.
UPDATE settlement_periods sp
   SET union_id = (SELECT u.id FROM unions u LIMIT 1)
 WHERE sp.club_id IS NULL
   AND sp.union_id IS NULL
   AND (SELECT count(*) FROM unions) = 1;
