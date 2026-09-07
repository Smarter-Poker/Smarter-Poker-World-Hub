-- ============================================================================
-- Poker Near Me cross-tour and cross-series artifact quarantine
-- Migration: 20260907023000_pnm_cross_source_artifact_quarantine.sql
-- ============================================================================
-- Retain every source row for audit, but make two proven contaminated cohorts
-- nonservable. The preflight binds exact row counts and sorted UUID checksums
-- to strict source/provenance identities so this cannot broaden silently.

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
  r record;
  v_count integer;
  v_checksum text;
begin
  if to_regclass('public.tour_stop_events') is null
     or to_regclass('public.poker_events') is null
     or to_regclass('public.poker_series') is null then
    raise exception 'pre-flight failed: a Poker Near Me event table is missing';
  end if;

  for r in
    select * from (values
      ('CPPT', 'https://www.pokeratlas.com/poker-tournaments/cppt',
       'c962fd673818a3ddfe0333d19536ec33e98ba74749c7aa87ba0f372c5854394d',
       16, '8f04165706cbb715bf082234c9a42dae'),
      ('LIPS', 'https://www.pokeratlas.com/poker-tournaments/lips',
       'b76a3d92382a33f1e6f4adaca6ac8a11679cf21b0fffd2caaa5ebe4bc8bd5e46',
       16, '8c2ca578ae03622ae5c63760410cc2ae'),
      ('PAT', 'https://pokeratlastour.com',
       '6466d1bf2a26b622509d326cc6f87c643018542e41174c755d2dc737a1477206',
       15, 'cd610b830cd14f6236dcc5a8c724034e')
    ) as expected(tour_code, source_url, html_hash, row_count, id_checksum)
  loop
    select count(*), md5(string_agg(t.id::text, ',' order by t.id::text))
      into v_count, v_checksum
      from public.tour_stop_events t
     where t.tour_code = r.tour_code
       and t.stop_name = r.tour_code || ' 2026 Season'
       and t.stop_start_date = date '2026-01-01'
       and t.stop_end_date = date '2026-12-31'
       and t.start_date is null
       and t.source_url = r.source_url
       and t.scrape_script = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/scrape_tour_full_schedules.py'
       and t.scrape_html_hash = r.html_hash
       and t.data_quality = 'scraped_verified';
    if v_count <> r.row_count or v_checksum is distinct from r.id_checksum then
      raise exception
        'pre-flight failed: % legacy tour cohort drifted (count %, checksum %)',
        r.tour_code, v_count, v_checksum;
    end if;
  end loop;

  for r in
    select * from (values
      ('2693', '1b5c0e4a-d5d4-4779-acda-59f8cad6801b'::uuid,
       '220303d609612c30cd31f21bab0a4303c72c759a1545c084ef1a23e7b2f72c91',
       35, 'cb177b370af4e0fcf73d04593be944e2'),
      ('2704', '1b5c0e4a-d5d4-4779-acda-59f8cad6801b'::uuid,
       '2a5132c3633a544a7a08ed380bab2fd2631e833d59d578bd6f500a4a97a33068',
       35, 'd6a8e42d5fac970d62eea21a08fa966f'),
      ('2702', '9e592160-4150-4e28-9143-2ba4571c4e29'::uuid,
       '2b08a82278d49a4416df77581fbe80e6336abd6af2002132f85fb924af1bca7d',
       21, 'f67295e7467a77a173dcded5ece56065'),
      ('2703', '9e592160-4150-4e28-9143-2ba4571c4e29'::uuid,
       '87dbca7ebde8f141017d243f4473f9a065484b6d8dfd3584548097fdeb04e512',
       21, 'd3232030c242a454d4c6e48ff517e336')
    ) as expected(series_uid, batch_id, html_hash, row_count, id_checksum)
  loop
    select count(*), md5(string_agg(e.id::text, ',' order by e.id::text))
      into v_count, v_checksum
      from public.poker_events e
     where e.series_uid = r.series_uid
       and e.source = 'cardplayer'
       and e.scrape_batch_id = r.batch_id
       and e.scrape_html_hash = r.html_hash
       and e.notes is null
       and e.data_quality = 'scraped_verified';
    if v_count <> r.row_count or v_checksum is distinct from r.id_checksum then
      raise exception
        'pre-flight failed: series % child cohort drifted (count %, checksum %)',
        r.series_uid, v_count, v_checksum;
    end if;
  end loop;

  select count(*)
    into v_count
    from public.poker_events a
    join public.poker_events b
      on a.event_name is not distinct from b.event_name
     and a.start_date is not distinct from b.start_date
     and a.buy_in is not distinct from b.buy_in
   where (a.series_uid, b.series_uid) in (('2693', '2704'), ('2702', '2703'))
     and a.data_quality = 'scraped_verified'
     and b.data_quality = 'scraped_verified';
  if v_count <> 56 then
    raise exception 'pre-flight failed: expected 56 exact cross-series event pairs, found %', v_count;
  end if;

  if exists (
    with expected(
      id, series_uid, series_name, start_date, end_date, event_count, events_count
    ) as (values
      (757::bigint, '2693', 'Cherokee Poker Classic', date '2026-08-06', date '2026-08-17', 37, 37),
      (756::bigint, '2704', 'Cherokee Nation Poker Series', date '2026-08-06', date '2026-08-17', 37, 37),
      (784::bigint, '2702', 'Gulf Coast Poker Championship', date '2026-05-18', date '2026-08-02', 221, 221),
      (828::bigint, '2703', 'Northwest Poker Championship', date '2026-05-18', date '2026-08-02', 221, 221)
    )
    select 1
      from expected
      left join public.poker_series actual using (id)
     where actual.id is null
        or actual.series_uid is distinct from expected.series_uid
        or actual.series_name is distinct from expected.series_name
        or actual.start_date is distinct from expected.start_date
        or actual.end_date is distinct from expected.end_date
        or actual.event_count is distinct from expected.event_count
        or actual.events_count is distinct from expected.events_count
        or actual.source is distinct from 'pokeratlas'
        or actual.source_url is distinct from ''
        or actual.scrape_url is distinct from ''
        or actual.scrape_batch_id is distinct from '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid
        or actual.scrape_html_hash is distinct from repeat('0', 64)
        or actual.data_quality is distinct from 'scraped_verified'
        or actual.is_suppressed is distinct from false
  ) then
    raise exception 'pre-flight failed: cross-series parent identity drifted';
  end if;
end
$preflight$;

with expected(tour_code, source_url, html_hash) as (values
  ('CPPT', 'https://www.pokeratlas.com/poker-tournaments/cppt',
   'c962fd673818a3ddfe0333d19536ec33e98ba74749c7aa87ba0f372c5854394d'),
  ('LIPS', 'https://www.pokeratlas.com/poker-tournaments/lips',
   'b76a3d92382a33f1e6f4adaca6ac8a11679cf21b0fffd2caaa5ebe4bc8bd5e46'),
  ('PAT', 'https://pokeratlastour.com',
   '6466d1bf2a26b622509d326cc6f87c643018542e41174c755d2dc737a1477206')
)
update public.tour_stop_events t
   set data_quality = 'stale',
       notes = concat_ws(
         ' | ', nullif(t.notes, ''),
         'Quarantined 2026-09-07: retired legacy annual tour extraction.'
       )
  from expected
 where t.tour_code = expected.tour_code
   and t.stop_name = expected.tour_code || ' 2026 Season'
   and t.stop_start_date = date '2026-01-01'
   and t.stop_end_date = date '2026-12-31'
   and t.start_date is null
   and t.source_url = expected.source_url
   and t.scrape_script = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/scrape_tour_full_schedules.py'
   and t.scrape_html_hash = expected.html_hash
   and t.data_quality = 'scraped_verified';

do $tour_update_count$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.tour_stop_events
   where tour_code in ('CPPT', 'LIPS', 'PAT')
     and stop_name = tour_code || ' 2026 Season'
     and stop_start_date = date '2026-01-01'
     and stop_end_date = date '2026-12-31'
     and start_date is null
     and scrape_script = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/scrape_tour_full_schedules.py'
     and data_quality = 'stale';
  if v_count <> 47 then
    raise exception 'tour quarantine updated %, expected 47', v_count;
  end if;
end
$tour_update_count$;

with expected(series_uid, batch_id, html_hash) as (values
  ('2693', '1b5c0e4a-d5d4-4779-acda-59f8cad6801b'::uuid,
   '220303d609612c30cd31f21bab0a4303c72c759a1545c084ef1a23e7b2f72c91'),
  ('2704', '1b5c0e4a-d5d4-4779-acda-59f8cad6801b'::uuid,
   '2a5132c3633a544a7a08ed380bab2fd2631e833d59d578bd6f500a4a97a33068'),
  ('2702', '9e592160-4150-4e28-9143-2ba4571c4e29'::uuid,
   '2b08a82278d49a4416df77581fbe80e6336abd6af2002132f85fb924af1bca7d'),
  ('2703', '9e592160-4150-4e28-9143-2ba4571c4e29'::uuid,
   '87dbca7ebde8f141017d243f4473f9a065484b6d8dfd3584548097fdeb04e512')
)
update public.poker_events e
   set data_quality = 'stale',
       flags = case
         when coalesce(e.flags, '[]'::jsonb)
              @> '["pnm_cross_series_identity_quarantine_20260907"]'::jsonb
           then coalesce(e.flags, '[]'::jsonb)
         else coalesce(e.flags, '[]'::jsonb)
              || '["pnm_cross_series_identity_quarantine_20260907"]'::jsonb
       end
  from expected
 where e.series_uid = expected.series_uid
   and e.source = 'cardplayer'
   and e.scrape_batch_id = expected.batch_id
   and e.scrape_html_hash = expected.html_hash
   and e.notes is null
   and e.data_quality = 'scraped_verified';

do $series_child_update_count$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.poker_events
   where series_uid in ('2693', '2704', '2702', '2703')
     and source = 'cardplayer'
     and scrape_batch_id in (
       '1b5c0e4a-d5d4-4779-acda-59f8cad6801b',
       '9e592160-4150-4e28-9143-2ba4571c4e29'
     )
     and data_quality = 'stale'
     and coalesce(flags, '[]'::jsonb)
         @> '["pnm_cross_series_identity_quarantine_20260907"]'::jsonb;
  if v_count <> 112 then
    raise exception 'series child quarantine updated %, expected 112', v_count;
  end if;
end
$series_child_update_count$;

update public.poker_series
   set data_quality = 'stale',
       is_suppressed = true
 where id in (756, 757, 784, 828)
   and data_quality = 'scraped_verified'
   and is_suppressed is false;

do $series_parent_update_count$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.poker_series
   where id in (756, 757, 784, 828)
     and data_quality = 'stale'
     and is_suppressed is true;
  if v_count <> 4 then
    raise exception 'series parent quarantine updated %, expected 4', v_count;
  end if;
end
$series_parent_update_count$;

do $post_apply$
begin
  if exists (
    select 1
      from public.tour_stop_events
     where tour_code in ('CPPT', 'LIPS', 'PAT')
       and stop_name = tour_code || ' 2026 Season'
       and stop_start_date = date '2026-01-01'
       and stop_end_date = date '2026-12-31'
       and start_date is null
       and scrape_script = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/scrape_tour_full_schedules.py'
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
  ) then
    raise exception 'post-apply failed: legacy annual tour rows remain servable';
  end if;

  if exists (
    select 1
      from public.poker_events
     where series_uid in ('2693', '2704', '2702', '2703')
       and source = 'cardplayer'
       and scrape_batch_id in (
         '1b5c0e4a-d5d4-4779-acda-59f8cad6801b',
         '9e592160-4150-4e28-9143-2ba4571c4e29'
       )
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
  ) then
    raise exception 'post-apply failed: cross-series children remain servable';
  end if;

  if exists (
    select 1
      from public.poker_series
     where id in (756, 757, 784, 828)
       and (
         data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research')
         or is_suppressed is not true
       )
  ) then
    raise exception 'post-apply failed: false series parents remain servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore rows only after exact, source-owned schedules prove the
-- requested tour or series identity and each individual event date.
