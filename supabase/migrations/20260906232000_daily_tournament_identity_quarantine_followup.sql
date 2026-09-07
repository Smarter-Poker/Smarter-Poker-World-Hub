-- ============================================================================
-- Daily-tournament cross-venue quarantine follow-up
-- Migration: 20260906232000_daily_tournament_identity_quarantine_followup.sql
-- ============================================================================
-- Live audit found two exact source-room assignments missed by the first
-- cleanup: Golden Nugget Atlantic City carried Golden Nugget Las Vegas rows,
-- and Harrah's Philadelphia carried Rivers Philadelphia rows. Preserve the
-- records for audit, but remove them from active discovery and clear matching
-- wrong source fields from the venue catalog.

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
begin
  if to_regclass('public.venue_daily_tournaments') is null
     or to_regclass('public.poker_venues') is null then
    raise exception 'pre-flight failed: Poker Near Me venue tables are missing';
  end if;
end
$preflight$;

with bad_mapping(venue_id, bad_slug) as (
  values
    (2293::bigint, 'golden-nugget-lv-las-vegas'),
    (2303::bigint, 'rivers-philadelphia')
)
update public.venue_daily_tournaments schedule
   set is_active = false,
       data_quality = 'stale',
       flags = case
         when coalesce(schedule.flags, '[]'::jsonb)
              @> '["pnm_source_identity_quarantine_20260906"]'::jsonb
           then coalesce(schedule.flags, '[]'::jsonb)
         else coalesce(schedule.flags, '[]'::jsonb)
              || '["pnm_source_identity_quarantine_20260906"]'::jsonb
       end
  from bad_mapping bad
 where schedule.venue_id = bad.venue_id
   and schedule.is_active is true
   and schedule.source_url ilike '%/poker-room/' || bad.bad_slug || '%';

with bad_mapping(venue_id, bad_slug) as (
  values
    (2293::bigint, 'golden-nugget-lv-las-vegas'),
    (2303::bigint, 'rivers-philadelphia')
)
update public.poker_venues venue
   set pokeratlas_url = case
         when venue.pokeratlas_url ilike '%/poker-room/' || bad.bad_slug || '%'
           then null else venue.pokeratlas_url end,
       poker_atlas_url = case
         when venue.poker_atlas_url ilike '%/poker-room/' || bad.bad_slug || '%'
           then null else venue.poker_atlas_url end,
       scrape_url = case
         when venue.scrape_url ilike '%/poker-room/' || bad.bad_slug || '%'
           then null else venue.scrape_url end,
       schedule_scrape_url = case
         when venue.schedule_scrape_url ilike '%/poker-room/' || bad.bad_slug || '%'
           then null else venue.schedule_scrape_url end
  from bad_mapping bad
 where venue.id = bad.venue_id;

do $post_apply$
begin
  if exists (
    select 1
      from public.venue_daily_tournaments
     where is_active is true
       and (
         (venue_id = 2293 and source_url ilike '%/poker-room/golden-nugget-lv-las-vegas%')
         or
         (venue_id = 2303 and source_url ilike '%/poker-room/rivers-philadelphia%')
       )
  ) then
    raise exception 'post-apply failed: cross-venue tournament rows remain active';
  end if;

  if exists (
    select 1
      from public.poker_venues
     where (id = 2293 and concat_ws(' ', pokeratlas_url, poker_atlas_url, scrape_url, schedule_scrape_url)
                              ilike '%/poker-room/golden-nugget-lv-las-vegas%')
        or (id = 2303 and concat_ws(' ', pokeratlas_url, poker_atlas_url, scrape_url, schedule_scrape_url)
                              ilike '%/poker-room/rivers-philadelphia%')
  ) then
    raise exception 'post-apply failed: wrong venue source URL remains configured';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore only from a reviewed source snapshot proving room identity.
