-- ============================================================================
-- Poker Near Me freshness invariant contract
-- Migration: 20260907015000_pnm_freshness_invariants_contract.sql
-- ============================================================================
-- The production watchdog calls this RPC with the service role. The function
-- previously existed only as manual database state, so a clean migration
-- replay could not reproduce the watchdog dependency.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $preflight$
begin
  if to_regclass('public.venue_daily_tournaments') is null
     or to_regclass('public.poker_venues') is null
     or to_regclass('public.tour_stop_events') is null
     or to_regclass('public.poker_series') is null
     or to_regclass('public.venue_live_tables') is null then
    raise exception 'pre-flight failed: a Poker Near Me freshness source table is missing';
  end if;
end
$preflight$;

create or replace function public.pnm_freshness_invariants()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public
as $function$
  select 'daily_tournaments_written_36h'::text,
         coalesce(max(scrape_timestamp) >= now() - interval '36 hours', false),
         'venue_daily_tournaments newest scrape: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from public.venue_daily_tournaments

  union all

  select 'daily_tournaments_breadth_36h',
         count(distinct venue_id) >= 25,
         count(distinct venue_id)::text
           || ' distinct venues scraped in last 36h (floor 25)'
    from public.venue_daily_tournaments
   where scrape_timestamp >= now() - interval '36 hours'

  union all

  select 'charity_rows_written_8d',
         coalesce(max(d.scrape_timestamp) >= now() - interval '8 days', false),
         'newest charity-venue scrape: '
           || coalesce(max(d.scrape_timestamp)::text, 'never')
    from public.venue_daily_tournaments d
    join public.poker_venues v on v.id = d.venue_id
   where lower(coalesce(v.venue_type, '')) like '%charity%'

  union all

  select 'tour_stops_scraped_4d',
         coalesce(max(scrape_timestamp) >= now() - interval '4 days', false),
         'tour_stop_events newest scrape: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from public.tour_stop_events

  union all

  select 'series_scraped_4d',
         coalesce(max(scrape_timestamp) >= now() - interval '4 days', false),
         'poker_series newest scrape: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from public.poker_series

  union all

  select 'live_tables_written_3h',
         coalesce(max(scrape_timestamp) >= now() - interval '3 hours', false),
         'venue_live_tables newest: '
           || coalesce(max(scrape_timestamp)::text, 'never')
    from public.venue_live_tables

  union all

  select 'calendar_inventory_floor',
         count(*) >= 1000,
         count(*)::text
           || ' active future visible-quality daily rows (floor 1000)'
    from public.venue_daily_tournaments
   where is_active
     and event_date >= current_date
     and data_quality in ('scraped_verified', 'scraped_inferred')

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
  'Service-role Poker Near Me freshness and provenance checks used by the daily watchdog.';

do $post_apply$
begin
  if not has_function_privilege(
    'service_role',
    'public.pnm_freshness_invariants()',
    'EXECUTE'
  ) then
    raise exception 'post-apply failed: service_role cannot execute freshness RPC';
  end if;

  if has_function_privilege(
    'anon',
    'public.pnm_freshness_invariants()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.pnm_freshness_invariants()',
    'EXECUTE'
  ) then
    raise exception 'post-apply failed: freshness RPC is exposed to public application roles';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK:
-- drop function if exists public.pnm_freshness_invariants();
