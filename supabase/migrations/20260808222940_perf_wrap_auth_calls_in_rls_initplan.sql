-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808222940_perf_wrap_auth_calls_in_rls_initplan.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
BEGIN;

ALTER POLICY "csi_select_own" ON public.club_shop_inventory USING (((( SELECT auth.uid() ) = user_id) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_shop_inventory.club_id) AND (c.owner_id = ( SELECT auth.uid() )))))));
ALTER POLICY "cet_select_own" ON public.commander_escrow_transactions USING ((( SELECT auth.uid() ) = player_id));
ALTER POLICY "diamond_platform_budget_service" ON public.diamond_platform_budget USING ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "diamond_reward_claims_select_own" ON public.diamond_reward_claims USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "diamond_transactions_select_own" ON public.diamond_transactions USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "Service role manages endless high scores" ON public.endless_high_scores USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Users can insert own endless high score" ON public.endless_high_scores WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "Users can update own endless high score" ON public.endless_high_scores USING ((( SELECT auth.uid() ) = user_id)) WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "leak_review_state_delete_own" ON public.leak_review_state USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "leak_review_state_insert_own" ON public.leak_review_state WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "leak_review_state_select_own" ON public.leak_review_state USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "leak_review_state_update_own" ON public.leak_review_state USING ((( SELECT auth.uid() ) = user_id)) WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "merchandise_orders_own_read" ON public.merchandise_orders USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "pbcal_own" ON public.pb_calibration_profiles USING ((( SELECT auth.uid() ) = user_id)) WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "profiles_update" ON public.profiles USING ((( SELECT auth.uid() ) = id)) WITH CHECK ((( SELECT auth.uid() ) = id));
ALTER POLICY "Service role manages survival progress" ON public.survival_progress USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Users can insert own survival progress" ON public.survival_progress WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "Users can update own survival progress" ON public.survival_progress USING ((( SELECT auth.uid() ) = user_id)) WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "table_waitlists_insert_own" ON public.table_waitlists WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "table_waitlists_update_own" ON public.table_waitlists USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "tsr_own" ON public.training_spaced_repetition USING ((( SELECT auth.uid() ) = user_id)) WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "Service role manages limits" ON public.trivia_diamond_award_limits USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Service role manages spins" ON public.trivia_prize_wheel_spins USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Users can view own spins" ON public.trivia_prize_wheel_spins USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "Participants can view their matches" ON public.trivia_pvp_matches USING ((((((( SELECT auth.uid() ) = player1_id) OR (( SELECT auth.uid() ) = player2_id)) OR (( SELECT auth.uid() ) = challenger_id)) OR (( SELECT auth.uid() ) = opponent_id)) OR (( SELECT auth.role() ) = 'service_role'::text)));
ALTER POLICY "Service role manages pvp matches" ON public.trivia_pvp_matches USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Users can delete own queue entry" ON public.trivia_pvp_queue USING (((( SELECT auth.uid() ) = user_id) OR (( SELECT auth.role() ) = 'service_role'::text)));
ALTER POLICY "Users can insert own queue entry" ON public.trivia_pvp_queue WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "Users can update own queue entry" ON public.trivia_pvp_queue USING (((( SELECT auth.uid() ) = user_id) OR (( SELECT auth.role() ) = 'service_role'::text))) WITH CHECK (((( SELECT auth.uid() ) = user_id) OR (( SELECT auth.role() ) = 'service_role'::text)));
ALTER POLICY "Waiting queue entries are discoverable" ON public.trivia_pvp_queue USING (((( SELECT auth.uid() ) = user_id) OR (( SELECT auth.role() ) = 'service_role'::text) OR ((status = 'waiting'::text) AND (expires_at > now()))));
ALTER POLICY "Service role can manage scores" ON public.trivia_scores USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Users can insert their own scores" ON public.trivia_scores WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "trivia_sessions_select_own" ON public.trivia_sessions USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "Service role can manage streaks" ON public.trivia_streaks USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Service role manages tournament entries" ON public.trivia_tournament_entries USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "Service role manages items" ON public.trivia_user_items USING ((( SELECT auth.role() ) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() ) = 'service_role'::text));
ALTER POLICY "trivia_history_update_own" ON public.trivia_user_question_history USING ((( SELECT auth.uid() ) = user_id)) WITH CHECK ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "vip_points_select_own" ON public.vip_points USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "vip_points_ledger_select_own" ON public.vip_points_ledger USING ((( SELECT auth.uid() ) = user_id));
ALTER POLICY "w2g_own" ON public.w2g_forms USING ((( SELECT auth.uid() ) = user_id)) WITH CHECK ((( SELECT auth.uid() ) = user_id));

DO $$
DECLARE
  r record;
  bare int;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.polname, c.relname AS tbl,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS q,
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS w
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND (c.relname, p.polname) IN (
    ('club_shop_inventory', 'csi_select_own'),
    ('commander_escrow_transactions', 'cet_select_own'),
    ('diamond_platform_budget', 'diamond_platform_budget_service'),
    ('diamond_reward_claims', 'diamond_reward_claims_select_own'),
    ('diamond_transactions', 'diamond_transactions_select_own'),
    ('endless_high_scores', 'Service role manages endless high scores'),
    ('endless_high_scores', 'Users can insert own endless high score'),
    ('endless_high_scores', 'Users can update own endless high score'),
    ('leak_review_state', 'leak_review_state_delete_own'),
    ('leak_review_state', 'leak_review_state_insert_own'),
    ('leak_review_state', 'leak_review_state_select_own'),
    ('leak_review_state', 'leak_review_state_update_own'),
    ('merchandise_orders', 'merchandise_orders_own_read'),
    ('pb_calibration_profiles', 'pbcal_own'),
    ('profiles', 'profiles_update'),
    ('survival_progress', 'Service role manages survival progress'),
    ('survival_progress', 'Users can insert own survival progress'),
    ('survival_progress', 'Users can update own survival progress'),
    ('table_waitlists', 'table_waitlists_insert_own'),
    ('table_waitlists', 'table_waitlists_update_own'),
    ('training_spaced_repetition', 'tsr_own'),
    ('trivia_diamond_award_limits', 'Service role manages limits'),
    ('trivia_prize_wheel_spins', 'Service role manages spins'),
    ('trivia_prize_wheel_spins', 'Users can view own spins'),
    ('trivia_pvp_matches', 'Participants can view their matches'),
    ('trivia_pvp_matches', 'Service role manages pvp matches'),
    ('trivia_pvp_queue', 'Users can delete own queue entry'),
    ('trivia_pvp_queue', 'Users can insert own queue entry'),
    ('trivia_pvp_queue', 'Users can update own queue entry'),
    ('trivia_pvp_queue', 'Waiting queue entries are discoverable'),
    ('trivia_scores', 'Service role can manage scores'),
    ('trivia_scores', 'Users can insert their own scores'),
    ('trivia_sessions', 'trivia_sessions_select_own'),
    ('trivia_streaks', 'Service role can manage streaks'),
    ('trivia_tournament_entries', 'Service role manages tournament entries'),
    ('trivia_user_items', 'Service role manages items'),
    ('trivia_user_question_history', 'trivia_history_update_own'),
    ('vip_points', 'vip_points_select_own'),
    ('vip_points_ledger', 'vip_points_ledger_select_own'),
    ('w2g_forms', 'w2g_own')
      )
  LOOP
    n := n + 1;
    bare :=
      (regexp_count(r.q, 'auth\.(uid|role|jwt)\(\)', 1, 'i')
        - regexp_count(r.q, 'select\s+auth\.(uid|role|jwt)\(\)', 1, 'i'))
      + (regexp_count(r.w, 'auth\.(uid|role|jwt)\(\)', 1, 'i')
        - regexp_count(r.w, 'select\s+auth\.(uid|role|jwt)\(\)', 1, 'i'));
    IF bare > 0 THEN
      RAISE EXCEPTION 'POST-CONDITION FAILED: bare auth call remains in policy "%" on table "%"', r.polname, r.tbl;
    END IF;
  END LOOP;
  IF n <> 40 THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: expected 40 policies, found %', n;
  END IF;
  RAISE NOTICE 'POST-CONDITION OK: all 40 policies free of bare auth calls';
END $$;

COMMIT;