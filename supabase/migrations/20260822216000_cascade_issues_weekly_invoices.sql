-- ROUND 4 of the weekly close: issue the square-up invoice.
--
-- The three money rounds already run every Monday 00:10 UTC via the pg_cron
-- job union-weekly-rakeback-close. ECO recording was added to the same
-- function in 20260822211000. This adds the last step the cycle was missing:
-- the statement that tells each club what it owes, persisted to
-- settlement_invoices and delivered to the club's owner and admins through
-- notifications (which the existing trigger mirrors to push).
--
-- Ordering matters: ECO is recorded to the ledger first, then the invoice is
-- issued from fn_union_club_invoice, so the ledger row and the billed figure
-- come from the same computation of the same closed week.
--
-- Both steps are wrapped: neither can abort the money rounds above them, and
-- both report their outcome in the returned JSON instead of failing silently.
--
-- Applied to production via Supabase MCP as 'cascade_issues_weekly_invoices'.
CREATE OR REPLACE FUNCTION public.fn_union_settlement_cascade(p_union_id uuid DEFAULT 'fade0000-0000-0000-0000-000000000001'::uuid, p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_period_start, date_trunc('week', now()) - interval '7 days');
  v_to   timestamptz := COALESCE(p_period_end,   date_trunc('week', now()));
  v_r1 jsonb; v_r2 jsonb; v_r3 jsonb; v_eco jsonb; v_inv jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.fn_is_union_overseer(p_union_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  -- ROUND 1 — union rake treasury pays the clubs their 90%.
  v_r1 := public.fn_union_weekly_rakeback_close(p_union_id, v_from, v_to);
  INSERT INTO union_settlement_rounds (union_id, period_start, period_end, round_no, round_name,
                                       payers, payees, amount, detail)
  VALUES (p_union_id, v_from, v_to, 1, 'union_to_clubs', 1,
          COALESCE((v_r1->>'clubs_paid')::int,0),
          COALESCE((v_r1->>'total_rakeback')::numeric,0), v_r1)
  ON CONFLICT (union_id, period_start, period_end, round_no) DO NOTHING;

  -- ROUND 2 — clubs pay their super agents and agents.
  v_r2 := public.fn_settle_round2_club_to_agents(p_union_id, v_from, v_to);
  INSERT INTO union_settlement_rounds (union_id, period_start, period_end, round_no, round_name,
                                       payees, amount, shortfalls, detail)
  VALUES (p_union_id, v_from, v_to, 2, 'club_to_agents',
          COALESCE((v_r2->>'payees')::int,0), COALESCE((v_r2->>'amount')::numeric,0),
          COALESCE((v_r2->>'shortfalls')::int,0), v_r2)
  ON CONFLICT (union_id, period_start, period_end, round_no) DO NOTHING;

  -- ROUND 3 — agents pay their players.
  v_r3 := public.fn_settle_round3_agents_to_players(p_union_id, v_from, v_to);
  INSERT INTO union_settlement_rounds (union_id, period_start, period_end, round_no, round_name,
                                       payees, amount, shortfalls, detail)
  VALUES (p_union_id, v_from, v_to, 3, 'agents_to_players',
          COALESCE((v_r3->>'payees')::int,0), COALESCE((v_r3->>'amount')::numeric,0),
          COALESCE((v_r3->>'shortfalls')::int,0), v_r3)
  ON CONFLICT (union_id, period_start, period_end, round_no) DO NOTHING;

  -- ECO — record the win tax / loss rebate for the week just closed, so the
  -- invoice can be reproduced later exactly as it was issued. Ledger write
  -- only: no chips move on ECO. Never allowed to abort the rounds above.
  IF public.fn_union_eco_enabled(p_union_id) THEN
    BEGIN
      v_eco := public.fn_union_eco_record(p_union_id, v_from, v_to, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_eco := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  ELSE
    v_eco := jsonb_build_object('skipped', true, 'reason', 'eco_disabled');
  END IF;

  -- ROUND 4 — issue the weekly square-up statement to every member club and
  -- notify its owner and admins. Idempotent; safe to re-run.
  BEGIN
    v_inv := public.fn_union_issue_weekly_invoices(p_union_id, v_from, v_to, true);
  EXCEPTION WHEN OTHERS THEN
    v_inv := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  INSERT INTO union_settlement_rounds (union_id, period_start, period_end, round_no, round_name,
                                       payees, amount, detail)
  VALUES (p_union_id, v_from, v_to, 4, 'union_invoices_issued',
          COALESCE((v_inv->>'invoices')::int, 0),
          0, v_inv)
  ON CONFLICT (union_id, period_start, period_end, round_no) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'union_id', p_union_id,
    'period_start', v_from, 'period_end', v_to,
    'round1_union_to_clubs', v_r1, 'round2_club_to_agents', v_r2,
    'round3_agents_to_players', v_r3, 'eco_recorded', v_eco,
    'round4_invoices', v_inv);
END $function$;

DO $$
BEGIN
  IF position('fn_union_issue_weekly_invoices' in
       pg_get_functiondef('public.fn_union_settlement_cascade(uuid,timestamptz,timestamptz)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'cascade does not issue invoices';
  END IF;
  RAISE NOTICE 'round 4 wired';
END $$;
