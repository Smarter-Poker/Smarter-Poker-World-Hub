-- TIER 3: existing union readers must include immutable Messenger payment receipts.
-- Preserve original issued invoice fields and all existing audience/financial rules.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.accounting_received_payments') IS NULL THEN RAISE EXCEPTION 'Payment receipt storage missing'; END IF;
 IF md5(pg_get_functiondef('public.ca_club_union_invoices(uuid,integer)'::regprocedure))<>'20148cb3fa6658a7b387e2a7b7496f35' THEN RAISE EXCEPTION 'Union reader source changed; review before installation'; END IF;
 IF md5(pg_get_functiondef('public.ca_union_statement_board(uuid,date,integer)'::regprocedure))<>'38e0bd2e7d3eb8b7dbfa79d2140cb3d7' THEN RAISE EXCEPTION 'Union reader source changed; review before installation'; END IF;
 IF md5(pg_get_functiondef('smarter_private.union_weekly_invoice_body(uuid)'::regprocedure))<>'a3f7005d4c4a666511dfb7a9b7faa951' THEN RAISE EXCEPTION 'Union reader source changed; review before installation'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.ca_club_union_invoices(p_club_id uuid, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lim int := GREATEST(LEAST(COALESCE(p_limit, 12), 52), 1);
BEGIN
  IF NOT ca_can_view_whole_club_report(p_club_id) THEN
    RAISE EXCEPTION 'not authorized for this club' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'invoice_id', i.id,
             'status', i.status,
             -- Derived, never stored: a flag needs a job to maintain it, and a
             -- job that does not run leaves the row lying about itself. The
             -- union board has computed it this way since it was built; the
             -- club side used to show the raw status, so an owner read
             -- "generated" on a statement that was days past due.
             'overdue', (i.status NOT IN ('paid','cancelled')
                         AND i.due_at IS NOT NULL AND i.due_at < now()),
             'paid_total', round((COALESCE((i.breakdown->>'paid_total')::numeric, 0) + (SELECT coalesce(sum(r.amount),0) FROM public.accounting_received_payments r WHERE r.invoice_id=i.id)), 2),
             'outstanding', round(GREATEST(
                 abs(COALESCE(i.net_amount, 0))
                 - (COALESCE((i.breakdown->>'paid_total')::numeric, 0) + (SELECT coalesce(sum(r.amount),0) FROM public.accounting_received_payments r WHERE r.invoice_id=i.id)), 0), 2),
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

CREATE OR REPLACE FUNCTION public.ca_union_statement_board(p_union_id uuid, p_period_end date DEFAULT NULL::date, p_history integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hist int := GREATEST(LEAST(COALESCE(p_history, 8), 52), 1);
  v_end  date;
  v_out  jsonb;
BEGIN
  IF NOT ca_can_oversee_union(p_union_id) THEN
    RAISE EXCEPTION 'not authorized for this union' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p_period_end, MAX((s.breakdown->>'period_end')::date))
    INTO v_end
    FROM settlement_invoices s
   WHERE s.invoice_type = 'union_weekly_squareup'
     AND s.breakdown->>'union_id' = p_union_id::text;

  WITH invoice_eco AS NOT MATERIALIZED (
    -- Project the immutable issued invoice. Never rerun today's ECO terms or
    -- invent aggregate record IDs/rates for separately recorded activities.
    SELECT s.*, COALESCE(s.breakdown->'eco_version'='2'::jsonb
             AND e.parts=2 AND e.record_ids=2 AND e.cash_parts=1 AND e.tournament_parts=1 AND e.valid_parts
             AND jsonb_typeof(s.breakdown->'eco_amount')='number'
             AND CASE WHEN jsonb_typeof(s.breakdown->'eco_amount')='number'
                  THEN (s.breakdown->>'eco_amount')::numeric=e.component_amount END,false) AS recorded_eco_complete,
           e.cash_amount AS recorded_cash_eco_amount,
           e.tournament_amount AS recorded_tournament_eco_amount
      FROM settlement_invoices s
      CROSS JOIN LATERAL (
        SELECT count(*) AS parts, count(DISTINCT c.value->>'record_id') AS record_ids,
          count(*) FILTER(WHERE c.value->>'activity'='cash') AS cash_parts,
          count(*) FILTER(WHERE c.value->>'activity'='tournament') AS tournament_parts,
          bool_and(COALESCE(jsonb_typeof(c.value)='object'
            AND c.value->>'activity' IN('cash','tournament')
            AND jsonb_typeof(c.value->'enabled')='boolean'
            AND c.value->>'base_mode'='club_profit'
            AND jsonb_typeof(c.value->'base')='number'
            AND jsonb_typeof(c.value->'rate')='number'
            AND jsonb_typeof(c.value->'amount')='number'
            AND CASE WHEN jsonb_typeof(c.value->'amount')='number'
                 THEN (c.value->>'amount')::numeric=round((c.value->>'amount')::numeric,2) END
            AND CASE WHEN jsonb_typeof(c.value->'base')='number'
                 AND jsonb_typeof(c.value->'rate')='number' AND jsonb_typeof(c.value->'amount')='number'
                 AND jsonb_typeof(c.value->'enabled')='boolean'
                 THEN (c.value->>'rate')::numeric BETWEEN 0 AND 1
                  AND (c.value->>'amount')::numeric=CASE WHEN (c.value->>'enabled')::boolean
                   THEN round(-(c.value->>'base')::numeric*(c.value->>'rate')::numeric,2) ELSE 0 END END
            AND jsonb_typeof(c.value->'terms_id')='string'
            AND pg_input_is_valid(c.value->>'terms_id','uuid')
            AND jsonb_typeof(c.value->'record_id')='string'
            AND pg_input_is_valid(c.value->>'record_id','uuid')
            AND c.value->>'status'='recorded',false)) AS valid_parts,
          sum(CASE WHEN jsonb_typeof(c.value->'amount')='number' THEN (c.value->>'amount')::numeric END) AS component_amount,
          max(CASE WHEN c.value->>'activity'='cash' AND jsonb_typeof(c.value->'amount')='number' THEN (c.value->>'amount')::numeric END) AS cash_amount,
          max(CASE WHEN c.value->>'activity'='tournament' AND jsonb_typeof(c.value->'amount')='number' THEN (c.value->>'amount')::numeric END) AS tournament_amount
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.breakdown->'eco_components')='array'
          THEN s.breakdown->'eco_components' ELSE '[]'::jsonb END)c(value)
      )e
     WHERE s.invoice_type='union_weekly_squareup' AND s.breakdown->>'union_id'=p_union_id::text
  ),
  clubs_in_union AS (
    -- Current members must show missing invoices. Former members keep their
    -- historical invoice under the union that issued it, after membership moves.
    SELECT c.id AS club_id, c.name AS club_name, c.code AS club_code, c.slug AS club_slug
      FROM clubs c
     WHERE EXISTS (SELECT 1 FROM union_clubs uc WHERE uc.club_id=c.id AND uc.union_id=p_union_id)
        OR EXISTS (SELECT 1 FROM settlement_invoices s WHERE s.club_id=c.id
          AND s.invoice_type='union_weekly_squareup'
          AND s.breakdown->>'union_id'=p_union_id::text
          AND (v_end IS NULL OR (s.breakdown->>'period_end')::date=v_end))
  ),
  period_invoices AS (
    SELECT DISTINCT ON (s.club_id) s.*
      FROM invoice_eco s
      JOIN clubs_in_union cu ON cu.club_id = s.club_id
     WHERE s.invoice_type = 'union_weekly_squareup'
       AND s.breakdown->>'union_id' = p_union_id::text
       AND (v_end IS NULL OR (s.breakdown->>'period_end')::date = v_end)
     ORDER BY s.club_id, s.created_at DESC
  ),
  board AS (
    SELECT cu.club_id, cu.club_name, cu.club_code, cu.club_slug,
           (i.id IS NULL OR i.status <> 'paid' OR coalesce(i.net_amount,0)=0 OR i.breakdown->>'paid_total' IS NOT NULL OR EXISTS(SELECT FROM public.accounting_received_payments r WHERE r.invoice_id=i.id)) AS payment_details_available,
           i.id                            AS invoice_id,
           (i.net_amount IS NOT NULL
             AND i.breakdown->>'rake_generated' IS NOT NULL
             AND i.breakdown->>'rakeback_due' IS NOT NULL
             AND i.breakdown->>'union_fee_kept' IS NOT NULL) AS snapshot_complete,
           COALESCE(i.status, 'missing')   AS status,
           i.created_at                    AS issued_at,
           i.due_at,
           COALESCE(i.net_amount, 0)       AS amount,
           i.breakdown->>'direction'       AS direction,
           i.breakdown->'weekly_player_results' AS weekly_player_results,
           i.invoice_number,
           CASE WHEN pg_input_is_valid(i.breakdown->>'period_start', 'timestamptz')
                THEN (i.breakdown->>'period_start')::timestamptz END AS period_start_at,
           CASE WHEN pg_input_is_valid(i.breakdown->>'period_end', 'timestamptz')
                THEN (i.breakdown->>'period_end')::timestamptz END AS period_end_at,
           i.from_entity_type AS payer_type,
           CASE i.from_entity_type
             WHEN 'union' THEN (SELECT u.name FROM unions u WHERE u.id = CASE WHEN pg_input_is_valid(i.from_entity_id, 'uuid') THEN i.from_entity_id::uuid END)
             WHEN 'club' THEN (SELECT pc.name FROM clubs pc WHERE pc.id = CASE WHEN pg_input_is_valid(i.from_entity_id, 'uuid') THEN i.from_entity_id::uuid END)
           END AS payer_name,
           i.to_entity_type AS payee_type,
           CASE i.to_entity_type
             WHEN 'union' THEN (SELECT u.name FROM unions u WHERE u.id = CASE WHEN pg_input_is_valid(i.to_entity_id, 'uuid') THEN i.to_entity_id::uuid END)
             WHEN 'club' THEN (SELECT pc.name FROM clubs pc WHERE pc.id = CASE WHEN pg_input_is_valid(i.to_entity_id, 'uuid') THEN i.to_entity_id::uuid END)
           END AS payee_name,
           (cu.club_id = p_union_id) AS union_house,
           CASE WHEN jsonb_typeof(i.breakdown->'settled_in_chips') = 'number'
                THEN (i.breakdown->>'settled_in_chips')::numeric END AS settled_in_chips,
           CASE WHEN jsonb_typeof(i.breakdown->'player_pnl_net') = 'number'
                THEN (i.breakdown->>'player_pnl_net')::numeric END AS player_pnl_net,
           CASE WHEN jsonb_typeof(i.breakdown->'outstanding') = 'number'
                THEN (i.breakdown->>'outstanding')::numeric END AS stored_outstanding,
           (SELECT jsonb_agg(jsonb_build_object('invoice_number', cn.invoice_number,
                                                'amount', round(cn.net_amount, 2))
                             ORDER BY cn.created_at, cn.invoice_number)
              FROM settlement_invoices cn
             WHERE cn.adjusts_invoice_id = i.id
               AND cn.invoice_type = 'union_weekly_credit_note') AS credit_notes,
           CASE WHEN i.id IS NOT NULL THEN public.fn_union_invoice_outstanding(i.id) END AS remaining_after_credits,
           EXISTS (SELECT 1 FROM accounting_invoice_deliveries d WHERE d.invoice_id = i.id) AS message_sent,
           (COALESCE((i.breakdown->>'paid_total')::numeric, 0) + (SELECT coalesce(sum(r.amount),0) FROM public.accounting_received_payments r WHERE r.invoice_id=i.id))     AS paid_total,
           COALESCE((i.breakdown->>'rake_generated')::numeric, 0) AS rake_generated,
           COALESCE((i.breakdown->>'rakeback_due')::numeric, 0)   AS rakeback_due,
           COALESCE((i.breakdown->>'union_fee_kept')::numeric, 0) AS union_fee_kept,
           COALESCE((i.breakdown->>'players_won')::numeric, 0)    AS players_won,
           COALESCE((i.breakdown->>'eco_amount')::numeric, 0)     AS eco_amount,
           COALESCE((i.breakdown->>'presettled')::numeric, 0)     AS presettled,
           CASE WHEN i.id IS NOT NULL THEN COALESCE(i.breakdown->'eco_version','1'::jsonb) END AS eco_version,
           CASE WHEN i.breakdown->'eco_version'='2'::jsonb THEN i.breakdown->'eco_components' END AS eco_components,
           COALESCE(i.recorded_eco_complete,false) AS eco_components_complete,
           CASE WHEN i.recorded_eco_complete THEN i.recorded_cash_eco_amount END AS cash_eco_amount,
           CASE WHEN i.recorded_eco_complete THEN i.recorded_tournament_eco_amount END AS tournament_eco_amount
      FROM clubs_in_union cu
      LEFT JOIN period_invoices i ON i.club_id = cu.club_id
  ),
  history AS (
    SELECT (s.breakdown->>'period_end')::date AS period_end,
           MIN((s.breakdown->>'period_start')::date) AS period_start,
           MIN(CASE WHEN pg_input_is_valid(s.breakdown->>'period_start', 'timestamptz')
                    THEN (s.breakdown->>'period_start')::timestamptz END) AS period_start_at,
           MAX(CASE WHEN pg_input_is_valid(s.breakdown->>'period_end', 'timestamptz')
                    THEN (s.breakdown->>'period_end')::timestamptz END) AS period_end_at,
           count(*)                                  AS clubs,
           round(SUM(s.net_amount), 2)               AS total_amount,
           round(SUM(COALESCE((s.breakdown->>'rake_generated')::numeric, 0)), 2) AS rake_generated,
           round(SUM(COALESCE((s.breakdown->>'eco_amount')::numeric, 0)), 2)     AS eco_amount,
           bool_and(s.recorded_eco_complete) AS eco_components_complete,
           CASE WHEN bool_and(s.recorded_eco_complete) THEN round(SUM(s.recorded_cash_eco_amount),2) END AS cash_eco_amount,
           CASE WHEN bool_and(s.recorded_eco_complete) THEN round(SUM(s.recorded_tournament_eco_amount),2) END AS tournament_eco_amount,
           count(*) FILTER (WHERE s.status = 'paid')                             AS paid,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM accounting_invoice_deliveries d WHERE d.invoice_id = s.id)) AS delivered
      FROM invoice_eco s
     WHERE s.invoice_type = 'union_weekly_squareup'
       AND s.breakdown->>'union_id' = p_union_id::text
       AND s.breakdown ? 'period_end'
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT v_hist
  )
  SELECT jsonb_build_object(
    'union_id', p_union_id,
    'union_name', (SELECT u.name FROM unions u WHERE u.id = p_union_id),
    'period_end', v_end,
    'period_start', (SELECT MIN((i.breakdown->>'period_start')::date) FROM period_invoices i),
    'period_start_at', (SELECT MIN(b.period_start_at) FROM board b),
    'period_end_at', (SELECT MAX(b.period_end_at) FROM board b),
    'totals', (SELECT jsonb_build_object(
                 'clubs',      count(*),
                 'issued',     count(*) FILTER (WHERE b.status <> 'missing'),
                 'missing',    count(*) FILTER (WHERE b.status = 'missing'),
                 'delivered',  count(*) FILTER (WHERE b.message_sent),
                 'paid',       count(*) FILTER (WHERE b.status = 'paid'),
                 'clubs_owe',  round(COALESCE(SUM(b.amount) FILTER (WHERE b.amount > 0), 0), 2),
                 'union_owes', round(COALESCE(SUM(-b.amount) FILTER (WHERE b.amount < 0), 0), 2),
                 'net',        round(COALESCE(SUM(b.amount), 0), 2),
                 'payment_details_available', coalesce(bool_and(b.payment_details_available),true), 'collected', CASE WHEN coalesce(bool_and(b.payment_details_available),true) THEN round(COALESCE(SUM(b.paid_total), 0), 2) END,
                 -- what is still out: the unpaid remainder, not the headline
                 'outstanding', CASE WHEN coalesce(bool_and(b.payment_details_available),true) THEN round(COALESCE(SUM(
                     GREATEST(COALESCE(b.remaining_after_credits, abs(b.amount)) - b.paid_total, 0))
                     FILTER (WHERE b.status NOT IN ('missing','cancelled')), 0), 2) END,
                 'rake_generated', round(COALESCE(SUM(b.rake_generated), 0), 2),
                 'eco_amount',     round(COALESCE(SUM(b.eco_amount), 0), 2),
                 'eco_components_complete',count(*)>0 AND bool_and(b.eco_components_complete),
                 'cash_eco_amount',CASE WHEN count(*)>0 AND bool_and(b.eco_components_complete) THEN round(SUM(b.cash_eco_amount),2) END,
                 'tournament_eco_amount',CASE WHEN count(*)>0 AND bool_and(b.eco_components_complete) THEN round(SUM(b.tournament_eco_amount),2) END)
                 FROM board b),
    'clubs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'club_id', b.club_id, 'club_name', b.club_name,
               'club_code', b.club_code, 'club_slug', b.club_slug,
               'invoice_id', b.invoice_id, 'status', b.status, 'snapshot_complete', b.snapshot_complete,
               'issued_at', b.issued_at, 'due_at', b.due_at,
               'amount', round(b.amount, 2), 'direction', b.direction,
               'message_sent', b.message_sent,
               'payment_details_available', b.payment_details_available, 'paid_total', CASE WHEN b.payment_details_available THEN round(b.paid_total, 2) END,
               'outstanding', CASE WHEN b.payment_details_available THEN round(GREATEST(COALESCE(b.remaining_after_credits, abs(b.amount)) - b.paid_total, 0), 2) END,
               -- overdue is derived, never stored: a stored flag needs a job to
               -- maintain it, and a job that does not run leaves the row lying
               'overdue', (b.status NOT IN ('paid','missing','cancelled')
                           AND b.due_at IS NOT NULL AND b.due_at < now()),
               'rake_generated', round(b.rake_generated, 2),
               'rakeback_due', round(b.rakeback_due, 2),
               'union_fee_kept', round(b.union_fee_kept, 2),
               'players_won', round(b.players_won, 2),
               'weekly_player_results',b.weekly_player_results,
               'invoice_number', b.invoice_number,
               'period_start_at', b.period_start_at, 'period_end_at', b.period_end_at,
               'payer_type', b.payer_type, 'payer_name', b.payer_name,
               'payee_type', b.payee_type, 'payee_name', b.payee_name,
               'union_house', b.union_house,
               'settled_in_chips', round(b.settled_in_chips, 2),
               'player_pnl_net', round(b.player_pnl_net, 2),
               'stored_outstanding', round(b.stored_outstanding, 2),
               'credit_notes', b.credit_notes,
               'remaining_after_credits', round(b.remaining_after_credits, 2),
               'eco_amount', round(b.eco_amount, 2),
               'eco_version',b.eco_version,'eco_components',b.eco_components,
               'eco_components_complete',b.eco_components_complete,
               'presettled', round(b.presettled, 2))
             ORDER BY (b.status = 'missing') DESC, b.amount DESC)
        FROM board b), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'period_start', h.period_start, 'period_end', h.period_end,
               'period_start_at', h.period_start_at, 'period_end_at', h.period_end_at,
               'clubs', h.clubs, 'total_amount', h.total_amount,
               'rake_generated', h.rake_generated, 'eco_amount', h.eco_amount,
               'eco_components_complete',h.eco_components_complete,
               'cash_eco_amount',h.cash_eco_amount,'tournament_eco_amount',h.tournament_eco_amount,
               'paid', h.paid, 'delivered', h.delivered)
             ORDER BY h.period_end DESC)
        FROM history h), '[]'::jsonb),
    'generated_at', now()
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION smarter_private.union_weekly_invoice_body(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.settlement_invoices%ROWTYPE;
  b jsonb;
  w jsonb;
  c jsonb;
  v_union uuid;
  v_union_name text;
  v_club_name text;
  v_house boolean;
  v_payer text;
  v_payee text;
  v_start timestamptz;
  v_end timestamptz;
  v_square boolean;
  v_body text;
  v_original text;
  v_credits text;
  v_credited numeric;
  v_remaining numeric;
  v_paid numeric;
BEGIN
  SELECT * INTO inv FROM public.settlement_invoices s WHERE s.id = p_invoice_id;
  IF NOT FOUND OR inv.invoice_type NOT IN ('union_weekly_squareup', 'union_weekly_credit_note') THEN
    RAISE EXCEPTION 'union_weekly_invoice_body_wrong_document' USING ERRCODE = '23514';
  END IF;
  b := COALESCE(inv.breakdown, '{}'::jsonb);
  v_union := CASE WHEN pg_input_is_valid(b->>'union_id', 'uuid') THEN (b->>'union_id')::uuid END;
  v_union_name := COALESCE((SELECT u.name FROM public.unions u WHERE u.id = v_union),
                           b->>'union_name', 'The Union');
  v_club_name := COALESCE((SELECT cl.name FROM public.clubs cl WHERE cl.id = inv.club_id),
                          b->>'club_name', 'The Club');
  v_house := inv.club_id IS NOT DISTINCT FROM v_union;
  v_start := CASE WHEN pg_input_is_valid(b->>'period_start', 'timestamptz')
                  THEN (b->>'period_start')::timestamptz END;
  v_end := CASE WHEN pg_input_is_valid(b->>'period_end', 'timestamptz')
                THEN (b->>'period_end')::timestamptz END;
  v_payer := CASE inv.from_entity_type
    WHEN 'union' THEN (SELECT u.name FROM public.unions u
                        WHERE u.id = CASE WHEN pg_input_is_valid(inv.from_entity_id, 'uuid') THEN inv.from_entity_id::uuid END)
    WHEN 'club' THEN (SELECT cl.name FROM public.clubs cl
                       WHERE cl.id = CASE WHEN pg_input_is_valid(inv.from_entity_id, 'uuid') THEN inv.from_entity_id::uuid END)
      || CASE WHEN v_house THEN ' (House Club)' ELSE '' END
  END;
  v_payee := CASE inv.to_entity_type
    WHEN 'union' THEN (SELECT u.name FROM public.unions u
                        WHERE u.id = CASE WHEN pg_input_is_valid(inv.to_entity_id, 'uuid') THEN inv.to_entity_id::uuid END)
    WHEN 'club' THEN (SELECT cl.name FROM public.clubs cl
                       WHERE cl.id = CASE WHEN pg_input_is_valid(inv.to_entity_id, 'uuid') THEN inv.to_entity_id::uuid END)
      || CASE WHEN v_house THEN ' (House Club)' ELSE '' END
  END;
  v_payer := COALESCE(v_payer, initcap(inv.from_entity_type));
  v_payee := COALESCE(v_payee, initcap(inv.to_entity_type));

  IF inv.invoice_type = 'union_weekly_credit_note' THEN
    SELECT o.invoice_number INTO v_original FROM public.settlement_invoices o
     WHERE o.id = CASE WHEN pg_input_is_valid(b->>'original_invoice_id', 'uuid')
                       THEN (b->>'original_invoice_id')::uuid END;
    RETURN v_union_name || ' Credit Note ' || COALESCE(inv.invoice_number, '')
      || E'\nAgainst Invoice: ' || COALESCE(v_original, b->>'credit_note_for', 'Unavailable')
      || E'\nWeek: ' || smarter_private.union_statement_week(v_start, v_end)
      || E'\nThe Week Includes Its Start And Excludes Its End.'
      || E'\nIssued By: ' || v_union_name
      || E'\nIssued To: ' || v_club_name
      || CASE WHEN v_house THEN ' (The Union''s Own House Club)' ELSE '' END
      || E'\nCredit: ' || v_payer || ' Credits ' || v_payee || ' '
      || smarter_private.union_statement_figure(abs(inv.net_amount)) || ' Chips'
      || E'\nA Credit Note Reduces The Original Invoice. No Chips Move.'
      || E'\nStatus: ' || initcap(inv.status)
      || CASE WHEN b ? 'reason' THEN E'\nReason: ' || (b->>'reason') ELSE '' END;
  END IF;

  -- A square-up later reduced by credit notes owes only what is left
  -- (fn_union_invoice_outstanding's rule): it never reads as the full amount.
  SELECT string_agg(cn.invoice_number || ' (' || smarter_private.union_statement_figure(cn.net_amount) || ')',
                    ', ' ORDER BY cn.created_at, cn.invoice_number),
         sum(cn.net_amount)
    INTO v_credits, v_credited
    FROM public.settlement_invoices cn
   WHERE cn.adjusts_invoice_id = inv.id AND cn.invoice_type = 'union_weekly_credit_note';
  v_remaining := round(abs(inv.net_amount) - COALESCE(v_credited, 0), 2);
  v_square := COALESCE(round(inv.net_amount, 2) = 0, false) OR COALESCE(b->>'direction', '') = 'square';
  v_body := v_union_name
      || CASE WHEN v_house THEN ' House Club Statement ' ELSE ' Weekly Statement ' END
      || COALESCE(inv.invoice_number, '')
    || E'\nWeek: ' || smarter_private.union_statement_week(v_start, v_end)
    || E'\nThe Week Includes Its Start And Excludes Its End.'
    || E'\nIssued By: ' || v_union_name
    || E'\nIssued To: ' || v_club_name
    || CASE WHEN v_house THEN ' (The Union''s Own House Club)' ELSE '' END
    || E'\nAmount Due: '
    || CASE WHEN v_square THEN 'Square, Nothing Due'
            WHEN v_credits IS NOT NULL AND v_remaining <= 0
              THEN 'Credited In Full, Nothing Due'
            WHEN v_credits IS NOT NULL
              THEN v_payer || ' Pays ' || v_payee || ' '
                || smarter_private.union_statement_figure(v_remaining) || ' Chips After Credit'
            ELSE v_payer || ' Pays ' || v_payee || ' '
              || smarter_private.union_statement_figure(abs(inv.net_amount)) || ' Chips' END
    || CASE WHEN v_credits IS NOT NULL
            THEN E'\nOriginal Amount: ' || smarter_private.union_statement_figure(abs(inv.net_amount))
              || E'\nCredited By: ' || v_credits
            ELSE '' END
    || E'\nStatus: ' || initcap(inv.status)
    || CASE WHEN inv.due_at IS NOT NULL AND NOT v_square AND v_remaining > 0
            THEN E'\nDue: ' || smarter_private.union_statement_instant(inv.due_at) || ' Chicago Time'
            ELSE '' END
    || E'\n'
    || E'\nRake Generated: ' || smarter_private.union_statement_amount(b->'rake_generated')
    || E'\nUnion Fee Kept: ' || smarter_private.union_statement_amount(b->'union_fee_kept')
    || E'\nRakeback Paid To The Club: ' || smarter_private.union_statement_amount(b->'rakeback_due')
    || E'\nPlayer Win/Loss, Fees Paid Included (Negative Means Players Lost): '
      || smarter_private.union_statement_amount(b->'players_won')
    || CASE WHEN b ? 'player_pnl_net'
            THEN E'\nPlayer Result Excluding Fees: '
              || smarter_private.union_statement_amount(b->'player_pnl_net')
              || E'\nThe Two Player Figures Differ By Exactly The Rake Generated; Neither Is An Amount Due.'
            ELSE '' END;

  w := b->'weekly_player_results';
  IF jsonb_typeof(w) = 'object' THEN
    v_body := v_body
      || E'\nThe Net Loss, ECO Charge And Full Weekly Net Lines Below Are Counted From The Club''s Side: '
      || 'Positive Means Players Lost Or The Club Pays. Less Club Rakeback Credit Is The Rakeback '
      || 'The Union Paid The Club, Subtracted In The Full Weekly Net.'
      || E'\nCash Player Net Loss: ' || smarter_private.union_statement_amount(w->'cash_net_loss')
      || E'\nTournament Player Net Loss: ' || smarter_private.union_statement_amount(w->'tournament_net_loss')
      || E'\nTotal Player Net Loss: ' || smarter_private.union_statement_amount(w->'total_net_loss')
      || E'\nLess Club Rakeback Credit: ' || smarter_private.union_statement_amount(w->'rakeback_credit')
      || E'\nECO Charge Or Credit (Positive Means The Club Pays): ' || smarter_private.union_statement_amount(w->'eco_charge')
      || E'\nFull Weekly Net (Positive Club Owes Union): '
        || smarter_private.union_statement_amount(w->'weekly_net_due_to_union')
      || E'\nThe Full Weekly Net Is Counted From The Club''s Side And Includes The Fees Players Paid. '
      || 'It Is A Summary, Not An Additional Payment Request.';
  ELSE
    v_body := v_body || E'\nCash And Tournament Player Split: Not Recorded On This Invoice';
  END IF;

  IF b->'eco_version' = '2'::jsonb AND jsonb_typeof(b->'eco_components') = 'array' THEN
    FOR c IN SELECT e.value FROM jsonb_array_elements(b->'eco_components') e
              ORDER BY CASE e.value->>'activity' WHEN 'cash' THEN 0 ELSE 1 END LOOP
      v_body := v_body || E'\n' || initcap(COALESCE(c->>'activity', 'Other')) || ' ECO: '
        || smarter_private.union_statement_amount(c->'amount')
        || ' (Base ' || smarter_private.union_statement_amount(c->'base')
        || ' At ' || CASE WHEN jsonb_typeof(c->'rate') = 'number'
                          THEN trim_scale((c->>'rate')::numeric * 100)::text || '%)'
                          ELSE 'Unavailable Rate)' END;
    END LOOP;
  END IF;

  v_body := v_body
    || E'\nCombined ECO (Negative Means The Club Pays): '
      || smarter_private.union_statement_amount(b->'eco_amount')
    || E'\nRecorded Presettlements: ' || smarter_private.union_statement_amount(b->'presettled')
    || CASE WHEN b ? 'settled_in_chips' THEN
         E'\nSettled In Chips: ' || smarter_private.union_statement_amount(b->'settled_in_chips')
         || CASE WHEN jsonb_typeof(b->'rakeback_due') = 'number' AND (b->>'rakeback_due')::numeric <> 0
                 THEN E'\n  Rakeback Paid By ' || v_union_name || ' To ' || v_club_name
                   || ' With The Monday Rakeback: '
                   || smarter_private.union_statement_amount(b->'rakeback_due')
                   || ' (The Only Union To Club Transfer In It)'
                 ELSE E'\n  No Rakeback Was Paid To The Club For This Week' END
         || CASE WHEN b ? 'player_pnl_net' THEN
              E'\n  Player Result Excluding Fees: '
              || smarter_private.union_statement_amount(b->'player_pnl_net')
              || ' (Already Settled At The Tables During The Week: Pots, Bad Beat Jackpot Drops And Awards, '
              || 'Tournament Entries And Prizes; Not A Union Or Club Transfer)'
            ELSE '' END
         || E'\nSettled In Chips Has Already Moved And Is Not Billed Again.'
       ELSE '' END
    || CASE WHEN b ? 'outstanding' THEN
         E'\nAmount Due Is What Remains: Combined ECO '
           || smarter_private.union_statement_amount(b->'eco_amount')
           || ' Plus Recorded Presettlements '
           || smarter_private.union_statement_amount(b->'presettled')
           || ' Equals ' || smarter_private.union_statement_amount(b->'outstanding')
           || ' (Negative: The Club Pays The Union; Positive: The Union Pays The Club)'
           || CASE WHEN v_credits IS NOT NULL
                   THEN E'\nLess Credit Notes ' || smarter_private.union_statement_figure(COALESCE(v_credited, 0))
                     || ' Leaves ' || smarter_private.union_statement_figure(greatest(v_remaining, 0)) || ' Due'
                   ELSE '' END
       ELSE '' END;
  v_paid := CASE WHEN jsonb_typeof(b->'paid_total') = 'number' THEN (b->>'paid_total')::numeric ELSE 0 END
    + (SELECT coalesce(sum(r.amount),0) FROM public.accounting_received_payments r WHERE r.invoice_id=inv.id);
  v_body := v_body
    || CASE WHEN v_paid > 0 THEN E'\nPaid So Far: ' || smarter_private.union_statement_figure(v_paid) ELSE '' END
    || E'\nRemaining Unpaid Balance: '
    || smarter_private.union_statement_figure(CASE WHEN v_square THEN 0 ELSE greatest(v_remaining - v_paid, 0) END);
  RETURN v_body;
END
$function$;

DO $$ BEGIN
 IF position('accounting_received_payments' in pg_get_functiondef('public.ca_union_statement_board(uuid,date,integer)'::regprocedure))=0 THEN RAISE EXCEPTION 'Payment receipts missing from union board'; END IF;
END $$;
COMMIT;
-- ROLLBACK: only before any receipts exist; never hide payments already recorded.
/*
BEGIN;
DO $$ BEGIN IF EXISTS(SELECT FROM public.accounting_received_payments) THEN RAISE EXCEPTION 'Recorded payments require a forward-compatible reader'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.ca_club_union_invoices(p_club_id uuid, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lim int := GREATEST(LEAST(COALESCE(p_limit, 12), 52), 1);
BEGIN
  IF NOT ca_can_view_whole_club_report(p_club_id) THEN
    RAISE EXCEPTION 'not authorized for this club' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'invoice_id', i.id,
             'status', i.status,
             -- Derived, never stored: a flag needs a job to maintain it, and a
             -- job that does not run leaves the row lying about itself. The
             -- union board has computed it this way since it was built; the
             -- club side used to show the raw status, so an owner read
             -- "generated" on a statement that was days past due.
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

CREATE OR REPLACE FUNCTION public.ca_union_statement_board(p_union_id uuid, p_period_end date DEFAULT NULL::date, p_history integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hist int := GREATEST(LEAST(COALESCE(p_history, 8), 52), 1);
  v_end  date;
  v_out  jsonb;
BEGIN
  IF NOT ca_can_oversee_union(p_union_id) THEN
    RAISE EXCEPTION 'not authorized for this union' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p_period_end, MAX((s.breakdown->>'period_end')::date))
    INTO v_end
    FROM settlement_invoices s
   WHERE s.invoice_type = 'union_weekly_squareup'
     AND s.breakdown->>'union_id' = p_union_id::text;

  WITH invoice_eco AS NOT MATERIALIZED (
    -- Project the immutable issued invoice. Never rerun today's ECO terms or
    -- invent aggregate record IDs/rates for separately recorded activities.
    SELECT s.*, COALESCE(s.breakdown->'eco_version'='2'::jsonb
             AND e.parts=2 AND e.record_ids=2 AND e.cash_parts=1 AND e.tournament_parts=1 AND e.valid_parts
             AND jsonb_typeof(s.breakdown->'eco_amount')='number'
             AND CASE WHEN jsonb_typeof(s.breakdown->'eco_amount')='number'
                  THEN (s.breakdown->>'eco_amount')::numeric=e.component_amount END,false) AS recorded_eco_complete,
           e.cash_amount AS recorded_cash_eco_amount,
           e.tournament_amount AS recorded_tournament_eco_amount
      FROM settlement_invoices s
      CROSS JOIN LATERAL (
        SELECT count(*) AS parts, count(DISTINCT c.value->>'record_id') AS record_ids,
          count(*) FILTER(WHERE c.value->>'activity'='cash') AS cash_parts,
          count(*) FILTER(WHERE c.value->>'activity'='tournament') AS tournament_parts,
          bool_and(COALESCE(jsonb_typeof(c.value)='object'
            AND c.value->>'activity' IN('cash','tournament')
            AND jsonb_typeof(c.value->'enabled')='boolean'
            AND c.value->>'base_mode'='club_profit'
            AND jsonb_typeof(c.value->'base')='number'
            AND jsonb_typeof(c.value->'rate')='number'
            AND jsonb_typeof(c.value->'amount')='number'
            AND CASE WHEN jsonb_typeof(c.value->'amount')='number'
                 THEN (c.value->>'amount')::numeric=round((c.value->>'amount')::numeric,2) END
            AND CASE WHEN jsonb_typeof(c.value->'base')='number'
                 AND jsonb_typeof(c.value->'rate')='number' AND jsonb_typeof(c.value->'amount')='number'
                 AND jsonb_typeof(c.value->'enabled')='boolean'
                 THEN (c.value->>'rate')::numeric BETWEEN 0 AND 1
                  AND (c.value->>'amount')::numeric=CASE WHEN (c.value->>'enabled')::boolean
                   THEN round(-(c.value->>'base')::numeric*(c.value->>'rate')::numeric,2) ELSE 0 END END
            AND jsonb_typeof(c.value->'terms_id')='string'
            AND pg_input_is_valid(c.value->>'terms_id','uuid')
            AND jsonb_typeof(c.value->'record_id')='string'
            AND pg_input_is_valid(c.value->>'record_id','uuid')
            AND c.value->>'status'='recorded',false)) AS valid_parts,
          sum(CASE WHEN jsonb_typeof(c.value->'amount')='number' THEN (c.value->>'amount')::numeric END) AS component_amount,
          max(CASE WHEN c.value->>'activity'='cash' AND jsonb_typeof(c.value->'amount')='number' THEN (c.value->>'amount')::numeric END) AS cash_amount,
          max(CASE WHEN c.value->>'activity'='tournament' AND jsonb_typeof(c.value->'amount')='number' THEN (c.value->>'amount')::numeric END) AS tournament_amount
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.breakdown->'eco_components')='array'
          THEN s.breakdown->'eco_components' ELSE '[]'::jsonb END)c(value)
      )e
     WHERE s.invoice_type='union_weekly_squareup' AND s.breakdown->>'union_id'=p_union_id::text
  ),
  clubs_in_union AS (
    -- Current members must show missing invoices. Former members keep their
    -- historical invoice under the union that issued it, after membership moves.
    SELECT c.id AS club_id, c.name AS club_name, c.code AS club_code, c.slug AS club_slug
      FROM clubs c
     WHERE EXISTS (SELECT 1 FROM union_clubs uc WHERE uc.club_id=c.id AND uc.union_id=p_union_id)
        OR EXISTS (SELECT 1 FROM settlement_invoices s WHERE s.club_id=c.id
          AND s.invoice_type='union_weekly_squareup'
          AND s.breakdown->>'union_id'=p_union_id::text
          AND (v_end IS NULL OR (s.breakdown->>'period_end')::date=v_end))
  ),
  period_invoices AS (
    SELECT DISTINCT ON (s.club_id) s.*
      FROM invoice_eco s
      JOIN clubs_in_union cu ON cu.club_id = s.club_id
     WHERE s.invoice_type = 'union_weekly_squareup'
       AND s.breakdown->>'union_id' = p_union_id::text
       AND (v_end IS NULL OR (s.breakdown->>'period_end')::date = v_end)
     ORDER BY s.club_id, s.created_at DESC
  ),
  board AS (
    SELECT cu.club_id, cu.club_name, cu.club_code, cu.club_slug,
           (i.id IS NULL OR i.status <> 'paid' OR coalesce(i.net_amount,0)=0 OR i.breakdown->>'paid_total' IS NOT NULL) AS payment_details_available,
           i.id                            AS invoice_id,
           (i.net_amount IS NOT NULL
             AND i.breakdown->>'rake_generated' IS NOT NULL
             AND i.breakdown->>'rakeback_due' IS NOT NULL
             AND i.breakdown->>'union_fee_kept' IS NOT NULL) AS snapshot_complete,
           COALESCE(i.status, 'missing')   AS status,
           i.created_at                    AS issued_at,
           i.due_at,
           COALESCE(i.net_amount, 0)       AS amount,
           i.breakdown->>'direction'       AS direction,
           i.breakdown->'weekly_player_results' AS weekly_player_results,
           i.invoice_number,
           CASE WHEN pg_input_is_valid(i.breakdown->>'period_start', 'timestamptz')
                THEN (i.breakdown->>'period_start')::timestamptz END AS period_start_at,
           CASE WHEN pg_input_is_valid(i.breakdown->>'period_end', 'timestamptz')
                THEN (i.breakdown->>'period_end')::timestamptz END AS period_end_at,
           i.from_entity_type AS payer_type,
           CASE i.from_entity_type
             WHEN 'union' THEN (SELECT u.name FROM unions u WHERE u.id = CASE WHEN pg_input_is_valid(i.from_entity_id, 'uuid') THEN i.from_entity_id::uuid END)
             WHEN 'club' THEN (SELECT pc.name FROM clubs pc WHERE pc.id = CASE WHEN pg_input_is_valid(i.from_entity_id, 'uuid') THEN i.from_entity_id::uuid END)
           END AS payer_name,
           i.to_entity_type AS payee_type,
           CASE i.to_entity_type
             WHEN 'union' THEN (SELECT u.name FROM unions u WHERE u.id = CASE WHEN pg_input_is_valid(i.to_entity_id, 'uuid') THEN i.to_entity_id::uuid END)
             WHEN 'club' THEN (SELECT pc.name FROM clubs pc WHERE pc.id = CASE WHEN pg_input_is_valid(i.to_entity_id, 'uuid') THEN i.to_entity_id::uuid END)
           END AS payee_name,
           (cu.club_id = p_union_id) AS union_house,
           CASE WHEN jsonb_typeof(i.breakdown->'settled_in_chips') = 'number'
                THEN (i.breakdown->>'settled_in_chips')::numeric END AS settled_in_chips,
           CASE WHEN jsonb_typeof(i.breakdown->'player_pnl_net') = 'number'
                THEN (i.breakdown->>'player_pnl_net')::numeric END AS player_pnl_net,
           CASE WHEN jsonb_typeof(i.breakdown->'outstanding') = 'number'
                THEN (i.breakdown->>'outstanding')::numeric END AS stored_outstanding,
           (SELECT jsonb_agg(jsonb_build_object('invoice_number', cn.invoice_number,
                                                'amount', round(cn.net_amount, 2))
                             ORDER BY cn.created_at, cn.invoice_number)
              FROM settlement_invoices cn
             WHERE cn.adjusts_invoice_id = i.id
               AND cn.invoice_type = 'union_weekly_credit_note') AS credit_notes,
           CASE WHEN i.id IS NOT NULL THEN public.fn_union_invoice_outstanding(i.id) END AS remaining_after_credits,
           EXISTS (SELECT 1 FROM accounting_invoice_deliveries d WHERE d.invoice_id = i.id) AS message_sent,
           COALESCE((i.breakdown->>'paid_total')::numeric, 0)     AS paid_total,
           COALESCE((i.breakdown->>'rake_generated')::numeric, 0) AS rake_generated,
           COALESCE((i.breakdown->>'rakeback_due')::numeric, 0)   AS rakeback_due,
           COALESCE((i.breakdown->>'union_fee_kept')::numeric, 0) AS union_fee_kept,
           COALESCE((i.breakdown->>'players_won')::numeric, 0)    AS players_won,
           COALESCE((i.breakdown->>'eco_amount')::numeric, 0)     AS eco_amount,
           COALESCE((i.breakdown->>'presettled')::numeric, 0)     AS presettled,
           CASE WHEN i.id IS NOT NULL THEN COALESCE(i.breakdown->'eco_version','1'::jsonb) END AS eco_version,
           CASE WHEN i.breakdown->'eco_version'='2'::jsonb THEN i.breakdown->'eco_components' END AS eco_components,
           COALESCE(i.recorded_eco_complete,false) AS eco_components_complete,
           CASE WHEN i.recorded_eco_complete THEN i.recorded_cash_eco_amount END AS cash_eco_amount,
           CASE WHEN i.recorded_eco_complete THEN i.recorded_tournament_eco_amount END AS tournament_eco_amount
      FROM clubs_in_union cu
      LEFT JOIN period_invoices i ON i.club_id = cu.club_id
  ),
  history AS (
    SELECT (s.breakdown->>'period_end')::date AS period_end,
           MIN((s.breakdown->>'period_start')::date) AS period_start,
           MIN(CASE WHEN pg_input_is_valid(s.breakdown->>'period_start', 'timestamptz')
                    THEN (s.breakdown->>'period_start')::timestamptz END) AS period_start_at,
           MAX(CASE WHEN pg_input_is_valid(s.breakdown->>'period_end', 'timestamptz')
                    THEN (s.breakdown->>'period_end')::timestamptz END) AS period_end_at,
           count(*)                                  AS clubs,
           round(SUM(s.net_amount), 2)               AS total_amount,
           round(SUM(COALESCE((s.breakdown->>'rake_generated')::numeric, 0)), 2) AS rake_generated,
           round(SUM(COALESCE((s.breakdown->>'eco_amount')::numeric, 0)), 2)     AS eco_amount,
           bool_and(s.recorded_eco_complete) AS eco_components_complete,
           CASE WHEN bool_and(s.recorded_eco_complete) THEN round(SUM(s.recorded_cash_eco_amount),2) END AS cash_eco_amount,
           CASE WHEN bool_and(s.recorded_eco_complete) THEN round(SUM(s.recorded_tournament_eco_amount),2) END AS tournament_eco_amount,
           count(*) FILTER (WHERE s.status = 'paid')                             AS paid,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM accounting_invoice_deliveries d WHERE d.invoice_id = s.id)) AS delivered
      FROM invoice_eco s
     WHERE s.invoice_type = 'union_weekly_squareup'
       AND s.breakdown->>'union_id' = p_union_id::text
       AND s.breakdown ? 'period_end'
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT v_hist
  )
  SELECT jsonb_build_object(
    'union_id', p_union_id,
    'union_name', (SELECT u.name FROM unions u WHERE u.id = p_union_id),
    'period_end', v_end,
    'period_start', (SELECT MIN((i.breakdown->>'period_start')::date) FROM period_invoices i),
    'period_start_at', (SELECT MIN(b.period_start_at) FROM board b),
    'period_end_at', (SELECT MAX(b.period_end_at) FROM board b),
    'totals', (SELECT jsonb_build_object(
                 'clubs',      count(*),
                 'issued',     count(*) FILTER (WHERE b.status <> 'missing'),
                 'missing',    count(*) FILTER (WHERE b.status = 'missing'),
                 'delivered',  count(*) FILTER (WHERE b.message_sent),
                 'paid',       count(*) FILTER (WHERE b.status = 'paid'),
                 'clubs_owe',  round(COALESCE(SUM(b.amount) FILTER (WHERE b.amount > 0), 0), 2),
                 'union_owes', round(COALESCE(SUM(-b.amount) FILTER (WHERE b.amount < 0), 0), 2),
                 'net',        round(COALESCE(SUM(b.amount), 0), 2),
                 'payment_details_available', coalesce(bool_and(b.payment_details_available),true), 'collected', CASE WHEN coalesce(bool_and(b.payment_details_available),true) THEN round(COALESCE(SUM(b.paid_total), 0), 2) END,
                 -- what is still out: the unpaid remainder, not the headline
                 'outstanding', CASE WHEN coalesce(bool_and(b.payment_details_available),true) THEN round(COALESCE(SUM(
                     GREATEST(COALESCE(b.remaining_after_credits, abs(b.amount)) - b.paid_total, 0))
                     FILTER (WHERE b.status NOT IN ('missing','cancelled')), 0), 2) END,
                 'rake_generated', round(COALESCE(SUM(b.rake_generated), 0), 2),
                 'eco_amount',     round(COALESCE(SUM(b.eco_amount), 0), 2),
                 'eco_components_complete',count(*)>0 AND bool_and(b.eco_components_complete),
                 'cash_eco_amount',CASE WHEN count(*)>0 AND bool_and(b.eco_components_complete) THEN round(SUM(b.cash_eco_amount),2) END,
                 'tournament_eco_amount',CASE WHEN count(*)>0 AND bool_and(b.eco_components_complete) THEN round(SUM(b.tournament_eco_amount),2) END)
                 FROM board b),
    'clubs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'club_id', b.club_id, 'club_name', b.club_name,
               'club_code', b.club_code, 'club_slug', b.club_slug,
               'invoice_id', b.invoice_id, 'status', b.status, 'snapshot_complete', b.snapshot_complete,
               'issued_at', b.issued_at, 'due_at', b.due_at,
               'amount', round(b.amount, 2), 'direction', b.direction,
               'message_sent', b.message_sent,
               'payment_details_available', b.payment_details_available, 'paid_total', CASE WHEN b.payment_details_available THEN round(b.paid_total, 2) END,
               'outstanding', CASE WHEN b.payment_details_available THEN round(GREATEST(COALESCE(b.remaining_after_credits, abs(b.amount)) - b.paid_total, 0), 2) END,
               -- overdue is derived, never stored: a stored flag needs a job to
               -- maintain it, and a job that does not run leaves the row lying
               'overdue', (b.status NOT IN ('paid','missing','cancelled')
                           AND b.due_at IS NOT NULL AND b.due_at < now()),
               'rake_generated', round(b.rake_generated, 2),
               'rakeback_due', round(b.rakeback_due, 2),
               'union_fee_kept', round(b.union_fee_kept, 2),
               'players_won', round(b.players_won, 2),
               'weekly_player_results',b.weekly_player_results,
               'invoice_number', b.invoice_number,
               'period_start_at', b.period_start_at, 'period_end_at', b.period_end_at,
               'payer_type', b.payer_type, 'payer_name', b.payer_name,
               'payee_type', b.payee_type, 'payee_name', b.payee_name,
               'union_house', b.union_house,
               'settled_in_chips', round(b.settled_in_chips, 2),
               'player_pnl_net', round(b.player_pnl_net, 2),
               'stored_outstanding', round(b.stored_outstanding, 2),
               'credit_notes', b.credit_notes,
               'remaining_after_credits', round(b.remaining_after_credits, 2),
               'eco_amount', round(b.eco_amount, 2),
               'eco_version',b.eco_version,'eco_components',b.eco_components,
               'eco_components_complete',b.eco_components_complete,
               'presettled', round(b.presettled, 2))
             ORDER BY (b.status = 'missing') DESC, b.amount DESC)
        FROM board b), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'period_start', h.period_start, 'period_end', h.period_end,
               'period_start_at', h.period_start_at, 'period_end_at', h.period_end_at,
               'clubs', h.clubs, 'total_amount', h.total_amount,
               'rake_generated', h.rake_generated, 'eco_amount', h.eco_amount,
               'eco_components_complete',h.eco_components_complete,
               'cash_eco_amount',h.cash_eco_amount,'tournament_eco_amount',h.tournament_eco_amount,
               'paid', h.paid, 'delivered', h.delivered)
             ORDER BY h.period_end DESC)
        FROM history h), '[]'::jsonb),
    'generated_at', now()
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION smarter_private.union_weekly_invoice_body(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.settlement_invoices%ROWTYPE;
  b jsonb;
  w jsonb;
  c jsonb;
  v_union uuid;
  v_union_name text;
  v_club_name text;
  v_house boolean;
  v_payer text;
  v_payee text;
  v_start timestamptz;
  v_end timestamptz;
  v_square boolean;
  v_body text;
  v_original text;
  v_credits text;
  v_credited numeric;
  v_remaining numeric;
  v_paid numeric;
BEGIN
  SELECT * INTO inv FROM public.settlement_invoices s WHERE s.id = p_invoice_id;
  IF NOT FOUND OR inv.invoice_type NOT IN ('union_weekly_squareup', 'union_weekly_credit_note') THEN
    RAISE EXCEPTION 'union_weekly_invoice_body_wrong_document' USING ERRCODE = '23514';
  END IF;
  b := COALESCE(inv.breakdown, '{}'::jsonb);
  v_union := CASE WHEN pg_input_is_valid(b->>'union_id', 'uuid') THEN (b->>'union_id')::uuid END;
  v_union_name := COALESCE((SELECT u.name FROM public.unions u WHERE u.id = v_union),
                           b->>'union_name', 'The Union');
  v_club_name := COALESCE((SELECT cl.name FROM public.clubs cl WHERE cl.id = inv.club_id),
                          b->>'club_name', 'The Club');
  v_house := inv.club_id IS NOT DISTINCT FROM v_union;
  v_start := CASE WHEN pg_input_is_valid(b->>'period_start', 'timestamptz')
                  THEN (b->>'period_start')::timestamptz END;
  v_end := CASE WHEN pg_input_is_valid(b->>'period_end', 'timestamptz')
                THEN (b->>'period_end')::timestamptz END;
  v_payer := CASE inv.from_entity_type
    WHEN 'union' THEN (SELECT u.name FROM public.unions u
                        WHERE u.id = CASE WHEN pg_input_is_valid(inv.from_entity_id, 'uuid') THEN inv.from_entity_id::uuid END)
    WHEN 'club' THEN (SELECT cl.name FROM public.clubs cl
                       WHERE cl.id = CASE WHEN pg_input_is_valid(inv.from_entity_id, 'uuid') THEN inv.from_entity_id::uuid END)
      || CASE WHEN v_house THEN ' (House Club)' ELSE '' END
  END;
  v_payee := CASE inv.to_entity_type
    WHEN 'union' THEN (SELECT u.name FROM public.unions u
                        WHERE u.id = CASE WHEN pg_input_is_valid(inv.to_entity_id, 'uuid') THEN inv.to_entity_id::uuid END)
    WHEN 'club' THEN (SELECT cl.name FROM public.clubs cl
                       WHERE cl.id = CASE WHEN pg_input_is_valid(inv.to_entity_id, 'uuid') THEN inv.to_entity_id::uuid END)
      || CASE WHEN v_house THEN ' (House Club)' ELSE '' END
  END;
  v_payer := COALESCE(v_payer, initcap(inv.from_entity_type));
  v_payee := COALESCE(v_payee, initcap(inv.to_entity_type));

  IF inv.invoice_type = 'union_weekly_credit_note' THEN
    SELECT o.invoice_number INTO v_original FROM public.settlement_invoices o
     WHERE o.id = CASE WHEN pg_input_is_valid(b->>'original_invoice_id', 'uuid')
                       THEN (b->>'original_invoice_id')::uuid END;
    RETURN v_union_name || ' Credit Note ' || COALESCE(inv.invoice_number, '')
      || E'\nAgainst Invoice: ' || COALESCE(v_original, b->>'credit_note_for', 'Unavailable')
      || E'\nWeek: ' || smarter_private.union_statement_week(v_start, v_end)
      || E'\nThe Week Includes Its Start And Excludes Its End.'
      || E'\nIssued By: ' || v_union_name
      || E'\nIssued To: ' || v_club_name
      || CASE WHEN v_house THEN ' (The Union''s Own House Club)' ELSE '' END
      || E'\nCredit: ' || v_payer || ' Credits ' || v_payee || ' '
      || smarter_private.union_statement_figure(abs(inv.net_amount)) || ' Chips'
      || E'\nA Credit Note Reduces The Original Invoice. No Chips Move.'
      || E'\nStatus: ' || initcap(inv.status)
      || CASE WHEN b ? 'reason' THEN E'\nReason: ' || (b->>'reason') ELSE '' END;
  END IF;

  -- A square-up later reduced by credit notes owes only what is left
  -- (fn_union_invoice_outstanding's rule): it never reads as the full amount.
  SELECT string_agg(cn.invoice_number || ' (' || smarter_private.union_statement_figure(cn.net_amount) || ')',
                    ', ' ORDER BY cn.created_at, cn.invoice_number),
         sum(cn.net_amount)
    INTO v_credits, v_credited
    FROM public.settlement_invoices cn
   WHERE cn.adjusts_invoice_id = inv.id AND cn.invoice_type = 'union_weekly_credit_note';
  v_remaining := round(abs(inv.net_amount) - COALESCE(v_credited, 0), 2);
  v_square := COALESCE(round(inv.net_amount, 2) = 0, false) OR COALESCE(b->>'direction', '') = 'square';
  v_body := v_union_name
      || CASE WHEN v_house THEN ' House Club Statement ' ELSE ' Weekly Statement ' END
      || COALESCE(inv.invoice_number, '')
    || E'\nWeek: ' || smarter_private.union_statement_week(v_start, v_end)
    || E'\nThe Week Includes Its Start And Excludes Its End.'
    || E'\nIssued By: ' || v_union_name
    || E'\nIssued To: ' || v_club_name
    || CASE WHEN v_house THEN ' (The Union''s Own House Club)' ELSE '' END
    || E'\nAmount Due: '
    || CASE WHEN v_square THEN 'Square, Nothing Due'
            WHEN v_credits IS NOT NULL AND v_remaining <= 0
              THEN 'Credited In Full, Nothing Due'
            WHEN v_credits IS NOT NULL
              THEN v_payer || ' Pays ' || v_payee || ' '
                || smarter_private.union_statement_figure(v_remaining) || ' Chips After Credit'
            ELSE v_payer || ' Pays ' || v_payee || ' '
              || smarter_private.union_statement_figure(abs(inv.net_amount)) || ' Chips' END
    || CASE WHEN v_credits IS NOT NULL
            THEN E'\nOriginal Amount: ' || smarter_private.union_statement_figure(abs(inv.net_amount))
              || E'\nCredited By: ' || v_credits
            ELSE '' END
    || E'\nStatus: ' || initcap(inv.status)
    || CASE WHEN inv.due_at IS NOT NULL AND NOT v_square AND v_remaining > 0
            THEN E'\nDue: ' || smarter_private.union_statement_instant(inv.due_at) || ' Chicago Time'
            ELSE '' END
    || E'\n'
    || E'\nRake Generated: ' || smarter_private.union_statement_amount(b->'rake_generated')
    || E'\nUnion Fee Kept: ' || smarter_private.union_statement_amount(b->'union_fee_kept')
    || E'\nRakeback Paid To The Club: ' || smarter_private.union_statement_amount(b->'rakeback_due')
    || E'\nPlayer Win/Loss, Fees Paid Included (Negative Means Players Lost): '
      || smarter_private.union_statement_amount(b->'players_won')
    || CASE WHEN b ? 'player_pnl_net'
            THEN E'\nPlayer Result Excluding Fees: '
              || smarter_private.union_statement_amount(b->'player_pnl_net')
              || E'\nThe Two Player Figures Differ By Exactly The Rake Generated; Neither Is An Amount Due.'
            ELSE '' END;

  w := b->'weekly_player_results';
  IF jsonb_typeof(w) = 'object' THEN
    v_body := v_body
      || E'\nThe Net Loss, ECO Charge And Full Weekly Net Lines Below Are Counted From The Club''s Side: '
      || 'Positive Means Players Lost Or The Club Pays. Less Club Rakeback Credit Is The Rakeback '
      || 'The Union Paid The Club, Subtracted In The Full Weekly Net.'
      || E'\nCash Player Net Loss: ' || smarter_private.union_statement_amount(w->'cash_net_loss')
      || E'\nTournament Player Net Loss: ' || smarter_private.union_statement_amount(w->'tournament_net_loss')
      || E'\nTotal Player Net Loss: ' || smarter_private.union_statement_amount(w->'total_net_loss')
      || E'\nLess Club Rakeback Credit: ' || smarter_private.union_statement_amount(w->'rakeback_credit')
      || E'\nECO Charge Or Credit (Positive Means The Club Pays): ' || smarter_private.union_statement_amount(w->'eco_charge')
      || E'\nFull Weekly Net (Positive Club Owes Union): '
        || smarter_private.union_statement_amount(w->'weekly_net_due_to_union')
      || E'\nThe Full Weekly Net Is Counted From The Club''s Side And Includes The Fees Players Paid. '
      || 'It Is A Summary, Not An Additional Payment Request.';
  ELSE
    v_body := v_body || E'\nCash And Tournament Player Split: Not Recorded On This Invoice';
  END IF;

  IF b->'eco_version' = '2'::jsonb AND jsonb_typeof(b->'eco_components') = 'array' THEN
    FOR c IN SELECT e.value FROM jsonb_array_elements(b->'eco_components') e
              ORDER BY CASE e.value->>'activity' WHEN 'cash' THEN 0 ELSE 1 END LOOP
      v_body := v_body || E'\n' || initcap(COALESCE(c->>'activity', 'Other')) || ' ECO: '
        || smarter_private.union_statement_amount(c->'amount')
        || ' (Base ' || smarter_private.union_statement_amount(c->'base')
        || ' At ' || CASE WHEN jsonb_typeof(c->'rate') = 'number'
                          THEN trim_scale((c->>'rate')::numeric * 100)::text || '%)'
                          ELSE 'Unavailable Rate)' END;
    END LOOP;
  END IF;

  v_body := v_body
    || E'\nCombined ECO (Negative Means The Club Pays): '
      || smarter_private.union_statement_amount(b->'eco_amount')
    || E'\nRecorded Presettlements: ' || smarter_private.union_statement_amount(b->'presettled')
    || CASE WHEN b ? 'settled_in_chips' THEN
         E'\nSettled In Chips: ' || smarter_private.union_statement_amount(b->'settled_in_chips')
         || CASE WHEN jsonb_typeof(b->'rakeback_due') = 'number' AND (b->>'rakeback_due')::numeric <> 0
                 THEN E'\n  Rakeback Paid By ' || v_union_name || ' To ' || v_club_name
                   || ' With The Monday Rakeback: '
                   || smarter_private.union_statement_amount(b->'rakeback_due')
                   || ' (The Only Union To Club Transfer In It)'
                 ELSE E'\n  No Rakeback Was Paid To The Club For This Week' END
         || CASE WHEN b ? 'player_pnl_net' THEN
              E'\n  Player Result Excluding Fees: '
              || smarter_private.union_statement_amount(b->'player_pnl_net')
              || ' (Already Settled At The Tables During The Week: Pots, Bad Beat Jackpot Drops And Awards, '
              || 'Tournament Entries And Prizes; Not A Union Or Club Transfer)'
            ELSE '' END
         || E'\nSettled In Chips Has Already Moved And Is Not Billed Again.'
       ELSE '' END
    || CASE WHEN b ? 'outstanding' THEN
         E'\nAmount Due Is What Remains: Combined ECO '
           || smarter_private.union_statement_amount(b->'eco_amount')
           || ' Plus Recorded Presettlements '
           || smarter_private.union_statement_amount(b->'presettled')
           || ' Equals ' || smarter_private.union_statement_amount(b->'outstanding')
           || ' (Negative: The Club Pays The Union; Positive: The Union Pays The Club)'
           || CASE WHEN v_credits IS NOT NULL
                   THEN E'\nLess Credit Notes ' || smarter_private.union_statement_figure(COALESCE(v_credited, 0))
                     || ' Leaves ' || smarter_private.union_statement_figure(greatest(v_remaining, 0)) || ' Due'
                   ELSE '' END
       ELSE '' END;
  v_paid := CASE WHEN jsonb_typeof(b->'paid_total') = 'number' THEN (b->>'paid_total')::numeric ELSE 0 END;
  v_body := v_body
    || CASE WHEN v_paid > 0 THEN E'\nPaid So Far: ' || smarter_private.union_statement_figure(v_paid) ELSE '' END
    || E'\nRemaining Unpaid Balance: '
    || smarter_private.union_statement_figure(CASE WHEN v_square THEN 0 ELSE greatest(v_remaining - v_paid, 0) END);
  RETURN v_body;
END
$function$;
COMMIT;
*/
