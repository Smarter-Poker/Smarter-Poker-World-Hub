-- ============================================================================
-- Poker Near Me verified morning schedule contract
-- Migration: 20260907037000_pnm_verified_morning_schedule_contract.sql
-- ============================================================================
-- A blanket 10:00 AM public-reader floor hid legitimate morning tournaments.
-- It also protected the feed from a much larger legacy cohort containing
-- midnight, CSS, promotion and currency-parser artifacts. Restore only the
-- exact source-labelled PokerAtlas schedule cohort and persist the parser
-- discriminator that the daemon previously carried only in process memory.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Match Supabase Realtime's lock order before altering a publication table.
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
  v_count bigint;
  v_id_md5 text;
  v_horseshoe bigint;
  v_fortune bigint;
  v_lucky bigint;
begin
  if to_regclass('public.venue_daily_tournaments') is null
     or to_regprocedure('public.pnm_freshness_invariants()') is null then
    raise exception 'pre-flight failed: daily table or freshness RPC is missing';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'venue_daily_tournaments'
       and column_name = 'scrape_source'
  ) then
    raise exception 'pre-flight failed: venue_daily_tournaments.scrape_source already exists';
  end if;

  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;
  if v_definition not like '%event_name ~ ''[A-Za-z0-9]''%'
     or v_definition not like '%source_url is not null and source_url <> ''''%'
     or v_definition not like '%end >= 600%' then
    raise exception 'pre-flight failed: applied 036 freshness contract drifted';
  end if;

  with cohort as materialized (
    select d.*
      from public.venue_daily_tournaments d
     where d.is_active
       and d.is_suppressed is not true
       and d.data_quality = 'scraped_verified'
       and d.human_verified is not true
       and d.is_recurring is false
       and d.parent_tournament_id is not null
       and coalesce(d.flags, '[]'::jsonb) ? 'pnm_recurring_projection'
       and d.source_url = d.best_scrape_url
       and d.source_url ~* '^https://(www\.)?pokeratlas\.com/poker-room/[^/?#[:space:]]+/tournaments/?([?#][^[:space:]]*)?$'
       and d.scrape_html_hash ~ '^[0-9A-Fa-f]{64}$'
       and d.scrape_html_hash !~ '^0{64}$'
       and d.scrape_batch_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       and d.scrape_timestamp <= now()
       and coalesce(d.last_scraped, d.scrape_timestamp)
             between now() - interval '30 days' and now()
       and d.start_time ~* '^[89]:[0-5][0-9][[:space:]]*AM$'
       and d.buy_in between 20 and 100000
       and (
         (
           d.venue_id = 3123
           and d.venue_name = 'Horseshoe Las Vegas'
           and d.tournament_name = 'No Limit Hold''em 9:00AM $100 Buy In'
           and d.start_time = '9:00AM'
           and d.buy_in = 100
           and d.source_url = 'https://www.pokeratlas.com/poker-room/horseshoe-las-vegas/tournaments'
           and d.scrape_html_hash = 'dc9dda71e4a6174f4ca03826178980471aea04b122671dfdb3918d4ec04e5b0f'
           and d.scrape_batch_id = 'cae3ab95-07f1-4ba0-ab2f-edde5c823398'
         )
         or (
           d.venue_id = 3011
           and d.venue_name = 'Fortune Poker Room'
           and d.tournament_name in ('$1K Gtd. NLH', '$2,500 Gtd. NLH')
           and d.start_time = '8:30AM'
           and d.buy_in = 60
           and d.source_url = 'https://www.pokeratlas.com/poker-room/fortune-poker-room-renton/tournaments'
           and d.scrape_html_hash = '252fe560338a99c0aa6d501aca5cc845b326abc279d5720c1ef786652565e339'
           and d.scrape_batch_id = '44e4e2b6-9b77-44f3-af6b-bef8c300dceb'
         )
         or (
           d.venue_id = 1930
           and d.venue_name = 'Lucky Chances Casino'
           and d.tournament_name in (
             'No Limit Hold''em 9:30AM $165 Buy In',
             'No Limit Hold''em 9:30AM $240 Buy In',
             'No Limit Hold''em 9:30AM $300 Buy In'
           )
           and d.start_time = '9:30AM'
           and d.buy_in in (165, 240, 300)
           and d.source_url = 'https://www.pokeratlas.com/poker-room/lucky-chances-colma/tournaments'
           and d.scrape_html_hash = 'd25b39c45674e8dafa8d3edb5796522dec36a212cab1d3c3dbe562cdb5736381'
           and d.scrape_batch_id = '44e4e2b6-9b77-44f3-af6b-bef8c300dceb'
         )
       )
  )
  select count(*),
         md5(string_agg(id::text, E'\n' order by id)),
         count(*) filter (where venue_id = 3123),
         count(*) filter (where venue_id = 3011),
         count(*) filter (where venue_id = 1930)
    into v_count, v_id_md5, v_horseshoe, v_fortune, v_lucky
    from cohort;

  if v_count <> 76
     or v_id_md5 <> '1819593f1326f6fc64192ad460725921'
     or v_horseshoe <> 28
     or v_fortune <> 28
     or v_lucky <> 20 then
    raise exception
      'pre-flight failed: morning cohort drifted count=% md5=% venues=%/%/%',
      v_count, v_id_md5, v_horseshoe, v_fortune, v_lucky;
  end if;
end
$preflight$;

alter table public.venue_daily_tournaments
  add column scrape_source text;

comment on column public.venue_daily_tournaments.scrape_source is
  'Exact parser/source discriminator persisted by the tournament schedule writer; NULL means legacy provenance is not proven.';

update public.venue_daily_tournaments d
   set scrape_source = 'pokeratlas'
 where d.id in (
   select q.id
     from public.venue_daily_tournaments q
    where q.is_active
      and q.is_suppressed is not true
      and q.data_quality = 'scraped_verified'
      and q.human_verified is not true
      and q.is_recurring is false
      and q.parent_tournament_id is not null
      and coalesce(q.flags, '[]'::jsonb) ? 'pnm_recurring_projection'
      and q.source_url = q.best_scrape_url
      and q.source_url ~* '^https://(www\.)?pokeratlas\.com/poker-room/[^/?#[:space:]]+/tournaments/?([?#][^[:space:]]*)?$'
      and q.scrape_html_hash ~ '^[0-9A-Fa-f]{64}$'
      and q.scrape_html_hash !~ '^0{64}$'
      and q.scrape_batch_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and q.scrape_timestamp <= now()
      and coalesce(q.last_scraped, q.scrape_timestamp)
            between now() - interval '30 days' and now()
      and q.start_time ~* '^[89]:[0-5][0-9][[:space:]]*AM$'
      and q.buy_in between 20 and 100000
      and (
        (q.venue_id = 3123
          and q.venue_name = 'Horseshoe Las Vegas'
          and q.tournament_name = 'No Limit Hold''em 9:00AM $100 Buy In'
          and q.start_time = '9:00AM' and q.buy_in = 100
          and q.source_url = 'https://www.pokeratlas.com/poker-room/horseshoe-las-vegas/tournaments'
          and q.scrape_html_hash = 'dc9dda71e4a6174f4ca03826178980471aea04b122671dfdb3918d4ec04e5b0f'
          and q.scrape_batch_id = 'cae3ab95-07f1-4ba0-ab2f-edde5c823398')
        or (q.venue_id = 3011
          and q.venue_name = 'Fortune Poker Room'
          and q.tournament_name in ('$1K Gtd. NLH', '$2,500 Gtd. NLH')
          and q.start_time = '8:30AM' and q.buy_in = 60
          and q.source_url = 'https://www.pokeratlas.com/poker-room/fortune-poker-room-renton/tournaments'
          and q.scrape_html_hash = '252fe560338a99c0aa6d501aca5cc845b326abc279d5720c1ef786652565e339'
          and q.scrape_batch_id = '44e4e2b6-9b77-44f3-af6b-bef8c300dceb')
        or (q.venue_id = 1930
          and q.venue_name = 'Lucky Chances Casino'
          and q.tournament_name in (
            'No Limit Hold''em 9:30AM $165 Buy In',
            'No Limit Hold''em 9:30AM $240 Buy In',
            'No Limit Hold''em 9:30AM $300 Buy In'
          )
          and q.start_time = '9:30AM' and q.buy_in in (165, 240, 300)
          and q.source_url = 'https://www.pokeratlas.com/poker-room/lucky-chances-colma/tournaments'
          and q.scrape_html_hash = 'd25b39c45674e8dafa8d3edb5796522dec36a212cab1d3c3dbe562cdb5736381'
          and q.scrape_batch_id = '44e4e2b6-9b77-44f3-af6b-bef8c300dceb')
      )
 );

do $replace_contract$
declare
  v_definition text;
  v_updated text;
  v_old_daily constant text := $old_daily$
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
$old_daily$;
  v_new_daily constant text := $new_daily$
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
$new_daily$;
begin
  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;

  if length(v_definition) - length(replace(v_definition, v_old_daily, ''))
       <> length(v_old_daily) then
    raise exception 'pre-flight failed: expected one 036 daily predicate';
  end if;

  v_updated := replace(v_definition, v_old_daily, v_new_daily);
  execute v_updated;
end
$replace_contract$;

revoke all on function public.pnm_freshness_invariants() from public;
revoke all on function public.pnm_freshness_invariants() from anon;
revoke all on function public.pnm_freshness_invariants() from authenticated;
grant execute on function public.pnm_freshness_invariants() to service_role;

comment on function public.pnm_freshness_invariants() is
  'Service-role PNM freshness checks aligned fail-closed with verified morning daily schedules and public tour, series and live readers.';

do $post_apply$
declare
  v_count bigint;
  v_id_md5 text;
  v_non_pokeratlas bigint;
  v_definition text;
  v_check_names text[];
begin
  select count(*), md5(string_agg(id::text, E'\n' order by id))
    into v_count, v_id_md5
    from public.venue_daily_tournaments
   where scrape_source = 'pokeratlas';
  select count(*) into v_non_pokeratlas
    from public.venue_daily_tournaments
   where scrape_source is not null and scrape_source <> 'pokeratlas';

  if v_count <> 76
     or v_id_md5 <> '1819593f1326f6fc64192ad460725921'
     or v_non_pokeratlas <> 0 then
    raise exception
      'post-apply failed: source backfill drifted count=% md5=% non_pa=%',
      v_count, v_id_md5, v_non_pokeratlas;
  end if;

  select pg_get_functiondef('public.pnm_freshness_invariants()'::regprocedure)
    into v_definition;
  if v_definition not like '%scrape_source = ''pokeratlas''%'
     or v_definition not like '%between 480 and 599%'
     or v_definition not like '%to be announced%'
     or v_definition not like '%scrape_batch_id::text ~* ''^[0-9a-f]{8}-%'
     or v_definition like '%where not time_is_parseable%' then
    raise exception 'post-apply failed: morning evidence predicate is missing';
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
-- Use a new forward migration to clear the exact 76 scrape_source values and
-- restore the prior private RPC predicate. Do not drop provenance after writers
-- begin populating it.
