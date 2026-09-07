-- ============================================================================
-- Poker Near Me freshness RPC: indexed daily static servability evidence
-- Migration: 20260907038000_pnm_freshness_daily_static_evidence_index.sql
-- ============================================================================
-- The private eight-check RPC evaluated multiple text/time/source regexes over
-- the entire daily table on every call. PostgREST's statement budget made that
-- intermittently return 57014 even though the same call sometimes completed in
-- ~9 seconds. Persist immutable evidence at write time and read it through a
-- partial covering index; timestamp/recurrence freshness remains evaluated at
-- request time.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $realtime_lock$
begin
  if to_regclass('realtime.subscription') is not null then
    execute 'lock table realtime.subscription in access exclusive mode';
  end if;
end
$realtime_lock$;

do $preflight$
declare
  v_definition text;
  v_source_count bigint;
  v_source_md5 text;
begin
  if to_regclass('public.venue_daily_tournaments') is null
     or to_regprocedure('public.pnm_freshness_invariants()') is null then
    raise exception 'pre-flight failed: daily table or freshness RPC is missing';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'venue_daily_tournaments'
       and column_name = 'scrape_source'
       and data_type = 'text'
  ) then
    raise exception 'pre-flight failed: applied 037 scrape_source column is missing';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'venue_daily_tournaments'
       and column_name in (
         'pnm_verified_morning_evidence', 'pnm_reader_static_servable'
       )
  ) then
    raise exception 'pre-flight failed: daily generated evidence columns already exist';
  end if;

  select count(*), md5(string_agg(id::text, E'\n' order by id))
    into v_source_count, v_source_md5
    from public.venue_daily_tournaments
   where scrape_source = 'pokeratlas';
  if v_source_count <> 76
     or v_source_md5 <> '1819593f1326f6fc64192ad460725921' then
    raise exception 'pre-flight failed: 037 source cohort drifted count=% md5=%',
      v_source_count, v_source_md5;
  end if;

  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;
  if v_definition not like '%scrape_source = ''pokeratlas''%'
     or v_definition not like '%between 480 and 599%'
     or v_definition not like '%scrape_batch_id::text ~*%'
     or v_definition like '%where not time_is_parseable%' then
    raise exception 'pre-flight failed: applied 037 morning/RPC contract drifted';
  end if;
end
$preflight$;

alter table public.venue_daily_tournaments
  add column pnm_verified_morning_evidence boolean generated always as (
    start_time ~* '^0?[89](?::[0-5][0-9](?::[0-5][0-9])?)?[[:space:]]*AM$'
    and data_quality = 'scraped_verified'
    and scrape_source = 'pokeratlas'
    and btrim(source_url) ~* '^https://(www\.)?pokeratlas\.com/poker-room/[^/?#[:space:]]+/tournaments/?([?#][^[:space:]]*)?$'
    and scrape_html_hash ~ '^[0-9A-Fa-f]{64}$'
    and scrape_html_hash !~ '^0{64}$'
    and scrape_batch_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and buy_in between 20 and 100000
  ) stored,
  add column pnm_reader_static_servable boolean generated always as (
    is_active
    and is_suppressed is not true
    and data_quality in (
      'scraped_verified', 'scraped_inferred', 'manual_research'
    )
    and btrim(coalesce(tournament_name, '')) <> ''
    and btrim(coalesce(venue_name, '')) <> ''
    and left(ltrim(tournament_name), 1) not in ('@', '{', '[')
    and left(ltrim(venue_name), 1) not in ('@', '{', '[')
    and tournament_name !~* '(<|>|-->|(^|[[:space:]])(class|href|src|style|charset|content|data-[a-z0-9_-]+)[[:space:]]*=)'
    and venue_name !~* '(<|>|-->|(^|[[:space:]])(class|href|src|style|charset|content|data-[a-z0-9_-]+)[[:space:]]*=)'
    and tournament_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+)[[:space:]]*$'
    and venue_name !~* '&(#[x]?[0-9a-f]+|[a-z][a-z0-9]+)[[:space:]]*$'
    and not coalesce(flags, '[]'::jsonb) ?| array[
      'pnm_public_text_quarantine_20260907', 'quarantined', 'suppressed'
    ]
    and (
      btrim(coalesce(start_time, '')) = ''
      or lower(btrim(start_time)) in ('tbd', 'unknown', 'to be announced')
      or btrim(start_time) ~* '^(?:(?:10|11)(?::[0-5][0-9](?::[0-5][0-9])?)?[[:space:]]*AM|(?:0?[1-9]|1[0-2])(?::[0-5][0-9](?::[0-5][0-9])?)?[[:space:]]*PM|(?:1[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?)$'
      or (
        start_time ~* '^0?[89](?::[0-5][0-9](?::[0-5][0-9])?)?[[:space:]]*AM$'
        and data_quality = 'scraped_verified'
        and scrape_source = 'pokeratlas'
        and btrim(source_url) ~* '^https://(www\.)?pokeratlas\.com/poker-room/[^/?#[:space:]]+/tournaments/?([?#][^[:space:]]*)?$'
        and scrape_html_hash ~ '^[0-9A-Fa-f]{64}$'
        and scrape_html_hash !~ '^0{64}$'
        and scrape_batch_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and buy_in between 20 and 100000
      )
    )
  ) stored;

comment on column public.venue_daily_tournaments.pnm_verified_morning_evidence is
  'Immutable source/time/provenance portion of the verified 8:00-9:59 AM public-reader contract.';
comment on column public.venue_daily_tournaments.pnm_reader_static_servable is
  'Immutable daily public-reader predicates; timestamp and recurrence freshness remain request-time checks.';

create index idx_vdt_pnm_freshness_servable
  on public.venue_daily_tournaments (
    scrape_timestamp desc, venue_id, event_date, last_scraped, is_recurring
  ) include (flags, pnm_verified_morning_evidence)
  where pnm_reader_static_servable;

do $replace_contract$
declare
  v_definition text;
  v_updated text;
  v_old_daily_candidates constant text := $old_daily_candidates$
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
     where btrim(coalesce(start_time, '')) = ''
        or lower(btrim(start_time)) in ('tbd', 'unknown', 'to be announced')
        or (
          time_is_parseable
          and parsed_minute between 0 and 59
          and (
            (parsed_period in ('AM', 'PM') and parsed_hour between 1 and 12)
            or (parsed_period = '' and parsed_hour between 0 and 23)
          )
          and (
            case
              when parsed_period = 'PM' and parsed_hour <> 12
                then (parsed_hour + 12) * 60 + parsed_minute
              when parsed_period = 'AM' and parsed_hour = 12
                then parsed_minute
              else parsed_hour * 60 + parsed_minute
            end >= 600
            or (
              case
                when parsed_period = 'AM' and parsed_hour = 12
                  then parsed_minute
                else parsed_hour * 60 + parsed_minute
              end between 480 and 599
              and parsed_period = 'AM'
              and data_quality = 'scraped_verified'
              and scrape_source = 'pokeratlas'
              and btrim(source_url) ~* '^https://(www\.)?pokeratlas\.com/poker-room/[^/?#[:space:]]+/tournaments/?([?#][^[:space:]]*)?$'
              and scrape_html_hash ~ '^[0-9A-Fa-f]{64}$'
              and scrape_html_hash !~ '^0{64}$'
              and scrape_batch_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              and coalesce(last_scraped, scrape_timestamp) <= now()
              and buy_in between 20 and 100000
            )
          )
        )
  ),
$old_daily_candidates$;
  v_new_daily_candidates constant text := $new_daily_candidates$
  with daily_candidates as materialized (
    select d.venue_id, d.event_date, d.scrape_timestamp
      from public.venue_daily_tournaments d
     where d.pnm_reader_static_servable
       and d.scrape_timestamp <= now()
       and (
         not d.pnm_verified_morning_evidence
         or coalesce(d.last_scraped, d.scrape_timestamp) <= now()
       )
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
    select * from daily_candidates
  ),
$new_daily_candidates$;
begin
  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;
  if length(v_definition) - length(replace(v_definition, v_old_daily_candidates, ''))
       <> length(v_old_daily_candidates) then
    raise exception 'pre-flight failed: expected one 037 daily CTE block';
  end if;
  v_updated := replace(v_definition, v_old_daily_candidates, v_new_daily_candidates);
  execute v_updated;
end
$replace_contract$;

revoke all on function public.pnm_freshness_invariants() from public;
revoke all on function public.pnm_freshness_invariants() from anon;
revoke all on function public.pnm_freshness_invariants() from authenticated;
grant execute on function public.pnm_freshness_invariants() to service_role;

comment on function public.pnm_freshness_invariants() is
  'Service-role PNM freshness checks using indexed static daily evidence plus fail-closed public tour, series and live reader predicates.';

do $post_apply$
declare
  v_definition text;
  v_morning_count bigint;
  v_morning_md5 text;
  v_false_morning bigint;
  v_index_valid boolean;
  v_check_names text[];
  v_failed_checks text[];
begin
  select count(*), md5(string_agg(id::text, E'\n' order by id))
    into v_morning_count, v_morning_md5
    from public.venue_daily_tournaments
   where pnm_verified_morning_evidence;
  select count(*) into v_false_morning
    from public.venue_daily_tournaments
   where pnm_verified_morning_evidence
     and (
       scrape_source <> 'pokeratlas'
       or data_quality <> 'scraped_verified'
       or start_time !~* '^0?[89](?::[0-5][0-9](?::[0-5][0-9])?)?[[:space:]]*AM$'
     );
  if v_morning_count <> 76
     or v_morning_md5 <> '1819593f1326f6fc64192ad460725921'
     or v_false_morning <> 0 then
    raise exception
      'post-apply failed: generated morning evidence drifted count=% md5=% false=%',
      v_morning_count, v_morning_md5, v_false_morning;
  end if;

  select i.indisvalid and i.indisready
    into v_index_valid
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where c.relname = 'idx_vdt_pnm_freshness_servable';
  if v_index_valid is not true then
    raise exception 'post-apply failed: freshness evidence index is not valid';
  end if;

  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;
  if v_definition not like '%d.pnm_reader_static_servable%'
     or v_definition not like '%not d.pnm_verified_morning_evidence%'
     or v_definition like '%time_is_parseable%'
     or v_definition like '%select d.*%' then
    raise exception 'post-apply failed: indexed daily RPC plan is missing';
  end if;

  with checks as materialized (
    select * from public.pnm_freshness_invariants()
  )
  select array_agg(check_name order by check_name),
         array_agg(check_name order by check_name) filter (where not ok)
    into v_check_names, v_failed_checks
    from checks;
  if v_check_names is distinct from array[
    'calendar_inventory_floor',
    'charity_rows_written_8d',
    'daily_tournaments_breadth_36h',
    'daily_tournaments_written_36h',
    'live_tables_written_3h',
    'no_sim_rows_claiming_scraped',
    'series_scraped_4d',
    'tour_stops_scraped_4d'
  ]::text[] or coalesce(cardinality(v_failed_checks), 0) <> 0 then
    raise exception 'post-apply failed: freshness checks drifted names=% failed=%',
      v_check_names, v_failed_checks;
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
-- Use a new forward migration to restore the 037 CTE body before dropping the
-- generated columns/index. Never mutate this applied migration in place.
