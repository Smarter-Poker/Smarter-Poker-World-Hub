-- ============================================================================
-- Legacy poker-series source-identity quarantine
-- Migration: 20260906230000_poker_series_identity_quarantine.sql
-- ============================================================================
-- The live source audit proved that legacy series 2751 points at a different
-- tournament series. Preserve the historical row for forensic review, but make
-- both the bad event and its parent unservable until a correct source is found.

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
  if to_regclass('public.poker_events') is null
     or to_regclass('public.poker_series') is null then
    raise exception 'pre-flight failed: poker series tables are missing';
  end if;

  -- Runtime-generated rows are absent on a fresh database replay.  In that
  -- case this data repair is an intentional no-op.  If the exact event UUID is
  -- present, fail closed unless its identity still matches the audited row.
  if exists (
    select 1
      from public.poker_events
     where event_uid = '2751_html_e1_4a22d164'
       and not (
         series_uid = '2751'
         and event_name = 'Buyer'
         and source = 'venue_subpage'
       )
  ) then
    raise exception 'pre-flight failed: legacy series event identity conflicts with audited evidence';
  end if;
end
$preflight$;

update public.poker_events
   set data_quality = 'stale',
       flags = case
         when coalesce(flags, '[]'::jsonb) @> '["pnm_source_identity_quarantine_20260906"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_source_identity_quarantine_20260906"]'::jsonb
       end
 where series_uid = '2751'
   and event_uid = '2751_html_e1_4a22d164'
   and event_name = 'Buyer'
   and source = 'venue_subpage';

update public.poker_series
   set is_suppressed = true,
       data_quality = 'stale',
       source_url = null,
       scrape_url = null,
       events_scraped = false,
       event_count = 0,
       events_count = 0,
       scrape_confidence = 'low',
       scrape_status = 'failed',
       scrape_timestamp = now()
 where series_uid = '2751'
   and series_name = 'Kings Poker Room Series'
   and source_url = 'https://www.pokeratlas.com/poker-tournament-series/2026-wsop-europe-kings-casino-prague-2026';

do $post_apply$
begin
  if exists (
    select 1
      from public.poker_events
     where series_uid = '2751'
       and event_uid = '2751_html_e1_4a22d164'
       and data_quality <> 'stale'
  ) then
    raise exception 'post-apply failed: mismatched series event remains servable';
  end if;

  if exists (
    select 1
      from public.poker_series
     where series_uid = '2751'
       and series_name = 'Kings Poker Room Series'
       and source_url = 'https://www.pokeratlas.com/poker-tournament-series/2026-wsop-europe-kings-casino-prague-2026'
  ) then
    raise exception 'post-apply failed: mismatched series parent remains publishable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK (only after a correct, identity-verified source is configured):
-- * Restore series 2751 from a new verified scrape and remove is_suppressed.
-- * Reactivate the historical event only if its own source proves its identity.
