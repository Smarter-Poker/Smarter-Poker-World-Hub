-- Engine DB (nscdmxldtyszyvcxxwgr) migration — applied via Supabase MCP on 2026-06-22.
-- Directory RPCs for the Players page team-list / tabs. Pull real season stat lines
-- (AVG/HR/RBI/OBP/SLG/OPS + wRC+/wOBA/PA for hitters; W-L/SV/ERA/WHIP/K/IP/FIP for
-- pitchers) from the latest agg_batter/agg_pitcher fg_season snapshot per player.
-- agg_batter/agg_pitcher are rewritten by the engine's daily pipeline, so these refresh
-- every day with no extra job. /api/mlb/players calls these instead of paging the
-- 6-column v_hitter_profile / v_pitcher_profile views.

create or replace function public.get_mlb_hitter_directory()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(j order by wrc_sort desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', d.player_id, 'full_name', d.full_name, 'team_id', d.team_id,
      'avg',  (b.metrics->>'AVG')::numeric,  'hr',   (b.metrics->>'HR')::numeric,
      'rbi',  (b.metrics->>'RBI')::numeric,  'r',    (b.metrics->>'R')::numeric,
      'sb',   (b.metrics->>'SB')::numeric,   'bb',   (b.metrics->>'BB')::numeric,
      'so',   (b.metrics->>'SO')::numeric,   'h',    (b.metrics->>'H')::numeric,
      'obp',  (b.metrics->>'OBP')::numeric,  'slg',  (b.metrics->>'SLG')::numeric,
      'ops',  (b.metrics->>'OPS')::numeric,  'iso',  (b.metrics->>'ISO')::numeric,
      'pa',   (b.metrics->>'PA')::numeric,   'wrc_plus', (b.metrics->>'wRC+')::numeric,
      'woba', (b.metrics->>'wOBA')::numeric, 'k_pct', (b.metrics->>'K%')::numeric,
      'bb_pct', (b.metrics->>'BB%')::numeric
    ) j,
    (b.metrics->>'wRC+')::numeric wrc_sort
    from dim_players d
    join lateral (
      select metrics from agg_batter
      where batter_id = d.player_id and window_kind = 'fg_season'
      order by as_of desc limit 1
    ) b on true
    where coalesce((b.metrics->>'PA')::numeric, 0) > 0
  ) s;
$$;

create or replace function public.get_mlb_pitcher_directory()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(j order by k_sort desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', d.player_id, 'full_name', d.full_name, 'team_id', d.team_id,
      'w',    (p.metrics->>'W')::numeric,    'l',   (p.metrics->>'L')::numeric,
      'sv',   (p.metrics->>'SV')::numeric,   'hld', (p.metrics->>'HLD')::numeric,
      'era',  (p.metrics->>'ERA')::numeric,  'whip',(p.metrics->>'WHIP')::numeric,
      'k',    (p.metrics->>'SO')::numeric,   'ip',  (p.metrics->>'IP')::numeric,
      'gs',   (p.metrics->>'GS')::numeric,   'g',   (p.metrics->>'G')::numeric,
      'fip',  (p.metrics->>'FIP')::numeric,  'siera',(p.metrics->>'SIERA')::numeric,
      'k9',   (p.metrics->>'K/9')::numeric,  'bb9', (p.metrics->>'BB/9')::numeric,
      'bf',   (p.metrics->>'TBF')::numeric
    ) j,
    (p.metrics->>'SO')::numeric k_sort
    from dim_players d
    join lateral (
      select metrics from agg_pitcher
      where pitcher_id = d.player_id and window_kind = 'fg_season'
      order by as_of desc limit 1
    ) p on true
    where coalesce((p.metrics->>'IP')::numeric, 0) > 0
  ) s;
$$;

grant execute on function public.get_mlb_hitter_directory() to anon, authenticated, service_role;
grant execute on function public.get_mlb_pitcher_directory() to anon, authenticated, service_role;
