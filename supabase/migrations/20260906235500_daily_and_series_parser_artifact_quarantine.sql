-- ============================================================================
-- Daily and series parser-artifact quarantine follow-up
-- Migration: 20260906235500_daily_and_series_parser_artifact_quarantine.sql
-- ============================================================================
-- A live read-only audit found four exact non-event labels still active in the
-- daily feed and one incomplete HTML fragment in poker_events. Preserve every
-- row for audit while removing it from all quality-gated public discovery.

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
     or to_regclass('public.poker_events') is null then
    raise exception 'pre-flight failed: Poker Near Me event tables are missing';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where flags is not null
       and jsonb_typeof(flags) <> 'array'
  ) or exists (
    select 1
      from public.poker_events
     where flags is not null
       and jsonb_typeof(flags) <> 'array'
  ) then
    raise exception 'pre-flight failed: event flags must be JSON arrays';
  end if;

  if exists (
    select 1
      from public.poker_events
     where id = '17700ed6-8713-42f7-8194-2452f3461959'::uuid
       and not (
         series_uid = '2719'
         and event_uid = '2719_html_e1_4d95a917'
         and event_name = '><head><meta charSet='
       )
  ) then
    raise exception 'pre-flight failed: audited poker_events identity drifted';
  end if;

  -- Runtime-generated daily rows are intentionally absent on a clean replay.
  -- If any of the audited production set exists, require the complete exact
  -- 79-row set so a partial or drifted identity cannot be changed silently.
  if (
    select count(*)
      from public.venue_daily_tournaments
     where is_active is true
       and lower(btrim(tournament_name)) in (
         'script',
         'id=',
         'https://championsclubtexas.com/event/5k-midweek-plo/',
         't miss out on the best promotion in town, the big blind'
       )
  ) not in (0, 79) then
    raise exception 'pre-flight failed: audited daily artifact set is partial or drifted';
  end if;
end
$preflight$;

update public.venue_daily_tournaments
   set is_active = false,
       data_quality = 'stale',
       flags = case
         when coalesce(flags, '[]'::jsonb)
              @> '["pnm_parser_artifact_quarantine_20260906_followup"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_parser_artifact_quarantine_20260906_followup"]'::jsonb
       end
 where is_active is true
   and lower(btrim(tournament_name)) in (
     'script',
     'id=',
     'https://championsclubtexas.com/event/5k-midweek-plo/',
     't miss out on the best promotion in town, the big blind'
   );

update public.poker_events
   set data_quality = 'stale',
       flags = case
         when coalesce(flags, '[]'::jsonb)
              @> '["pnm_parser_artifact_quarantine_20260906_followup"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_parser_artifact_quarantine_20260906_followup"]'::jsonb
       end
 where id = '17700ed6-8713-42f7-8194-2452f3461959'::uuid
   and series_uid = '2719'
   and event_uid = '2719_html_e1_4d95a917'
   and event_name = '><head><meta charSet=';

do $post_apply$
begin
  if exists (
    select 1
      from public.venue_daily_tournaments
     where is_active is true
       and lower(btrim(tournament_name)) in (
         'script',
         'id=',
         'https://championsclubtexas.com/event/5k-midweek-plo/',
         't miss out on the best promotion in town, the big blind'
       )
  ) then
    raise exception 'post-apply failed: daily parser artifacts remain active';
  end if;

  if exists (
    select 1
      from public.poker_events
     where id = '17700ed6-8713-42f7-8194-2452f3461959'::uuid
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
  ) then
    raise exception 'post-apply failed: series parser artifact remains servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: reactivate only after exact source evidence proves a real event.
