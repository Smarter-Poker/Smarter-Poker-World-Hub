-- ============================================================================
-- Poker Near Me PokerAtlas cross-series cohort quarantine
-- Migration: 20260907024500_pnm_pokeratlas_cross_series_cohort_quarantine.sql
-- ============================================================================
-- A retired catalog run attached schedules from sixteen PokerAtlas series pages
-- to 48 unrelated series parents. Preserve every row for audit, but suppress
-- the false parents and make all 4,337 physical child rows nonservable. Exact
-- identities, counts and sorted UUID checksums make this migration fail closed.

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

create temporary table pnm_bad_series_expected (
  id bigint primary key,
  series_uid text unique not null,
  series_name text not null,
  start_date date not null,
  end_date date not null,
  events_count integer not null,
  source_url text not null,
  child_count integer not null,
  child_checksum text not null
) on commit drop;

insert into pnm_bad_series_expected values
  (875, '581', 'Texas Poker Open & PGT High Rollers', date '2026-04-01', date '2026-04-12', 40, 'https://www.pokeratlas.com/poker-tournament-series/spring-classic-26-texas-card-house-spring-2026', 40, 'c09a2c6ac4029e093c1df0bea75ca1b4'),
  (884, '2614', 'Venetian DeepStack Extravaganza', date '2026-04-01', date '2026-05-17', 218, 'https://www.pokeratlas.com/poker-tournament-series/deepstack-extravaganza-ii-2026-venetian-las-vegas-2026', 218, '4889c09e8be7853589d0c9a094305b18'),
  (752, '2616', 'Borgata Poker Open', date '2026-04-08', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/the-pure-grind-series-true-triple-stack-april-26-borgata-atlantic-city-2026', 16, '3e004f3ba3569d26e6dc7d55a3891446'),
  (856, '2618', 'Seminole Hard Rock Poker Open', date '2026-04-08', date '2026-04-29', 307, 'https://www.pokeratlas.com/poker-tournament-series/wpt-seminole-hard-rock-poker-showdown-26-hard-rock-hollywood-ft-lauderdale-2026', 307, '0bfbcedfce40c72a9a7df0e6200e2f2f'),
  (749, '2619', 'Bike Series (The Bicycle Casino)', date '2026-03-06', date '2026-04-16', 198, 'https://www.pokeratlas.com/poker-tournament-series/2026-winnin-o-the-green-bicycle-casino-bell-gardens-2026', 200, '01e47b27583d79425210fd0048c1c09c'),
  (779, '2624', 'Golden Nugget Grand Poker Series', date '2026-04-02', date '2026-04-13', 103, 'https://www.pokeratlas.com/poker-tournament-series/2025-26-wsop-circuit-chicago-spring-grand-victoria-elgin-2026', 103, '06a375702c3a7027fe9a7845e8201b28'),
  (811, '2625', 'Lucky Hearts Poker Open', date '2026-03-27', date '2026-04-19', 30, 'https://www.pokeratlas.com/poker-tournament-series/2026-battle-of-the-bay-lucky-chances-colma-2026', 30, '651ba1033a2cca587438e49ccf16a7e5'),
  (774, '2637', 'Florida State Poker Championship', date '2026-03-22', date '2026-04-19', 65, 'https://www.pokeratlas.com/poker-tournament-series/2026-sd-state-poker-championship-silverado-casino-deadwood-2026', 65, '9105cbece7c9302eb62e90a46c85ac6d'),
  (742, '2638', 'Arizona State Poker Championship', date '2026-03-22', date '2026-04-19', 65, 'https://www.pokeratlas.com/poker-tournament-series/2026-sd-state-poker-championship-silverado-casino-deadwood-2026', 67, '86d2b271315844b652cd329db264233a'),
  (823, '2641', 'Motor City Poker Championship', date '2026-04-08', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/the-pure-grind-series-true-triple-stack-april-26-borgata-atlantic-city-2026', 15, 'b394baa00623fdfccdbc4b689583a863'),
  (821, '2643', 'Mohegan Sun Poker Series', date '2026-04-23', date '2026-04-25', 6, 'https://www.pokeratlas.com/poker-tournament-series/spring-fever-26-mohegan-sun-uncasville-2026', 1, '1e99654c73f9fa6994059ffbdb0fda8a'),
  (815, '2653', 'Maryland Live Poker Series', date '2026-04-09', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/live-100k-multi-flight-april-26-maryland-live-hanover-2026', 16, '9ab45dfb29f82ba4aa39ee6f7ad0cb14'),
  (791, '2654', 'Horseshoe Baltimore Poker Series', date '2026-04-15', date '2026-04-27', 93, 'https://www.pokeratlas.com/poker-tournament-series/2025-26-wsop-circuit-tunica-spring-horseshoe-tunica-robinsonville-2026', 55, 'f5ec12a795a340c166127c147fb5b565'),
  (787, '2655', 'Hard Rock Tulsa Poker Series', date '2026-04-08', date '2026-04-29', 307, 'https://www.pokeratlas.com/poker-tournament-series/wpt-seminole-hard-rock-poker-showdown-26-hard-rock-hollywood-ft-lauderdale-2026', 307, '81333bfe5578322b6781dd8026e8be3b'),
  (873, '2657', 'Texas Card House Tournament Series', date '2026-04-01', date '2026-04-12', 40, 'https://www.pokeratlas.com/poker-tournament-series/spring-classic-26-texas-card-house-spring-2026', 40, 'f37b922f92ca0e48dfe4a97002f810c7'),
  (750, '2659', 'Black Hawk Poker Classic', date '2026-04-09', date '2026-04-12', 13, 'https://www.pokeratlas.com/poker-tournament-series/spring-showdown-2026-ballys-black-hawk-2026', 14, '65531144c3f537c525b048ca269a9aae'),
  (739, '2660', 'Ameristar Black Hawk Poker Series', date '2026-04-09', date '2026-04-12', 13, 'https://www.pokeratlas.com/poker-tournament-series/spring-showdown-2026-ballys-black-hawk-2026', 14, '0c3203ac46681802a95c72fbf555be6d'),
  (755, '2661', 'Canterbury Park Poker Classic', date '2026-04-22', date '2026-05-03', 47, 'https://www.pokeratlas.com/poker-tournament-series/spring-championship-series-canterbury-park-shakopee-2026', 50, '10fbf12306ab6c561849226e7b88e67a'),
  (793, '2663', 'Horseshoe Indiana Poker Series', date '2026-04-15', date '2026-04-27', 93, 'https://www.pokeratlas.com/poker-tournament-series/2025-26-wsop-circuit-tunica-spring-horseshoe-tunica-robinsonville-2026', 55, '21c29297074aa543050597f89135a527'),
  (868, '2664', 'Talking Stick Poker Series', date '2026-04-10', date '2026-04-12', 5, 'https://www.pokeratlas.com/poker-tournament-series/2026-spring-staycation-weekeend-talking-stick-resort-scottsdale-2026', 5, '386259f1ab9bb8a3865ca8aaff82c218'),
  (845, '2674', 'Red Rock Poker Series', date '2026-04-08', date '2026-04-29', 307, 'https://www.pokeratlas.com/poker-tournament-series/wpt-seminole-hard-rock-poker-showdown-26-hard-rock-hollywood-ft-lauderdale-2026', 307, '14c5a571877faf25e14d926e7da97e35'),
  (794, '2677', 'Horseshoe Las Vegas Poker Series', date '2026-04-01', date '2026-05-17', 218, 'https://www.pokeratlas.com/poker-tournament-series/deepstack-extravaganza-ii-2026-venetian-las-vegas-2026', 218, 'b3345570757372b4540e61d6110467f1'),
  (795, '2678', 'Hustler Casino Live Poker Series', date '2026-04-09', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/live-100k-multi-flight-april-26-maryland-live-hanover-2026', 16, 'a9b4a52c48cb5682c5bdc791bc8414c7'),
  (789, '2686', 'Hialeah Park Poker Series', date '2026-04-22', date '2026-05-03', 47, 'https://www.pokeratlas.com/poker-tournament-series/spring-championship-series-canterbury-park-shakopee-2026', 47, '496080fb7c324ed5fcd2ac573807d724'),
  (763, '2688', 'Coconut Creek Lucky Hearts Open', date '2026-03-27', date '2026-04-19', 30, 'https://www.pokeratlas.com/poker-tournament-series/2026-battle-of-the-bay-lucky-chances-colma-2026', 31, '5d7412275e68e338222b7158ef5929d5'),
  (799, '2695', 'Jack Casino Cleveland Poker Series', date '2026-04-23', date '2026-04-30', 9, 'https://www.pokeratlas.com/poker-tournament-series/jack-championship-series-jack-cleveland-2026', 9, '2380a9e5de2884a0661192115561c30d'),
  (798, '2696', 'Jack Casino Cincinnati Poker Series', date '2026-04-23', date '2026-04-30', 9, 'https://www.pokeratlas.com/poker-tournament-series/jack-championship-series-jack-cleveland-2026', 9, 'ddbf1cb11ad07e05b53390ae9e4207e8'),
  (790, '2697', 'Hollywood Columbus Poker Series', date '2026-04-08', date '2026-04-29', 307, 'https://www.pokeratlas.com/poker-tournament-series/wpt-seminole-hard-rock-poker-showdown-26-hard-rock-hollywood-ft-lauderdale-2026', 307, '1377cba14a74bb31028a13fa9e4655cf'),
  (783, '2698', 'Green Valley Ranch Poker Series', date '2026-03-06', date '2026-04-16', 198, 'https://www.pokeratlas.com/poker-tournament-series/2026-winnin-o-the-green-bicycle-casino-bell-gardens-2026', 198, '1b68274cbaeb47e8a96332995be7f408'),
  (816, '2700', 'MGM Grand Poker Series', date '2026-04-02', date '2026-04-13', 103, 'https://www.pokeratlas.com/poker-tournament-series/2025-26-wsop-circuit-chicago-spring-grand-victoria-elgin-2026', 103, '16163cc0da340e1791cb9570b77083d2'),
  (785, '2706', 'Hard Rock Cherokee Poker Classic', date '2026-04-08', date '2026-04-29', 307, 'https://www.pokeratlas.com/poker-tournament-series/wpt-seminole-hard-rock-poker-showdown-26-hard-rock-hollywood-ft-lauderdale-2026', 307, 'cabb28d300836cd561545f4875170141'),
  (808, '2711', 'Live Casino Poker Series', date '2026-04-09', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/live-100k-multi-flight-april-26-maryland-live-hanover-2026', 16, '99b3ea2dd5f1f8cd042307893e7decea'),
  (840, '2715', 'Poker House Dallas Tournament Series', date '2026-04-01', date '2026-04-12', 40, 'https://www.pokeratlas.com/poker-tournament-series/spring-classic-26-texas-card-house-spring-2026', 40, '15e6dc006cd6a4a0cea6a18eb1acac17'),
  (874, '2716', 'Texas Poker Champions', date '2026-04-01', date '2026-04-12', 40, 'https://www.pokeratlas.com/poker-tournament-series/spring-classic-26-texas-card-house-spring-2026', 40, '11ab8533f8a05b781d494fcc413eb2bd'),
  (776, '2720', 'Foxwoods Mega Stack Challenge', date '2026-04-08', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/the-pure-grind-series-true-triple-stack-april-26-borgata-atlantic-city-2026', 15, '1b47e8ea983ca1ad8ef5e7bc361ea5c3'),
  (854, '2726', 'SD State Poker Championship', date '2026-03-22', date '2026-04-19', 65, 'https://www.pokeratlas.com/poker-tournament-series/2026-sd-state-poker-championship-silverado-casino-deadwood-2026', 65, '175a8da638b2fd5a4d35224e5f33d709'),
  (872, '2728', 'TCH Houston Space City Stacks', date '2026-04-08', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/the-pure-grind-series-true-triple-stack-april-26-borgata-atlantic-city-2026', 15, 'c4d5f3c4123278f4ba140582f94d9d7c'),
  (809, '2730', 'Live Poker Classic', date '2026-04-09', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/live-100k-multi-flight-april-26-maryland-live-hanover-2026', 16, 'd644e5348b8a8beaab5e8a73b0eca6c8'),
  (863, '2732', 'Spring Fling Poker Series', date '2026-04-01', date '2026-04-12', 40, 'https://www.pokeratlas.com/poker-tournament-series/spring-classic-26-texas-card-house-spring-2026', 40, 'ad117d66753e3399f4de12c6b6e72aff'),
  (766, '2736', 'DeepStack Showdown', date '2026-04-01', date '2026-05-17', 218, 'https://www.pokeratlas.com/poker-tournament-series/deepstack-extravaganza-ii-2026-venetian-las-vegas-2026', 223, '8c0cc15200a98c29080e0db10e123b32'),
  (820, '2743', 'Mohegan Sun Fall Poker Championship', date '2026-04-23', date '2026-04-25', 6, 'https://www.pokeratlas.com/poker-tournament-series/spring-fever-26-mohegan-sun-uncasville-2026', 1, '9b831feaab084986e939d8a1eb9b32c1'),
  (870, '2749', 'TCH Austin Poker Series', date '2026-04-21', date '2026-05-04', 98, 'https://www.pokeratlas.com/poker-tournament-series/wsop-circuit-austin-26-tch-social-austin-2026', 98, '9bb880af17a2f5869a141a49415ff6d3'),
  (844, '2750', 'Prime Social Poker Series', date '2026-04-21', date '2026-05-04', 98, 'https://www.pokeratlas.com/poker-tournament-series/wsop-circuit-austin-26-tch-social-austin-2026', 98, 'b29a067e85e470669faad08cf1b04d6d'),
  (855, '2753', 'Seminole Brighton Poker Series', date '2026-04-08', date '2026-04-29', 307, 'https://www.pokeratlas.com/poker-tournament-series/wpt-seminole-hard-rock-poker-showdown-26-hard-rock-hollywood-ft-lauderdale-2026', 307, '5179ec578c1dd2fd61f53c1bbd3010d7'),
  (814, '2754', 'Magic City Poker Open', date '2026-04-08', date '2026-04-12', 15, 'https://www.pokeratlas.com/poker-tournament-series/the-pure-grind-series-true-triple-stack-april-26-borgata-atlantic-city-2026', 15, '458f34354228ad37c53bc1e9719f59f0'),
  (770, '2757', 'Downtown Grand Poker Series', date '2026-04-02', date '2026-04-13', 103, 'https://www.pokeratlas.com/poker-tournament-series/2025-26-wsop-circuit-chicago-spring-grand-victoria-elgin-2026', 108, '1c710e826734891fec8f46b5782df071'),
  (812, '2758', 'M Resort Poker Series', date '2026-04-10', date '2026-04-12', 5, 'https://www.pokeratlas.com/poker-tournament-series/2026-spring-staycation-weekeend-talking-stick-resort-scottsdale-2026', 5, '13b7abb18c80bad67eb37d62630262fc'),
  (888, '2760', 'Wisconsin State Poker Championship', date '2026-03-22', date '2026-04-19', 65, 'https://www.pokeratlas.com/poker-tournament-series/2026-sd-state-poker-championship-silverado-casino-deadwood-2026', 65, 'bbcd584ef241a64701cea4923867b382');

do $preflight$
declare
  r record;
  v_count integer;
  v_child_count integer;
  v_checksum text;
begin
  if to_regclass('public.poker_events') is null
     or to_regclass('public.poker_series') is null then
    raise exception 'pre-flight failed: a Poker Near Me series table is missing';
  end if;

  select count(*), coalesce(sum(child_count), 0)
    into v_count, v_child_count
    from pnm_bad_series_expected;
  if v_count <> 48 or v_child_count <> 4337 then
    raise exception 'pre-flight failed: expected table has % parents and % children',
      v_count, v_child_count;
  end if;

  select count(*)
    into v_count
    from (select source_url from pnm_bad_series_expected group by source_url) grouped;
  if v_count <> 16 then
    raise exception 'pre-flight failed: expected 16 contaminated source groups, found %', v_count;
  end if;

  select md5(string_agg(id::text, ',' order by id::text))
    into v_checksum
    from pnm_bad_series_expected;
  if v_checksum is distinct from 'fa36eb823b807dd3171c7590fd026861' then
    raise exception 'pre-flight failed: expected parent identity checksum drifted (%)', v_checksum;
  end if;

  if exists (
    select 1
      from pnm_bad_series_expected expected
      left join public.poker_series actual using (id)
     where actual.id is null
        or actual.series_uid is distinct from expected.series_uid
        or actual.series_name is distinct from expected.series_name
        or actual.start_date is distinct from expected.start_date
        or actual.end_date is distinct from expected.end_date
        or actual.event_count is distinct from expected.events_count
        or actual.events_count is distinct from expected.events_count
        or actual.source is distinct from 'pokeratlas'
        or actual.source_url is distinct from expected.source_url
        or actual.scrape_url is distinct from expected.source_url
        or actual.scrape_batch_id is distinct from '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid
        or actual.scrape_html_hash is distinct from repeat('0', 64)
        or actual.data_quality is distinct from 'scraped_verified'
        or actual.is_suppressed is distinct from false
  ) then
    raise exception 'pre-flight failed: cross-series parent identity drifted';
  end if;

  for r in select * from pnm_bad_series_expected order by series_uid
  loop
    select count(*), md5(string_agg(e.id::text, ',' order by e.id::text))
      into v_count, v_checksum
      from public.poker_events e
     where e.series_uid = r.series_uid
       and e.source = 'html_fallback'
       and e.data_quality = 'scraped_verified';
    if v_count <> r.child_count or v_checksum is distinct from r.child_checksum then
      raise exception
        'pre-flight failed: series % physical child cohort drifted (count %, checksum %)',
        r.series_uid, v_count, v_checksum;
    end if;
  end loop;

  select count(*)
    into v_count
    from public.poker_events e
    join pnm_bad_series_expected expected using (series_uid)
   where e.data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research');
  if v_count <> 4337 then
    raise exception 'pre-flight failed: expected 4337 total servable children, found %', v_count;
  end if;
end
$preflight$;

update public.poker_events e
   set data_quality = 'stale',
       flags = case
         when coalesce(e.flags, '[]'::jsonb)
              @> '["pnm_cross_series_identity_quarantine_20260907b"]'::jsonb
           then coalesce(e.flags, '[]'::jsonb)
         else coalesce(e.flags, '[]'::jsonb)
              || '["pnm_cross_series_identity_quarantine_20260907b"]'::jsonb
       end
  from pnm_bad_series_expected expected
 where e.series_uid = expected.series_uid
   and e.source = 'html_fallback'
   and e.data_quality = 'scraped_verified';

do $child_update_count$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.poker_events e
    join pnm_bad_series_expected expected using (series_uid)
   where e.data_quality = 'stale'
     and coalesce(e.flags, '[]'::jsonb)
         @> '["pnm_cross_series_identity_quarantine_20260907b"]'::jsonb;
  if v_count <> 4337 then
    raise exception 'child quarantine updated %, expected 4337', v_count;
  end if;
end
$child_update_count$;

update public.poker_series actual
   set data_quality = 'stale',
       is_suppressed = true
  from pnm_bad_series_expected expected
 where actual.id = expected.id
   and actual.data_quality = 'scraped_verified'
   and actual.is_suppressed is false;

do $parent_update_count$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.poker_series actual
    join pnm_bad_series_expected expected using (id)
   where actual.data_quality = 'stale'
     and actual.is_suppressed is true;
  if v_count <> 48 then
    raise exception 'parent quarantine updated %, expected 48', v_count;
  end if;
end
$parent_update_count$;

do $post_apply$
begin
  if exists (
    select 1
      from public.poker_events e
      join pnm_bad_series_expected expected using (series_uid)
     where e.data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research')
  ) then
    raise exception 'post-apply failed: contaminated children remain servable';
  end if;

  if exists (
    select 1
      from public.poker_series actual
      join pnm_bad_series_expected expected using (id)
     where actual.is_suppressed is not true
        or actual.data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research')
  ) then
    raise exception 'post-apply failed: contaminated parents remain servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore a parent and its child rows only after a source-owned page
-- proves that exact series identity and every individual event date.
