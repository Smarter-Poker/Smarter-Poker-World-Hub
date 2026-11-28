-- ═══════════════════════════════════════════════════════════════════════
-- 05_bankroll_ledger_changes.sql
-- Install as: supabase/migrations/<UTC stamp>_bankroll_ledger_changes.sql
-- DRAFT - NOT INSTALLED. Nothing in this folder has been applied anywhere.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive: new table, RLS, trigger function, two triggers)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     tables: public.bankroll_ledger_changes (new)
--              triggers: bankroll_ledger_changes_on_update / _on_delete
--              functions: public.fn_bankroll_ledger_record_change()
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS: none yet. Every existing ledger write
--   (createLedgerEntry, updateLedgerEntry, deleteLedgerEntry and revisions in
--   src/lib/bankroll/bankrollSelectors.ts) keeps working unchanged; the
--   trigger only adds a history row beside each UPDATE and DELETE.
--   Planned readers: an "Edit History" panel on a session and a "Recently
--   Deleted" list, both reading
--     supabase.from('bankroll_ledger_changes').select('*')
--       .eq('user_id', userId).order('changed_at', { ascending: false })
--   and paging with fetchAllRows.
--
-- WHY:
--   An edited or deleted session is gone without trace: the player cannot
--   see what a row said before, and a mistaken delete cannot be undone.
--
-- HOW:
--   - bankroll_ledger_changes(id, entry_id, user_id, changed_at, op,
--     old_row jsonb, new_row jsonb). op is 'UPDATE' or 'DELETE'; new_row is
--     NULL for a delete. No foreign key to bankroll_ledger: the history of a
--     deleted row must outlive it.
--   - user_id REFERENCES auth.users ON DELETE CASCADE, so deleting an
--     account deletes its history (ledger rows already cascade the same way).
--   - AFTER UPDATE trigger (only when the row actually changed: OLD IS
--     DISTINCT FROM NEW) and AFTER DELETE trigger, both FOR EACH ROW.
--   - The trigger function is SECURITY DEFINER so it can write a table the
--     client has no INSERT right on; search_path pinned to
--     public, extensions, pg_temp (pg_temp last, so no temp-table shadowing).
--   - Account deletion: auth.users -> bankroll_ledger cascade fires the
--     DELETE trigger. Writing a history row for a user who no longer exists
--     would violate the user_id foreign key and abort the account deletion,
--     so the function skips rows whose user is already gone.
--   - RLS: SELECT own rows only. No INSERT/UPDATE/DELETE policy and those
--     rights are revoked from anon and authenticated: clients cannot forge,
--     edit or erase history.
--   - Index (user_id, changed_at DESC) for the per-player newest-first read.
--
-- RECENTLY DELETED / RESTORE: a DELETE row's old_row is the complete ledger
--   row. Restoring is an ordinary client insert of old_row (minus the
--   generated net_result) through createLedgerEntry and the existing
--   "Users can insert own ledger" policy; the same id can be reused because
--   the original row is gone. Staking links (staking_sessions cascade on
--   ledger delete) are NOT restored by this; the UI must say so.
--
-- GROWTH: one row per real edit or delete. No purge job is added (no
--   scheduled work without owner instruction); a retention rule, if wanted,
--   is a later decision.
--
-- BREAK WINDOW: the database refuses DDL from :50 to :03 UTC every hour.
-- Run `date -u` first; a refused run applied nothing - apply ONCE after :03.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.bankroll_ledger_changes') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.bankroll_ledger_changes already exists (installed already?)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.bankroll_ledger'::regclass
             AND tgname IN ('bankroll_ledger_changes_on_update','bankroll_ledger_changes_on_delete')) THEN
    RAISE EXCEPTION 'pre-flight failed: a ledger history trigger already exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.bankroll_ledger'::regclass
                 AND conname = 'bankroll_ledger_user_id_fkey') THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_ledger.user_id -> auth.users FK not found; the account-deletion reasoning in the header no longer holds';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
CREATE TABLE public.bankroll_ledger_changes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id   uuid NOT NULL,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  op         text NOT NULL CHECK (op IN ('UPDATE', 'DELETE')),
  old_row    jsonb NOT NULL,
  new_row    jsonb,
  CONSTRAINT bankroll_ledger_changes_new_row_matches_op
    CHECK ((op = 'UPDATE' AND new_row IS NOT NULL) OR (op = 'DELETE' AND new_row IS NULL))
);

COMMENT ON TABLE public.bankroll_ledger_changes IS
  'Before/after image of every UPDATE and DELETE on bankroll_ledger, written only by trigger. Players read their own rows (edit history, recently deleted). 2026-11-28.';

CREATE INDEX bankroll_ledger_changes_user_changed_idx
  ON public.bankroll_ledger_changes (user_id, changed_at DESC);
CREATE INDEX bankroll_ledger_changes_entry_idx
  ON public.bankroll_ledger_changes (entry_id);

ALTER TABLE public.bankroll_ledger_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ledger changes"
  ON public.bankroll_ledger_changes
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.bankroll_ledger_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bankroll_ledger_changes TO authenticated;

CREATE FUNCTION public.fn_bankroll_ledger_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
BEGIN
  -- Account deletion cascades auth.users -> bankroll_ledger. The user row is
  -- already gone, so a history row would break the user_id foreign key and
  -- abort the deletion. Their history is being cascaded away anyway.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.bankroll_ledger_changes (entry_id, user_id, op, old_row, new_row)
    VALUES (OLD.id, OLD.user_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.bankroll_ledger_changes (entry_id, user_id, op, old_row, new_row)
    VALUES (OLD.id, OLD.user_id, 'DELETE', to_jsonb(OLD), NULL);
  END IF;
  RETURN NULL;
END
$fn$;

COMMENT ON FUNCTION public.fn_bankroll_ledger_record_change() IS
  'AFTER UPDATE/DELETE trigger on bankroll_ledger: writes the before/after image to bankroll_ledger_changes. 2026-11-28.';

REVOKE ALL ON FUNCTION public.fn_bankroll_ledger_record_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bankroll_ledger_changes_on_update
  AFTER UPDATE ON public.bankroll_ledger
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.fn_bankroll_ledger_record_change();

CREATE TRIGGER bankroll_ledger_changes_on_delete
  AFTER DELETE ON public.bankroll_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bankroll_ledger_record_change();

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bankroll_ledger_changes'::regclass) THEN
    RAISE EXCEPTION 'post-apply: RLS is off on bankroll_ledger_changes';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bankroll_ledger_changes') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bankroll_ledger_changes'
                    AND policyname = 'Users can view own ledger changes' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'post-apply: expected exactly the one own-rows SELECT policy';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.bankroll_ledger_changes', 'SELECT') THEN
    RAISE EXCEPTION 'post-apply: authenticated cannot SELECT bankroll_ledger_changes';
  END IF;
  IF has_table_privilege('authenticated', 'public.bankroll_ledger_changes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.bankroll_ledger_changes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.bankroll_ledger_changes', 'DELETE')
     OR has_table_privilege('anon', 'public.bankroll_ledger_changes', 'SELECT')
     OR has_table_privilege('anon', 'public.bankroll_ledger_changes', 'INSERT') THEN
    RAISE EXCEPTION 'post-apply: a client role holds a write right (or anon a read right) on bankroll_ledger_changes';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.bankroll_ledger'::regclass AND NOT tgisinternal
      AND tgname IN ('bankroll_ledger_changes_on_update','bankroll_ledger_changes_on_delete') AND tgenabled = 'O') <> 2 THEN
    RAISE EXCEPTION 'post-apply: expected both history triggers enabled';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_bankroll_ledger_record_change()'::regprocedure)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.fn_bankroll_ledger_record_change()'::regprocedure
                    AND proconfig::text LIKE '%search_path=%') THEN
    RAISE EXCEPTION 'post-apply: trigger function must be SECURITY DEFINER with a pinned search_path';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (drops all recorded history - export it first if any reader ships):
-- BEGIN;
-- SET LOCAL lock_timeout = '2s';
-- DROP TRIGGER IF EXISTS bankroll_ledger_changes_on_delete ON public.bankroll_ledger;
-- DROP TRIGGER IF EXISTS bankroll_ledger_changes_on_update ON public.bankroll_ledger;
-- DROP FUNCTION IF EXISTS public.fn_bankroll_ledger_record_change();
-- DROP TABLE IF EXISTS public.bankroll_ledger_changes;
-- COMMIT;
-- ═══════════════════════════════════════════════════════════════════════
