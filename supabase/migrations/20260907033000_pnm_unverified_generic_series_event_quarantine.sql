-- ============================================================================
-- Poker Near Me unverified generic series-event quarantine
-- Migration: 20260907033000_pnm_unverified_generic_series_event_quarantine.sql
-- ============================================================================
-- Generic page scanners cannot establish that an arbitrary currency value is
-- an event buy-in or that a row belongs to the requested series. Preserve all
-- 2,309 audited physical rows, but make them nonservable until a human or a
-- source-owned structured extractor verifies them. Eight contaminated legacy
-- tournament_series parents are also suppressed. No source row is deleted.

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

lock table public.poker_events in share row exclusive mode;
lock table public.tournament_series in share row exclusive mode;

create temporary table pnm_unsafe_event_sources (
  source text primary key,
  expected_count integer not null
) on commit drop;

insert into pnm_unsafe_event_sources values
  ('cardplayer', 159),
  ('html_fallback', 2121),
  ('venue_subpage', 27),
  ('venue_website', 2),
  ('bravo_venue', 0),
  ('source_url', 0),
  ('pdf_fallback', 0);

create temporary table pnm_false_tournament_series (
  id integer primary key,
  series_uid text,
  child_count integer not null,
  child_checksum text
) on commit drop;

insert into pnm_false_tournament_series values
  (469, 'pa_trailblazer-season-ii-finale-tch-social-austin-2026', 155,
   'd9f9ab2ee7845858c4395741c0131260'),
  (481, 'pa_100k-mystery-bounty-mad-river-poker-mahoning-valley-girard-2026', 15,
   '762ec845f875f5df57baff6e5ade568a'),
  (499, 'pa_poker-jamboree-ii-tgt-poker-tampa-2026', 65,
   '09cd6387d1c35ed5753ee8c301fa17ce'),
  (510, 'pa_2026-300-grand-stack-mgm-grand-las-vegas-2026', 8,
   '98b59daba3a004975545f17cab38b31c'),
  (580, null, 0, null),
  (581, null, 0, null),
  (589, 'MSPT-2026-588', 0, null),
  (592, 'MSPT-2026-725', 0, null);

do $preflight$
declare
  r record;
  v_count integer;
  v_checksum text;
begin
  if to_regclass('public.poker_events') is null
     or to_regclass('public.tournament_series') is null then
    raise exception 'pre-flight failed: series tables are missing';
  end if;

  select count(*), md5(string_agg(id::text, ',' order by id::text))
    into v_count, v_checksum
    from public.poker_events
   where source in (select source from pnm_unsafe_event_sources)
     and data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
     and coalesce(human_verified, false) is false
     and coalesce(flags, '[]'::jsonb) = '[]'::jsonb;
  if v_count <> 2309
     or v_checksum is distinct from '9061719585fe480056a0e5317816d884' then
    raise exception 'pre-flight failed: generic event cohort drifted (%, %)',
      v_count, v_checksum;
  end if;

  select md5(string_agg(distinct series_uid, ',' order by series_uid))
    into v_checksum
    from public.poker_events
   where source in (select source from pnm_unsafe_event_sources)
     and data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
     and coalesce(human_verified, false) is false
     and coalesce(flags, '[]'::jsonb) = '[]'::jsonb;
  if v_checksum is distinct from '53af2da9ab9c2345baf6a37977c804de' then
    raise exception 'pre-flight failed: generic event series identities drifted (%)',
      v_checksum;
  end if;

  if exists (
    select 1
      from pnm_unsafe_event_sources expected
      left join (
        select source, count(*)::integer as actual_count
          from public.poker_events
         where source in (select source from pnm_unsafe_event_sources)
           and data_quality in (
             'scraped_verified', 'scraped_inferred', 'manual_research'
           )
           and coalesce(human_verified, false) is false
           and coalesce(flags, '[]'::jsonb) = '[]'::jsonb
         group by source
      ) actual using (source)
     where coalesce(actual.actual_count, 0) <> expected.expected_count
  ) then
    raise exception 'pre-flight failed: generic event source distribution drifted';
  end if;

  if exists (
    select 1
      from public.poker_events
     where source in (select source from pnm_unsafe_event_sources)
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
       and coalesce(human_verified, false) is false
       and coalesce(flags, '[]'::jsonb) = '[]'::jsonb
       and (data_quality is distinct from 'scraped_verified'
            or human_verified is distinct from false)
  ) then
    raise exception 'pre-flight failed: generic event provenance distribution drifted';
  end if;

  -- The 76 children of already-suppressed parents are a strict subset of the
  -- 2,309-row generic cohort, not an additional update population.
  select count(*), md5(string_agg(id::text, ',' order by id::text))
    into v_count, v_checksum
    from public.poker_events
   where series_uid in ('2745', '2763')
     and data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     );
  if v_count <> 76
     or v_checksum is distinct from '2dcefb8c0f375f3199eb53047a163936' then
    raise exception 'pre-flight failed: suppressed-parent child cohort drifted (%, %)',
      v_count, v_checksum;
  end if;
  if (select count(*) from public.poker_events
       where series_uid = '2745'
         and data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research')) <> 12
     or (select count(*) from public.poker_events
       where series_uid = '2763'
         and data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research')) <> 64
     or exists (
       select 1
         from public.poker_events
        where series_uid in ('2745', '2763')
          and data_quality in (
            'scraped_verified', 'scraped_inferred', 'manual_research'
          )
          and not (
            source in (select source from pnm_unsafe_event_sources)
            and human_verified is false
            and coalesce(flags, '[]'::jsonb) = '[]'::jsonb
          )
     ) then
    raise exception 'pre-flight failed: suppressed-parent child subset drifted';
  end if;

  if (select count(*) from pnm_false_tournament_series) <> 8
     or (select md5(string_agg(id::text, ',' order by id::text))
           from pnm_false_tournament_series)
        is distinct from '7f58dcf97d19007d6c4762da1047d2ca' then
    raise exception 'pre-flight failed: false parent ID contract drifted';
  end if;

  -- This checksum covers every column of all eight parent rows, including
  -- identity, dates, location, provenance, counts, and suppression state.
  select count(*), md5(string_agg(to_jsonb(actual)::text, E'\n' order by actual.id))
    into v_count, v_checksum
    from public.tournament_series actual
    join pnm_false_tournament_series expected using (id);
  if v_count <> 8
     or v_checksum is distinct from 'a37711848e8dd08652a5ba5a62afe7e7' then
    raise exception 'pre-flight failed: false parent snapshots drifted (%, %)',
      v_count, v_checksum;
  end if;

  for r in select * from pnm_false_tournament_series order by id
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
      raise exception 'pre-flight failed: parent % children drifted (%, %)',
        r.id, v_count, v_checksum;
    end if;
  end loop;

  select count(*), md5(string_agg(e.id::text, ',' order by e.id::text))
    into v_count, v_checksum
    from public.poker_events e
   where e.series_uid in (
     select series_uid from pnm_false_tournament_series where series_uid is not null
   )
     and e.data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     );
  if v_count <> 243
     or v_checksum is distinct from '7e887d0f30b31a0365d16f1f6e59dd26' then
    raise exception 'pre-flight failed: false parent children drifted (%, %)',
      v_count, v_checksum;
  end if;
end
$preflight$;

update public.poker_events
   set data_quality = 'stale',
       flags = coalesce(flags, '[]'::jsonb)
         || '["pnm_unverified_generic_series_event_quarantine_20260907"]'::jsonb
 where source in (select source from pnm_unsafe_event_sources)
   and data_quality in (
     'scraped_verified', 'scraped_inferred', 'manual_research'
   )
   and coalesce(human_verified, false) is false
   and coalesce(flags, '[]'::jsonb) = '[]'::jsonb;

update public.tournament_series actual
   set data_quality = 'stale',
       is_suppressed = true,
       is_featured = false,
       scrape_status = 'quarantined'
  from pnm_false_tournament_series expected
 where actual.id = expected.id
   and actual.data_quality in (
     'scraped_verified', 'scraped_inferred', 'manual_research'
   )
   and actual.is_suppressed is false;

do $post_apply$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.poker_events
   where data_quality = 'stale'
     and coalesce(flags, '[]'::jsonb)
         @> '["pnm_unverified_generic_series_event_quarantine_20260907"]'::jsonb;
  if v_count <> 2309 then
    raise exception 'generic series-event quarantine updated %, expected 2309',
      v_count;
  end if;

  if exists (
    select 1
      from public.poker_events
     where source in (select source from pnm_unsafe_event_sources)
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
       and coalesce(human_verified, false) is false
  ) then
    raise exception 'post-apply failed: an unverified generic event remains servable';
  end if;

  if exists (
    select 1
      from public.tournament_series actual
      join pnm_false_tournament_series expected using (id)
     where actual.is_suppressed is distinct from true
        or actual.data_quality is distinct from 'stale'
        or actual.scrape_status is distinct from 'quarantined'
        or actual.is_featured is distinct from false
  ) then
    raise exception 'post-apply failed: a false parent remains servable';
  end if;

  if exists (
    select 1
      from public.poker_events
     where series_uid in ('2745', '2763')
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
  ) then
    raise exception 'post-apply failed: suppressed-parent children remain servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore a row only after a human or source-owned structured
-- extractor proves its exact series identity and every event field.
