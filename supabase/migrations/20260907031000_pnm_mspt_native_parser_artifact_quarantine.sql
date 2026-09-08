-- ============================================================================
-- Poker Near Me MSPT native-parser artifact quarantine
-- Migration: 20260907031000_pnm_mspt_native_parser_artifact_quarantine.sql
-- ============================================================================
-- Preserve every source row. The retired native parser shifted homepage-card
-- fields, published no-date stops, and treated guarantees as buy-ins. These 16
-- exact still-servable rows are quarantined; two rows from the same source hash
-- were already stale before this migration and are intentionally untouched.

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

create temporary table pnm_mspt_native_artifacts (
  id uuid primary key
) on commit drop;

insert into pnm_mspt_native_artifacts (id) values
  ('053487a2-7b2f-4642-b7fc-2322424da1c6'::uuid),
  ('20d4b5b3-134f-43ae-b81c-2d4afb4a867b'::uuid),
  ('25cca858-2f91-463f-bc6b-c1c280016b49'::uuid),
  ('279f5aa6-771c-4dfa-9821-33cf7ab5fed5'::uuid),
  ('28dcf64b-f2ed-47ca-825a-3f0952dd60f4'::uuid),
  ('6935a968-1573-4f04-9c62-844f082a3fda'::uuid),
  ('7ae30755-f848-4ed7-9793-32b6ba6c0246'::uuid),
  ('83d21ae0-ce3c-4888-ba5b-0f50d3a71cc8'::uuid),
  ('85ff98b8-554a-4bf3-ba44-c7185918f919'::uuid),
  ('a5bfd388-7164-42da-89af-8adc123c097f'::uuid),
  ('ba760972-8ca9-4fae-aeab-fbd3b8b71b66'::uuid),
  ('c3e0ca47-af58-46a5-bb86-5fc946f9b64c'::uuid),
  ('caa54b82-d7ac-401b-84b2-37e4113884ad'::uuid),
  ('ccbbcbe4-6c4f-4bcd-9515-ba252d66c433'::uuid),
  ('edc36164-45b2-4417-9926-c1a4512a2c5b'::uuid),
  ('fd6c647f-a283-41e5-a698-08431296775c'::uuid);

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
    from pnm_mspt_native_artifacts;
  if v_count <> 16
     or v_checksum is distinct from '2eeeeab60df1251c468390e974d65c49' then
    raise exception 'pre-flight failed: MSPT native UUID cohort drifted (%, %)',
      v_count, v_checksum;
  end if;

  select count(*), md5(string_agg(t.id::text, ',' order by t.id::text))
    into v_count, v_checksum
    from public.tour_stop_events t
    join pnm_mspt_native_artifacts expected using (id)
   where t.tour_code = 'MSPT'
     and t.source_url = 'https://msptpoker.com/'
     and t.scrape_script =
       '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/scrape_tour_native.py'
     and t.scrape_html_hash =
       'd74e452ac1a6c571ad57824218138519d8fa61332252193489ba5fc6548c282b'
     and t.data_quality = 'scraped_verified'
     and t.stop_start_date is null
     and t.stop_end_date is null
     and t.start_date is null;
  if v_count <> 16
     or v_checksum is distinct from '2eeeeab60df1251c468390e974d65c49' then
    raise exception 'pre-flight failed: MSPT native rows drifted (%, %)',
      v_count, v_checksum;
  end if;
end
$preflight$;

update public.tour_stop_events t
   set data_quality = 'stale',
       notes = concat_ws(
         ' | ', nullif(t.notes, ''),
         'Quarantined 2026-09-07: retired MSPT native parser shifted card fields.'
       )
  from pnm_mspt_native_artifacts expected
 where t.id = expected.id
   and t.data_quality = 'scraped_verified';

do $post_apply$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.tour_stop_events t
    join pnm_mspt_native_artifacts expected using (id)
   where t.data_quality = 'stale'
     and t.notes like
       '%Quarantined 2026-09-07: retired MSPT native parser shifted card fields.%';
  if v_count <> 16 then
    raise exception 'MSPT native quarantine updated %, expected 16', v_count;
  end if;

  if exists (
    select 1
      from public.tour_stop_events t
      join pnm_mspt_native_artifacts expected using (id)
     where t.data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     )
  ) then
    raise exception 'post-apply failed: an MSPT native artifact remains servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore only after exact source-owned event dates, location, and
-- buy-in evidence are independently verified and written by the active owner.
