-- ==========================================================================
-- Poker series extraction-quality contract
-- Migration: 20260906224000_poker_series_quality_contract.sql
-- ==========================================================================
-- HTML and aggregator-derived series schedules must remain explicitly
-- inferred.  The prior table check forced every accepted scraper row to claim
-- verified quality even when only the parent identity was source-verified.

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
declare
  v_definition text;
  v_trigger_function text;
begin
  if to_regclass('public.poker_series') is null then
    raise exception 'pre-flight failed: public.poker_series not found';
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
       and actual.table_name = 'poker_series'
       and actual.column_name = expected.column_name
     where actual.column_name is null
        or actual.udt_name <> expected.udt_name
        or actual.is_nullable <> expected.is_nullable
  ) then
    raise exception 'pre-flight failed: poker_series provenance columns drifted';
  end if;

  select pg_get_constraintdef(c.oid, true)
    into v_definition
    from pg_constraint c
   where c.conrelid = 'public.poker_series'::regclass
     and c.conname = 'chk_poker_series_data_quality'
     and c.contype = 'c';

  if v_definition is null then
    raise exception 'pre-flight failed: chk_poker_series_data_quality not found';
  end if;
  if v_definition not like '%scraped_verified%'
     or v_definition not like '%manual_research%'
     or v_definition not like '%stale%'
     or v_definition not like '%expired%'
     or v_definition like '%scraped_inferred%' then
    raise exception 'pre-flight failed: unexpected prior quality check: %', v_definition;
  end if;

  if exists (
    select 1
      from public.poker_series
     where data_quality not in (
       'scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired'
     )
  ) then
    raise exception 'pre-flight failed: unsupported poker_series data_quality values exist';
  end if;

  select p.prosrc
    into v_trigger_function
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.poker_series'::regclass
     and t.tgname = 'trg_enforce_provenance'
     and not t.tgisinternal
     and p.proname = 'enforce_scrape_provenance';

  if v_trigger_function is null
     or v_trigger_function not like '%scraped_verified%'
     or v_trigger_function not like '%scraped_inferred%'
     or v_trigger_function not like '%manual_research%'
     or v_trigger_function not like '%stale%'
     or v_trigger_function not like '%expired%' then
    raise exception 'pre-flight failed: poker_series provenance trigger vocabulary drifted';
  end if;
end
$preflight$;

alter table public.poker_series
  drop constraint chk_poker_series_data_quality;

alter table public.poker_series
  add constraint chk_poker_series_data_quality
  check (data_quality in (
    'scraped_verified', 'scraped_inferred', 'manual_research', 'stale', 'expired'
  )) not valid;

alter table public.poker_series
  validate constraint chk_poker_series_data_quality;

do $post_apply$
declare
  v_definition text;
  v_validated boolean;
begin
  select pg_get_constraintdef(c.oid, true), c.convalidated
    into v_definition, v_validated
    from pg_constraint c
   where c.conrelid = 'public.poker_series'::regclass
     and c.conname = 'chk_poker_series_data_quality'
     and c.contype = 'c';

  if v_definition is null or not v_validated then
    raise exception 'post-apply failed: poker series quality check missing or unvalidated';
  end if;
  if v_definition not like '%scraped_verified%'
     or v_definition not like '%scraped_inferred%'
     or v_definition not like '%manual_research%'
     or v_definition not like '%stale%'
     or v_definition not like '%expired%' then
    raise exception 'post-apply failed: poker series quality vocabulary incomplete';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK (apply only after reverting inferred parent writes):
-- begin;
-- set local lock_timeout = '10s';
-- update public.poker_series set data_quality = 'stale'
--  where data_quality = 'scraped_inferred';
-- alter table public.poker_series drop constraint chk_poker_series_data_quality;
-- alter table public.poker_series add constraint chk_poker_series_data_quality
--   check (data_quality in (
--     'scraped_verified', 'manual_research', 'stale', 'expired'
--   )) not valid;
-- alter table public.poker_series validate constraint chk_poker_series_data_quality;
-- commit;
