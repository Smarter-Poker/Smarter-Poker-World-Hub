-- Per-user HR bet tracking for the MLB HR Tracker / player pages.
-- Users log a wager (stake + American odds) on a player to hit a home run; the UI
-- computes cumulative P&L per player and the recovery stake needed to stay net-positive.
-- Applied to the MAIN project (kuklfnapbkmacvwxktbh) via apply_migration: mlb_hr_bets_user_tracking.
create table if not exists public.mlb_hr_bets (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid(),
  player_id     integer not null,
  player_name   text,
  team_id       integer,
  bet_date      date not null default current_date,
  stake         numeric(10,2) not null default 0 check (stake >= 0),
  american_odds integer not null default 100,
  result        text not null default 'pending' check (result in ('pending','hit','miss','push')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.mlb_hr_bets enable row level security;

create index if not exists idx_mlb_hr_bets_user_player
  on public.mlb_hr_bets (user_id, player_id, bet_date desc);

drop policy if exists "mlb_hr_bets_select_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_select_own" on public.mlb_hr_bets
  for select using (auth.uid() = user_id);

drop policy if exists "mlb_hr_bets_insert_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_insert_own" on public.mlb_hr_bets
  for insert with check (auth.uid() = user_id);

drop policy if exists "mlb_hr_bets_update_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_update_own" on public.mlb_hr_bets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mlb_hr_bets_delete_own" on public.mlb_hr_bets;
create policy "mlb_hr_bets_delete_own" on public.mlb_hr_bets
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.mlb_hr_bets to authenticated;
