DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v_backtest_summary' AND column_name = 'market'
  ) THEN
    EXECUTE $func$
CREATE OR REPLACE FUNCTION public.get_mlb_model_intel()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $_$
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
),
clv_trend_calc as (
  select
    to_char(date, 'YYYY-MM-DD') as date,
    sum(clv_num) over (order by date rows between 13 preceding and current row) as w_clv_num,
    sum(clv_den) over (order by date rows between 13 preceding and current row) as w_clv_den,
    row_number() over (order by date) as rn
  from daily
),
clv_trend as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', date,
           'rolling_clv', case when w_clv_den > 0 then round(w_clv_num / w_clv_den, 2) else 0 end
         ) order by date), '[]'::jsonb) as data
  from clv_trend_calc
  where rn >= 14
),
td as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',            to_char(date, 'YYYY-MM-DD'),
    'market',          lower(market),
    'n',               n,
    'brier',           brier,
    'avg_clv',         clv,
    'sum_unit_profit', profit,
    'bet_count',       bets
  ) order by date desc), '[]'::jsonb) as data
  from src
)
select jsonb_build_object(
  'kpi',           (select to_jsonb(k) from kpi k),
  'model_version', (select model_version from sim_bets where model_version is not null order by as_of_ts desc limit 1),
  'recent_roi',    (select roi from recent),
  'history',       (select data from hist),
  'table_data',    (select data from td),
  'markets',       (select data from mkt),
  'bet_types',     (select data from bt),
  'clv_trend',     (select data from clv_trend),
  'calibration',   '[]'::jsonb
);
$_$;
    $func$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_mlb_model_intel() TO anon, authenticated, service_role;';
  ELSE
    RAISE NOTICE 'Skipping get_mlb_model_intel execution: v_backtest_summary is missing the market column. This is expected if running against the HUB database instead of the MLB engine database.';
  END IF;
END $do$;
