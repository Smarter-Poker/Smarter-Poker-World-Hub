-- Mirrored from the live database on 2026-07-27. Applied via MCP as migration 20260727161220_worldhub_missing_objects_2026_07_27.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- World Hub audit 2026-07-27: objects referenced by shipping code that never
-- existed in production. Every signature below is taken verbatim from its
-- call site; no behaviour is invented.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. training_spaced_repetition  (pages/api/training/spaced-repetition.js,
--    smart-practice.js). SM-2 style review queue. Upsert conflict target is
--    (user_id, spot_signature) exactly as the route specifies.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.training_spaced_repetition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  spot_signature text not null,
  game_id text,
  ev_loss numeric(10,4) default 0,
  classification text,
  next_review_at timestamptz not null default now(),
  review_interval integer not null default 1,
  ease_factor numeric(4,2) not null default 2.50,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_spaced_repetition_user_spot_key unique (user_id, spot_signature)
);
create index if not exists idx_tsr_due on public.training_spaced_repetition (user_id, next_review_at);
alter table public.training_spaced_repetition enable row level security;
drop policy if exists tsr_own on public.training_spaced_repetition;
create policy tsr_own on public.training_spaced_repetition
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. pb_calibration_profiles  (pages/api/poker-brain/calibration.js)
--    Route selects id, name, device_name, overrides, created_at, updated_at.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.pb_calibration_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  device_name text default 'Unknown Device',
  overrides text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pbcal_user on public.pb_calibration_profiles (user_id, updated_at desc);
alter table public.pb_calibration_profiles enable row level security;
drop policy if exists pbcal_own on public.pb_calibration_profiles;
create policy pbcal_own on public.pb_calibration_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. horse_session_analytics  (src/lib/poker-engine/PerformanceTracker.js)
--    Upsert with no explicit conflict target, so it needs a natural key.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.horse_session_analytics (
  id uuid primary key default gen_random_uuid(),
  horse_id text not null,
  table_id text not null,
  variant text,
  big_blind numeric(12,2),
  hands_played integer default 0,
  bb_per_100 numeric(10,3),
  total_bb_delta numeric(12,3),
  vpip numeric(6,3),
  pfr numeric(6,3),
  three_bet numeric(6,3),
  aggression_factor numeric(6,3),
  wtsd numeric(6,3),
  wsd numeric(6,3),
  session_duration_min numeric(10,2),
  total_rake_paid numeric(12,2),
  win_rate_class text,
  recorded_at timestamptz not null default now(),
  constraint horse_session_analytics_horse_table_key unique (horse_id, table_id)
);
alter table public.horse_session_analytics enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. w2g_forms  (pages/api/bankroll/tax-report.js) — tax compliance surface.
--    Route filters on user_id + tax_year and orders by upload_date.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.w2g_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tax_year integer not null,
  form_type text,
  source_description text,
  file_name text,
  file_url text,
  gross_amount numeric(12,2),
  withholding_amount numeric(12,2),
  upload_date date default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_w2g_user_year on public.w2g_forms (user_id, tax_year, upload_date);
alter table public.w2g_forms enable row level security;
drop policy if exists w2g_own on public.w2g_forms;
create policy w2g_own on public.w2g_forms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. promo_wagering_ledger + record_promo_wagering
--    LobbyManager records playthrough per player at hand end. Nothing in the
--    codebase READS wagering totals, so this is a faithful append-only
--    ledger. It deliberately does NOT gate withdrawals or clear promo funds:
--    that rule is not defined anywhere in the code and must not be invented.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.promo_wagering_ledger (
  id uuid primary key default gen_random_uuid(),
  club_id uuid,
  player_user_id uuid not null,
  amount_wagered numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pwl_player on public.promo_wagering_ledger (player_user_id, created_at desc);
create index if not exists idx_pwl_club on public.promo_wagering_ledger (club_id, created_at desc);
alter table public.promo_wagering_ledger enable row level security;

create or replace function public.record_promo_wagering(
  p_club_id uuid,
  p_player_user_id uuid,
  p_amount_wagered numeric
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_player_user_id is null or p_amount_wagered is null or p_amount_wagered <= 0 then
    return;
  end if;
  insert into promo_wagering_ledger (club_id, player_user_id, amount_wagered)
  values (p_club_id, p_player_user_id, p_amount_wagered);
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. close_table_session  (src/lib/poker-engine/AntiCheat.js)
--    table_sessions already carries is_active / left_at / kick_reason.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.close_table_session(
  p_table_id uuid,
  p_player_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_table_id is null or p_player_id is null then return; end if;
  update table_sessions
     set is_active = false,
         left_at = coalesce(left_at, now()),
         kick_reason = coalesce(p_reason, kick_reason)
   where table_id = p_table_id
     and player_id = p_player_id
     and is_active is true;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. update_table_stats  (src/lib/poker-engine/LobbyManager.js)
--    The call site documents the intent exactly: increment hands_dealt and
--    smooth avg_pot with an EMA (old*0.9 + new*0.1). `tables` had neither
--    column, so both are added here.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.tables add column if not exists hands_dealt bigint not null default 0;
alter table public.tables add column if not exists avg_pot numeric(14,2) not null default 0;

create or replace function public.update_table_stats(
  p_table_id uuid,
  p_pot_total numeric
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_table_id is null then return; end if;
  update tables
     set hands_dealt = coalesce(hands_dealt, 0) + 1,
         -- Seed the average on the first hand instead of dragging it up from 0.
         avg_pot = case
           when coalesce(hands_dealt, 0) = 0 then coalesce(p_pot_total, 0)
           else (coalesce(avg_pot, 0) * 0.9) + (coalesce(p_pot_total, 0) * 0.1)
         end,
         updated_at = now()
   where id = p_table_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. fn_increment_agent_player_count  (pages/api/club-arena/join-club.js)
--    Modelled on the existing sibling fn_increment_club_member_count.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.fn_increment_agent_player_count(
  p_agent_user_id uuid default null,
  p_club_id uuid default null,
  p_increment integer default 1
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_agent_user_id is null then return; end if;
  update agents
     set total_players = greatest(0, coalesce(total_players, 0) + p_increment),
         active_player_count = greatest(0, coalesce(active_player_count, 0) + p_increment),
         updated_at = now()
   where user_id = p_agent_user_id
     and (p_club_id is null or club_id = p_club_id);
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. increment_cache_served  (pages/api/geeves/ask.js, chat.js)
--    geeves_knowledge_cache already has times_served / last_served_at.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.increment_cache_served(cache_uuid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if cache_uuid is null then return; end if;
  update geeves_knowledge_cache
     set times_served = coalesce(times_served, 0) + 1,
         last_served_at = now()
   where id = cache_uuid;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. fn_get_all_identity_unread_counts  (pages/api/social/pages/index.js)
--     Caller reads rows as { entity_id, unread_total }. Counts messages in
--     each conversation bound to a social identity that arrived after the
--     caller last read it and were not sent by the caller.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.fn_get_all_identity_unread_counts(p_user_id uuid)
returns table (entity_id uuid, unread_total bigint)
language sql stable security definer set search_path = public as $$
  select c.context_entity_id as entity_id,
         count(m.id)::bigint as unread_total
    from social_conversation_participants p
    join social_conversations c on c.id = p.conversation_id
    join social_messages m on m.conversation_id = c.id
   where p.user_id = p_user_id
     and c.context_entity_id is not null
     and coalesce(m.is_deleted, false) = false
     and m.sender_id is distinct from p_user_id
     and m.created_at > coalesce(p.last_read_at, '-infinity'::timestamptz)
   group by c.context_entity_id
$$;

revoke all on function public.record_promo_wagering(uuid, uuid, numeric) from public, anon;
revoke all on function public.close_table_session(uuid, uuid, text) from public, anon;
revoke all on function public.update_table_stats(uuid, numeric) from public, anon;
revoke all on function public.fn_increment_agent_player_count(uuid, uuid, integer) from public, anon;

-- ── Post-conditions: fail loudly rather than silently half-applying ──
do $$
declare missing text;
begin
  select string_agg(x, ', ') into missing from (
    select t from unnest(array['training_spaced_repetition','pb_calibration_profiles',
                               'horse_session_analytics','w2g_forms','promo_wagering_ledger']) t
    where not exists (select 1 from information_schema.tables
                      where table_schema='public' and table_name=t)
  ) s(x);
  if missing is not null then raise exception 'tables not created: %', missing; end if;

  select string_agg(x, ', ') into missing from (
    select f from unnest(array['record_promo_wagering','close_table_session','update_table_stats',
                               'fn_increment_agent_player_count','increment_cache_served',
                               'fn_get_all_identity_unread_counts']) f
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname=f)
  ) s(x);
  if missing is not null then raise exception 'functions not created: %', missing; end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='tables' and column_name='hands_dealt') then
    raise exception 'tables.hands_dealt missing';
  end if;
end $$;
