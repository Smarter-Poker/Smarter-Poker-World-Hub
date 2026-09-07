-- ============================================================================
-- Poker Near Me daily parser-artifact quarantine
-- Migration: 20260907030000_pnm_social_wall_daily_artifact_quarantine.sql
-- ============================================================================
-- Preserve all source rows. Thirteen future projections accidentally used a
-- Squarespace implementation class as the tournament name. They are not
-- player-facing events and must not remain servable.

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

create temporary table pnm_social_wall_artifacts (
  id uuid primary key
) on commit drop;

insert into pnm_social_wall_artifacts (id) values
  ('009a215a-ebf2-443a-9597-16ff34f93b53'::uuid),
  ('06794c7b-316b-4108-b48e-caa51b7e34d1'::uuid),
  ('0c05477f-6e7b-47f4-9930-5d0135fe1902'::uuid),
  ('135decfb-bdc6-4e6d-9dde-17025a52d4f1'::uuid),
  ('1a0a373d-3297-4626-9da5-08b496c5acba'::uuid),
  ('2d6e8b31-473d-495d-9999-00275c7503c2'::uuid),
  ('65e6e87d-aaee-4bfb-9b3c-4127a2c177bf'::uuid),
  ('72d86dd2-7999-428f-8d2c-b50f378dd46c'::uuid),
  ('7558622c-9415-43af-a238-369ca75ad332'::uuid),
  ('8969a7c0-b95a-45d4-a6c5-9f253fcf73ad'::uuid),
  ('d1755cbd-dac8-4cbf-8a5d-611bdf9988f9'::uuid),
  ('d626b651-2389-4dd0-adb0-9f8aaa47133d'::uuid),
  ('f43b4860-c21c-41dc-8c17-f4d09a7e12ec'::uuid);

do $preflight$
declare
  v_count integer;
  v_checksum text;
begin
  if to_regclass('public.venue_daily_tournaments') is null then
    raise exception 'pre-flight failed: public.venue_daily_tournaments is missing';
  end if;

  select count(*), md5(string_agg(id::text, ',' order by id::text))
    into v_count, v_checksum
    from pnm_social_wall_artifacts;
  if v_count <> 13
     or v_checksum is distinct from '22bc70fc51b6a62face62514a33ddf06' then
    raise exception 'pre-flight failed: social-wall UUID cohort drifted (%, %)',
      v_count, v_checksum;
  end if;

  select count(*), md5(string_agg(d.id::text, ',' order by d.id::text))
    into v_count, v_checksum
    from public.venue_daily_tournaments d
    join pnm_social_wall_artifacts expected using (id)
   where d.venue_id = 2019
     and d.venue_name = 'House of Kings Card Club'
     and d.source_url = 'https://www.houseofkingscardclubep.com'
     and d.data_quality = 'scraped_inferred'
     and d.human_verified is false
     and d.is_active is true
     and d.is_suppressed is false
     and d.event_date between date '2026-09-10' and date '2026-10-01'
     and d.tournament_name ilike 'social-wall-stream-%'
     and coalesce(d.flags, '[]'::jsonb) @> '["pnm_recurring_projection"]'::jsonb;
  if v_count <> 13
     or v_checksum is distinct from '22bc70fc51b6a62face62514a33ddf06' then
    raise exception 'pre-flight failed: social-wall rows drifted (%, %)',
      v_count, v_checksum;
  end if;
end
$preflight$;

update public.venue_daily_tournaments d
   set is_active = false,
       is_suppressed = true,
       data_quality = 'stale',
       flags = case
         when coalesce(d.flags, '[]'::jsonb)
              @> '["pnm_social_wall_artifact_quarantine_20260907"]'::jsonb
           then coalesce(d.flags, '[]'::jsonb)
         else coalesce(d.flags, '[]'::jsonb)
              || '["pnm_social_wall_artifact_quarantine_20260907"]'::jsonb
       end
  from pnm_social_wall_artifacts expected
 where d.id = expected.id
   and d.is_active is true
   and d.is_suppressed is false
   and d.data_quality = 'scraped_inferred';

do $post_apply$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from public.venue_daily_tournaments d
    join pnm_social_wall_artifacts expected using (id)
   where d.is_active is false
     and d.is_suppressed is true
     and d.data_quality = 'stale'
     and coalesce(d.flags, '[]'::jsonb)
         @> '["pnm_social_wall_artifact_quarantine_20260907"]'::jsonb;
  if v_count <> 13 then
    raise exception 'social-wall quarantine updated %, expected 13', v_count;
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments d
      join pnm_social_wall_artifacts expected using (id)
     where d.is_active is true
        or d.is_suppressed is not true
        or d.data_quality in (
          'scraped_verified', 'scraped_inferred', 'manual_research'
        )
  ) then
    raise exception 'post-apply failed: a social-wall artifact remains servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore only after a human verifies each exact event against a
-- clean venue-owned schedule; the implementation-token names are not evidence.
