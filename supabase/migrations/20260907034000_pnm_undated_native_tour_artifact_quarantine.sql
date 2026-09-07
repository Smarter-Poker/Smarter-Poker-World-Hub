-- ============================================================================
-- Poker Near Me undated native-tour artifact quarantine
-- Migration: 20260907034000_pnm_undated_native_tour_artifact_quarantine.sql
-- ============================================================================
-- Preserve but fail-close five exact native-parser rows which have neither an
-- event date nor a stop start date. Four are RunGood article fragments and one
-- is a Gulf Coast/Hendon Mob navigation fragment. The native writer is retired;
-- this migration removes the last known rows from the public quality cohort.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $realtime_lock$
begin
  if to_regclass('realtime.subscription') is not null then
    execute 'lock table realtime.subscription in access exclusive mode';
  end if;
end
$realtime_lock$;

lock table public.tour_stop_events in share row exclusive mode;

create temporary table pnm_undated_native_tour_artifacts (
  id uuid primary key,
  tour_code text not null,
  stop_name text not null,
  stop_venue text not null,
  event_number integer not null,
  event_name text not null,
  buy_in integer not null,
  source_url text not null,
  scrape_html_hash text not null
) on commit drop;

insert into pnm_undated_native_tour_artifacts values
  ('19b60ec2-1790-466e-b162-4ca224e6a8e8', 'RGPS', 'RGPS 2026', 'Various', 4,
   '$400 Pot-Limit Omaha Ring Event 3:00PM&nbsp; -&nbsp;', 400,
   'https://www.rungood.com/blogs/tour-news-1',
   '804ad828c9c5245988263c5aadc872cdf5aeb1bf220539d4780357312b20527e'),
  ('369b72fd-9f85-4890-a3cb-c122da0df891', 'RGPS', 'RGPS 2026', 'Various', 2,
   '$300 Omaha 8 1:00pm :&nbsp;', 300,
   'https://www.rungood.com/blogs/tour-news-1',
   '804ad828c9c5245988263c5aadc872cdf5aeb1bf220539d4780357312b20527e'),
  ('96842c19-c826-4ae4-b466-e3ca6d38a2ac', 'RGPS', 'RGPS 2026', 'Various', 1,
   '$300 Pot-Limit Omaha Ring Event 3PM -&nbsp;', 300,
   'https://www.rungood.com/blogs/tour-news-1',
   '804ad828c9c5245988263c5aadc872cdf5aeb1bf220539d4780357312b20527e'),
  ('b2f85513-56e9-4b23-af49-2afd1a61b42e', 'RGPS', 'RGPS 2026', 'Various', 3,
   '$1,000 PLO Championship 8-Handed Ring&nbsp;Event (', 1000,
   'https://www.rungood.com/blogs/tour-news-1',
   '804ad828c9c5245988263c5aadc872cdf5aeb1bf220539d4780357312b20527e'),
  ('652004c9-5943-4ac4-847a-b945b1b5da13', 'GCPT',
   concat('GCPT ', chr(8212), ' 7 Clans Poker Cup'), '7 Clans Casinos', 2,
   '$50 k Hendon Mob', 50,
   'https://gulfcoastpoker.net/7-clans/schedule/',
   '408af9c924b69cfb7bce74250c401ed486a8ed251ce838661d2aadbe46ae41ba');

do $preflight$
declare
  v_count integer;
  v_checksum text;
begin
  if to_regclass('public.tour_stop_events') is null then
    raise exception 'pre-flight failed: public.tour_stop_events is missing';
  end if;

  select count(*), md5(string_agg(id::text, ',' order by id::text))
    into v_count, v_checksum
    from pnm_undated_native_tour_artifacts;
  if v_count <> 5
     or v_checksum is distinct from '04397d6c71da6ed50cfa1e80e99ce3a9' then
    raise exception 'pre-flight failed: undated native UUID cohort drifted (%, %)',
      v_count, v_checksum;
  end if;

  select count(*), md5(string_agg(t.id::text, ',' order by t.id::text))
    into v_count, v_checksum
    from public.tour_stop_events t
    join pnm_undated_native_tour_artifacts expected using (id)
   where t.tour_code = expected.tour_code
     and t.stop_name = expected.stop_name
     and t.stop_venue = expected.stop_venue
     and t.event_number = expected.event_number
     and t.event_name = expected.event_name
     and t.buy_in = expected.buy_in
     and t.source_url = expected.source_url
     and t.scrape_url = expected.source_url
     and t.scrape_html_hash = expected.scrape_html_hash
     and t.scrape_script =
       '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/scrape_tour_native.py'
     and t.data_quality = 'scraped_verified'
     and t.start_date is null
     and t.stop_start_date is null
     and (
       (t.tour_code = 'RGPS'
        and t.scrape_byte_count = 467498
        and t.scrape_timestamp = '2026-04-07T03:27:14.947486Z'::timestamptz)
       or
       (t.tour_code = 'GCPT'
        and t.stop_city = 'Various'
        and t.stop_state = 'OK'
        and t.game_type = 'NLH'
        and t.scrape_byte_count = 23907
        and t.scrape_timestamp = '2026-04-07T03:26:57.572788Z'::timestamptz)
     );
  if v_count <> 5
     or v_checksum is distinct from '04397d6c71da6ed50cfa1e80e99ce3a9' then
    raise exception 'pre-flight failed: undated native rows drifted (%, %)',
      v_count, v_checksum;
  end if;
end
$preflight$;

update public.tour_stop_events actual
   set data_quality = 'stale',
       notes = concat_ws(
         ' | ', nullif(actual.notes, ''),
         'Quarantined 2026-09-07: undated retired native-parser fragment.'
       )
  from pnm_undated_native_tour_artifacts expected
 where actual.id = expected.id
   and actual.data_quality = 'scraped_verified';

do $post_apply$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.tour_stop_events actual
    join pnm_undated_native_tour_artifacts expected using (id)
   where actual.data_quality = 'stale'
     and actual.notes like
       '%Quarantined 2026-09-07: undated retired native-parser fragment.%';
  if v_count <> 5 then
    raise exception 'undated native quarantine updated %, expected 5', v_count;
  end if;

  if exists (
    select 1
      from public.tour_stop_events actual
      join pnm_undated_native_tour_artifacts expected using (id)
     where actual.data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
  ) then
    raise exception 'post-apply failed: an undated native artifact remains servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore only after a source-owned event date and exact schedule
-- identity are independently verified by the active tour owner.
