-- ============================================================================
-- Poker Near Me freshness reader parity: fail-closed identity hardening
-- Migration: 20260907036000_pnm_freshness_fail_closed_identity_contract.sql
-- ============================================================================
-- 035 aligned the freshness cohorts with the public readers' primary evidence
-- rules. This forward-only follow-up closes the remaining parser edge cases:
-- punctuation/entity-only tour identity and URL authorities accepted by a
-- permissive SQL regex but rejected by the JavaScript URL reader. Applied
-- migrations remain immutable; this migration patches only the private RPC.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $replace_contract$
declare
  v_definition text;
  v_updated text;
  v_old_tour constant text := $old_tour$
       and btrim(coalesce(stop_name, '')) <> ''
       and btrim(coalesce(event_name, '')) <> ''
$old_tour$;
  v_new_tour constant text := $new_tour$
       and btrim(coalesce(stop_name, '')) <> ''
       and btrim(coalesce(event_name, '')) <> ''
       and stop_name ~ '[A-Za-z0-9]'
       and event_name ~ '[A-Za-z0-9]'
       and stop_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+);'
       and event_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+);'
$new_tour$;
  v_old_series_url constant text := $old_series_url$
       and (
         case
           when nullif(btrim(source_url), '') is not null
             then btrim(source_url)
           else btrim(scrape_url)
         end
       ) ~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
$old_series_url$;
  v_new_series_url constant text := $new_series_url$
       and (
         case
           when source_url is not null and source_url <> ''
             then btrim(source_url)
           else btrim(scrape_url)
         end
       ) ~* '^https?://[a-z0-9]([a-z0-9._-]*[a-z0-9])?([:][0-9]{1,4})?([/?#][^[:space:]]*)?$'
       and (
         case
           when source_url is not null and source_url <> ''
             then btrim(source_url)
           else btrim(scrape_url)
         end
       ) ~* '^https?://[a-z0-9._-]*[a-z]'
$new_series_url$;
begin
  if to_regprocedure('public.pnm_freshness_invariants()') is null then
    raise exception 'pre-flight failed: pnm_freshness_invariants() is missing';
  end if;

  if to_regclass('public.tour_stop_events') is null
     or to_regclass('public.poker_series') is null then
    raise exception 'pre-flight failed: a reader-parity source table is missing';
  end if;

  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;

  if v_definition not like '%start_date is not null or stop_start_date is not null%'
     or v_definition not like '%scrape_html_hash !~ ''^0{64}$''%'
     or v_definition not like '%community_verified%'
     or v_definition not like '%venue_reported%' then
    raise exception 'pre-flight failed: 035 reader-parity contract drifted';
  end if;

  v_updated := v_definition;

  if v_updated not like '%event_name ~ ''[A-Za-z0-9]''%'
     or v_updated not like '%stop_name ~ ''[A-Za-z0-9]''%' then
    if length(v_updated) - length(replace(v_updated, v_old_tour, ''))
         <> length(v_old_tour) then
      raise exception 'pre-flight failed: expected one tour identity insertion point';
    end if;
    v_updated := replace(v_updated, v_old_tour, v_new_tour);
  end if;

  if v_updated not like '%source_url is not null and source_url <> ''''%'
     or v_updated not like '%[a-z0-9._-]*[a-z]%' then
    if length(v_updated) - length(replace(v_updated, v_old_series_url, ''))
         <> length(v_old_series_url) then
      raise exception 'pre-flight failed: expected one series URL insertion point';
    end if;
    v_updated := replace(v_updated, v_old_series_url, v_new_series_url);
  end if;

  if v_updated is distinct from v_definition then
    execute v_updated;
  end if;
end
$replace_contract$;

revoke all on function public.pnm_freshness_invariants() from public;
revoke all on function public.pnm_freshness_invariants() from anon;
revoke all on function public.pnm_freshness_invariants() from authenticated;
grant execute on function public.pnm_freshness_invariants() to service_role;

comment on function public.pnm_freshness_invariants() is
  'Service-role PNM freshness checks aligned fail-closed with public daily, tour, series and live readers.';

do $post_apply$
declare
  v_definition text;
  v_check_names text[];
begin
  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;

  if v_definition not like '%event_name ~ ''[A-Za-z0-9]''%'
     or v_definition not like '%stop_name ~ ''[A-Za-z0-9]''%'
     or v_definition not like '%event_name !~* ''&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+);''%'
     or v_definition not like '%stop_name !~* ''&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+);''%'
     or v_definition not like '%source_url is not null and source_url <> ''''%'
     or v_definition not like '%[a-z0-9]([a-z0-9._-]*[a-z0-9])?%'
     or v_definition not like '%[a-z0-9._-]*[a-z]%' then
    raise exception 'post-apply failed: fail-closed identity predicates are missing';
  end if;

  select array_agg(check_name order by check_name)
    into v_check_names
    from public.pnm_freshness_invariants();

  if v_check_names is distinct from array[
    'calendar_inventory_floor',
    'charity_rows_written_8d',
    'daily_tournaments_breadth_36h',
    'daily_tournaments_written_36h',
    'live_tables_written_3h',
    'no_sim_rows_claiming_scraped',
    'series_scraped_4d',
    'tour_stops_scraped_4d'
  ]::text[] then
    raise exception 'post-apply failed: freshness RPC check surface drifted: %',
      v_check_names;
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
-- Restore the 035 RPC definition with a new forward migration only if the
-- public reader intentionally begins accepting these malformed identities.
