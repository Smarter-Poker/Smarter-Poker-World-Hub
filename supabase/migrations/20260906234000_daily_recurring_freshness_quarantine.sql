-- ==========================================================================
-- Daily recurring-schedule freshness and parser-artifact quarantine
-- Migration: 20260906234000_daily_recurring_freshness_quarantine.sql
-- ==========================================================================
-- A recurring schedule is an instruction to create future occurrences. Once
-- its source has not been re-verified for 30 days, continuing to project it is
-- equivalent to inventing future events. Preserve the rows for audit while
-- removing them from public discovery.

begin;

set local lock_timeout = '10s';
-- The provenance trigger validates every row; normalizing roughly 30k legacy
-- projection rows takes about three minutes on production hardware.
set local statement_timeout = '300s';

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
          ('id', 'uuid'),
          ('is_active', 'bool'),
          ('is_recurring', 'bool'),
          ('event_date', 'date'),
          ('parent_tournament_id', 'uuid'),
          ('last_scraped', 'timestamptz'),
          ('scrape_timestamp', 'timestamptz'),
          ('data_quality', 'text'),
          ('flags', 'jsonb'),
          ('tournament_name', 'text')
      ) expected(column_name, udt_name)
      left join information_schema.columns actual
        on actual.table_schema = 'public'
       and actual.table_name = 'venue_daily_tournaments'
       and actual.column_name = expected.column_name
     where actual.column_name is null
        or actual.udt_name <> expected.udt_name
  ) then
    raise exception 'pre-flight failed: recurring freshness schema drifted';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where flags is not null
       and jsonb_typeof(flags) <> 'array'
  ) then
    raise exception 'pre-flight failed: venue_daily_tournaments.flags is not an array';
  end if;
end
$preflight$;

create index if not exists idx_vdt_active_last_scraped_id
  on public.venue_daily_tournaments (
    coalesce(last_scraped, scrape_timestamp), id
  )
  where is_active is true;

-- These exact values were confirmed in the live active catalog. They are
-- JSON-LD keys, DOM IDs, CSS values, ad-widget identifiers, and booleans, not
-- tournament names. Keep the rows for forensic review, but never serve them.
update public.venue_daily_tournaments
   set is_active = false,
       data_quality = 'stale',
       flags = case
         when coalesce(flags, '[]'::jsonb)
              @> '["pnm_parser_artifact_quarantine_20260906"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_parser_artifact_quarantine_20260906"]'::jsonb
       end
 where is_active is true
   and (
     lower(btrim(tournament_name)) in (
       '@context', 'false', 'true', 'content', 'comp-jv7a5ybk',
       'color: #ffffff', 'agency_aps_iframe', 'eventattendancemode',
       'at-above-post addthis_tool', 'em texas hold',
       'em friday @ 7pm hold'
     )
     or lower(btrim(tournament_name))
        ~ '^font_[278][[:space:]]+wixui-rich-text__text$'
   );

-- Tag concrete children before normalizing their recurrence flag. The flag is
-- retained so read-time freshness checks can distinguish a projected child
-- from a source-dated one-off event.
update public.venue_daily_tournaments
   set flags = case
         when coalesce(flags, '[]'::jsonb)
              @> '["pnm_recurring_projection"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_recurring_projection"]'::jsonb
       end
 where is_recurring is true
   and event_date is not null
   and event_date <> date '1970-01-01';

update public.venue_daily_tournaments
   set is_active = false,
       data_quality = 'stale',
       flags = case
         when coalesce(flags, '[]'::jsonb)
              @> '["pnm_recurring_freshness_quarantine_20260906"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_recurring_freshness_quarantine_20260906"]'::jsonb
       end
 where is_active is true
   and (
     is_recurring is true
     or coalesce(flags, '[]'::jsonb) @> '["pnm_recurring_projection"]'::jsonb
   )
   and (
     coalesce(last_scraped, scrape_timestamp) is null
     or coalesce(last_scraped, scrape_timestamp) < now() - interval '30 days'
   );

-- A concrete occurrence has a concrete date. Its relationship to a recurring
-- template is represented by parent_tournament_id and the projection flag.
update public.venue_daily_tournaments
   set is_recurring = false
 where is_recurring is true
   and event_date is not null
   and event_date <> date '1970-01-01';

do $post_apply$
begin
  if exists (
    select 1
     from public.venue_daily_tournaments
     where is_active is true
       and (
         is_recurring is true
         or coalesce(flags, '[]'::jsonb) @> '["pnm_recurring_projection"]'::jsonb
       )
       and (
         coalesce(last_scraped, scrape_timestamp) is null
         or coalesce(last_scraped, scrape_timestamp) < now() - interval '30 days'
       )
  ) then
    raise exception 'post-apply failed: stale recurring schedules remain active';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where is_recurring is true
       and event_date is not null
       and event_date <> date '1970-01-01'
  ) then
    raise exception 'post-apply failed: dated rows remain marked recurring';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where is_active is true
       and (
         lower(btrim(tournament_name)) in (
           '@context', 'false', 'true', 'content', 'comp-jv7a5ybk',
           'color: #ffffff', 'agency_aps_iframe', 'eventattendancemode',
           'at-above-post addthis_tool', 'em texas hold',
           'em friday @ 7pm hold'
         )
         or lower(btrim(tournament_name))
            ~ '^font_[278][[:space:]]+wixui-rich-text__text$'
       )
  ) then
    raise exception 'post-apply failed: parser artifacts remain active';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK:
-- Rows are retained. Reactivate only after a new source observation confirms
-- the schedule; removing the flag without new evidence is not a valid rollback.
