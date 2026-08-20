-- WEEKLY SQUARE-UP INVOICE: union -> club, issued Monday.
--
-- fn_union_club_invoice has existed since 2026-08-20 and computed the whole
-- statement, but nothing ever called it: no API route, no UI, no function, no
-- cron. It was a calculation with no delivery. This makes it an issued
-- document.
--
-- WHAT THE INVOICE IS. From fn_union_club_invoice's own semantics:
--   settled_in_chips = player P&L + rakeback -- these ALREADY moved
--                      automatically during the week, shown for transparency.
--   outstanding      = ECO + presettlements -- THIS is the number that has to
--                      be squared up, and it is what the invoice bills.
-- Positive outstanding means the union owes the club; negative means the club
-- owes the union. Direction sets from_entity/to_entity accordingly.
--
-- IDEMPOTENT: one invoice per (club, period, type), enforced by a unique index
-- and an upsert, so re-running Monday's close never bills a club twice.
--
-- DELIVERY: rows land in notifications for the club owner and every club
-- admin. A trigger already mirrors notifications into push_outbox, which the
-- push-dispatch cron drains every minute, so in-app and push delivery need no
-- new infrastructure. Email goes out from the API route
-- (pages/api/club-arena/union-invoice) which reads these rows -- keeping the
-- record durable even if the mail leg never fires.
--
-- Applied to production via Supabase MCP as 'union_weekly_squareup_invoices'.

ALTER TABLE public.settlement_invoices
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

ALTER TABLE public.settlement_invoices
  DROP CONSTRAINT IF EXISTS settlement_invoices_invoice_type_check;
ALTER TABLE public.settlement_invoices
  ADD CONSTRAINT settlement_invoices_invoice_type_check
  CHECK (invoice_type = ANY (ARRAY[
    'union_to_club','club_to_agent','agent_to_subagent','agent_to_player',
    'union_club_pnl','club_to_union','union_weekly_squareup']));

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_invoices_squareup
  ON public.settlement_invoices (club_id, period_id, invoice_type)
  WHERE invoice_type = 'union_weekly_squareup';

CREATE OR REPLACE FUNCTION public.fn_union_issue_weekly_invoices(
  p_union_id uuid,
  p_start    timestamptz DEFAULT NULL,
  p_end      timestamptz DEFAULT NULL,
  p_notify   boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_from timestamptz := COALESCE(p_start, date_trunc('week', now()) - interval '7 days');
  v_to   timestamptz := COALESCE(p_end,   date_trunc('week', now()));
  v_due  timestamptz;
  v_union_name text;
  r record;
  v_period_id uuid;
  v_invoice_id uuid;
  v_issued int := 0;
  v_notified int := 0;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM unions u WHERE u.id = p_union_id AND u.owner_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM union_admins ua
                      WHERE ua.union_id = p_union_id AND ua.user_id = v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  v_due := v_to + interval '3 days';
  SELECT u.name INTO v_union_name FROM unions u WHERE u.id = p_union_id;

  FOR r IN SELECT * FROM fn_union_club_invoice(p_union_id, v_from, v_to) LOOP
    SELECT sp.id INTO v_period_id
      FROM settlement_periods sp
     WHERE sp.club_id = r.club_id AND sp.union_id = p_union_id
       AND sp.start_at = v_from AND sp.end_at = v_to
     ORDER BY sp.created_at DESC LIMIT 1;

    IF v_period_id IS NULL THEN
      INSERT INTO settlement_periods (club_id, union_id, period_number, year,
                                      start_at, end_at, status)
      VALUES (r.club_id, p_union_id,
              EXTRACT(week FROM v_from)::int, EXTRACT(isoyear FROM v_from)::int,
              v_from, v_to, 'processing')
      RETURNING id INTO v_period_id;
    END IF;

    INSERT INTO settlement_invoices (
      club_id, period_id, invoice_type,
      from_entity_type, from_entity_id, to_entity_type, to_entity_id,
      gross_amount, net_amount, deductions, breakdown, status,
      chips_transferred, due_at, notes)
    VALUES (
      r.club_id, v_period_id, 'union_weekly_squareup',
      CASE WHEN r.outstanding >= 0 THEN 'union' ELSE 'club' END,
      CASE WHEN r.outstanding >= 0 THEN p_union_id::text ELSE r.club_id::text END,
      CASE WHEN r.outstanding >= 0 THEN 'club'  ELSE 'union' END,
      CASE WHEN r.outstanding >= 0 THEN r.club_id::text ELSE p_union_id::text END,
      abs(r.outstanding), abs(r.outstanding), 0,
      jsonb_build_object(
        'union_id', p_union_id, 'union_name', v_union_name,
        'club_id', r.club_id, 'club_name', r.club_name,
        'period_start', r.period_start, 'period_end', r.period_end,
        'rake_generated', r.rake_generated,
        'union_fee_kept', r.union_fee_kept,
        'rakeback_due',   r.rakeback_due,
        'players_won',    r.players_won,
        'player_pnl_net', r.player_pnl_net,
        'eco_amount',     r.eco_amount,
        'eco_enabled',    r.eco_enabled,
        'presettled',     r.presettled,
        'settled_in_chips', r.settled_in_chips,
        'outstanding',    r.outstanding,
        'net_position',   r.net_position,
        'direction',      r.direction),
      'generated', false, v_due,
      'Weekly union square-up. settled_in_chips already moved during the week; '
      || 'outstanding is the amount to settle.')
    ON CONFLICT (club_id, period_id, invoice_type)
      WHERE invoice_type = 'union_weekly_squareup'
    DO UPDATE SET
      from_entity_type = EXCLUDED.from_entity_type,
      from_entity_id   = EXCLUDED.from_entity_id,
      to_entity_type   = EXCLUDED.to_entity_type,
      to_entity_id     = EXCLUDED.to_entity_id,
      gross_amount     = EXCLUDED.gross_amount,
      net_amount       = EXCLUDED.net_amount,
      breakdown        = EXCLUDED.breakdown,
      due_at           = EXCLUDED.due_at,
      updated_at       = now()
    RETURNING id INTO v_invoice_id;

    v_issued := v_issued + 1;

    IF p_notify THEN
      INSERT INTO notifications (user_id, type, title, message, data, read)
      SELECT DISTINCT u.uid, 'union_invoice',
             v_union_name || ' weekly statement',
             CASE
               WHEN r.outstanding > 0 THEN
                 v_union_name || ' owes ' || r.club_name || ' '
                 || to_char(abs(r.outstanding), 'FM999,999,999,990.00') || ' for the week.'
               WHEN r.outstanding < 0 THEN
                 r.club_name || ' owes ' || v_union_name || ' '
                 || to_char(abs(r.outstanding), 'FM999,999,999,990.00') || ' for the week.'
               ELSE
                 r.club_name || ' is square with ' || v_union_name || ' for the week.'
             END,
             jsonb_build_object('invoice_id', v_invoice_id, 'club_id', r.club_id,
                                'union_id', p_union_id,
                                'period_start', r.period_start, 'period_end', r.period_end,
                                'outstanding', r.outstanding, 'due_at', v_due,
                                'source', 'club_arena'),
             false
        FROM (
          SELECT c.owner_id AS uid FROM clubs c WHERE c.id = r.club_id AND c.owner_id IS NOT NULL
          UNION
          SELECT cm.user_id FROM club_members cm
           WHERE cm.club_id = r.club_id AND cm.role IN ('owner','admin')
             AND COALESCE(cm.status,'active') NOT IN ('banned','suspended')
        ) u
       WHERE u.uid IS NOT NULL;
      GET DIAGNOSTICS v_notified = ROW_COUNT;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'club_id', r.club_id, 'club_name', r.club_name,
      'invoice_id', v_invoice_id, 'outstanding', r.outstanding,
      'direction', r.direction, 'due_at', v_due));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'union_id', p_union_id,
    'period_start', v_from, 'period_end', v_to, 'due_at', v_due,
    'invoices', v_issued, 'notified', v_notified, 'detail', v_out);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_issue_weekly_invoices(uuid, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_union_issue_weekly_invoices(uuid, timestamptz, timestamptz, boolean)
  TO authenticated;

-- Read side for the club owner's screen: their own union statements.
CREATE OR REPLACE FUNCTION public.ca_club_union_invoices(
  p_club_id uuid, p_limit integer DEFAULT 12)
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
