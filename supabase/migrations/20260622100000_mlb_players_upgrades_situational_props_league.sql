-- Engine DB (nscdmxldtyszyvcxxwgr) — applied via Supabase MCP on 2026-06-22.
-- Players-page upgrades:
--   * get_mlb_hitter_directory(): adds player_class (Starter/Backup card badge).
--   * get_mlb_league_averages(): league means (qualified players) for stat color-coding.
--   * get_mlb_player_detail(): adds situational splits, pitch-type/velo tendencies,
--     injury status, and the player's current prop bets.
-- All read the engine's daily-refreshed tables, so they stay current automatically.

create or replace function public.get_mlb_hitter_directory()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(j order by wrc_sort desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', d.player_id, 'full_name', d.full_name, 'team_id', d.team_id,
      'player_class', d.player_class, 'position', d."position",
      'avg',(b.metrics->>'AVG')::numeric, 'hr',(b.metrics->>'HR')::numeric, 'rbi',(b.metrics->>'RBI')::numeric,
      'r',(b.metrics->>'R')::numeric, 'sb',(b.metrics->>'SB')::numeric, 'bb',(b.metrics->>'BB')::numeric,
      'so',(b.metrics->>'SO')::numeric, 'h',(b.metrics->>'H')::numeric, 'obp',(b.metrics->>'OBP')::numeric,
      'slg',(b.metrics->>'SLG')::numeric, 'ops',(b.metrics->>'OPS')::numeric, 'iso',(b.metrics->>'ISO')::numeric,
      'pa',(b.metrics->>'PA')::numeric, 'wrc_plus',(b.metrics->>'wRC+')::numeric, 'woba',(b.metrics->>'wOBA')::numeric,
      'k_pct',(b.metrics->>'K%')::numeric, 'bb_pct',(b.metrics->>'BB%')::numeric
    ) j, (b.metrics->>'wRC+')::numeric wrc_sort
    from dim_players d
    join lateral (select metrics from agg_batter where batter_id=d.player_id and window_kind='fg_season' order by as_of desc limit 1) b on true
    where coalesce((b.metrics->>'PA')::numeric,0) > 0
  ) s;
$$;

create or replace function public.get_mlb_league_averages()
returns jsonb language sql stable as $$
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
);
$$;

create or replace function public.get_mlb_player_detail(p_id bigint)
returns jsonb language sql stable as $$
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
  order by f.official_date asc, f.first_pitch_utc asc nulls last limit 1
),
opp_sp as (
  select coalesce(
    (select rp.pitcher_id from raw_probables rp where rp.game_pk = (select game_pk from game) and rp.team_id = (select opp_team from game) order by rp.knowledge_time desc limit 1),
    (select opp_sp_fact from game)
  ) as pid
),
bvp as (select pa, hr, woba, k_pct from agg_bvp where batter_id = p_id and pitcher_id = (select pid from opp_sp) order by as_of desc limit 1),
pvt as (select era, k9, lineup_woba, (metrics->>'pa')::numeric as pa from agg_pitcher_vs_team where pitcher_id = p_id and team_id = (select opp_team from game) order by as_of desc limit 1),
opp_sp_line as (select metrics from agg_pitcher where pitcher_id = (select pid from opp_sp) and window_kind = 'fg_season' order by as_of desc limit 1),
opp_pitch as (select metrics from agg_team where team_id = (select opp_team from game) and window_kind = 'pitching' order by as_of desc limit 1),
opp_hit as (select metrics from agg_team where team_id = (select opp_team from game) and window_kind = 'fg_hitting' order by as_of desc limit 1),
latest_slate as (select max(as_of_ts) ts from pred_props)
select jsonb_build_object(
  'type', (select t from typ),
  'player', (select to_jsonb(d) from d),
  'season', case when (select t from typ) = 'pitcher' then (select metrics from pit) else (select metrics from hit) end,
  'profile', jsonb_build_object(
    'sim_rates', case when (select t from typ) = 'pitcher' then (select metrics->'sim_rates' from prof_p) else (select metrics->'sim_rates' from prof_b) end,
    'streaks',   case when (select t from typ) = 'pitcher' then (select metrics->'streaks' from prof_p)   else (select metrics->'streaks' from prof_b) end
  ),
  'situational', (select metrics from agg_batter where batter_id = p_id and window_kind = 'situational' order by as_of desc limit 1),
  'tendencies',  (select metrics from agg_batter where batter_id = p_id and window_kind = 'historical_trends' order by as_of desc limit 1),
  'health', coalesce(
    (select metrics from agg_batter where batter_id = p_id and window_kind = 'health' order by as_of desc limit 1),
    (select metrics from agg_pitcher where pitcher_id = p_id and window_kind = 'health' order by as_of desc limit 1)
  ),
  'props', (select coalesce(jsonb_agg(jsonb_build_object('prop',prop,'line',line,'proj',proj_mean,'prob_over',prob_over,'edge',edge_pts,'rec',rec) order by edge_pts desc nulls last), '[]'::jsonb)
            from pred_props where player_id = p_id and as_of_ts = (select ts from latest_slate)),
  'matchup', case when (select game_pk from game) is null then null else jsonb_build_object(
    'game_pk', (select game_pk from game), 'date', (select official_date from game),
    'first_pitch_utc', (select first_pitch_utc from game), 'is_home', (select is_home from game),
    'opp_team_id', (select opp_team from game),
    'opp_team_name', (select name from dim_teams where team_id = (select opp_team from game)),
    'opp_pitcher_id', (select pid from opp_sp),
    'opp_pitcher_name', (select full_name from dim_players where player_id = (select pid from opp_sp)),
    'opp_pitcher_throws', (select throws from dim_players where player_id = (select pid from opp_sp)),
    'opp_pitcher_season', (select case when metrics is null then null else jsonb_build_object(
        'era',(metrics->>'ERA')::numeric,'whip',(metrics->>'WHIP')::numeric,'k9',(metrics->>'K/9')::numeric,
        'fip',(metrics->>'FIP')::numeric,'w',(metrics->>'W')::numeric,'l',(metrics->>'L')::numeric,
        'ip',(metrics->>'IP')::numeric,'gs',(metrics->>'GS')::numeric) end from opp_sp_line),
    'bvp', case when (select t from typ) = 'hitter' then (select to_jsonb(bvp) from bvp) else null end,
    'pvt', case when (select t from typ) = 'pitcher' then (select to_jsonb(pvt) from pvt) else null end,
    'opp_team_pitching', (select case when metrics is null then null else jsonb_build_object('era',(metrics->>'era')::numeric,'whip',(metrics->>'whip')::numeric) end from opp_pitch),
    'opp_team_hitting', (select case when metrics is null then null else jsonb_build_object('avg',(metrics->>'AVG')::numeric,'ops',(metrics->>'OPS')::numeric,'wrc',(metrics->>'wRC+')::numeric) end from opp_hit)
  ) end
)
where exists (select 1 from d);
$$;

grant execute on function public.get_mlb_hitter_directory() to anon, authenticated, service_role;
grant execute on function public.get_mlb_league_averages() to anon, authenticated, service_role;
grant execute on function public.get_mlb_player_detail(bigint) to anon, authenticated, service_role;
