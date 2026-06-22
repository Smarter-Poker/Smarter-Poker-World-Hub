-- Optimize mlb_hr_bets RLS policies: wrap auth.uid() in a scalar subselect so Postgres
-- evaluates it ONCE per query (initplan) instead of once per row. Resolves the Supabase
-- auth_rls_initplan performance advisory. Behavior is identical (owner-only access).
-- Applied to MAIN (kuklfnapbkmacvwxktbh) via apply_migration: mlb_hr_bets_rls_initplan_optimization.
drop policy if exists "mlb_hr_bets_select_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_select_own" on public.mlb_hr_bets
  for select using ((select auth.uid()) = user_id);

drop policy if exists "mlb_hr_bets_insert_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_insert_own" on public.mlb_hr_bets
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "mlb_hr_bets_update_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_update_own" on public.mlb_hr_bets
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "mlb_hr_bets_delete_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_delete_own" on public.mlb_hr_bets
  for delete using ((select auth.uid()) = user_id);
