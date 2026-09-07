-- ============================================================================
-- Poker Near Me freshness checks must measure rows public readers can serve
-- Migration: 20260907020500_pnm_freshness_servable_quality_contract.sql
-- ============================================================================
-- A newly written stale/quarantined row must never keep production monitoring
-- green. This append-only replacement preserves the private RPC contract while
-- constraining every freshness family to the same activity, quality, text,
-- recurring-age and time-safety vocabulary used by public readers.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $preflight$
declare
  v_definition text;
begin
  if to_regprocedure('public.pnm_freshness_invariants()') is null then
    raise exception 'pre-flight failed: pnm_freshness_invariants() is missing';
  end if;

  if to_regclass('public.venue_daily_tournaments') is null
     or to_regclass('public.poker_venues') is null
     or to_regclass('public.venue_live_tables') is null
     or to_regclass('public.tour_stop_events') is null
     or to_regclass('public.poker_series') is null then
    raise exception 'pre-flight failed: a Poker Near Me freshness table is missing';
  end if;

  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;
  if v_definition not like '%tour_stops_scraped_4d%'
     or v_definition not like '%series_scraped_4d%' then
    raise exception 'pre-flight failed: prior freshness RPC contract drifted';
  end if;
end
$preflight$;

create or replace function public.pnm_freshness_invariants()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public
as $function$
  with daily_candidates as materialized (
    select d.*,
           btrim(coalesce(d.start_time, '')) ~*
             '^([0-9]{1,2}:[0-9]{2}(:[0-9]{2})?[[:space:]]*([AP]M)?|[0-9]{1,2}[[:space:]]*[AP]M)$'
             as time_is_parseable,
           substring(btrim(coalesce(d.start_time, '')) from '^([0-9]{1,2})')::integer
             as parsed_hour,
           case
             when position(':' in coalesce(d.start_time, '')) > 0
               then substring(btrim(d.start_time) from '^[0-9]{1,2}:([0-9]{2})')::integer
             else 0
           end as parsed_minute,
           upper(coalesce(
             substring(btrim(coalesce(d.start_time, '')) from '([AP]M)$'), ''
           )) as parsed_period
      from public.venue_daily_tournaments d
     where d.is_active
       and d.is_suppressed is not true
       and d.data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
       and d.scrape_timestamp <= now()
       and btrim(coalesce(d.tournament_name, '')) <> ''
       and btrim(coalesce(d.venue_name, '')) <> ''
       and left(ltrim(d.tournament_name), 1) not in ('@', '{', '[')
       and left(ltrim(d.venue_name), 1) not in ('@', '{', '[')
       and d.tournament_name !~* '(<|>|-->|(^|[[:space:]])(class|href|src|style|charset|content|data-[a-z0-9_-]+)[[:space:]]*=)'
       and d.venue_name !~* '(<|>|-->|(^|[[:space:]])(class|href|src|style|charset|content|data-[a-z0-9_-]+)[[:space:]]*=)'
       and d.tournament_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+)[[:space:]]*$'
       and d.venue_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+)[[:space:]]*$'
       and not coalesce(d.flags, '[]'::jsonb) ?| array[
         'pnm_public_text_quarantine_20260907', 'quarantined', 'suppressed'
       ]
       and (
         not (
           d.is_recurring is true
           or coalesce(d.flags, '[]'::jsonb) ? 'pnm_recurring_projection'
           or d.event_date is null
           or d.event_date = date '1970-01-01'
         )
         or coalesce(d.last_scraped, d.scrape_timestamp)
              between now() - interval '30 days' and now()
       )
  ),
  servable_daily as materialized (
    select *
      from daily_candidates
     where not time_is_parseable
        or (
          parsed_minute between 0 and 59
          and (
            (parsed_period in ('AM', 'PM') and parsed_hour between 1 and 12)
            or (parsed_period = '' and parsed_hour between 0 and 23)
          )
          and case
            when parsed_period = 'PM' and parsed_hour <> 12
              then (parsed_hour + 12) * 60 + parsed_minute
            when parsed_period = 'AM' and parsed_hour = 12
              then parsed_minute
            else parsed_hour * 60 + parsed_minute
          end >= 600
        )
  ),
  servable_tours as materialized (
    select *
      from public.tour_stop_events
     where data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
       and scrape_timestamp <= now()
  ),
  servable_series as materialized (
    select *
      from public.poker_series
     where data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
       and is_suppressed is not true
       and scrape_timestamp <= now()
  ),
  servable_live as materialized (
    select *
      from public.venue_live_tables
     where scrape_timestamp <= now()
       and (
         (observation_kind = 'observed' and data_quality = 'scraped_verified')
         or (observation_kind = 'modeled' and data_quality = 'simulated')
         or (observation_kind = 'catalog' and data_quality = 'catalog_verified')
       )
  )
  select 'daily_tournaments_written_36h'::text,
         coalesce(max(scrape_timestamp) >= now() - interval '36 hours', false),
         'servable venue_daily_tournaments newest scrape: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from servable_daily

  union all

  select 'daily_tournaments_breadth_36h',
         count(distinct venue_id) >= 25,
         count(distinct venue_id)::text
           || ' distinct venues scraped in last 36h (floor 25)'
    from servable_daily
   where scrape_timestamp >= now() - interval '36 hours'

  union all

  select 'charity_rows_written_8d',
         coalesce(max(d.scrape_timestamp) >= now() - interval '8 days', false),
         'newest charity-venue scrape: '
           || coalesce(max(d.scrape_timestamp)::text, 'never')
    from servable_daily d
    join public.poker_venues v on v.id = d.venue_id
   where lower(coalesce(v.venue_type, '')) like '%charity%'
     and v.is_active is not false
     and v.is_suppressed is not true

  union all

  select 'tour_stops_scraped_4d',
         coalesce(max(scrape_timestamp) >= now() - interval '4 days', false),
         'servable tour_stop_events newest scrape: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from servable_tours

  union all

  select 'series_scraped_4d',
         coalesce(max(scrape_timestamp) >= now() - interval '4 days', false),
         'servable poker_series newest scrape: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from servable_series

  union all

  select 'live_tables_written_3h',
         coalesce(max(scrape_timestamp) >= now() - interval '3 hours', false),
         'servable observed, modeled or catalog venue_live_tables newest: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from servable_live

  union all

  select 'calendar_inventory_floor',
         count(*) >= 1000,
         count(*)::text || ' servable future daily rows (floor 1000)'
    from servable_daily
   where event_date >= current_date

  union all

  select 'no_sim_rows_claiming_scraped',
         count(*) = 0,
         count(*)::text || ' sim-batch rows labeled scraped_verified'
    from public.venue_live_tables
   where scrape_batch_id like 'sim-%'
     and data_quality = 'scraped_verified';
$function$;

revoke all on function public.pnm_freshness_invariants() from public;
revoke all on function public.pnm_freshness_invariants() from anon;
revoke all on function public.pnm_freshness_invariants() from authenticated;
grant execute on function public.pnm_freshness_invariants() to service_role;

comment on function public.pnm_freshness_invariants() is
  'Service-role PNM freshness checks; every family counts only public-servable evidence.';

do $post_apply$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;

  if v_definition not like '%servable_daily%'
     or v_definition not like '%d.is_active%'
     or v_definition not like '%d.is_suppressed is not true%'
     or v_definition not like '%time_is_parseable%'
     or v_definition not like '%servable_tours%'
     or v_definition not like '%servable_series%'
     or v_definition not like '%servable_live%'
     or v_definition not like '%observation_kind = ''catalog''%' then
    raise exception 'post-apply failed: public-servability filters are missing';
  end if;

  if not has_function_privilege(
    'service_role', 'public.pnm_freshness_invariants()', 'EXECUTE'
  ) then
    raise exception 'post-apply failed: service_role cannot execute freshness RPC';
  end if;

  if has_function_privilege(
    'anon', 'public.pnm_freshness_invariants()', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'public.pnm_freshness_invariants()', 'EXECUTE'
  ) then
    raise exception 'post-apply failed: freshness RPC is exposed to application roles';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK:
-- Restore a prior pnm_freshness_invariants() definition only if public readers
-- intentionally change their servability contract.
