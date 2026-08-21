-- ca_union_statement_board: the live definition.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'union_statement_board_club_code_column' (version 20260821033115).
-- Supersedes the body first applied in 20260821033012, which referenced
-- clubs.club_code. That column does not exist; the columns are clubs.code and
-- clubs.slug. Both are carried, because the club page routes on either.
--
-- The board is built around the CLUB LIST, not the invoice list. Every club in
-- the union appears for the period, and a club with no invoice appears with
-- status 'missing' rather than silently not appearing - being missed is the
-- finding, not a gap.
--
-- Verified against production as the union owner: 2 clubs, 228,146.79 owed,
-- 2 delivered, 0 missing, history back to 2026-08-10. Refused with 42501 for
-- an ordinary club member.
CREATE OR REPLACE FUNCTION public.ca_union_statement_board(
  p_union_id uuid,
  p_period_end date DEFAULT NULL,
  p_history integer DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    JOIN union_clubs uc ON uc.club_id = s.club_id AND uc.union_id = p_union_id
   WHERE s.invoice_type = 'union_weekly_squareup';

  WITH clubs_in_union AS (
    SELECT uc.club_id, c.name AS club_name, c.code AS club_code, c.slug AS club_slug
      FROM union_clubs uc
      JOIN clubs c ON c.id = uc.club_id
     WHERE uc.union_id = p_union_id
  ),
  period_invoices AS (
    SELECT DISTINCT ON (s.club_id) s.*
      FROM settlement_invoices s
      JOIN clubs_in_union cu ON cu.club_id = s.club_id
     WHERE s.invoice_type = 'union_weekly_squareup'
       AND (v_end IS NULL OR (s.breakdown->>'period_end')::date = v_end)
     ORDER BY s.club_id, s.created_at DESC
  ),
  board AS (
    SELECT cu.club_id, cu.club_name, cu.club_code, cu.club_slug,
           i.id                            AS invoice_id,
           -- a club with no statement for the period is the finding, not a gap
           COALESCE(i.status, 'missing')   AS status,
           i.created_at                    AS issued_at,
           i.due_at,
           COALESCE(i.net_amount, 0)       AS amount,
           i.breakdown->>'direction'       AS direction,
           COALESCE(i.message_sent, false) AS message_sent,
           COALESCE((i.breakdown->>'rake_generated')::numeric, 0) AS rake_generated,
           COALESCE((i.breakdown->>'rakeback_due')::numeric, 0)   AS rakeback_due,
           COALESCE((i.breakdown->>'union_fee_kept')::numeric, 0) AS union_fee_kept,
           COALESCE((i.breakdown->>'players_won')::numeric, 0)    AS players_won,
           COALESCE((i.breakdown->>'eco_amount')::numeric, 0)     AS eco_amount,
           COALESCE((i.breakdown->>'presettled')::numeric, 0)     AS presettled
      FROM clubs_in_union cu
      LEFT JOIN period_invoices i ON i.club_id = cu.club_id
  ),
  history AS (
    SELECT (s.breakdown->>'period_end')::date AS period_end,
           MIN((s.breakdown->>'period_start')::date) AS period_start,
           count(*)                                  AS clubs,
           round(SUM(s.net_amount), 2)               AS total_amount,
           round(SUM(COALESCE((s.breakdown->>'rake_generated')::numeric, 0)), 2) AS rake_generated,
           round(SUM(COALESCE((s.breakdown->>'eco_amount')::numeric, 0)), 2)     AS eco_amount,
           count(*) FILTER (WHERE s.status = 'paid')                             AS paid,
           count(*) FILTER (WHERE COALESCE(s.message_sent, false))               AS delivered
      FROM settlement_invoices s
      JOIN clubs_in_union cu ON cu.club_id = s.club_id
     WHERE s.invoice_type = 'union_weekly_squareup'
       AND s.breakdown ? 'period_end'
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT v_hist
  )
  SELECT jsonb_build_object(
    'union_id', p_union_id,
    'union_name', (SELECT u.name FROM unions u WHERE u.id = p_union_id),
    'period_end', v_end,
    'period_start', (SELECT MIN(h.period_start) FROM history h WHERE h.period_end = v_end),
    'totals', (SELECT jsonb_build_object(
                 'clubs',      count(*),
                 'issued',     count(*) FILTER (WHERE b.status <> 'missing'),
                 'missing',    count(*) FILTER (WHERE b.status = 'missing'),
                 'delivered',  count(*) FILTER (WHERE b.message_sent),
                 'paid',       count(*) FILTER (WHERE b.status = 'paid'),
                 -- owed-to and owed-by kept apart: a net of zero across both is
                 -- not the same as nothing being owed
                 'clubs_owe',  round(COALESCE(SUM(b.amount) FILTER (WHERE b.amount > 0), 0), 2),
                 'union_owes', round(COALESCE(SUM(-b.amount) FILTER (WHERE b.amount < 0), 0), 2),
                 'net',        round(COALESCE(SUM(b.amount), 0), 2),
                 'rake_generated', round(COALESCE(SUM(b.rake_generated), 0), 2),
                 'eco_amount',     round(COALESCE(SUM(b.eco_amount), 0), 2))
                 FROM board b),
    'clubs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'club_id', b.club_id, 'club_name', b.club_name,
               'club_code', b.club_code, 'club_slug', b.club_slug,
               'invoice_id', b.invoice_id, 'status', b.status,
               'issued_at', b.issued_at, 'due_at', b.due_at,
               'amount', round(b.amount, 2), 'direction', b.direction,
               'message_sent', b.message_sent,
               'overdue', (b.status NOT IN ('paid','missing')
                           AND b.due_at IS NOT NULL AND b.due_at < now()),
               'rake_generated', round(b.rake_generated, 2),
               'rakeback_due', round(b.rakeback_due, 2),
               'union_fee_kept', round(b.union_fee_kept, 2),
               'players_won', round(b.players_won, 2),
               'eco_amount', round(b.eco_amount, 2),
               'presettled', round(b.presettled, 2))
             ORDER BY (b.status = 'missing') DESC, b.amount DESC)
        FROM board b), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'period_start', h.period_start, 'period_end', h.period_end,
               'clubs', h.clubs, 'total_amount', h.total_amount,
               'rake_generated', h.rake_generated, 'eco_amount', h.eco_amount,
               'paid', h.paid, 'delivered', h.delivered)
             ORDER BY h.period_end DESC)
        FROM history h), '[]'::jsonb),
    'generated_at', now()
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_union_statement_board(uuid, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_union_statement_board(uuid, date, integer) TO authenticated;
