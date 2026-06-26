-- Engine DB (nscdmxldtyszyvcxxwgr) — applied via Supabase MCP on 2026-06-22.
-- Fixes get_mlb_league_averages() being an 8.5s query (it deduped the full
-- agg_batter/agg_pitcher history on every cold call). Two-part fix:
--   1. Partial indexes for the "latest fg_season snapshot per player" pattern
--      (also speeds the directory RPCs' per-player lateral lookups).
--   2. A 1-row cache table + lazy-refresh function: recompute at most every ~20h,
--      otherwise return the cached jsonb instantly. Measured: 8479ms -> 11ms.

create index if not exists idx_agg_batter_fgseason_latest
  on public.agg_batter (batter_id, as_of desc)
  where window_kind = 'fg_season';

create index if not exists idx_agg_pitcher_fgseason_latest
  on public.agg_pitcher (pitcher_id, as_of desc)
  where window_kind = 'fg_season';

create table if not exists public.mlb_league_avg_cache (
  id int primary key default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint mlb_league_avg_cache_single_row check (id = 1)
);

create or replace function public.get_mlb_league_averages()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cached jsonb;
  cached_at timestamptz;
  result jsonb;
begin
  select payload, updated_at into cached, cached_at from public.mlb_league_avg_cache where id = 1;
  if cached is not null and cached_at > now() - interval '20 hours' then
    return cached;
  end if;

  with hb as (select distinct on (batter_id) metrics from agg_batter where window_kind='fg_season' order by batter_id, as_of desc),
       pb as (select distinct on (pitcher_id) metrics from agg_pitcher where window_kind='fg_season' order by pitcher_id, as_of desc)
  select jsonb_build_object(
    'hitter', (select jsonb_object_agg(k, v) from (
        select key k, round(avg((metrics->>key)::numeric), 4) v
        from hb, lateral (values ('AVG'),('OBP'),('SLG'),('OPS'),('wRC+'),('wOBA'),('xwOBA'),('ISO'),('BABIP'),
                                 ('K%'),('BB%'),('Barrel%'),('HardHit%'),('EV'),('GB%'),('FB%'),('LD%'),
                                 ('O-Swing%'),('Contact%'),('SwStr%'),('WAR')) as keys(key)
        where (metrics->>'PA')::numeric >= 150 and (metrics->>key) ~ '^-?[0-9.]+$'
        group by key) h),
    'pitcher', (select jsonb_object_agg(k, v) from (
        select key k, round(avg((metrics->>key)::numeric), 4) v
        from pb, lateral (values ('ERA'),('WHIP'),('FIP'),('xFIP'),('SIERA'),('xERA'),('K/9'),('BB/9'),('HR/9'),
                                 ('K%'),('BB%'),('K-BB%'),('LOB%'),('BABIP'),('Barrel%'),('HardHit%'),('GB%'),('WAR')) as keys(key)
        where (metrics->>'IP')::numeric >= 20 and (metrics->>key) ~ '^-?[0-9.]+$'
        group by key) pt)
  ) into result;

  insert into public.mlb_league_avg_cache(id, payload, updated_at) values (1, result, now())
    on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at;
  return result;
exception when others then
  if cached is not null then return cached; end if;
  return jsonb_build_object('hitter', '{}'::jsonb, 'pitcher', '{}'::jsonb);
end;
$$;

grant execute on function public.get_mlb_league_averages() to anon, authenticated, service_role;