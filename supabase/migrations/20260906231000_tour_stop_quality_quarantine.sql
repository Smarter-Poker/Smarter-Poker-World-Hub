-- ============================================================================
-- Tour-stop extraction quarantine
-- Migration: 20260906231000_tour_stop_quality_quarantine.sql
-- ============================================================================
-- A live canary on Wynn's poker page proved two exact rows should not remain
-- publishable: a utility CTA was paired with an image-alt date, and the source
-- heading duplicated an existing manually researched stop for the same dates.
-- Preserve both rows for audit while excluding stale quality in API readers.

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
  if to_regclass('public.tour_stop_events') is null then
    raise exception 'pre-flight failed: public.tour_stop_events not found';
  end if;

  -- Fresh databases do not contain these runtime-generated UUIDs. If an ID is
  -- present, however, require every audited identity field before changing it.
  if exists (
    select 1 from public.tour_stop_events where id in (
      '25d63d43-dcb6-4efe-8066-4b82445a9de8'::uuid,
      '49ab71e1-a3b3-4504-b45e-80b60b3a8c99'::uuid
    )
  ) and exists (
    select 1
      from public.tour_stop_events
     where id in (
       '25d63d43-dcb6-4efe-8066-4b82445a9de8'::uuid,
       '49ab71e1-a3b3-4504-b45e-80b60b3a8c99'::uuid
     )
       and not (
         tour_code = 'WYNN'
         and source_url = 'https://www.wynnlasvegas.com/casino/poker'
         and stop_start_date = date '2026-08-17'
         and stop_end_date = date '2026-09-07'
         and (
           (id = '25d63d43-dcb6-4efe-8066-4b82445a9de8'::uuid
            and stop_name = 'CHIP COUNTS/REDRAWS')
           or
           (id = '49ab71e1-a3b3-4504-b45e-80b60b3a8c99'::uuid
            and stop_name = 'WYNN SIGNATURE SERIES')
         )
       )
  ) then
    raise exception 'pre-flight failed: audited Wynn tour-stop identity drifted';
  end if;
end
$preflight$;

update public.tour_stop_events
   set data_quality = 'stale',
       notes = concat_ws(
         ' | ',
         nullif(notes, ''),
         case
           when id = '25d63d43-dcb6-4efe-8066-4b82445a9de8'::uuid
             then 'Quarantined 2026-09-06: utility CTA was not a tour stop.'
           else 'Quarantined 2026-09-06: duplicate of manually researched Wynn Signature Series stop.'
         end
       )
 where id in (
   '25d63d43-dcb6-4efe-8066-4b82445a9de8'::uuid,
   '49ab71e1-a3b3-4504-b45e-80b60b3a8c99'::uuid
 );

do $post_apply$
begin
  if exists (
    select 1
      from public.tour_stop_events
     where id in (
       '25d63d43-dcb6-4efe-8066-4b82445a9de8'::uuid,
       '49ab71e1-a3b3-4504-b45e-80b60b3a8c99'::uuid
     )
       and data_quality <> 'stale'
  ) then
    raise exception 'post-apply failed: audited Wynn rows remain publishable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK (only after a source-specific parser proves the row identity):
-- Restore a row's prior quality after reviewing its exact source snapshot.
