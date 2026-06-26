-- Engine DB (nscdmxldtyszyvcxxwgr) — applied via Supabase MCP on 2026-06-22.
-- Perf rewrite of both player directory RPCs. The slow form scanned every fg_season
-- snapshot (hitter directory measured 2.2s, which caused cold-start 503s on
-- /api/mlb/hitters). New form: lateral over DISTINCT *_id (index-only scan) + one
-- index seek per player — reads ~1 row per player instead of the full history.
-- Numeric guards stop a single non-numeric metric from erroring the whole RPC.
-- Relies on idx_agg_batter_fgseason_latest / idx_agg_pitcher_fgseason_latest
-- (created in 20260622110000_mlb_league_avg_perf_lazy_cache.sql).

create or replace function public.get_mlb_hitter_directory()
returns jsonb language sql stable as $$
with latest_hitter as (
  select i.batter_id, l.metrics
  from (select distinct batter_id from agg_batter where window_kind = 'fg_season') i
  cross join lateral (
    select metrics from agg_batter a
    where a.batter_id = i.batter_id and a.window_kind = 'fg_season'
    order by a.as_of desc limit 1
  ) l
)
select coalesce(jsonb_agg(j order by wrc_sort desc nulls last), '[]'::jsonb)
from (
  select jsonb_build_object(
    'player_id', d.player_id, 'full_name', d.full_name, 'team_id', d.team_id,
    'player_class', d.player_class, 'position', d."position",
    'avg',  case when (b.metrics->>'AVG')  ~ '^-?[0-9.]+$' then (b.metrics->>'AVG')::numeric  else null end,
    'hr',   case when (b.metrics->>'HR')   ~ '^-?[0-9.]+$' then (b.metrics->>'HR')::numeric   else null end,
    'rbi',  case when (b.metrics->>'RBI')  ~ '^-?[0-9.]+$' then (b.metrics->>'RBI')::numeric  else null end,
    'r',    case when (b.metrics->>'R')    ~ '^-?[0-9.]+$' then (b.metrics->>'R')::numeric    else null end,
    'sb',   case when (b.metrics->>'SB')   ~ '^-?[0-9.]+$' then (b.metrics->>'SB')::numeric   else null end,
    'bb',   case when (b.metrics->>'BB')   ~ '^-?[0-9.]+$' then (b.metrics->>'BB')::numeric   else null end,
    'so',   case when (b.metrics->>'SO')   ~ '^-?[0-9.]+$' then (b.metrics->>'SO')::numeric   else null end,
    'h',    case when (b.metrics->>'H')    ~ '^-?[0-9.]+$' then (b.metrics->>'H')::numeric    else null end,
    'obp',  case when (b.metrics->>'OBP')  ~ '^-?[0-9.]+$' then (b.metrics->>'OBP')::numeric  else null end,
    'slg',  case when (b.metrics->>'SLG')  ~ '^-?[0-9.]+$' then (b.metrics->>'SLG')::numeric  else null end,
    'ops',  case when (b.metrics->>'OPS')  ~ '^-?[0-9.]+$' then (b.metrics->>'OPS')::numeric  else null end,
    'iso',  case when (b.metrics->>'ISO')  ~ '^-?[0-9.]+$' then (b.metrics->>'ISO')::numeric  else null end,
    'pa',   case when (b.metrics->>'PA')   ~ '^-?[0-9.]+$' then (b.metrics->>'PA')::numeric   else null end,
    'wrc_plus', case when (b.metrics->>'wRC+') ~ '^-?[0-9.]+$' then (b.metrics->>'wRC+')::numeric else null end,
    'woba', case when (b.metrics->>'wOBA') ~ '^-?[0-9.]+$' then (b.metrics->>'wOBA')::numeric else null end,
    'k_pct',  case when (b.metrics->>'K%') ~ '^-?[0-9.]+$' then (b.metrics->>'K%')::numeric   else null end,
    'bb_pct', case when (b.metrics->>'BB%') ~ '^-?[0-9.]+$' then (b.metrics->>'BB%')::numeric else null end
  ) j,
  (case when (b.metrics->>'wRC+') ~ '^-?[0-9.]+$' then (b.metrics->>'wRC+')::numeric else null end) wrc_sort
  from dim_players d
  join latest_hitter b on b.batter_id = d.player_id
  where case when (b.metrics->>'PA') ~ '^-?[0-9.]+$' then (b.metrics->>'PA')::numeric else 0 end > 0
) s;
$$;

create or replace function public.get_mlb_pitcher_directory()
returns jsonb language sql stable as $$
with latest_pitcher as (
  select i.pitcher_id, l.metrics
  from (select distinct pitcher_id from agg_pitcher where window_kind = 'fg_season') i
  cross join lateral (
    select metrics from agg_pitcher a
    where a.pitcher_id = i.pitcher_id and a.window_kind = 'fg_season'
    order by a.as_of desc limit 1
  ) l
)
select coalesce(jsonb_agg(j order by k_sort desc nulls last), '[]'::jsonb)
from (
  select jsonb_build_object(
    'player_id', d.player_id, 'full_name', d.full_name, 'team_id', d.team_id,
    'player_class', d.player_class, 'position', d."position",
    'w',    case when (p.metrics->>'W') ~ '^-?[0-9.]+$' then (p.metrics->>'W')::numeric else null end,
    'l',    case when (p.metrics->>'L') ~ '^-?[0-9.]+$' then (p.metrics->>'L')::numeric else null end,
    'sv',   case when (p.metrics->>'SV') ~ '^-?[0-9.]+$' then (p.metrics->>'SV')::numeric else null end,
    'hld',  case when (p.metrics->>'HLD') ~ '^-?[0-9.]+$' then (p.metrics->>'HLD')::numeric else null end,
    'era',  case when (p.metrics->>'ERA') ~ '^-?[0-9.]+$' then (p.metrics->>'ERA')::numeric else null end,
    'whip', case when (p.metrics->>'WHIP') ~ '^-?[0-9.]+$' then (p.metrics->>'WHIP')::numeric else null end,
    'k',    case when (p.metrics->>'SO') ~ '^-?[0-9.]+$' then (p.metrics->>'SO')::numeric else null end,
    'ip',   case when (p.metrics->>'IP') ~ '^-?[0-9.]+$' then (p.metrics->>'IP')::numeric else null end,
    'gs',   case when (p.metrics->>'GS') ~ '^-?[0-9.]+$' then (p.metrics->>'GS')::numeric else null end,
    'g',    case when (p.metrics->>'G') ~ '^-?[0-9.]+$' then (p.metrics->>'G')::numeric else null end,
    'fip',  case when (p.metrics->>'FIP') ~ '^-?[0-9.]+$' then (p.metrics->>'FIP')::numeric else null end,
    'siera',case when (p.metrics->>'SIERA') ~ '^-?[0-9.]+$' then (p.metrics->>'SIERA')::numeric else null end,
    'k9',   case when (p.metrics->>'K/9') ~ '^-?[0-9.]+$' then (p.metrics->>'K/9')::numeric else null end,
    'bb9',  case when (p.metrics->>'BB/9') ~ '^-?[0-9.]+$' then (p.metrics->>'BB/9')::numeric else null end,
    'bf',   case when (p.metrics->>'TBF') ~ '^-?[0-9.]+$' then (p.metrics->>'TBF')::numeric else null end
  ) j,
  coalesce(case when (p.metrics->>'SO') ~ '^-?[0-9.]+$' then (p.metrics->>'SO')::numeric else null end, 0) k_sort
  from dim_players d
  join latest_pitcher p on p.pitcher_id = d.player_id
  where case when (p.metrics->>'IP') ~ '^-?[0-9.]+$' then (p.metrics->>'IP')::numeric else 0 end > 0
) s;
$$;

grant execute on function public.get_mlb_hitter_directory() to anon, authenticated, service_role;
grant execute on function public.get_mlb_pitcher_directory() to anon, authenticated, service_role;