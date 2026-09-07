-- ============================================================================
-- Daily tournament runtime cleanup and bounded-sweep index
-- Migration: 20260906225000_daily_tournament_runtime_cleanup.sql
-- ============================================================================
-- Keeps historical rows for audit/rollback while removing them from active
-- discovery.  The bad PokerAtlas mappings below were confirmed by the venue
-- catalog audit: the same source room had been assigned to unrelated venues.

begin;

set local lock_timeout = '10s';
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
  if to_regclass('public.venue_daily_tournaments') is null
     or to_regclass('public.poker_venues') is null then
    raise exception 'pre-flight failed: Poker Near Me venue tables are missing';
  end if;

  if exists (
    select 1
      from (
        values
          ('venue_daily_tournaments', 'id', 'uuid'),
          ('venue_daily_tournaments', 'event_date', 'date'),
          ('venue_daily_tournaments', 'is_active', 'bool'),
          ('venue_daily_tournaments', 'is_recurring', 'bool'),
          ('venue_daily_tournaments', 'is_special_event', 'bool'),
          ('venue_daily_tournaments', 'data_quality', 'text'),
          ('venue_daily_tournaments', 'flags', 'jsonb'),
          ('poker_venues', 'id', 'int4'),
          ('poker_venues', 'pokeratlas_slug', 'text'),
          ('poker_venues', 'pokeratlas_url', 'text'),
          ('poker_venues', 'poker_atlas_url', 'text'),
          ('poker_venues', 'scrape_url', 'text'),
          ('poker_venues', 'schedule_scrape_url', 'text')
      ) expected(table_name, column_name, udt_name)
      left join information_schema.columns actual
        on actual.table_schema = 'public'
       and actual.table_name = expected.table_name
       and actual.column_name = expected.column_name
     where actual.column_name is null
        or actual.udt_name <> expected.udt_name
  ) then
    raise exception 'pre-flight failed: daily tournament cleanup schema drifted';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where flags is not null
       and jsonb_typeof(flags) <> 'array'
       and not (
         jsonb_typeof(flags) = 'string'
         and flags #>> '{}' in ('[]', '["vision_ai_extracted"]')
       )
  ) then
    raise exception 'pre-flight failed: unsupported venue_daily_tournaments.flags shape found';
  end if;
end
$preflight$;

-- Repair the only two inventoried legacy shapes: JSON strings that themselves
-- contain a serialized JSON array.  No flag is discarded or reinterpreted.
update public.venue_daily_tournaments
   set flags = (flags #>> '{}')::jsonb
 where jsonb_typeof(flags) = 'string';

-- Supports both the runtime's bounded past-event sweep and current/future API
-- reads.  The production table had no event_date index despite historical
-- migrations declaring one, which left a 28k-row UPDATE to sequential-scan.
create index if not exists idx_vdt_active_event_date_id
  on public.venue_daily_tournaments (event_date, id)
  where is_active is true;

-- These are evidence-confirmed wrong room assignments, not fuzzy guesses.
-- Numeric PokerAtlas links were navigation CTA artifacts, while the named
-- slugs belonged to a different venue in the PokerAtlas directory.
with bad_mapping(venue_id, bad_slug) as (
  values
    (2057::bigint, 'resorts-world-las-vegas'),
    (2307::bigint, 'resorts-world-las-vegas'),
    (2329::bigint, 'resorts-world-las-vegas'),
    (2470::bigint, 'resorts-world-las-vegas'),
    (2478::bigint, 'resorts-world-las-vegas'),
    (2481::bigint, 'resorts-world-las-vegas'),
    (1962::bigint, '10803'),
    (1965::bigint, '10803'),
    (1992::bigint, '10803'),
    (2303::bigint, '10803'),
    (2472::bigint, '10803'),
    (2178::bigint, '9059'),
    (2165::bigint, 'venetian-las-vegas'),
    (2241::bigint, 'venetian-las-vegas'),
    (2256::bigint, 'venetian-las-vegas'),
    (2468::bigint, 'bellagio-las-vegas'),
    (1934::bigint, 'parkwest-lodi'),
    (1935::bigint, 'parkwest-lodi'),
    (2317::bigint, 'paradise-poker-utica'),
    (3378::bigint, 'bear-river-casino-loleta'),
    (2457::bigint, 'celebrity-card-club-odessa'),
    (3379::bigint, 'horseshoe-indy-shelbyville')
)
update public.venue_daily_tournaments schedule
   set is_active = false,
       data_quality = 'stale',
       flags = case
         when coalesce(schedule.flags, '[]'::jsonb) @> '["pnm_source_identity_quarantine_20260906"]'::jsonb
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
    (2057::bigint, 'resorts-world-las-vegas'),
    (2307::bigint, 'resorts-world-las-vegas'),
    (2329::bigint, 'resorts-world-las-vegas'),
    (2470::bigint, 'resorts-world-las-vegas'),
    (2478::bigint, 'resorts-world-las-vegas'),
    (2481::bigint, 'resorts-world-las-vegas'),
    (1962::bigint, '10803'),
    (1965::bigint, '10803'),
    (1992::bigint, '10803'),
    (2303::bigint, '10803'),
    (2472::bigint, '10803'),
    (2178::bigint, '9059'),
    (2165::bigint, 'venetian-las-vegas'),
    (2241::bigint, 'venetian-las-vegas'),
    (2256::bigint, 'venetian-las-vegas'),
    (2468::bigint, 'bellagio-las-vegas'),
    (1934::bigint, 'parkwest-lodi'),
    (1935::bigint, 'parkwest-lodi'),
    (2317::bigint, 'paradise-poker-utica'),
    (3378::bigint, 'bear-river-casino-loleta'),
    (2457::bigint, 'celebrity-card-club-odessa'),
    (3379::bigint, 'horseshoe-indy-shelbyville')
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

-- Daytona's current venue homepage was captured and audited.  Its five
-- supposed tournaments were cash-promotion copy (Money Wheel / Power Hours),
-- and the hardened parser now returns a valid empty result for that page.
update public.venue_daily_tournaments schedule
   set is_active = false,
       data_quality = 'stale',
       flags = case
         when coalesce(schedule.flags, '[]'::jsonb) @> '["pnm_promotion_copy_quarantine_20260906"]'::jsonb
           then coalesce(schedule.flags, '[]'::jsonb)
         else coalesce(schedule.flags, '[]'::jsonb)
              || '["pnm_promotion_copy_quarantine_20260906"]'::jsonb
       end
 where schedule.is_active is true
   and (
     (
       schedule.venue_id = 2037
       and rtrim(lower(schedule.source_url), '/') = 'https://www.daytonabeachpoker.com'
     )
     or schedule.data_quality = 'stale'
     or schedule.tournament_name ~* (
       'jsx-|main-menu|menu-wrapper|relative z-|elementor-|wix-|class=|</|<script|row-unique|'
       'mega money wheel|power hours|high hand promotion|giveaway|drawing|sweepstakes'
     )
     or (
       schedule.is_recurring is true
       and coalesce(schedule.is_special_event, false) is false
       and schedule.event_date > (now() at time zone 'America/Los_Angeles')::date + 90
     )
   );

-- Historical rows remain available for audit, but must not be returned as an
-- active upcoming schedule.  Use the westernmost continental-US business date
-- so a tournament is never retired while it is still today at its venue.
update public.venue_daily_tournaments
   set is_active = false
 where is_active is true
   and (
     event_date = date '1970-01-01'
     or (
       event_date is not null
       and event_date < (now() at time zone 'America/Los_Angeles')::date
     )
   );

do $post_apply$
declare
  v_index_definition text;
begin
  select indexdef
    into v_index_definition
    from pg_indexes
   where schemaname = 'public'
     and tablename = 'venue_daily_tournaments'
     and indexname = 'idx_vdt_active_event_date_id';
  if v_index_definition is null
     or v_index_definition not ilike '%(event_date, id)%'
     or v_index_definition not ilike '%where (is_active is true)%' then
    raise exception 'post-apply failed: active event-date sweep index is missing or drifted';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where is_active is true
       and (
         event_date = date '1970-01-01'
         or (event_date is not null and event_date < (now() at time zone 'America/Los_Angeles')::date)
         or data_quality = 'stale'
         or tournament_name ~* (
           'jsx-|main-menu|menu-wrapper|relative z-|elementor-|wix-|class=|</|<script|row-unique|'
           'mega money wheel|power hours|high hand promotion|giveaway|drawing|sweepstakes'
         )
         or (
           is_recurring is true
           and coalesce(is_special_event, false) is false
           and event_date > (now() at time zone 'America/Los_Angeles')::date + 90
         )
       )
  ) then
    raise exception 'post-apply failed: invalid or expired daily tournaments remain active';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments
     where flags is not null and jsonb_typeof(flags) <> 'array'
  ) then
    raise exception 'post-apply failed: legacy serialized flags remain';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK:
-- * The migration never deletes a tournament row. Rows carrying either
--   pnm_*_quarantine_20260906 flag can be reviewed and reactivated explicitly.
-- * Wrong source values are reconstructible from the bad_mapping list above.
-- * The date cleanup intentionally has no bulk reactivation rollback: expired
--   schedules must remain historical.
-- drop index concurrently if exists public.idx_vdt_active_event_date_id;
