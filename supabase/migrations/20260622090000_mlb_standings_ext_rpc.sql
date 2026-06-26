-- Engine DB (nscdmxldtyszyvcxxwgr) migration — applied via Supabase MCP on 2026-06-22.
-- Adds get_mlb_standings_ext(): enriched standings used by /api/mlb/standings so the
-- Players-page team selector can show ERA / AVG / R-G / RA-G (previously "--" because
-- v_mlb_standings has no era/team_avg/runs_per_game/runs_allowed_per_game columns).
--
-- R/G and RA/G are computed from the view's rs/ra/gp. ERA/WHIP come from the latest
-- agg_team(window_kind='pitching') snapshot; team AVG/OBP/SLG/OPS from the latest
-- agg_team(window_kind='fg_hitting') snapshot. agg_team is rewritten by the engine's
-- daily pipeline, so these values refresh every day with no extra job.
create or replace function public.get_mlb_standings_ext()
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(s) || jsonb_build_object(
        'runs_per_game',         NULL::numeric,
        'runs_allowed_per_game', NULL::numeric,
        'era',       p.era,
        'whip',      NULL::numeric,
        'team_avg',  h.avg,
        'team_obp',  h.obp,
        'team_slg',  h.slg,
        'team_ops',  h.ops
      )
      order by s.league, s.division, s.pct desc nulls last
    ),
    '[]'::jsonb
  )
  from v_mlb_standings s
  left join lateral (
    select era from agg_team
    where team_id = s.team_id and window_kind = 'pitching'
    order by as_of desc limit 1
  ) p on true
  left join lateral (
    select avg, obp, slg, ops from agg_team
    where team_id = s.team_id and window_kind = 'fg_hitting'
    order by as_of desc limit 1
  ) h on true;
$$;

grant execute on function public.get_mlb_standings_ext() to anon, authenticated, service_role;
