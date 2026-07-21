-- get_current_settlement_period was SECURITY INVOKER, so its create-branch INSERT
-- was RLS-blocked from the browser (settlement_periods is service-role-write-only:
-- policy settlement_svc = ALL/service_role, settlement_read = SELECT/public). At
-- period rollover (no open period) the RPC returned nothing and SettlementService
-- fabricated a random-UUID period that no row backs -> every settlement written
-- against it is orphaned. SECURITY DEFINER lets the get-or-create persist a real
-- period; the SPA no longer fabricates one (throws instead).
CREATE OR REPLACE FUNCTION public.get_current_settlement_period()
 RETURNS TABLE(id uuid, period_start timestamptz, period_end timestamptz, status text, total_rake numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_now timestamptz := now(); v_start timestamptz; v_end timestamptz; v_id uuid;
BEGIN
  RETURN QUERY SELECT sp.id, sp.start_at, sp.end_at, sp.status::text, COALESCE(sp.total_rake_collected, 0)
  FROM settlement_periods sp WHERE sp.status = 'open' ORDER BY sp.start_at DESC LIMIT 1;
  IF NOT FOUND THEN
    v_start := date_trunc('week', v_now) - interval '1 day';
    v_end := v_start + interval '7 days';
    v_id := gen_random_uuid();
    INSERT INTO settlement_periods (id, start_at, end_at, status, total_rake_collected)
    VALUES (v_id, v_start, v_end, 'open', 0) ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT sp.id, sp.start_at, sp.end_at, sp.status::text, COALESCE(sp.total_rake_collected, 0)
    FROM settlement_periods sp WHERE sp.id = v_id;
  END IF;
END;
$function$;

-- NOTE (pre-existing, out of scope): there are currently 2 'open' settlement
-- periods. The ON CONFLICT DO NOTHING keys on id (always unique) so concurrent
-- create-branch calls can produce duplicate open periods. A partial-unique index
-- on status='open' would prevent that but cannot be added until the existing
-- duplicate is reconciled. Tracked for a focused follow-up.
