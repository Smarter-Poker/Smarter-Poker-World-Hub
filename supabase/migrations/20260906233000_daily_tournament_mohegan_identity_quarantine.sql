-- ============================================================================
-- Mohegan Sun Pocono cross-venue schedule quarantine
-- Migration: 20260906233000_daily_tournament_mohegan_identity_quarantine.sql
-- ============================================================================
-- The PA venue has a correct Wilkes-Barre source now, but one still-active
-- legacy row came from Mohegan Sun Uncasville, Connecticut. Preserve the exact
-- row for audit and make it unservable immediately.

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
  if to_regclass('public.venue_daily_tournaments') is null then
    raise exception 'pre-flight failed: public.venue_daily_tournaments not found';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where id = '34acccdc-5390-4f11-8fe2-21458733b8ab'::uuid
       and not (
         venue_id = 2305
         and venue_name = 'Mohegan Sun Pocono'
         and source_url = 'https://www.pokeratlas.com/poker-room/mohegan-sun-uncasville/tournaments'
       )
  ) then
    raise exception 'pre-flight failed: audited Mohegan row identity drifted';
  end if;
end
$preflight$;

update public.venue_daily_tournaments
   set is_active = false,
       data_quality = 'stale',
       flags = case
         when coalesce(flags, '[]'::jsonb)
              @> '["pnm_source_identity_quarantine_20260906"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_source_identity_quarantine_20260906"]'::jsonb
       end
 where id = '34acccdc-5390-4f11-8fe2-21458733b8ab'::uuid
   and venue_id = 2305
   and venue_name = 'Mohegan Sun Pocono'
   and source_url = 'https://www.pokeratlas.com/poker-room/mohegan-sun-uncasville/tournaments';

do $post_apply$
begin
  if exists (
    select 1
      from public.venue_daily_tournaments
     where id = '34acccdc-5390-4f11-8fe2-21458733b8ab'::uuid
       and is_active is true
  ) then
    raise exception 'post-apply failed: cross-venue Mohegan row remains active';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore only if the exact Uncasville source proves Pocono identity.
