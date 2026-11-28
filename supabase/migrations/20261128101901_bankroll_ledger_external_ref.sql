-- ═══════════════════════════════════════════════════════════════════════
-- 20261128101901_bankroll_ledger_external_ref.sql  (INSTALLED 2026-11-28 10:19 UTC)
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive column + partial unique index)
-- AUTHOR:      Claude (Bankroll Manager programme coordinator, owner-authorized)
-- AFFECTS:     public.bankroll_ledger.external_ref, index bankroll_ledger_user_external_ref_key
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   src/lib/bankroll/clubArenaSessions.mjs (Club Arena import), CSV import.
--
-- WHY:
--   Imported entries were deduplicated by a marker in notes, which a player
--   can edit away, after which the same Club Arena sitting could be logged
--   twice. external_ref records the source; the unique (user_id,
--   external_ref) index makes a second import of the same source fail.
--
-- HOW:
--   - Nullable text column; shape check '^[a-z][a-z0-9_-]*:' and 3-200 chars.
--   - Partial unique index on (user_id, external_ref) WHERE NOT NULL. The
--     table had 22 rows, so a non-concurrent index was safe; the pre-flight
--     refuses above 100k rows.
--
-- ROLLBACK: DROP INDEX bankroll_ledger_user_external_ref_key; ALTER TABLE
--   public.bankroll_ledger DROP CONSTRAINT bankroll_ledger_external_ref_shape,
--   DROP COLUMN external_ref;  (only after the client stops writing it)
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'bankroll_ledger' AND column_name = 'external_ref') THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_ledger.external_ref already exists';
  END IF;
  IF (SELECT reltuples FROM pg_class WHERE oid = 'public.bankroll_ledger'::regclass) > 100000 THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_ledger too large for a non-concurrent index; build it CONCURRENTLY in its own migration';
  END IF;
END
$pre$;
ALTER TABLE public.bankroll_ledger ADD COLUMN external_ref text;
ALTER TABLE public.bankroll_ledger
  ADD CONSTRAINT bankroll_ledger_external_ref_shape
    CHECK (external_ref IS NULL OR (length(external_ref) BETWEEN 3 AND 200 AND external_ref ~ '^[a-z][a-z0-9_-]*:'));
CREATE UNIQUE INDEX bankroll_ledger_user_external_ref_key
  ON public.bankroll_ledger (user_id, external_ref)
  WHERE external_ref IS NOT NULL;
COMMENT ON COLUMN public.bankroll_ledger.external_ref IS
  'Source of an imported entry, e.g. club-arena:cash:<first chip_ledger id>, club-arena:mtt:<tournament id>, csv:<import id>:<row>. Unique per user. NULL for typed entries.';
DO $post$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'bankroll_ledger'
                 AND indexname = 'bankroll_ledger_user_external_ref_key') THEN
    RAISE EXCEPTION 'post-apply: unique external_ref index missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bankroll_ledger WHERE external_ref IS NOT NULL) THEN
    RAISE EXCEPTION 'post-apply: no existing row should have an external_ref';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bankroll_ledger'::regclass) THEN
    RAISE EXCEPTION 'post-apply: RLS is off on bankroll_ledger';
  END IF;
END
$post$;
COMMIT;
