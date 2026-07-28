-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728180152_commander_comp_log_missing_category_and_notes.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- ─────────────────────────────────────────────────────────────────────────────
-- Club Commander: restore the two comp-log columns the routes have always
-- written to but that never existed.
--
-- pages/api/comps/balances.js inserts comp_category and notes on every comp it
-- logs (awardComp x3 paths, voidComp), but commander_member_comp_log has
-- neither column. PostgREST rejects the whole insert with PGRST204 and the
-- route only console.warn()s the error, so the comp ledger has been recording
-- nothing at all — the newest row is 2026-03-02 and there are zero rows of
-- type 'void' despite the void path being live.
--
-- Two further consequences, both fixed by the columns existing:
--   * voidComp's double-void guard matches on
--     notes LIKE 'VOID-REF:<id> |%' — with no notes column that lookup can
--     never match, so a comp could be voided repeatedly, each time reversing
--     the balance again.
--   * voidComp branches on logEntry.comp_category to decide how to reverse
--     (membership vs free_time vs dollar); that was always undefined, so every
--     void took the dollar branch.
--
-- Purely additive: both columns nullable, existing 54 rows untouched.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.commander_member_comp_log add column if not exists comp_category text;
alter table public.commander_member_comp_log add column if not exists notes text;

-- voidComp scans for an existing void referencing a given comp id via
-- notes LIKE 'VOID-REF:<uuid> |%'. Give that lookup an index rather than a
-- venue-wide sequential scan on every void.
create index if not exists idx_member_comp_log_void_ref
  on public.commander_member_comp_log (venue_id, member_id, type)
  where type = 'void';

-- ── post-condition ────────────────────────────────────────────────────────────
do $post$
declare
  v_col text;
begin
  foreach v_col in array array['comp_category', 'notes'] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'commander_member_comp_log'
         and column_name = v_col
         and data_type = 'text'
         and is_nullable = 'YES'
    ) then
      raise exception 'post-condition failed: commander_member_comp_log.% (nullable text) is missing', v_col;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'commander_member_comp_log'
       and indexname = 'idx_member_comp_log_void_ref'
  ) then
    raise exception 'post-condition failed: idx_member_comp_log_void_ref was not created';
  end if;

  if (select count(*) from public.commander_member_comp_log) < 54 then
    raise exception 'post-condition failed: comp log lost rows (expected at least the 54 pre-existing)';
  end if;

  raise notice 'commander_comp_log_missing_category_and_notes: comp_category + notes present, existing rows intact';
end
$post$;