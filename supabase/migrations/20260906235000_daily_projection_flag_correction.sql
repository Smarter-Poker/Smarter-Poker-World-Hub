-- ==========================================================================
-- Correct legacy daily projection classification
-- Migration: 20260906235000_daily_projection_flag_correction.sql
-- ==========================================================================
-- Migration 20260906234000 initially tagged every legacy dated
-- is_recurring=true row as an expanded projection. Real daemon projections
-- always have parent_tournament_id; source-dated one-offs do not. Remove the
-- incorrect marker without reactivating or upgrading any stale evidence.

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
    raise exception 'pre-flight failed: public.venue_daily_tournaments is missing';
  end if;

  if exists (
    select 1
      from (
        values
          ('event_date', 'date'),
          ('parent_tournament_id', 'uuid'),
          ('flags', 'jsonb')
      ) expected(column_name, udt_name)
      left join information_schema.columns actual
        on actual.table_schema = 'public'
       and actual.table_name = 'venue_daily_tournaments'
       and actual.column_name = expected.column_name
     where actual.column_name is null
        or actual.udt_name <> expected.udt_name
  ) then
    raise exception 'pre-flight failed: projection correction schema drifted';
  end if;
end
$preflight$;

-- Rows incorrectly quarantined by the broad first predicate remain inactive
-- and stale. Remove the misleading reasons and retain an explicit audit marker
-- documenting the correction; new source evidence is required to reactivate.
update public.venue_daily_tournaments
   set flags = (
         (coalesce(flags, '[]'::jsonb) - 'pnm_recurring_projection')
           - 'pnm_recurring_freshness_quarantine_20260906'
       ) || '["pnm_projection_classification_corrected_20260906"]'::jsonb
 where parent_tournament_id is null
   and event_date is not null
   and event_date <> date '1970-01-01'
   and coalesce(flags, '[]'::jsonb)
       @> '["pnm_recurring_freshness_quarantine_20260906"]'::jsonb;

-- Fresh source-dated one-offs were never quarantined, but did receive the
-- projection marker. Remove only that incorrect marker.
update public.venue_daily_tournaments
   set flags = coalesce(flags, '[]'::jsonb) - 'pnm_recurring_projection'
 where parent_tournament_id is null
   and event_date is not null
   and event_date <> date '1970-01-01'
   and coalesce(flags, '[]'::jsonb) @> '["pnm_recurring_projection"]'::jsonb;

do $post_apply$
begin
  if exists (
    select 1
      from public.venue_daily_tournaments
     where parent_tournament_id is null
       and event_date is not null
       and event_date <> date '1970-01-01'
       and (
         coalesce(flags, '[]'::jsonb) @> '["pnm_recurring_projection"]'::jsonb
         or coalesce(flags, '[]'::jsonb)
            @> '["pnm_recurring_freshness_quarantine_20260906"]'::jsonb
       )
  ) then
    raise exception 'post-apply failed: source-dated rows remain projection-tagged';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK:
-- No automatic rollback. Reclassifying a source-dated one-off as an open-ended
-- recurrence would recreate the data-truth defect this migration corrects.
