-- MLB Model Intel RPC
-- Target project: MLB analytics engine DB (nscdmxldtyszyvcxxwgr), NOT the main hub DB.
-- Purpose: bound the /api/mlb/model-intel payload and guarantee a CORRECT cumulative
-- P&L curve + KPIs regardless of how large v_backtest_summary grows. The old API
-- selected raw rows with .limit(2000); Supabase clamps oversized limits, which would
-- silently truncate the equity-curve baseline and total-bet count once the view passes
-- the row cap. Aggregating server-side (one row per date) fixes that permanently.
--
-- Returns a single JSONB object:
--   kpi           : { total_bets, graded_predictions, markets_tracked, avg_brier,
--                     avg_clv, overall_roi, data_through }
--   model_version : real version string stamped on the sim_bets ledger (or null)
--   recent_roi    : bets-weighted portfolio ROI over the most recent 14 active dates
--   history       : [{ date, bets, pnl, cum_pnl, roi }]  (one row per date, asc)
--   markets       : [{ market, n, bets, brier, avg_clv, roi, units }]  (n desc)
--   bet_types     : [{ bet_type, category, sample_n, win_pct, roi, avg_clv,
--                      status, score_mult }]  (sample_n desc)
--
-- Brier / CLV are n-weighted across graded predictions (calibration quality).
-- ROI is a TRUE portfolio return (total unit profit / total bets placed), matching
-- the proven aggregation in pages/api/mlb/accuracy.ts.

create or replace function public.get_mlb_model_intel()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with src as (
  select
    date,
    market,
    coalesce(n, 0)::bigint                as n,
    coalesce(bet_count, 0)::bigint        as bets,
    coalesce(sum_unit_profit, 0)::numeric as profit,
    brier::numeric                        as brier,
    avg_clv::numeric                      as clv
  from v_backtest_summary
),
daily as (
  select
    date,
    sum(bets)::bigint                                            as bets,
    sum(profit)::numeric                                         as profit,
    sum(n)::bigint                                               as graded,
    sum(case when brier is not null then brier * n end)::numeric as brier_num,
    sum(case when brier is not null then n else 0 end)::bigint   as brier_den,
    sum(case when clv   is not null then clv   * n end)::numeric as clv_num,
    sum(case when clv   is not null then n else 0 end)::bigint   as clv_den
  from src
  group by date
),
daily_curve as (
  select
    date, bets, profit, graded,
    case when brier_den > 0 then round(brier_num / brier_den, 4) end as brier,
    case when clv_den   > 0 then round(clv_num   / clv_den,   2) end as avg_clv,
    case when bets > 0 then round((profit / bets) * 100, 2) else 0 end as roi,
    round(sum(profit) over (order by date rows between unbounded preceding and current row), 2) as cum_pnl
  from daily
),
hist as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'date',    to_char(date, 'YYYY-MM-DD'),
           'bets',    bets,
           'pnl',     round(profit, 2),
           'cum_pnl', cum_pnl,
           'roi',     roi
         ) order by date), '[]'::jsonb) as data
  from daily_curve
),
mkt as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc), '[]'::jsonb) as data
  from (
    select
      market,
      sum(n)::bigint    as n,
      sum(bets)::bigint as bets,
      case when sum(case when brier is not null then n else 0 end) > 0
           then round(sum(case when brier is not null then brier * n end)
                      / sum(case when brier is not null then n else 0 end), 4) end as brier,
      case when sum(case when clv is not null then n else 0 end) > 0
           then round(sum(case when clv is not null then clv * n end)
                      / sum(case when clv is not null then n else 0 end), 2) end as avg_clv,
      case when sum(bets) > 0 then round((sum(profit) / sum(bets)) * 100, 2) end as roi,
      round(sum(profit), 2) as units
    from src
    group by market
  ) x
),
recent as (
  select case when sum(bets) > 0 then round((sum(profit) / sum(bets)) * 100, 2) else 0 end as roi
  from (select bets, profit from daily order by date desc limit 14) r
),
bt as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'bet_type',   bet_type,
           'category',   category,
           'sample_n',   coalesce(sample_n, 0),
           'win_pct',    win_pct,
           'roi',        roi,
           'avg_clv',    avg_clv,
           'status',     status,
           'score_mult', score_mult
         ) order by sample_n desc nulls last), '[]'::jsonb) as data
  from bet_type_reliability
),
kpi as (
  select
    coalesce(sum(bets), 0)::bigint   as total_bets,
    coalesce(sum(graded), 0)::bigint as graded_predictions,
    (select count(distinct market) from src) as markets_tracked,
    case when sum(brier_den) > 0 then round(sum(brier_num) / sum(brier_den), 4) end as avg_brier,
    case when sum(clv_den)   > 0 then round(sum(clv_num)   / sum(clv_den),   2) end as avg_clv,
    case when sum(bets) > 0 then round((sum(profit) / sum(bets)) * 100, 2) end as overall_roi,
    to_char(max(date), 'YYYY-MM-DD') as data_through
  from daily
)
select jsonb_build_object(
  'kpi',           (select to_jsonb(k) from kpi k),
  'model_version', (select model_version from sim_bets where model_version is not null order by as_of_ts desc limit 1),
  'recent_roi',    (select roi from recent),
  'history',       (select data from hist),
  'markets',       (select data from mkt),
  'bet_types',     (select data from bt)
);
$$;

grant execute on function public.get_mlb_model_intel() to anon, authenticated, service_role;
