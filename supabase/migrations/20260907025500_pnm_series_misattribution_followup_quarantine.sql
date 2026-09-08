-- ============================================================================
-- Poker Near Me series misattribution follow-up quarantine
-- Migration: 20260907025500_pnm_series_misattribution_followup_quarantine.sql
-- ============================================================================
-- Preserve every source row. Suppress 18 parents bound to a different
-- source-owned PokerAtlas identity and 18 parents whose child schedule is not
-- date-coherent. All 1,125 currently servable physical children become stale.

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

create temporary table pnm_bad_series_followup (
  cohort text not null check (cohort in ('identity', 'window')),
  id bigint primary key,
  series_uid text unique not null,
  series_name text not null,
  start_date date not null,
  end_date date not null,
  events_count integer not null,
  source_url text not null,
  scrape_url text not null,
  scrape_batch_id uuid not null,
  child_count integer not null,
  child_checksum text not null,
  outside_count integer not null
) on commit drop;

insert into pnm_bad_series_followup values
  ('identity', 741::bigint, '2630', 'Aria Poker Classic', date '2026-04-09', date '2026-04-22', 47, 'https://www.pokeratlas.com/poker-tournament-series/pgt-u-s-poker-open-aria-las-vegas-2026', 'https://www.pokeratlas.com/poker-tournament-series/pgt-u-s-poker-open-aria-las-vegas-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 48, 'f88ea8b0bb92a39bb26c92aec9c0869d', 0),
  ('identity', 743::bigint, '2727', 'Battles at the Beach', date '2026-04-09', date '2026-04-12', 11, 'https://www.pokeratlas.com/poker-tournament-series/april-26-monster-multi-flight-palm-beach-kc-west-palm-beach-2026', 'https://www.pokeratlas.com/poker-tournament-series/april-26-monster-multi-flight-palm-beach-kc-west-palm-beach-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 12, '4bd5afa4dbfffbdaec283eaf2785f2a0', 0),
  ('identity', 748::bigint, '2685', 'bestbet Orange Park Poker Series', date '2026-04-10', date '2026-04-20', 14, 'https://www.pokeratlas.com/poker-tournament-series/april-2026-bestbet-100k-bestbet-jacksonville-2026', 'https://www.pokeratlas.com/poker-tournament-series/april-2026-bestbet-100k-bestbet-jacksonville-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 22, '08df5e9dae59424026daa0429d079589', 0),
  ('identity', 753::bigint, '2690', 'Caesars AC Poker Classic', date '2026-04-15', date '2026-04-27', 102, 'https://www.pokeratlas.com/poker-tournament-series/2025-26-wsop-circuit-lake-tahoe-spring-caesars-tahoe-stateline-2026', 'https://www.pokeratlas.com/poker-tournament-series/2025-26-wsop-circuit-lake-tahoe-spring-caesars-tahoe-stateline-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 102, '8a7ab13db9cca5ffb4da7b5cf5879977', 0),
  ('identity', 754::bigint, '2672', 'Caesars Palace Poker Classic', date '2026-04-18', date '2026-04-25', 15, 'https://www.pokeratlas.com/poker-tournament-series/2026-chainsaw-mixed-series-of-poker-caesars-palace-las-vegas-2026', 'https://www.pokeratlas.com/poker-tournament-series/2026-chainsaw-mixed-series-of-poker-caesars-palace-las-vegas-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 22, '65be07891b78ee5c6a40d9ca30bbe670', 0),
  ('identity', 761::bigint, '2725', 'Cincinnati Poker Open', date '2026-04-24', date '2026-04-26', 11, 'https://www.pokeratlas.com/poker-tournament-series/50k-gtd-quarterly-multi-flight-april-26-hard-rock-cincinnati-2026', 'https://www.pokeratlas.com/poker-tournament-series/50k-gtd-quarterly-multi-flight-april-26-hard-rock-cincinnati-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 12, '0a69dcceea8e97e0acba69d388cdacef', 0),
  ('identity', 769::bigint, '2705', 'Downstream Casino Poker Classic', date '2026-04-07', date '2026-04-12', 49, 'https://www.pokeratlas.com/poker-tournament-series/rungood-poker-series-2026-downstream-casino-quapaw-2026', 'https://www.pokeratlas.com/poker-tournament-series/rungood-poker-series-2026-downstream-casino-quapaw-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 51, '37dd47ad142abee6be4d73507772f364', 0),
  ('identity', 772::bigint, '2735', 'Elite Poker Lounge Series', date '2026-03-23', date '2026-05-03', 35, 'https://www.pokeratlas.com/poker-tournament-series/elite-25k-gtd-elite-poker-lounge-mcallen-2026', 'https://www.pokeratlas.com/poker-tournament-series/elite-25k-gtd-elite-poker-lounge-mcallen-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 35, '644a78ddce143031d2a7593d12e5d344', 0),
  ('identity', 786::bigint, '2752', 'Hard Rock Tampa Poker Series', date '2026-04-10', date '2026-04-19', 25, 'https://www.pokeratlas.com/poker-tournament-series/april-26-little-slick-hard-rock-tampa-2026', 'https://www.pokeratlas.com/poker-tournament-series/april-26-little-slick-hard-rock-tampa-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 25, '57751c5efa4f1b2a9e800e9b3c28bf73', 0),
  ('identity', 788::bigint, '2679', 'Hawaiian Gardens Poker Series', date '2026-04-15', date '2026-04-19', 13, 'https://www.pokeratlas.com/poker-tournament-series/socal-spring-special-26-the-gardens-hawaiian-gardens-2026', 'https://www.pokeratlas.com/poker-tournament-series/socal-spring-special-26-the-gardens-hawaiian-gardens-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 13, '0eaab607485366ff8c327936c418ecfd', 0),
  ('identity', 792::bigint, '2669', 'Horseshoe Council Bluffs Poker Series', date '2026-04-21', date '2026-04-26', 42, 'https://www.pokeratlas.com/poker-tournament-series/rgps-passport-season-iowa-horseshoe-cb-council-bluffs-2026', 'https://www.pokeratlas.com/poker-tournament-series/rgps-passport-season-iowa-horseshoe-cb-council-bluffs-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 42, 'a4c349650b13624a079c00c6442184fd', 0),
  ('identity', 843::bigint, '2668', 'Prairie Meadows Poker Series', date '2026-04-17', date '2026-04-19', 11, 'https://www.pokeratlas.com/poker-tournament-series/portland-meadows-bounty-series-portland-meadows-2026', 'https://www.pokeratlas.com/poker-tournament-series/portland-meadows-bounty-series-portland-meadows-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 11, '057f2e839045bd8106b89cbbb59aeabf', 0),
  ('identity', 848::bigint, '2644', 'Rivers Casino Poker Series', date '2026-04-12', date '2026-04-19', 11, 'https://www.pokeratlas.com/poker-tournament-series/electric-city-mini-event-april-26-rivers-schenectady-2026', 'https://www.pokeratlas.com/poker-tournament-series/electric-city-mini-event-april-26-rivers-schenectady-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 11, 'eb47e2863ccbc400ce60abd577a9e052', 0),
  ('identity', 850::bigint, '2662', 'Running Aces Poker Series', date '2026-04-07', date '2026-04-19', 77, 'https://www.pokeratlas.com/poker-tournament-series/mspt-26-minnesota-poker-state-championship-running-aces-forest-lake-2026', 'https://www.pokeratlas.com/poker-tournament-series/mspt-26-minnesota-poker-state-championship-running-aces-forest-lake-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 77, '7cf8beeeffc1bb42edc1726e1bf07f08', 0),
  ('identity', 859::bigint, '2634', 'South Point Poker Series', date '2026-04-20', date '2026-04-26', 25, 'https://www.pokeratlas.com/poker-tournament-series/l-i-p-s-women-in-poker-spring-festival-las-vegas-south-point-las-vegas-2026', 'https://www.pokeratlas.com/poker-tournament-series/l-i-p-s-women-in-poker-spring-festival-las-vegas-south-point-las-vegas-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 25, '59d198bc70234437120fe00d79cd575e', 0),
  ('identity', 869::bigint, '2708', 'Tampa Bay Downs Poker Series', date '2026-03-27', date '2026-04-12', 65, 'https://www.pokeratlas.com/poker-tournament-series/poker-jamboree-ii-tgt-poker-tampa-2026', 'https://www.pokeratlas.com/poker-tournament-series/poker-jamboree-ii-tgt-poker-tampa-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 65, '277a5774af5fc7e4ef35aab7606fe010', 0),
  ('identity', 879::bigint, '2631', 'Thunder Valley Poker Series', date '2026-04-15', date '2026-04-19', 11, 'https://www.pokeratlas.com/poker-tournament-series/2026-emerald-valley-poker-classic-high-mountain-eugene-2026', 'https://www.pokeratlas.com/poker-tournament-series/2026-emerald-valley-poker-classic-high-mountain-eugene-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 11, 'fa7d39d427c5e3738a302213d3bd3c11', 0),
  ('identity', 894::bigint, '2615', 'Wynn Poker Series', date '2026-04-20', date '2026-05-03', 73, 'https://www.pokeratlas.com/poker-tournament-series/2026-wynn-april-signature-series-wynn-las-vegas-2026', 'https://www.pokeratlas.com/poker-tournament-series/2026-wynn-april-signature-series-wynn-las-vegas-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 73, '5d858a4d47bf6b7257e6614ab501c8e5', 0),
  ('window', 744::bigint, '2626', 'Bay 101 Shooting Star', date '2026-08-28', date '2026-08-28', 2, '', '', 'ec643d96-a64d-4054-a196-4667190e0026'::uuid, 5, 'ceceffc8867a1876cc06b305f97d8ecd', 5),
  ('window', 745::bigint, '2646', 'Beau Rivage Million Dollar Heater', date '2026-07-28', date '2026-08-02', 11, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 49, '90085d428056c78531a01833d5601cf2', 49),
  ('window', 747::bigint, '2673', 'Bellagio Five Diamond Poker Classic', date '2026-08-29', date '2026-08-29', 22, '', '', '604b5cb5-d17e-46f7-89a3-3d87096805df'::uuid, 21, 'f91866c1ce73b37da13e74840cfc9fdf', 21),
  ('window', 768::bigint, '2707', 'Derby Lane Poker Series', date '2026-08-25', date '2026-08-25', 1, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 2, '0ae3a5d65d55c0c0b39fd76ceef1dacd', 2),
  ('window', 778::bigint, '2744', 'Foxwoods World Poker Finals', date '2026-08-12', date '2026-08-24', 76, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 29, '57b80cefcd058923170116c015dbb0b5', 29),
  ('window', 782::bigint, '2684', 'Graton Poker Series', date '2026-07-01', date '2026-12-13', 26, '', '', '828a5511-8cd5-421c-ab60-c9a56c8dd2a3'::uuid, 7, '0b6900fc6e8b9d754eb81fdaa86c27b7', 4),
  ('window', 796::bigint, '2761', 'Illinois Poker Championship', date '2026-05-18', date '2026-08-02', 221, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 36, '75f01e623e2fe7b007c32f8ee2aaf7f1', 36),
  ('window', 801::bigint, '2712', 'Jamul Casino Poker Room Series', date '2026-09-10', date '2026-09-10', 1, '', '', '828a5511-8cd5-421c-ab60-c9a56c8dd2a3'::uuid, 3, '71758bfa7bb103db1d69642aec27f688', 3),
  ('window', 813::bigint, '2737', 'Macau Poker Open', date '2026-07-28', date '2026-08-11', 91, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 92, '83388028e2db8485aaca6c3a1291b1e8', 92),
  ('window', 822::bigint, '2682', 'Morongo Poker Series', date '2026-07-01', date '2026-07-01', 1, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 2, '50f0a519541ef8d808c435c384e374af', 2),
  ('window', 824::bigint, 'pa_mpt-macau-poker-open-26-mgm-cotai-2026', 'MPT Macau Poker Open &#39;26', date '2026-07-28', date '2026-08-11', 91, 'https://www.pokeratlas.com/poker-tournament-series/mpt-macau-poker-open-26-mgm-cotai-2026', 'https://www.pokeratlas.com/poker-tournament-series/mpt-macau-poker-open-26-mgm-cotai-2026', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 92, '8b6b155e526bc53765469e19dd0029d2', 92),
  ('window', 835::bigint, '2650', 'Parx Big Stax Poker Series', date '2026-07-29', date '2026-08-23', 9, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 5, '4a36be4686bdbdd365f42e8b4c5d9fc6', 5),
  ('window', 836::bigint, '2648', 'Pearl River Poker Open', date '2026-07-28', date '2026-08-11', 91, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 92, '5a7b77dc5614d0055c994b10cf09a01c', 92),
  ('window', 851::bigint, '2746', 'San Diego Poker Series', date '2026-07-30', date '2026-08-09', 19, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 9, 'e3545cbac843a64c93450b9efbc3d1fd', 9),
  ('window', 852::bigint, '2681', 'San Manuel Poker Series', date '2026-07-30', date '2026-08-09', 19, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 1, '08a07d73dbd778b80e759ab10d811ba1', 1),
  ('window', 871::bigint, '2748', 'TCH Dallas Poker Series', date '2026-08-13', date '2026-08-23', 30, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 1, '0cb3475c875fee1fc4ae23167ddbbd87', 1),
  ('window', 881::bigint, '2691', 'Tropicana AC Poker Series', date '2026-08-15', date '2026-08-15', 2, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 2, '92e9619e0bd00273a773e944609bb369', 2),
  ('window', 883::bigint, '580', 'U.S. Poker Open', date '2026-07-28', date '2026-08-11', 91, '', '', '4ca3637e-d1d6-4ce7-8397-55d04509beb0'::uuid, 20, 'f5bc314d7ad39dc7c51f531599802976', 20);

do $preflight$
declare
  r record;
  v_count integer;
  v_checksum text;
begin
  if to_regclass('public.poker_events') is null
     or to_regclass('public.poker_series') is null then
    raise exception 'pre-flight failed: a Poker Near Me series table is missing';
  end if;

  for r in
    select * from (values
      ('identity', 18, 657, '75cf126c4be1836288a820afc6d0ea44',
       'ac64044796fcfe9ddf18c07c8c00b0af',
       'bcd66f4d3eb978a9198bc5a76515b6be'),
      ('window', 18, 468, 'cfe7bbffcb1f243b0250a4dd3006bba3',
       'da71d6e85f6c2c1f946ea89b13396447',
       '8ce4e4a914b010ffa05afb242bd1d4aa')
    ) as expected(cohort, parent_count, child_count, parent_id_checksum,
                  parent_uid_checksum, child_checksum)
  loop
    select count(*), md5(string_agg(id::text, ',' order by id::text))
      into v_count, v_checksum
      from pnm_bad_series_followup
     where cohort = r.cohort;
    if v_count <> r.parent_count
       or v_checksum is distinct from r.parent_id_checksum then
      raise exception 'pre-flight failed: % parent IDs drifted (%, %)',
        r.cohort, v_count, v_checksum;
    end if;

    select md5(string_agg(series_uid, ',' order by series_uid))
      into v_checksum
      from pnm_bad_series_followup
     where cohort = r.cohort;
    if v_checksum is distinct from r.parent_uid_checksum then
      raise exception 'pre-flight failed: % parent UIDs drifted (%)',
        r.cohort, v_checksum;
    end if;

    select count(*), md5(string_agg(e.id::text, ',' order by e.id::text))
      into v_count, v_checksum
      from public.poker_events e
      join pnm_bad_series_followup expected using (series_uid)
     where expected.cohort = r.cohort
       and e.data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       );
    if v_count <> r.child_count
       or v_checksum is distinct from r.child_checksum then
      raise exception 'pre-flight failed: % children drifted (%, %)',
        r.cohort, v_count, v_checksum;
    end if;
  end loop;

  if exists (
    select 1
      from pnm_bad_series_followup expected
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
        or actual.scrape_url is distinct from expected.scrape_url
        or actual.scrape_batch_id is distinct from expected.scrape_batch_id
        or actual.scrape_html_hash is distinct from repeat('0', 64)
        or actual.data_quality is distinct from 'scraped_verified'
        or actual.is_suppressed is distinct from false
  ) then
    raise exception 'pre-flight failed: follow-up parent identity drifted';
  end if;

  for r in select * from pnm_bad_series_followup order by series_uid
  loop
    select count(*), md5(string_agg(e.id::text, ',' order by e.id::text))
      into v_count, v_checksum
      from public.poker_events e
     where e.series_uid = r.series_uid
       and e.data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       );
    if v_count <> r.child_count
       or v_checksum is distinct from r.child_checksum then
      raise exception
        'pre-flight failed: series % physical children drifted (%, %)',
        r.series_uid, v_count, v_checksum;
    end if;
  end loop;

  select count(*)
    into v_count
    from public.poker_events e
    join pnm_bad_series_followup expected using (series_uid)
   where expected.cohort = 'identity'
     and e.data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
     and e.source is distinct from 'html_fallback';
  if v_count <> 0 then
    raise exception 'pre-flight failed: identity cohort has % non-HTML children', v_count;
  end if;

  select count(*)
    into v_count
    from public.poker_events e
    join pnm_bad_series_followup expected using (series_uid)
   where expected.cohort = 'window'
     and e.data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
     and e.start_date is not null
     and (e.start_date < expected.start_date or e.start_date > expected.end_date);
  if v_count <> 465 then
    raise exception 'pre-flight failed: expected 465 outside-window children, found %',
      v_count;
  end if;
end
$preflight$;

update public.poker_events e
   set data_quality = 'stale',
       flags = case
         when coalesce(e.flags, '[]'::jsonb)
              @> '["pnm_series_misattribution_quarantine_20260907c"]'::jsonb
           then coalesce(e.flags, '[]'::jsonb)
         else coalesce(e.flags, '[]'::jsonb)
              || '["pnm_series_misattribution_quarantine_20260907c"]'::jsonb
       end
  from pnm_bad_series_followup expected
 where e.series_uid = expected.series_uid
   and e.data_quality in (
     'scraped_verified', 'scraped_inferred', 'manual_research'
   );

do $child_update_count$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.poker_events e
    join pnm_bad_series_followup expected using (series_uid)
   where e.data_quality = 'stale'
     and coalesce(e.flags, '[]'::jsonb)
         @> '["pnm_series_misattribution_quarantine_20260907c"]'::jsonb;
  if v_count <> 1125 then
    raise exception 'series follow-up child quarantine updated %, expected 1125',
      v_count;
  end if;
end
$child_update_count$;

update public.poker_series actual
   set data_quality = 'stale',
       is_suppressed = true
  from pnm_bad_series_followup expected
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
    join pnm_bad_series_followup expected using (id)
   where actual.data_quality = 'stale'
     and actual.is_suppressed is true;
  if v_count <> 36 then
    raise exception 'series follow-up parent quarantine updated %, expected 36',
      v_count;
  end if;
end
$parent_update_count$;

do $post_apply$
begin
  if exists (
    select 1
      from public.poker_events e
      join pnm_bad_series_followup expected using (series_uid)
     where e.data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
  ) then
    raise exception 'post-apply failed: follow-up children remain servable';
  end if;

  if exists (
    select 1
      from public.poker_series actual
      join pnm_bad_series_followup expected using (id)
     where actual.is_suppressed is not true
        or actual.data_quality in (
          'scraped_verified', 'scraped_inferred', 'manual_research'
        )
  ) then
    raise exception 'post-apply failed: follow-up parents remain servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore only after a source-owned page proves the exact parent
-- identity and every child event fits that parent's inclusive date window.

