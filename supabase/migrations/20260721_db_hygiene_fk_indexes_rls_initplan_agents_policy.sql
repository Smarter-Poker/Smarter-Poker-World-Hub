-- Task #57 (batch 2): covering indexes for unindexed FKs, auth.uid() init-plan
-- wrapping (mlb_hr_bets), and agents SELECT-policy consolidation.
-- Applied to prod via Supabase MCP 2026-07-21.

-- 1. Covering indexes for the 4 unindexed foreign keys (perf advisor).
CREATE INDEX IF NOT EXISTS idx_agg_team_team_id ON public.agg_team (team_id);
CREATE INDEX IF NOT EXISTS idx_commander_home_join_attempts_group_id ON public.commander_home_join_attempts (group_id);
CREATE INDEX IF NOT EXISTS idx_live_ban_audit_banned_by ON public.live_ban_audit (banned_by);
CREATE INDEX IF NOT EXISTS idx_trivia_question_reports_user_id ON public.trivia_question_reports (user_id);

-- 2. mlb_hr_bets: wrap auth.uid() in (SELECT ...) (auth_rls_initplan). Semantics unchanged.
DROP POLICY IF EXISTS mlb_hr_bets_select_own ON public.mlb_hr_bets;
CREATE POLICY mlb_hr_bets_select_own ON public.mlb_hr_bets FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS mlb_hr_bets_insert_own ON public.mlb_hr_bets;
CREATE POLICY mlb_hr_bets_insert_own ON public.mlb_hr_bets FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS mlb_hr_bets_update_own ON public.mlb_hr_bets;
CREATE POLICY mlb_hr_bets_update_own ON public.mlb_hr_bets FOR UPDATE
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS mlb_hr_bets_delete_own ON public.mlb_hr_bets;
CREATE POLICY mlb_hr_bets_delete_own ON public.mlb_hr_bets FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- 3. agents: merge the two permissive PUBLIC SELECT policies into one (OR of both
--    USING clauses -> semantically identical). service_role policy left as-is.
DROP POLICY IF EXISTS "Agents can read own agent row" ON public.agents;
DROP POLICY IF EXISTS agents_club_owner_read ON public.agents;
CREATE POLICY agents_read_own_or_club_manager ON public.agents FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = agents.club_id
        AND (
          c.owner_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM club_members cm
            WHERE cm.club_id = agents.club_id
              AND cm.user_id = (SELECT auth.uid())
              AND cm.role = ANY (ARRAY['owner'::text, 'co_owner'::text, 'admin'::text])
          )
        )
    )
  );
