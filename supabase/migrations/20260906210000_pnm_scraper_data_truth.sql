-- ═══════════════════════════════════════════════════════════════════════
-- 20260906210000_pnm_scraper_data_truth.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      Codex scraper/data-truth track
-- AFFECTS:     venue_live_tables, venue_live_history, game_live_history,
--              venue_daily_tournaments, tour_stop_events, scraper_metrics
-- IRREVERSIBLE: no (explicit rollback is included below)
--
-- WHY:
--   Simulator rows used the same source and quality vocabulary as observed
--   Bravo rows, so they entered PokerAtlas's observed-source dedupe index.
--   PokerAtlas catalog rows and inferred tournament rows were also forced into
--   quality values that described stronger evidence than the source provided.
--   Finally, scraper_metrics could not distinguish a confirmed valid-empty run
--   from a run that persisted zero rows after a write failure.
--
-- HOW:
--   * Adds one shared observation_kind vocabulary to current + history cash data.
--   * Backfills legacy sim-* and PokerAtlas rows before enforcing the contract.
--   * Replaces data_quality checks with the values production writers emit.
--   * Adds explicit attempted/rejected/run-status fields to scraper_metrics.
--
-- APPLY ORDER:
--   1. Pause every Bravo, PokerAtlas, simulator, and tournament writer.
--   2. Apply this migration through the sanctioned migration workflow.
--   3. Deploy daemon/API code that writes and selects the new columns.
--   4. Resume writers only after their deployed revisions are verified.
--   Older writers are intentionally rejected by the new consistency checks, so
--   skipping the pause creates a preventable ingestion outage.
-- ═══════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- 1. PRE-FLIGHT ASSERTIONS
do $$
declare
  v_table text;
  v_unknown text;
  v_unexpected_constraints text;
  v_definition_hash text;
begin
  foreach v_table in array array[
    'venue_live_tables',
    'venue_live_history',
    'game_live_history',
    'venue_daily_tournaments',
    'tour_stop_events',
    'scraper_metrics'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'pre-flight failed: public.% not found', v_table;
    end if;
  end loop;

  -- This migration owns these columns and its rollback removes them. Abort on
  -- schema drift rather than normalizing or deleting somebody else's columns.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and (
         (table_name in ('venue_live_tables', 'venue_live_history', 'game_live_history')
          and column_name = 'observation_kind')
         or (table_name = 'scraper_metrics' and column_name in (
           'run_status', 'records_attempted', 'records_rejected', 'status_reason'
         ))
       )
  ) then
    raise exception 'pre-flight failed: one or more migration-owned columns already exist';
  end if;

  if to_regprocedure('public.enforce_vdt_scrape_provenance_truth()') is not null then
    raise exception 'pre-flight failed: migration-owned VDT trigger function already exists';
  end if;

  if exists (
    select 1
      from pg_constraint co
      join pg_class cl on cl.oid = co.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
     where ns.nspname = 'public'
       and co.conname in (
         'venue_live_tables_observation_kind_check',
         'venue_live_history_observation_kind_check',
         'game_live_history_observation_kind_check',
         'venue_live_tables_provenance_consistency_check',
         'venue_live_history_provenance_consistency_check',
         'game_live_history_provenance_consistency_check',
         'venue_live_tables_data_quality_truth_check',
         'venue_live_tables_evidence_quality_consistency_check',
         'venue_daily_tournaments_data_quality_truth_check',
         'tour_stop_events_data_quality_truth_check',
         'scraper_metrics_run_status_check',
         'scraper_metrics_record_counts_check'
       )
  ) then
    raise exception 'pre-flight failed: a migration-owned constraint name already exists';
  end if;

  if exists (
    select 1
      from (
        values
          ('venue_live_tables', 'source', 'text'),
          ('venue_live_tables', 'scrape_batch_id', 'text'),
          ('venue_live_tables', 'data_quality', 'text'),
          ('venue_live_tables', 'venue_name', 'text'),
          ('venue_live_tables', 'bravo_slug', 'text'),
          ('venue_live_history', 'source', 'text'),
          ('venue_live_history', 'batch_id', 'text'),
          ('game_live_history', 'source', 'text'),
          ('game_live_history', 'batch_id', 'text'),
          ('venue_daily_tournaments', 'data_quality', 'text'),
          ('venue_daily_tournaments', 'scrape_html_hash', 'text'),
          ('venue_daily_tournaments', 'scrape_timestamp', 'timestamptz'),
          ('tour_stop_events', 'data_quality', 'text'),
          ('scraper_metrics', 'records_saved', 'int4'),
          ('scraper_metrics', 'errors', 'int4')
      ) as expected(table_name, column_name, udt_name)
      left join information_schema.columns actual
        on actual.table_schema = 'public'
       and actual.table_name = expected.table_name
       and actual.column_name = expected.column_name
     where actual.column_name is null
        or actual.udt_name is distinct from expected.udt_name
  ) then
    raise exception 'pre-flight failed: a referenced scraper column contract drifted';
  end if;

  -- These hashes are the exact, validated production CHECK definitions
  -- inventoried for this migration. A familiar name with changed semantics is
  -- schema drift and must never be silently dropped.
  select md5(pg_get_constraintdef(co.oid))
    into v_definition_hash
    from pg_constraint co
   where co.conrelid = 'public.venue_live_tables'::regclass
     and co.conname = 'venue_live_tables_data_quality_check'
     and co.contype = 'c'
     and co.convalidated;
  if v_definition_hash is distinct from '4e5b69c252ac864b3f445a694f55daed' then
    raise exception 'pre-flight failed: venue_live_tables data_quality CHECK drifted';
  end if;

  select md5(pg_get_constraintdef(co.oid))
    into v_definition_hash
    from pg_constraint co
   where co.conrelid = 'public.venue_daily_tournaments'::regclass
     and co.conname = 'check_data_quality_provenance'
     and co.contype = 'c'
     and co.convalidated;
  if v_definition_hash is distinct from '725fb83b051e6a9e88d116fb7195c34c' then
    raise exception 'pre-flight failed: venue_daily_tournaments provenance CHECK drifted';
  end if;

  select md5(pg_get_constraintdef(co.oid))
    into v_definition_hash
    from pg_constraint co
   where co.conrelid = 'public.venue_daily_tournaments'::regclass
     and co.conname = 'chk_venue_daily_tournaments_data_quality'
     and co.contype = 'c'
     and co.convalidated;
  if v_definition_hash is distinct from '725fb83b051e6a9e88d116fb7195c34c' then
    raise exception 'pre-flight failed: venue_daily_tournaments quality CHECK drifted';
  end if;

  select md5(pg_get_constraintdef(co.oid))
    into v_definition_hash
    from pg_constraint co
   where co.conrelid = 'public.tour_stop_events'::regclass
     and co.conname = 'tour_stop_events_data_quality_check'
     and co.contype = 'c'
     and co.convalidated;
  if v_definition_hash is distinct from 'e542fc5bfe1ac48e6dce10fd94449bdf' then
    raise exception 'pre-flight failed: tour_stop_events data_quality CHECK drifted';
  end if;

  select md5(pg_get_triggerdef(t.oid))
    into v_definition_hash
    from pg_trigger t
   where t.tgrelid = 'public.venue_daily_tournaments'::regclass
     and t.tgname = 'trg_enforce_scrape_provenance_tournaments'
     and not t.tgisinternal
     and t.tgenabled = 'O';
  if v_definition_hash is distinct from 'db73e35293b420a8a92610e72cfe348f' then
    raise exception 'pre-flight failed: VDT provenance trigger drifted';
  end if;

  if exists (
    select 1
      from pg_trigger t
     where t.tgrelid = 'public.venue_daily_tournaments'::regclass
       and t.tgname = 'ensure_provenance_vdt'
       and not t.tgisinternal
  ) then
    raise exception 'pre-flight failed: unexpected legacy VDT provenance trigger exists';
  end if;

  select string_agg(cl.relname || '.' || co.conname, ', ' order by cl.relname, co.conname)
    into v_unexpected_constraints
    from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
   where ns.nspname = 'public'
     and cl.relname in ('venue_live_tables', 'venue_daily_tournaments', 'tour_stop_events')
     and co.contype = 'c'
     and pg_get_constraintdef(co.oid) ilike '%data_quality%'
     and not (
       (cl.relname = 'venue_live_tables'
        and co.conname = 'venue_live_tables_data_quality_check')
       or (cl.relname = 'venue_daily_tournaments'
           and co.conname in ('check_data_quality_provenance', 'chk_venue_daily_tournaments_data_quality'))
       or (cl.relname = 'tour_stop_events'
           and co.conname = 'tour_stop_events_data_quality_check')
     );
  if v_unexpected_constraints is not null then
    raise exception 'pre-flight failed: unexpected data_quality checks: %', v_unexpected_constraints;
  end if;

  if exists (
    select 1 from public.venue_live_tables
     where lower(coalesce(source, '')) = 'pokeratlas'
       and (
         coalesce(scrape_batch_id, '') like 'sim-%'
         or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
       )
  ) then
    raise exception 'pre-flight failed: a live row is simultaneously PokerAtlas and modeled';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'venue_live_tables'
       and column_name = 'data_quality'
  ) then
    raise exception 'pre-flight failed: venue_live_tables.data_quality not found';
  end if;

  select string_agg(
           distinct coalesce(data_quality, '<NULL>'),
           ', ' order by coalesce(data_quality, '<NULL>')
         )
    into v_unknown
    from public.venue_live_tables
   where data_quality is null
      or data_quality not in ('scraped_verified', 'catalog_verified', 'simulated', 'stale', 'expired');
  if v_unknown is not null then
    raise exception 'pre-flight failed: unknown venue_live_tables quality values: %', v_unknown;
  end if;

  select string_agg(
           distinct coalesce(data_quality, '<NULL>'),
           ', ' order by coalesce(data_quality, '<NULL>')
         )
    into v_unknown
    from public.venue_daily_tournaments
   where data_quality is null
      or data_quality not in ('scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired', 'pending');
  if v_unknown is not null then
    raise exception 'pre-flight failed: unknown venue_daily_tournaments quality values: %', v_unknown;
  end if;

  select string_agg(
           distinct coalesce(data_quality, '<NULL>'),
           ', ' order by coalesce(data_quality, '<NULL>')
         )
    into v_unknown
    from public.tour_stop_events
   where data_quality is null
      or data_quality not in ('scraped_verified', 'scraped_inferred', 'scraped_stealth', 'manual_research', 'stale', 'expired', 'pending');
  if v_unknown is not null then
    raise exception 'pre-flight failed: unknown tour_stop_events quality values: %', v_unknown;
  end if;
end $$;

-- 2. CASH-DATA PROVENANCE
alter table public.venue_live_tables
  add column observation_kind text not null default 'observed';
alter table public.venue_live_history
  add column observation_kind text not null default 'observed';
alter table public.game_live_history
  add column observation_kind text not null default 'observed';

update public.venue_live_tables
   set observation_kind = case
     when coalesce(scrape_batch_id, '') like 'sim-%'
       or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
       then 'modeled'
     when lower(coalesce(source, '')) = 'pokeratlas' then 'catalog'
     else 'observed'
   end
 where coalesce(scrape_batch_id, '') like 'sim-%'
    or lower(coalesce(source, '')) in (
      'pokeratlas', 'bravo-simulator', 'bravo_simulator', 'modeled_cash_game'
    );

update public.venue_live_history
   set observation_kind = case
     when coalesce(batch_id, '') like 'sim-%'
       or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
       then 'modeled'
     when lower(coalesce(source, '')) = 'pokeratlas' then 'catalog'
     else 'observed'
   end
 where coalesce(batch_id, '') like 'sim-%'
    or lower(coalesce(source, '')) in (
      'pokeratlas', 'bravo-simulator', 'bravo_simulator', 'modeled_cash_game'
    );

update public.game_live_history
   set observation_kind = case
     when coalesce(batch_id, '') like 'sim-%'
       or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
       then 'modeled'
     when lower(coalesce(source, '')) = 'pokeratlas' then 'catalog'
     else 'observed'
   end
 where coalesce(batch_id, '') like 'sim-%'
    or lower(coalesce(source, '')) in (
      'pokeratlas', 'bravo-simulator', 'bravo_simulator', 'modeled_cash_game'
    );

-- Every pre-v1.4 simulator batch was eligible to derive table counts from a
-- PokerAtlas catalog row and generic activity curves. Those rows cannot be
-- proven to satisfy the observed-history contract introduced by this release.
-- venue_live_tables is an ephemeral current-feed table, so retire only its
-- simulator-owned rows now; durable history and every observed/catalog row are
-- preserved. The repaired estimator will republish a fresh sim-* batch after
-- deployment only for exact venue/game/weekday/hour contexts with qualified
-- Bravo observations.
delete from public.venue_live_tables
 where observation_kind = 'modeled';

alter table public.venue_live_tables
  drop constraint if exists venue_live_tables_observation_kind_check;
alter table public.venue_live_tables
  add constraint venue_live_tables_observation_kind_check
  check (observation_kind in ('observed', 'catalog', 'modeled')) not valid;

alter table public.venue_live_history
  drop constraint if exists venue_live_history_observation_kind_check;
alter table public.venue_live_history
  add constraint venue_live_history_observation_kind_check
  check (observation_kind in ('observed', 'catalog', 'modeled')) not valid;

alter table public.game_live_history
  drop constraint if exists game_live_history_observation_kind_check;
alter table public.game_live_history
  add constraint game_live_history_observation_kind_check
  check (observation_kind in ('observed', 'catalog', 'modeled')) not valid;

-- Tie the explicit evidence class back to the legacy source/batch identity.
-- This is deliberately fail-closed during rollout: an older simulator or
-- PokerAtlas process that omits observation_kind must be rejected instead of
-- inheriting the default 'observed' and publishing modeled/catalog data as
-- live evidence.
alter table public.venue_live_tables
  drop constraint if exists venue_live_tables_provenance_consistency_check;
alter table public.venue_live_tables
  add constraint venue_live_tables_provenance_consistency_check
  check (
    (
      coalesce(scrape_batch_id, '') like 'sim-%'
      or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
    ) = (observation_kind = 'modeled')
    and (lower(coalesce(source, '')) = 'pokeratlas') = (observation_kind = 'catalog')
  ) not valid;

alter table public.venue_live_history
  drop constraint if exists venue_live_history_provenance_consistency_check;
alter table public.venue_live_history
  add constraint venue_live_history_provenance_consistency_check
  check (
    (
      coalesce(batch_id, '') like 'sim-%'
      or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
    ) = (observation_kind = 'modeled')
    and (lower(coalesce(source, '')) = 'pokeratlas') = (observation_kind = 'catalog')
  ) not valid;

alter table public.game_live_history
  drop constraint if exists game_live_history_provenance_consistency_check;
alter table public.game_live_history
  add constraint game_live_history_provenance_consistency_check
  check (
    (
      coalesce(batch_id, '') like 'sim-%'
      or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
    ) = (observation_kind = 'modeled')
    and (lower(coalesce(source, '')) = 'pokeratlas') = (observation_kind = 'catalog')
  ) not valid;

alter table public.venue_live_tables validate constraint venue_live_tables_observation_kind_check;
alter table public.venue_live_history validate constraint venue_live_history_observation_kind_check;
alter table public.game_live_history validate constraint game_live_history_observation_kind_check;
alter table public.venue_live_tables validate constraint venue_live_tables_provenance_consistency_check;
alter table public.venue_live_history validate constraint venue_live_history_provenance_consistency_check;
alter table public.game_live_history validate constraint game_live_history_provenance_consistency_check;

comment on column public.venue_live_tables.observation_kind is
  'Evidence class: observed source value, catalog availability, or modeled estimate. Never infer this from non-null counts.';
comment on column public.venue_live_history.observation_kind is
  'Evidence class propagated from the source snapshot: observed, catalog, or modeled.';
comment on column public.game_live_history.observation_kind is
  'Evidence class propagated from the source snapshot: observed, catalog, or modeled.';

-- Remove legacy data_quality CHECK constraints before relabeling rows. Older
-- constraints allow only scraped_verified/stale/expired, so leaving them in
-- place would reject the simulated and catalog_verified backfill below.
-- Live production definitions were inventoried before authoring this allowlist.
-- Pre-flight aborts if any additional quality invariant appears, so no unknown
-- cross-field check is silently discarded.
alter table public.venue_live_tables
  drop constraint if exists venue_live_tables_data_quality_check;
alter table public.venue_daily_tournaments
  drop constraint if exists check_data_quality_provenance;
alter table public.venue_daily_tournaments
  drop constraint if exists chk_venue_daily_tournaments_data_quality;
alter table public.tour_stop_events
  drop constraint if exists tour_stop_events_data_quality_check;

-- Correct legacy quality labels before the replacement checks are enforced.
update public.venue_live_tables
   set data_quality = 'simulated'
 where observation_kind = 'modeled'
   and data_quality <> 'simulated';

update public.venue_live_tables
   set data_quality = 'catalog_verified'
 where observation_kind = 'catalog'
   and data_quality <> 'catalog_verified';

-- Older PokerAtlas discovery followed card CTA links as if they were rooms.
-- Keep the rows for auditability, but expire them so no catalog consumer can
-- publish navigation copy as a venue while the repaired crawler replaces the
-- current batch with canonical US room slugs.
update public.venue_live_tables
   set data_quality = 'expired'
 where observation_kind = 'catalog'
   and (
     lower(coalesce(venue_name, '')) like '%view live info%'
     or lower(coalesce(venue_name, '')) like '%wait list registration%'
     or lower(coalesce(venue_name, '')) like '%waitlist registration%'
     or coalesce(bravo_slug, '') ~ '^pa-[0-9]+$'
   );

alter table public.venue_live_tables
  add constraint venue_live_tables_data_quality_truth_check
  check (data_quality in ('scraped_verified', 'catalog_verified', 'simulated', 'stale', 'expired')) not valid;

alter table public.venue_live_tables
  drop constraint if exists venue_live_tables_evidence_quality_consistency_check;
alter table public.venue_live_tables
  add constraint venue_live_tables_evidence_quality_consistency_check
  check (
    data_quality is not null
    and (
      (observation_kind = 'modeled' and data_quality = 'simulated')
      or (observation_kind = 'catalog' and data_quality in ('catalog_verified', 'stale', 'expired'))
      or (observation_kind = 'observed' and data_quality in ('scraped_verified', 'stale', 'expired'))
    )
  ) not valid;

alter table public.venue_daily_tournaments
  add constraint venue_daily_tournaments_data_quality_truth_check
  check (data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired', 'pending')) not valid;

-- The historical shared trigger rejects scraped_inferred even though this table
-- and its replacement check allow it. Use a table-specific trigger so widening
-- the VDT vocabulary cannot weaken unrelated scrape-provenance tables.
create or replace function public.enforce_vdt_scrape_provenance_truth()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.scrape_html_hash is null or new.scrape_timestamp is null then
    raise exception 'venue_daily_tournaments requires scrape_html_hash and scrape_timestamp';
  end if;
  if new.data_quality is null or new.data_quality not in (
    'scraped_verified', 'scraped_inferred', 'manual_research',
    'stale', 'expired', 'pending'
  ) then
    raise exception 'unsupported venue_daily_tournaments data_quality: %', new.data_quality;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_provenance_vdt on public.venue_daily_tournaments;
drop trigger if exists trg_enforce_scrape_provenance_tournaments on public.venue_daily_tournaments;
create trigger trg_enforce_scrape_provenance_tournaments
before insert or update on public.venue_daily_tournaments
for each row execute function public.enforce_vdt_scrape_provenance_truth();

update public.tour_stop_events
   set data_quality = 'scraped_inferred'
 where data_quality = 'scraped_stealth';

alter table public.tour_stop_events
  add constraint tour_stop_events_data_quality_truth_check
  check (data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired', 'pending')) not valid;

alter table public.venue_live_tables validate constraint venue_live_tables_data_quality_truth_check;
alter table public.venue_live_tables validate constraint venue_live_tables_evidence_quality_consistency_check;
alter table public.venue_daily_tournaments validate constraint venue_daily_tournaments_data_quality_truth_check;
alter table public.tour_stop_events validate constraint tour_stop_events_data_quality_truth_check;

-- 3. PERSISTED-OUTPUT HEALTH CONTRACT
alter table public.scraper_metrics
  add column run_status text not null default 'legacy',
  add column records_attempted integer,
  add column records_rejected integer not null default 0,
  add column status_reason text;

alter table public.scraper_metrics
  drop constraint if exists scraper_metrics_run_status_check;
alter table public.scraper_metrics
  add constraint scraper_metrics_run_status_check
  check (run_status in ('success', 'valid_empty', 'progress', 'maintenance', 'partial', 'failed', 'legacy')) not valid;

alter table public.scraper_metrics
  drop constraint if exists scraper_metrics_record_counts_check;
alter table public.scraper_metrics
  add constraint scraper_metrics_record_counts_check
  check (
    (
      run_status = 'legacy'
      and records_attempted is null
      and coalesce(records_saved, 0) >= 0
      and records_rejected = 0
      and coalesce(errors, 0) >= 0
    )
    or (
      run_status <> 'legacy'
      and records_attempted is not null
      and records_saved is not null
      and errors is not null
      and nullif(btrim(status_reason), '') is not null
      and records_attempted >= 0
      and records_saved >= 0
      and records_rejected >= 0
      and errors >= 0
      and records_attempted = records_saved + records_rejected
      and (
        (
          run_status = 'success'
          and records_attempted > 0
          and records_saved = records_attempted
          and records_rejected = 0
          and errors = 0
        )
        or (
          run_status in ('valid_empty', 'progress', 'maintenance')
          and records_attempted = 0
          and records_saved = 0
          and records_rejected = 0
          and errors = 0
        )
        or (
          run_status = 'partial'
          and records_saved > 0
          and (records_rejected > 0 or errors > 0)
        )
        or (
          run_status = 'failed'
          and records_saved = 0
          and errors > 0
        )
      )
    )
  ) not valid;

alter table public.scraper_metrics validate constraint scraper_metrics_run_status_check;
alter table public.scraper_metrics validate constraint scraper_metrics_record_counts_check;

comment on column public.scraper_metrics.run_status is
  'success requires persisted rows; valid_empty is a completed empty sweep; progress/maintenance are healthy zero-write checkpoints; partial/failed are unhealthy.';
comment on column public.scraper_metrics.records_attempted is
  'Rows submitted or otherwise requiring persistence in this run; NULL only on pre-migration legacy metrics.';
comment on column public.scraper_metrics.records_rejected is
  'Attempted rows not confirmed persisted. A positive value prevents a success classification.';

-- 4. POST-APPLY ASSERTIONS
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'venue_live_tables', 'venue_live_history', 'game_live_history'
  ] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = v_table
         and column_name = 'observation_kind'
         and is_nullable = 'NO'
    ) then
      raise exception 'post-apply failed: %.observation_kind is missing or nullable', v_table;
    end if;
  end loop;

  if exists (
    select 1 from public.venue_live_tables
     where data_quality is null
        or not (
          (observation_kind = 'modeled' and data_quality = 'simulated')
          or (observation_kind = 'catalog' and data_quality in ('catalog_verified', 'stale', 'expired'))
          or (observation_kind = 'observed' and data_quality in ('scraped_verified', 'stale', 'expired'))
        )
  ) then
    raise exception 'post-apply failed: live-table observation_kind/data_quality mismatch';
  end if;

  if exists (
    select 1 from public.venue_live_tables
     where observation_kind = 'modeled'
  ) then
    raise exception 'post-apply failed: a legacy modeled current-feed row survived cleanup';
  end if;

  if exists (
    select 1 from public.venue_live_tables
     where observation_kind = 'catalog'
       and data_quality <> 'expired'
       and (
         lower(coalesce(venue_name, '')) like '%view live info%'
         or lower(coalesce(venue_name, '')) like '%wait list registration%'
         or lower(coalesce(venue_name, '')) like '%waitlist registration%'
         or coalesce(bravo_slug, '') ~ '^pa-[0-9]+$'
       )
  ) then
    raise exception 'post-apply failed: a PokerAtlas navigation artifact remains publishable';
  end if;

  if exists (
    select 1 from pg_constraint
     where conname in (
       'venue_live_tables_observation_kind_check',
       'venue_live_history_observation_kind_check',
       'game_live_history_observation_kind_check',
       'venue_live_tables_provenance_consistency_check',
       'venue_live_history_provenance_consistency_check',
       'game_live_history_provenance_consistency_check',
       'venue_live_tables_data_quality_truth_check',
       'venue_live_tables_evidence_quality_consistency_check',
       'venue_daily_tournaments_data_quality_truth_check',
       'tour_stop_events_data_quality_truth_check',
       'scraper_metrics_run_status_check',
       'scraper_metrics_record_counts_check'
     )
       and not convalidated
  ) then
    raise exception 'post-apply failed: one or more data-truth constraints are not validated';
  end if;

  if not exists (
    select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.venue_daily_tournaments'::regclass
       and t.tgname = 'trg_enforce_scrape_provenance_tournaments'
       and not t.tgisinternal
       and p.proname = 'enforce_vdt_scrape_provenance_truth'
  ) then
    raise exception 'post-apply failed: VDT truth trigger is missing or miswired';
  end if;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 — apply only after rolling daemon/API code back)
-- Catalog truth labels are degraded to stale, never to scraped_verified, before
-- restoring the inventoried production constraints. Dropping the new columns loses
-- only the metadata introduced here; current/source/batch fields remain.
-- ═══════════════════════════════════════════════════════════════════════
-- begin;
-- set local lock_timeout = '5s';
-- alter table public.venue_live_tables drop constraint if exists venue_live_tables_evidence_quality_consistency_check;
-- update public.venue_live_tables set data_quality = 'stale'
--  where data_quality = 'catalog_verified';
-- update public.venue_live_tables set data_quality = 'stale'
--  where observation_kind = 'catalog' and data_quality = 'expired';
-- update public.venue_daily_tournaments set data_quality = 'stale'
--  where data_quality = 'pending';
-- update public.tour_stop_events set data_quality = 'stale'
--  where data_quality = 'scraped_inferred';
-- alter table public.venue_live_tables drop constraint if exists venue_live_tables_data_quality_truth_check;
-- alter table public.venue_daily_tournaments drop constraint if exists venue_daily_tournaments_data_quality_truth_check;
-- alter table public.tour_stop_events drop constraint if exists tour_stop_events_data_quality_truth_check;
-- alter table public.venue_live_tables add constraint venue_live_tables_data_quality_check
--   check (data_quality in ('scraped_verified', 'stale', 'expired', 'simulated'));
-- alter table public.venue_daily_tournaments add constraint check_data_quality_provenance
--   check (data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired'));
-- alter table public.venue_daily_tournaments add constraint chk_venue_daily_tournaments_data_quality
--   check (data_quality in ('scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired'));
-- alter table public.tour_stop_events add constraint tour_stop_events_data_quality_check
--   check (data_quality in ('scraped_verified', 'manual_research', 'stale', 'expired', 'pending'));
-- drop trigger if exists trg_enforce_scrape_provenance_tournaments on public.venue_daily_tournaments;
-- drop function if exists public.enforce_vdt_scrape_provenance_truth();
-- create trigger trg_enforce_scrape_provenance_tournaments
--   before insert or update on public.venue_daily_tournaments
--   for each row execute function public.enforce_scrape_provenance();
-- alter table public.venue_live_tables drop constraint if exists venue_live_tables_observation_kind_check;
-- alter table public.venue_live_history drop constraint if exists venue_live_history_observation_kind_check;
-- alter table public.game_live_history drop constraint if exists game_live_history_observation_kind_check;
-- alter table public.venue_live_tables drop constraint if exists venue_live_tables_provenance_consistency_check;
-- alter table public.venue_live_history drop constraint if exists venue_live_history_provenance_consistency_check;
-- alter table public.game_live_history drop constraint if exists game_live_history_provenance_consistency_check;
-- alter table public.venue_live_tables drop column if exists observation_kind;
-- alter table public.venue_live_history drop column if exists observation_kind;
-- alter table public.game_live_history drop column if exists observation_kind;
-- alter table public.scraper_metrics drop constraint if exists scraper_metrics_run_status_check;
-- alter table public.scraper_metrics drop constraint if exists scraper_metrics_record_counts_check;
-- alter table public.scraper_metrics drop column if exists run_status;
-- alter table public.scraper_metrics drop column if exists records_attempted;
-- alter table public.scraper_metrics drop column if exists records_rejected;
-- alter table public.scraper_metrics drop column if exists status_reason;
-- commit;
