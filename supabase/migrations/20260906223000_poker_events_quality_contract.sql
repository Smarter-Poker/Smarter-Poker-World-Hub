-- ============================================================================
-- Poker event extraction-quality contract
-- Migration: 20260906223000_poker_events_quality_contract.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Poker Near Me data-truth audit
-- AFFECTS:     public.poker_events
--
-- WHY:
--   poker_series_scraper.py correctly labels regex/heuristic HTML extraction as
--   scraped_inferred, but the table check still accepted only verified, stale,
--   and expired. One inferred record therefore rejected an otherwise valid
--   PostgREST batch. The already-installed provenance trigger accepts the
--   intended five-value vocabulary; this migration makes the table invariant
--   agree with it without upgrading inferred or manual evidence to verified.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Preserve the established Supabase realtime lock order before public-table
-- DDL. Disposable test databases may not contain this schema.
do $realtime_lock$
begin
  if to_regclass('realtime.subscription') is not null then
    execute 'lock table realtime.subscription in access exclusive mode';
  end if;
end
$realtime_lock$;

do $preflight$
declare
  v_definition text;
  v_trigger_function text;
begin
  if to_regclass('public.poker_events') is null then
    raise exception 'pre-flight failed: public.poker_events not found';
  end if;

  if exists (
    select 1
      from (
        values
          ('data_quality', 'text', 'NO'),
          ('scrape_html_hash', 'text', 'NO'),
          ('scrape_timestamp', 'timestamptz', 'NO')
      ) expected(column_name, udt_name, is_nullable)
      left join information_schema.columns actual
        on actual.table_schema = 'public'
       and actual.table_name = 'poker_events'
       and actual.column_name = expected.column_name
     where actual.column_name is null
        or actual.udt_name <> expected.udt_name
        or actual.is_nullable <> expected.is_nullable
  ) then
    raise exception 'pre-flight failed: poker_events provenance columns drifted';
  end if;

  select pg_get_constraintdef(c.oid, true)
    into v_definition
    from pg_constraint c
   where c.conrelid = 'public.poker_events'::regclass
     and c.conname = 'chk_poker_events_data_quality'
     and c.contype = 'c';

  if v_definition is null then
    raise exception 'pre-flight failed: chk_poker_events_data_quality not found';
  end if;
  if v_definition not like '%scraped_verified%'
     or v_definition not like '%stale%'
     or v_definition not like '%expired%'
     or v_definition like '%scraped_inferred%'
     or v_definition like '%manual_research%' then
    raise exception 'pre-flight failed: unexpected prior quality check: %', v_definition;
  end if;

  if exists (
    select 1
      from public.poker_events
     where data_quality not in (
       'scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired'
     )
  ) then
    raise exception 'pre-flight failed: unsupported poker_events data_quality values exist';
  end if;

  select p.prosrc
    into v_trigger_function
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.poker_events'::regclass
     and t.tgname = 'trg_enforce_provenance'
     and not t.tgisinternal
     and p.proname = 'enforce_scrape_provenance';

  if v_trigger_function is null
     or v_trigger_function not like '%scraped_verified%'
     or v_trigger_function not like '%scraped_inferred%'
     or v_trigger_function not like '%manual_research%'
     or v_trigger_function not like '%stale%'
     or v_trigger_function not like '%expired%' then
    raise exception 'pre-flight failed: poker_events provenance trigger vocabulary drifted';
  end if;
end
$preflight$;

alter table public.poker_events
  drop constraint chk_poker_events_data_quality;

alter table public.poker_events
  add constraint chk_poker_events_data_quality
  check (data_quality in (
    'scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired'
  )) not valid;

alter table public.poker_events
  validate constraint chk_poker_events_data_quality;

do $post_apply$
declare
  v_definition text;
  v_validated boolean;
begin
  select pg_get_constraintdef(c.oid, true), c.convalidated
    into v_definition, v_validated
    from pg_constraint c
   where c.conrelid = 'public.poker_events'::regclass
     and c.conname = 'chk_poker_events_data_quality'
     and c.contype = 'c';

  if v_definition is null or not v_validated then
    raise exception 'post-apply failed: poker event quality check missing or unvalidated';
  end if;
  if v_definition not like '%scraped_verified%'
     or v_definition not like '%scraped_inferred%'
     or v_definition not like '%manual_research%'
     or v_definition not like '%stale%'
     or v_definition not like '%expired%' then
    raise exception 'post-apply failed: poker event quality vocabulary incomplete';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK (apply only after reverting scraper provenance labels):
-- begin;
-- set local lock_timeout = '10s';
-- update public.poker_events
--    set data_quality = 'stale'
--  where data_quality in ('scraped_inferred', 'manual_research');
-- alter table public.poker_events drop constraint chk_poker_events_data_quality;
-- alter table public.poker_events add constraint chk_poker_events_data_quality
--   check (data_quality in ('scraped_verified', 'stale', 'expired')) not valid;
-- alter table public.poker_events validate constraint chk_poker_events_data_quality;
-- commit;
