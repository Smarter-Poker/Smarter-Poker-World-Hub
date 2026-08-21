-- THE SETTLEMENT LIFECYCLE HAD NO END.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'union_statements_can_be_settled' (version 20260821034457).
--
-- Statements have been issued since 2026-08-20 and every one of them still
-- read status='generated'. Nothing in the codebase could ever set 'paid': not
-- the cascade, not the API route, not any UI. due_at came and went. The union
-- board made this impossible to ignore, because it renders "overdue" pills and
-- "0 paid" with no way to resolve either.
--
-- THIS RECORDS RECEIPT. IT MOVES NO CHIPS. Dan, 2026-08-20: "eco doesn't move
-- chips, its an adjust on the end of week invoice." The same is true of the
-- statement as a whole. chip_transfer_id, chips_transferred and transferred_at
-- are deliberately untouched, so a statement marked paid can never be mistaken
-- for a chip movement that happened.
--
-- PARTIAL PAYMENTS ARE REAL and are not forced into a shape that lies about
-- them. settlement_invoices.status is constrained to
-- (pending, generated, paid, cancelled, overdue) - there is no 'partial' - so
-- a part payment leaves status alone and accumulates breakdown.paid_total.
-- Inventing a status value would have meant a schema change to express
-- something the breakdown already holds.
--
-- OVERDUE IS NOT STORED. It is due_at < now() on an unpaid statement, which is
-- derivable at read time and always correct. A stored flag needs a job to
-- maintain it, and a job that does not run leaves a statement lying about its
-- own state.
--
-- Verified on production under the union owner's own JWT and rolled back:
-- part payment 3,000 leaves status generated; settling the rest flips to paid
-- at 7,531.11; a repeat returns already_settled instead of double counting;
-- the board then reads paid 1, collected 7,531.11, outstanding 220,615.68,
-- exactly the other club's balance; reopening returns it to generated with the
-- payment history intact. An ordinary club member is refused with 42501.

CREATE OR REPLACE FUNCTION public.ca_union_set_statement_paid(
  p_invoice_id uuid,
  p_paid       boolean DEFAULT true,
  p_amount     numeric DEFAULT NULL,
  p_note       text    DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_inv      settlement_invoices%ROWTYPE;
  v_union    uuid;
  v_owed     numeric;
  v_prev     numeric;
  v_add      numeric;
  v_total    numeric;
  v_status   text;
  v_payments jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  -- lock the row: two union admins clicking at once must not both read the
  -- same paid_total and each add their payment to it
  SELECT * INTO v_inv FROM settlement_invoices
   WHERE id = p_invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.invoice_type <> 'union_weekly_squareup' THEN
    RAISE EXCEPTION 'not a weekly square-up statement' USING ERRCODE = '22023';
  END IF;

  SELECT uc.union_id INTO v_union FROM union_clubs uc WHERE uc.club_id = v_inv.club_id LIMIT 1;
  IF v_union IS NULL OR NOT ca_can_oversee_union(v_union) THEN
    RAISE EXCEPTION 'not authorized for this union' USING ERRCODE = '42501';
  END IF;

  IF v_inv.status = 'cancelled' THEN
    RAISE EXCEPTION 'this statement was cancelled' USING ERRCODE = '22023';
  END IF;

  -- the amount owed is an absolute: a statement where the union owes the club
  -- is settled by the same act of paying it, in the other direction
  v_owed     := abs(COALESCE(v_inv.net_amount, 0));
  v_prev     := COALESCE((v_inv.breakdown->>'paid_total')::numeric, 0);
  v_payments := COALESCE(v_inv.breakdown->'payments', '[]'::jsonb);

  IF p_paid THEN
    -- no amount given means "settled in full", the common case, which should
    -- not require the caller to restate a number the row already holds
    v_add   := COALESCE(p_amount, GREATEST(v_owed - v_prev, 0));
    IF v_add <= 0 AND v_prev >= v_owed THEN
      RETURN jsonb_build_object(
        'success', true, 'already_settled', true,
        'invoice_id', p_invoice_id, 'status', v_inv.status,
        'paid_total', v_prev, 'owed', v_owed);
    END IF;
    v_total := round(v_prev + GREATEST(v_add, 0), 2);
    -- a hundredth of a chip short is paid; exact equality on numeric money
    -- would leave statements permanently one rounding step from settled
    v_status := CASE WHEN v_total >= v_owed - 0.01 THEN 'paid' ELSE v_inv.status END;
    v_payments := v_payments || jsonb_build_object(
      'amount', round(GREATEST(v_add, 0), 2),
      'at', now(),
      'by', v_uid,
      'note', NULLIF(btrim(COALESCE(p_note, '')), ''));
  ELSE
    -- reopening: mistakes get made, and a statement that can only ever move
    -- one way turns a misclick into a permanent falsehood in the record. The
    -- payment history is kept, with the reversal appended to it.
    v_total  := 0;
    v_status := 'generated';
    v_payments := v_payments || jsonb_build_object(
      'amount', 0, 'reversal', true, 'at', now(), 'by', v_uid,
      'note', NULLIF(btrim(COALESCE(p_note, '')), ''));
  END IF;

  UPDATE settlement_invoices
     SET status     = v_status,
         updated_at = now(),
         breakdown  = COALESCE(breakdown, '{}'::jsonb) || jsonb_build_object(
           'paid_total', v_total,
           'paid_at',    CASE WHEN v_status = 'paid' THEN now() ELSE NULL END,
           'paid_by',    CASE WHEN v_status = 'paid' THEN v_uid  ELSE NULL END,
           'payments',   v_payments)
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'status', v_status,
    'paid_total', v_total,
    'owed', v_owed,
    'fully_settled', (v_status = 'paid'));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_union_set_statement_paid(uuid, boolean, numeric, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_union_set_statement_paid(uuid, boolean, numeric, text)
  TO authenticated;

-- The board carries paid_total, outstanding and collected, so a part payment
-- is visible as a part payment and the headline owed figure - which does not
-- change as money comes in - is no longer the only number on the screen.
-- Supersedes the definition in 20260821033115.
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
           COALESCE((i.breakdown->>'paid_total')::numeric, 0)     AS paid_total,
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
                 'collected',  round(COALESCE(SUM(b.paid_total), 0), 2),
                 -- what is still out: the unpaid remainder, not the headline
                 'outstanding', round(COALESCE(SUM(
                     GREATEST(abs(b.amount) - b.paid_total, 0))
                     FILTER (WHERE b.status NOT IN ('missing','cancelled')), 0), 2),
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
               'paid_total', round(b.paid_total, 2),
               'outstanding', round(GREATEST(abs(b.amount) - b.paid_total, 0), 2),
               -- overdue is derived, never stored: a stored flag needs a job to
               -- maintain it, and a job that does not run leaves the row lying
               'overdue', (b.status NOT IN ('paid','missing','cancelled')
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
