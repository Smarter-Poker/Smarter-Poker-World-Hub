-- Engine DB (nscdmxldtyszyvcxxwgr) migration — applied via Supabase MCP on 2026-06-22.
-- get_mlb_player_detail(p_id): the full player profile for /api/mlb/players/[id] —
-- identity + type + complete fg_season stat line + profile sim_rates/streaks (recent
-- form) + TODAY'S matchup (opponent, probable opposing pitcher with season line,
-- batter-vs-pitcher history, pitcher-vs-team history, opponent team context). All from
-- the engine's daily-refreshed tables (agg_batter/agg_pitcher/agg_team/agg_bvp/
-- agg_pitcher_vs_team/fact_games/raw_probables/dim_players/dim_teams).
create or replace function public.get_mlb_player_detail(p_id bigint)
returns jsonb
language sql
stable
as $$
with d as (
  select player_id, full_name, team_id, bats, throws, "position", birth_date, player_class
  from dim_players where player_id = p_id
),
hit as (select metrics from agg_batter where batter_id = p_id and window_kind = 'fg_season' order by as_of desc limit 1),
pit as (select metrics from agg_pitcher where pitcher_id = p_id and window_kind = 'fg_season' order by as_of desc limit 1),
prof_b as (select metrics from agg_batter where batter_id = p_id and window_kind = 'profile' and vs_hand = 'A' order by as_of desc limit 1),
prof_p as (select metrics from agg_pitcher where pitcher_id = p_id and window_kind = 'profile' order by as_of desc limit 1),
typ as (
  select case
    when coalesce((select (metrics->>'PA')::numeric from hit), 0) >= 20 then 'hitter'
    when (select metrics from pit) is not null and coalesce((select (metrics->>'IP')::numeric from pit), 0) > 0 then 'pitcher'
    when (select metrics from hit) is not null then 'hitter'
    else 'pitcher'
  end as t
),
game as (
  select f.game_pk, f.official_date, f.first_pitch_utc,
    (f.home_team_id = (select team_id from d)) as is_home,
    (case when f.home_team_id = (select team_id from d) then f.away_team_id else f.home_team_id end) as opp_team,
    (case when f.home_team_id = (select team_id from d) then f.away_sp_id else f.home_sp_id end) as opp_sp_fact
  from fact_games f
  where (f.home_team_id = (select team_id from d) or f.away_team_id = (select team_id from d))
    and f.official_date >= current_date and not f.final
  order by f.official_date asc, f.first_pitch_utc asc nulls last
  limit 1
),
opp_sp as (
  select coalesce(
    (select rp.pitcher_id from raw_probables rp
       where rp.game_pk = (select game_pk from game) and rp.team_id = (select opp_team from game)
       order by rp.knowledge_time desc limit 1),
    (select opp_sp_fact from game)
  ) as pid
),
bvp as (
  select pa, hr, woba, k_pct from agg_bvp
  where batter_id = p_id and pitcher_id = (select pid from opp_sp)
  order by as_of desc limit 1
),
pvt as (
  select era, k9, lineup_woba, (metrics->>'pa')::numeric as pa from agg_pitcher_vs_team
  where pitcher_id = p_id and team_id = (select opp_team from game)
  order by as_of desc limit 1
),
opp_sp_line as (select metrics from agg_pitcher where pitcher_id = (select pid from opp_sp) and window_kind = 'fg_season' order by as_of desc limit 1),
opp_pitch as (select metrics from agg_team where team_id = (select opp_team from game) and window_kind = 'pitching' order by as_of desc limit 1),
opp_hit as (select metrics from agg_team where team_id = (select opp_team from game) and window_kind = 'fg_hitting' order by as_of desc limit 1)
select jsonb_build_object(
  'type', (select t from typ),
  'player', (select to_jsonb(d) from d),
  'season', case when (select t from typ) = 'pitcher' then (select metrics from pit) else (select metrics from hit) end,
  'profile', jsonb_build_object(
    'sim_rates', case when (select t from typ) = 'pitcher' then (select metrics->'sim_rates' from prof_p) else (select metrics->'sim_rates' from prof_b) end,
    'streaks',   case when (select t from typ) = 'pitcher' then (select metrics->'streaks' from prof_p)   else (select metrics->'streaks' from prof_b) end
  ),
  'matchup', case when (select game_pk from game) is null then null else jsonb_build_object(
    'game_pk', (select game_pk from game),
    'date', (select official_date from game),
    'first_pitch_utc', (select first_pitch_utc from game),
    'is_home', (select is_home from game),
    'opp_team_id', (select opp_team from game),
    'opp_team_name', (select name from dim_teams where team_id = (select opp_team from game)),
    'opp_pitcher_id', (select pid from opp_sp),
    'opp_pitcher_name', (select full_name from dim_players where player_id = (select pid from opp_sp)),
    'opp_pitcher_throws', (select throws from dim_players where player_id = (select pid from opp_sp)),
    'opp_pitcher_season', (select case when metrics is null then null else jsonb_build_object(
        'era', (metrics->>'ERA')::numeric, 'whip', (metrics->>'WHIP')::numeric,
        'k9', (metrics->>'K/9')::numeric, 'fip', (metrics->>'FIP')::numeric,
        'w', (metrics->>'W')::numeric, 'l', (metrics->>'L')::numeric,
        'ip', (metrics->>'IP')::numeric, 'gs', (metrics->>'GS')::numeric
      ) end from opp_sp_line),
    'bvp', case when (select t from typ) = 'hitter' then (select to_jsonb(bvp) from bvp) else null end,
    'pvt', case when (select t from typ) = 'pitcher' then (select to_jsonb(pvt) from pvt) else null end,
    'opp_team_pitching', (select case when metrics is null then null else jsonb_build_object(
        'era', (metrics->>'era')::numeric, 'whip', (metrics->>'whip')::numeric) end from opp_pitch),
    'opp_team_hitting', (select case when metrics is null then null else jsonb_build_object(
        'avg', (metrics->>'AVG')::numeric, 'ops', (metrics->>'OPS')::numeric, 'wrc', (metrics->>'wRC+')::numeric) end from opp_hit)
  ) end
)
where exists (select 1 from d);
$$;

grant execute on function public.get_mlb_player_detail(bigint) to anon, authenticated, service_role;
