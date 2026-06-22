-- Defense-in-depth: mlb_hr_bets is owner-only via RLS, but the table also carried a
-- table-level grant to anon. anon has no auth.uid() so RLS already returns 0 rows, but
-- revoke the grant anyway so anon has no surface at all. authenticated keeps its grant.
-- Applied to MAIN (kuklfnapbkmacvwxktbh) via apply_migration: mlb_hr_bets_revoke_anon.
revoke all on public.mlb_hr_bets from anon;
