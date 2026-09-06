-- ═══════════════════════════════════════════════════════════════════════
-- 20260906173000_pnm_scraper_data_truth.sql
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
--   This migration MUST land before daemon/API code that writes or selects the
--   new columns. Supabase MCP was unavailable while authored; do not bypass the
--   sanctioned migration workflow with direct DDL.
-- ═══════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- 1. PRE-FLIGHT ASSERTIONS
do $$
declare
  v_table text;
  v_unknown text;
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

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'venue_live_tables'
       and column_name = 'data_quality'
  ) then
    raise exception 'pre-flight failed: venue_live_tables.data_quality not found';
  end if;

  select string_agg(distinct data_quality, ', ' order by data_quality)
    into v_unknown
    from public.venue_live_tables
   where data_quality is null
      or data_quality not in ('scraped_verified', 'catalog_verified', 'simulated', 'stale', 'expired');
  if v_unknown is not null then
    raise exception 'pre-flight failed: unknown venue_live_tables quality values: %', v_unknown;
  end if;

  select string_agg(distinct data_quality, ', ' order by data_quality)
    into v_unknown
    from public.venue_daily_tournaments
   where data_quality is null
      or data_quality not in ('scraped_verified', 'scraped_inferred', 'stale', 'expired', 'pending');
  if v_unknown is not null then
    raise exception 'pre-flight failed: unknown venue_daily_tournaments quality values: %', v_unknown;
  end if;

  select string_agg(distinct data_quality, ', ' order by data_quality)
    into v_unknown
    from public.tour_stop_events
   where data_quality is null
      or data_quality not in ('scraped_verified', 'scraped_inferred', 'scraped_stealth', 'stale', 'expired', 'pending');
  if v_unknown is not null then
    raise exception 'pre-flight failed: unknown tour_stop_events quality values: %', v_unknown;
  end if;
end $$;

-- 2. CASH-DATA PROVENANCE
alter table public.venue_live_tables
  add column if not exists observation_kind text;
alter table public.venue_live_history
  add column if not exists observation_kind text;
alter table public.game_live_history
  add column if not exists observation_kind text;

update public.venue_live_tables
   set observation_kind = case
     when coalesce(scrape_batch_id, '') like 'sim-%'
       or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
       then 'modeled'
     when lower(coalesce(source, '')) = 'pokeratlas' then 'catalog'
     else 'observed'
   end
 where observation_kind is null;

update public.venue_live_history
   set observation_kind = case
     when coalesce(batch_id, '') like 'sim-%'
       or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
       then 'modeled'
     when lower(coalesce(source, '')) = 'pokeratlas' then 'catalog'
     else 'observed'
   end
 where observation_kind is null;

update public.game_live_history
   set observation_kind = case
     when coalesce(batch_id, '') like 'sim-%'
       or lower(coalesce(source, '')) in ('bravo-simulator', 'bravo_simulator', 'modeled_cash_game')
       then 'modeled'
     when lower(coalesce(source, '')) = 'pokeratlas' then 'catalog'
     else 'observed'
   end
 where observation_kind is null;

alter table public.venue_live_tables
  alter column observation_kind set default 'observed',
  alter column observation_kind set not null;
alter table public.venue_live_history
  alter column observation_kind set default 'observed',
  alter column observation_kind set not null;
alter table public.game_live_history
  alter column observation_kind set default 'observed',
  alter column observation_kind set not null;

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

alter table public.venue_live_tables validate constraint venue_live_tables_observation_kind_check;
alter table public.venue_live_history validate constraint venue_live_history_observation_kind_check;
alter table public.game_live_history validate constraint game_live_history_observation_kind_check;

comment on column public.venue_live_tables.observation_kind is
  'Evidence class: observed source value, catalog availability, or modeled estimate. Never infer this from non-null counts.';
comment on column public.venue_live_history.observation_kind is
  'Evidence class propagated from the source snapshot: observed, catalog, or modeled.';
comment on column public.game_live_history.observation_kind is
  'Evidence class propagated from the source snapshot: observed, catalog, or modeled.';

create index if not exists idx_vlt_observation_freshness
  on public.venue_live_tables (observation_kind, scrape_timestamp desc);
create index if not exists idx_vlh_observation_freshness
  on public.venue_live_history (observation_kind, snapshot_time desc);
create index if not exists idx_glh_observation_freshness
  on public.game_live_history (observation_kind, snapshot_time desc);

-- Correct legacy quality labels before the replacement checks are enforced.
update public.venue_live_tables
   set data_quality = 'simulated'
 where observation_kind = 'modeled'
   and data_quality <> 'simulated';

update public.venue_live_tables
   set data_quality = 'catalog_verified'
 where observation_kind = 'catalog'
   and data_quality <> 'catalog_verified';

-- Drop only CHECK constraints whose expression actually references
-- data_quality. Several historical migrations used different names, so a
-- hardcoded DROP would leave one of the contradictory checks active.
do $$
declare
  r record;
  v_table text;
begin
  foreach v_table in array array[
    'venue_live_tables', 'venue_daily_tournaments', 'tour_stop_events'
  ] loop
    for r in
      select c.conname
        from pg_constraint c
       where c.conrelid = ('public.' || v_table)::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) ilike '%data_quality%'
    loop
      execute format('alter table public.%I drop constraint %I', v_table, r.conname);
    end loop;
  end loop;
end $$;

alter table public.venue_live_tables
  add constraint venue_live_tables_data_quality_truth_check
  check (data_quality in ('scraped_verified', 'catalog_verified', 'simulated', 'stale', 'expired')) not valid;

alter table public.venue_daily_tournaments
  add constraint venue_daily_tournaments_data_quality_truth_check
  check (data_quality in ('scraped_verified', 'scraped_inferred', 'stale', 'expired', 'pending')) not valid;

update public.tour_stop_events
   set data_quality = 'scraped_inferred'
 where data_quality = 'scraped_stealth';

alter table public.tour_stop_events
  add constraint tour_stop_events_data_quality_truth_check
  check (data_quality in ('scraped_verified', 'scraped_inferred', 'stale', 'expired', 'pending')) not valid;

alter table public.venue_live_tables validate constraint venue_live_tables_data_quality_truth_check;
alter table public.venue_daily_tournaments validate constraint venue_daily_tournaments_data_quality_truth_check;
alter table public.tour_stop_events validate constraint tour_stop_events_data_quality_truth_check;

-- 3. PERSISTED-OUTPUT HEALTH CONTRACT
alter table public.scraper_metrics
  add column if not exists run_status text not null default 'legacy',
  add column if not exists records_attempted integer,
  add column if not exists records_rejected integer not null default 0,
  add column if not exists status_reason text;

alter table public.scraper_metrics
  drop constraint if exists scraper_metrics_run_status_check;
alter table public.scraper_metrics
  add constraint scraper_metrics_run_status_check
  check (run_status in ('success', 'valid_empty', 'partial', 'failed', 'legacy')) not valid;

alter table public.scraper_metrics
  drop constraint if exists scraper_metrics_record_counts_check;
alter table public.scraper_metrics
  add constraint scraper_metrics_record_counts_check
  check (
    (records_attempted is null or records_attempted >= 0)
    and coalesce(records_saved, 0) >= 0
    and records_rejected >= 0
    and not (run_status = 'valid_empty' and (
      coalesce(records_attempted, 0) <> 0
      or coalesce(records_saved, 0) <> 0
      or records_rejected <> 0
      or coalesce(errors, 0) <> 0
    ))
    and not (run_status = 'success' and coalesce(records_saved, 0) = 0)
  ) not valid;

alter table public.scraper_metrics validate constraint scraper_metrics_run_status_check;
alter table public.scraper_metrics validate constraint scraper_metrics_record_counts_check;

comment on column public.scraper_metrics.run_status is
  'success requires persisted rows; valid_empty is the only healthy zero-output state; partial/failed are unhealthy.';
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
     where (observation_kind = 'modeled' and data_quality <> 'simulated')
        or (observation_kind = 'catalog' and data_quality <> 'catalog_verified')
  ) then
    raise exception 'post-apply failed: live-table observation_kind/data_quality mismatch';
  end if;

  if exists (
    select 1 from pg_constraint
     where conname in (
       'venue_live_tables_observation_kind_check',
       'venue_live_history_observation_kind_check',
       'game_live_history_observation_kind_check',
       'venue_live_tables_data_quality_truth_check',
       'venue_daily_tournaments_data_quality_truth_check',
       'tour_stop_events_data_quality_truth_check',
       'scraper_metrics_run_status_check',
       'scraper_metrics_record_counts_check'
     )
       and not convalidated
  ) then
    raise exception 'post-apply failed: one or more data-truth constraints are not validated';
  end if;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 — apply only after rolling daemon/API code back)
-- New truth labels are degraded to stale, never to scraped_verified, before
-- restoring the narrower legacy constraints. Dropping the new columns loses
-- only the metadata introduced here; current/source/batch fields remain.
-- ═══════════════════════════════════════════════════════════════════════
-- begin;
-- set local lock_timeout = '5s';
-- update public.venue_live_tables set data_quality = 'stale'
--  where data_quality in ('simulated', 'catalog_verified');
-- update public.venue_daily_tournaments set data_quality = 'stale'
--  where data_quality in ('scraped_inferred', 'pending');
-- update public.tour_stop_events set data_quality = 'stale'
--  where data_quality in ('scraped_inferred', 'pending');
-- alter table public.venue_live_tables drop constraint if exists venue_live_tables_data_quality_truth_check;
-- alter table public.venue_daily_tournaments drop constraint if exists venue_daily_tournaments_data_quality_truth_check;
-- alter table public.tour_stop_events drop constraint if exists tour_stop_events_data_quality_truth_check;
-- alter table public.venue_live_tables add constraint venue_live_tables_data_quality_check
--   check (data_quality in ('scraped_verified', 'stale', 'expired'));
-- alter table public.venue_daily_tournaments add constraint venue_daily_tournaments_data_quality_check
--   check (data_quality in ('scraped_verified', 'stale', 'expired'));
-- alter table public.tour_stop_events add constraint tour_stop_events_data_quality_check
--   check (data_quality in ('scraped_verified', 'stale', 'expired', 'pending'));
-- alter table public.venue_live_tables drop constraint if exists venue_live_tables_observation_kind_check;
-- alter table public.venue_live_history drop constraint if exists venue_live_history_observation_kind_check;
-- alter table public.game_live_history drop constraint if exists game_live_history_observation_kind_check;
-- drop index if exists public.idx_vlt_observation_freshness;
-- drop index if exists public.idx_vlh_observation_freshness;
-- drop index if exists public.idx_glh_observation_freshness;
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
