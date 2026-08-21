-- THE LAST TWO GAPS IN THE WEEKLY SQUARE-UP.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'presettlements_and_the_club_sees_overdue' (version 20260821180003).
--
-- 1. PAYMENTS MADE DURING A PERIOD HAD NO ENTRY POINT.
--    fn_union_record_presettlement has existed for months and
--    union_presettlements has never held a row, because nothing calls it. The
--    statement breakdown reads `presettled` and would honour it; there was no
--    way to put anything there. A club that paid mid-week was billed for the
--    whole week and squared up by hand.
--
--    THIS RECORDS MONEY RECEIVED, IT MOVES NO CHIPS. It reduces what the NEXT
--    statement asks for.
--
-- 2. A CLUB SAW A RAW STATUS. ca_club_union_invoices returned `status` as
--    stored, so a club owner read "generated" on a statement days past due
--    while the union board showed the same invoice as overdue. Two screens,
--    one invoice, two answers.

CREATE OR REPLACE FUNCTION public.ca_union_record_presettlement(
  p_union_id uuid, p_club_id uuid, p_amount numeric,
  p_method text DEFAULT NULL, p_reference text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_res jsonb; v_total numeric;
BEGIN
  IF NOT ca_can_oversee_union(p_union_id) THEN
    RAISE EXCEPTION 'not authorized for this union' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'enter an amount greater than zero');
  END IF;

  -- The underlying function does its own membership and authorization checks
  -- and returns jsonb rather than raising; pass it straight through.
  v_res := fn_union_record_presettlement(p_union_id, p_club_id, p_amount,
                                         p_method, p_reference, p_note);
  IF NOT COALESCE((v_res->>'success')::boolean, false) THEN RETURN v_res; END IF;

  -- What this club has been credited that is not yet tied to a statement:
  -- what the next square-up will subtract.
  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM union_presettlements
   WHERE union_id = p_union_id AND club_id = p_club_id
     AND applied_settlement_id IS NULL;

  RETURN v_res || jsonb_build_object('unapplied_total', round(v_total, 2));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_union_record_presettlement(uuid, uuid, numeric, text, text, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_union_record_presettlement(uuid, uuid, numeric, text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.ca_club_union_invoices(p_club_id uuid, p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lim int := GREATEST(LEAST(COALESCE(p_limit, 12), 52), 1);
BEGIN
  IF NOT ca_can_view_club_finances(p_club_id) THEN
    RAISE EXCEPTION 'not authorized for this club' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'invoice_id', i.id,
             'status', i.status,
             -- Derived, never stored: a flag needs a job to maintain it, and a
             -- job that does not run leaves the row lying about itself.
             'overdue', (i.status NOT IN ('paid','cancelled')
                         AND i.due_at IS NOT NULL AND i.due_at < now()),
             'paid_total', round(COALESCE((i.breakdown->>'paid_total')::numeric, 0), 2),
             'outstanding', round(GREATEST(
                 abs(COALESCE(i.net_amount, 0))
                 - COALESCE((i.breakdown->>'paid_total')::numeric, 0), 0), 2),
             'issued_at', i.created_at,
             'due_at', i.due_at,
             'amount', i.net_amount,
             'direction', i.breakdown->>'direction',
             'period_start', i.breakdown->>'period_start',
             'period_end', i.breakdown->>'period_end',
             'breakdown', i.breakdown,
             'message_sent', COALESCE(i.message_sent, false))
           ORDER BY i.created_at DESC)
      FROM (
        SELECT * FROM settlement_invoices s
         WHERE s.club_id = p_club_id AND s.invoice_type = 'union_weekly_squareup'
         ORDER BY s.created_at DESC LIMIT v_lim
      ) i
  ), '[]'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_club_union_invoices(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_club_union_invoices(uuid, integer) TO authenticated;
