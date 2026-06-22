-- Engine DB migration
-- Deep safety fixes for MLB Directory RPCs to handle null/empty string casting errors.

create or replace function public.get_mlb_hitter_directory()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(j order by wrc_sort desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', d.player_id, 'full_name', d.full_name, 'team_id', d.team_id,
      'avg',  nullif(b.metrics->>'AVG', '')::numeric,  'hr',   nullif(b.metrics->>'HR', '')::numeric,
      'rbi',  nullif(b.metrics->>'RBI', '')::numeric,  'r',    nullif(b.metrics->>'R', '')::numeric,
      'sb',   nullif(b.metrics->>'SB', '')::numeric,   'bb',   nullif(b.metrics->>'BB', '')::numeric,
      'so',   nullif(b.metrics->>'SO', '')::numeric,   'h',    nullif(b.metrics->>'H', '')::numeric,
      'obp',  nullif(b.metrics->>'OBP', '')::numeric,  'slg',  nullif(b.metrics->>'SLG', '')::numeric,
      'ops',  nullif(b.metrics->>'OPS', '')::numeric,  'iso',  nullif(b.metrics->>'ISO', '')::numeric,
      'pa',   nullif(b.metrics->>'PA', '')::numeric,   'wrc_plus', nullif(b.metrics->>'wRC+', '')::numeric,
      'woba', nullif(b.metrics->>'wOBA', '')::numeric, 'k_pct', nullif(replace(b.metrics->>'K%', '%', ''), '')::numeric,
      'bb_pct', nullif(replace(b.metrics->>'BB%', '%', ''), '')::numeric
    ) j,
    nullif(b.metrics->>'wRC+', '')::numeric wrc_sort
    from dim_players d
    join lateral (
      select metrics from agg_batter
      where batter_id = d.player_id and window_kind = 'fg_season'
      order by as_of desc limit 1
    ) b on true
    where coalesce(nullif(b.metrics->>'PA', '')::numeric, 0) > 0
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
      'w',    nullif(p.metrics->>'W', '')::numeric,    'l',   nullif(p.metrics->>'L', '')::numeric,
      'sv',   nullif(p.metrics->>'SV', '')::numeric,   'hld', nullif(p.metrics->>'HLD', '')::numeric,
      'era',  nullif(p.metrics->>'ERA', '')::numeric,  'whip',nullif(p.metrics->>'WHIP', '')::numeric,
      'k',    nullif(p.metrics->>'SO', '')::numeric,   'ip',  nullif(p.metrics->>'IP', '')::numeric,
      'gs',   nullif(p.metrics->>'GS', '')::numeric,   'g',   nullif(p.metrics->>'G', '')::numeric,
      'fip',  nullif(p.metrics->>'FIP', '')::numeric,  'siera',nullif(p.metrics->>'SIERA', '')::numeric,
      'k9',   nullif(p.metrics->>'K/9', '')::numeric,  'bb9', nullif(p.metrics->>'BB/9', '')::numeric,
      'bf',   nullif(p.metrics->>'TBF', '')::numeric
    ) j,
    nullif(p.metrics->>'SO', '')::numeric k_sort
    from dim_players d
    join lateral (
      select metrics from agg_pitcher
      where pitcher_id = d.player_id and window_kind = 'fg_season'
      order by as_of desc limit 1
    ) p on true
    where coalesce(nullif(p.metrics->>'IP', '')::numeric, 0) > 0
  ) s;
$$;

grant execute on function public.get_mlb_hitter_directory() to anon, authenticated, service_role;
grant execute on function public.get_mlb_pitcher_directory() to anon, authenticated, service_role;
