-- =========================================================================
-- Poker Brain — Supabase Schema
-- Tables: sessions, hands, profiles, stats
-- Includes RLS, RPC functions, and indexes.
-- Run with: supabase db push  (or paste into SQL editor)
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Table: pb_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.pb_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  game_type       text not null check (game_type in ('nlhe','plo','plo_hilo','plo5','plo6','tournament')),
  player_count    int  not null check (player_count between 2 and 10),
  capture_mode    text not null check (capture_mode in ('camera','screen','manual','hybrid')),
  client_profile  text,            -- pokerstars, ggpoker, custom_xxx, etc.
  starting_stack  numeric,
  final_stack     numeric,
  hands_played    int  not null default 0,
  correct_calls   int  not null default 0,
  total_decisions int  not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists pb_sessions_user_started_idx
  on public.pb_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Table: pb_hands
-- ---------------------------------------------------------------------------
create table if not exists public.pb_hands (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.pb_sessions(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  hand_number     int  not null,
  position        text,
  hole_cards      text[] not null,    -- ['As','Kd',...]
  board           text[] not null default '{}',
  game_type       text not null,
  pot_size        numeric,
  bet_to_call     numeric,
  stack_size      numeric,
  equity          numeric,            -- 0..100
  pot_odds        numeric,
  decision        text check (decision in ('fold','call','raise','check')),
  raise_amount    numeric,
  confidence      numeric,            -- 0..100
  reasoning       text,
  actual_action   text,               -- what the user actually did
  outcome         text,               -- win/lose/chop/unknown
  chips_won       numeric,
  detected_auto   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists pb_hands_session_idx  on public.pb_hands (session_id, hand_number);
create index if not exists pb_hands_user_idx     on public.pb_hands (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Table: pb_profiles — custom calibration profiles
-- ---------------------------------------------------------------------------
create table if not exists public.pb_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  slug            text not null,
  regions         jsonb not null,   -- { hole1: {x,y,w,h}, ... }
  video_size      jsonb,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists pb_profiles_user_idx on public.pb_profiles (user_id);

-- ---------------------------------------------------------------------------
-- Table: pb_stats — rolled-up per-user stats (1 row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.pb_stats (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  total_sessions   int  not null default 0,
  total_hands      int  not null default 0,
  total_decisions  int  not null default 0,
  correct_calls    int  not null default 0,
  total_winnings   numeric not null default 0,
  best_hand_type   text,
  biggest_pot_won  numeric,
  last_played_at   timestamptz,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.pb_sessions enable row level security;
alter table public.pb_hands    enable row level security;
alter table public.pb_profiles enable row level security;
alter table public.pb_stats    enable row level security;

drop policy if exists "pb_sessions_owner" on public.pb_sessions;
create policy "pb_sessions_owner" on public.pb_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pb_hands_owner" on public.pb_hands;
create policy "pb_hands_owner" on public.pb_hands
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pb_profiles_owner" on public.pb_profiles;
create policy "pb_profiles_owner" on public.pb_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pb_stats_owner" on public.pb_stats;
create policy "pb_stats_owner" on public.pb_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPC: pb_start_session
-- ---------------------------------------------------------------------------
create or replace function public.pb_start_session(
  p_game_type      text,
  p_player_count   int,
  p_capture_mode   text,
  p_client_profile text default null,
  p_starting_stack numeric default null
) returns uuid
language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into public.pb_sessions (user_id, game_type, player_count, capture_mode, client_profile, starting_stack)
  values (auth.uid(), p_game_type, p_player_count, p_capture_mode, p_client_profile, p_starting_stack)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: pb_log_hand
-- ---------------------------------------------------------------------------
create or replace function public.pb_log_hand(
  p_session_id   uuid,
  p_hand_number  int,
  p_position     text,
  p_hole_cards   text[],
  p_board        text[],
  p_game_type    text,
  p_pot_size     numeric,
  p_bet_to_call  numeric,
  p_stack_size   numeric,
  p_equity       numeric,
  p_pot_odds     numeric,
  p_decision     text,
  p_raise_amount numeric,
  p_confidence   numeric,
  p_reasoning    text,
  p_detected_auto boolean default false
) returns uuid
language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into public.pb_hands (
    session_id, user_id, hand_number, position, hole_cards, board, game_type,
    pot_size, bet_to_call, stack_size, equity, pot_odds, decision, raise_amount,
    confidence, reasoning, detected_auto
  ) values (
    p_session_id, auth.uid(), p_hand_number, p_position, p_hole_cards, p_board, p_game_type,
    p_pot_size, p_bet_to_call, p_stack_size, p_equity, p_pot_odds, p_decision, p_raise_amount,
    p_confidence, p_reasoning, p_detected_auto
  ) returning id into v_id;

  update public.pb_sessions
    set hands_played = hands_played + 1,
        total_decisions = total_decisions + 1
    where id = p_session_id and user_id = auth.uid();

  insert into public.pb_stats (user_id, total_hands, total_decisions, last_played_at)
    values (auth.uid(), 1, 1, now())
  on conflict (user_id) do update
    set total_hands = public.pb_stats.total_hands + 1,
        total_decisions = public.pb_stats.total_decisions + 1,
        last_played_at = now(),
        updated_at = now();

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: pb_end_session
-- ---------------------------------------------------------------------------
create or replace function public.pb_end_session(
  p_session_id   uuid,
  p_final_stack  numeric default null,
  p_notes        text default null
) returns void
language plpgsql security definer as $$
begin
  update public.pb_sessions
    set ended_at = now(),
        final_stack = coalesce(p_final_stack, final_stack),
        notes = coalesce(p_notes, notes)
    where id = p_session_id and user_id = auth.uid();

  insert into public.pb_stats (user_id, total_sessions, last_played_at)
    values (auth.uid(), 1, now())
  on conflict (user_id) do update
    set total_sessions = public.pb_stats.total_sessions + 1,
        last_played_at = now(),
        updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- RPC: pb_save_profile
-- ---------------------------------------------------------------------------
create or replace function public.pb_save_profile(
  p_name       text,
  p_slug       text,
  p_regions    jsonb,
  p_video_size jsonb default null
) returns uuid
language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into public.pb_profiles (user_id, name, slug, regions, video_size)
  values (auth.uid(), p_name, p_slug, p_regions, p_video_size)
  on conflict (user_id, slug) do update
    set name = excluded.name,
        regions = excluded.regions,
        video_size = excluded.video_size,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.pb_start_session(text,int,text,text,numeric) to authenticated;
grant execute on function public.pb_log_hand(uuid,int,text,text[],text[],text,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,boolean) to authenticated;
grant execute on function public.pb_end_session(uuid,numeric,text) to authenticated;
grant execute on function public.pb_save_profile(text,text,jsonb,jsonb) to authenticated;
