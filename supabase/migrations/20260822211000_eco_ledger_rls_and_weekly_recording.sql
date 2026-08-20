-- ECO wiring gaps found in the 2026-08-20 verification pass.
--
-- GAP 1 -- THE LEDGER WAS UNREADABLE AND OVER-GRANTED.
--   union_eco_ledger had RLS enabled with ZERO policies, so every SELECT by
--   anon or authenticated returned zero rows silently -- a union owner could
--   never see the ECO history the ledger exists to preserve. At the same time
--   the raw table grants were anon=arwdxtm and authenticated=arwdxtm, i.e. the
--   only thing standing between anon and INSERT/UPDATE/DELETE on a money
--   ledger was the absence of a permissive policy. Fixed both ways: grants
--   narrowed to SELECT for authenticated (none for anon), and the same
--   owner-or-union-admin read policy union_pnl_settlements already uses.
--
-- GAP 2 -- NOTHING EVER WROTE THE LEDGER.
--   fn_union_eco_record_current_week had no caller anywhere: not in pg_cron,
--   not in the Open Claw dispatcher, not in any API route, not in any other
--   Postgres function. The credit-risk sweep already had an invariant
--   (union_eco_not_recorded) whose entire purpose is to complain about this,
--   so once ECO were switched on it would have warned every week forever.
--   ECO recording is now a step of fn_union_settlement_cascade, which is the
--   weekly close that pg_cron runs (union-weekly-rakeback-close, Mondays
--   00:10 UTC). The cascade already resolves the CLOSED week
--   (date_trunc('week', now()) - 7 days .. date_trunc('week', now()); as of
--   this migration that is 2026-08-10 .. 2026-08-17), so the ledger row lands
--   on the week being settled -- not on the ten minutes of the new week that
--   fn_union_eco_record_current_week would have captured had it been wired to
--   the same schedule.
--
--   Recording is skipped unless the union has eco_enabled, so this is a no-op
--   until ECO is switched on. It is wrapped so a failure can never abort the
--   three money rounds, and its outcome is returned in the cascade's JSON
--   rather than swallowed.
--
-- NOT CHANGED, DELIBERATELY: nothing here charges ECO. It remains an invoice
-- adjustment surfaced by fn_union_club_invoice with no automatic chip
-- movement, exactly as designed. Wiring the ECO amount into a settlement that
-- moves chips is a money decision and is Dan's to make.
--
-- Applied to production via Supabase MCP as 'eco_ledger_rls_and_weekly_recording'.

-- ---------------------------------------------------------------------------
-- GAP 1
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.union_eco_ledger FROM anon;
REVOKE ALL ON TABLE public.union_eco_ledger FROM authenticated;
GRANT SELECT ON TABLE public.union_eco_ledger TO authenticated;

DROP POLICY IF EXISTS union_eco_ledger_admin_read ON public.union_eco_ledger;
CREATE POLICY union_eco_ledger_admin_read ON public.union_eco_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM unions u
             WHERE u.id = union_eco_ledger.union_id
               AND u.owner_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM union_admins a
                WHERE a.union_id = union_eco_ledger.union_id
                  AND a.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS union_eco_ledger_service ON public.union_eco_ledger;
CREATE POLICY union_eco_ledger_service ON public.union_eco_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- GAP 2
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_settlement_cascade(p_union_id uuid DEFAULT 'fade0000-0000-0000-0000-000000000001'::uuid, p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_period_start, date_trunc('week', now()) - interval '7 days');
  v_to   timestamptz := COALESCE(p_period_end,   date_trunc('week', now()));
  v_r1 jsonb; v_r2 jsonb; v_r3 jsonb; v_eco jsonb;
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

  RETURN jsonb_build_object('success', true, 'union_id', p_union_id,
    'period_start', v_from, 'period_end', v_to,
    'round1_union_to_clubs', v_r1, 'round2_club_to_agents', v_r2,
    'round3_agents_to_players', v_r3, 'eco_recorded', v_eco);
END $function$;

-- ---------------------------------------------------------------------------
-- POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n int; v_acl text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.union_eco_ledger'::regclass;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'expected 2 policies on union_eco_ledger, found %', v_n;
  END IF;

  SELECT relacl::text INTO v_acl FROM pg_class WHERE oid = 'public.union_eco_ledger'::regclass;
  IF v_acl LIKE '%anon=%' THEN
    RAISE EXCEPTION 'anon still holds grants on union_eco_ledger: %', v_acl;
  END IF;
  IF v_acl NOT LIKE '%authenticated=r/%' THEN
    RAISE EXCEPTION 'authenticated should hold SELECT only on union_eco_ledger: %', v_acl;
  END IF;

  IF position('fn_union_eco_record' in
       pg_get_functiondef('public.fn_union_settlement_cascade(uuid,timestamptz,timestamptz)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'weekly cascade does not record ECO';
  END IF;

  RAISE NOTICE 'ECO wiring assertions passed';
END $$;
