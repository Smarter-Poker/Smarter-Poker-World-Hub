-- ═══════════════════════════════════════════════════════════════════════
-- 20261128101825_bankroll_ledger_entry_currency.sql
-- INSTALLED on production 2026-11-28 10:18:25 UTC as version 20261128101825 (supabase_migrations.schema_migrations).
-- Repo SQL equals the installed statements (comments and blank lines aside). Never edit.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive: nullable columns, constant default, checks)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     tables: public.bankroll_ledger (4 new columns, 3 checks)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS: none yet. No shipped reader or writer
--   names these columns, and nothing must until this is installed (a select
--   or insert naming a missing column fails with 42703 / PGRST204).
--   Planned writers: the session entry form in pages/hub/bankroll-manager.js
--   (via createLedgerEntry / updateLedgerEntry in
--   src/lib/bankroll/bankrollSelectors.ts). See "Client changes" below.
--
-- WHY:
--   A player who plays in Europe types a EUR buy-in today and either converts
--   it in their head or stores EUR as if it were USD. Tonight's ruling stays:
--   every total, tax figure and export is USD, and Display EUR converts
--   display money only (currencyUtils.js). So gross_in / gross_out KEEP
--   MEANING USD for every row. These columns only remember what the player
--   actually typed and at what rate, so an entry can be shown and edited in
--   its own currency and audited later.
--
-- HOW:
--   entry_currency     text DEFAULT 'USD', nullable; ISO-4217 shape check.
--                      NULL and 'USD' both mean "typed in USD".
--   fx_rate_to_usd     numeric; USD per one unit of entry_currency; > 0.
--   original_gross_in  numeric; the buy-in as typed, in entry_currency.
--   original_gross_out numeric; the cash-out as typed, in entry_currency.
--   Check bankroll_ledger_foreign_entry_complete: a non-USD row must carry a
--   rate and both originals. A USD/NULL row may leave them NULL.
--   On PostgreSQL 11+ ADD COLUMN with a constant default is metadata only
--   (no rewrite). The checks are added NOT VALID then VALIDATEd, which takes
--   only a SHARE UPDATE EXCLUSIVE lock while scanning (22 rows 2026-11-28).
--
-- BACKWARD COMPATIBILITY:
--   - gross_in, gross_out and the generated net_result are untouched, so
--     ledgerMath, ledgerReport, bankrollStats, tax, exports, staking, the
--     analytics view and fn_bankroll_totals read exactly what they read now.
--   - Every existing row reads entry_currency = 'USD' (the default is applied
--     to existing rows virtually) and NULL for the other three.
--   - select('*') readers receive four extra keys they ignore.
--   - Inserts that do not name the columns get 'USD' / NULL.
--   - RLS policies on bankroll_ledger are row policies; they cover the new
--     columns unchanged. Table-level grants also cover new columns.
--
-- CLIENT CHANGES NEEDED AFTER INSTALL (none are in this lane's PR):
--   1. Entry form: a currency select (default USD). For a non-USD entry,
--      take the rate (prefilled from the rate currencyUtils already uses for
--      display, editable), store original_gross_in / original_gross_out as
--      typed, and write gross_in = round(original_gross_in * rate, 2),
--      gross_out likewise. All USD math keeps reading gross_in / gross_out.
--   2. Edit form: when entry_currency is not USD, edit the originals and
--      recompute gross_* with the stored rate (or a corrected one).
--   3. Ledger list / session detail: show "EUR 200.00 (USD 216.40 at 1.0820)"
--      for a foreign row; totals stay USD.
--   4. Exports: add Entry Currency, Original Buy-In, Original Cash-Out and
--      FX Rate columns AFTER the existing ones (spreadsheets keyed on column
--      order keep working). Tax stays USD and says so.
--   5. Revisions (is_revision copies) must copy the four columns too.
--   6. src/types/supabase.ts: regenerate types.
--
-- BREAK WINDOW: the database refuses DDL from :50 to :03 UTC every hour.
-- Run `date -u` first; a refused run applied nothing - apply ONCE after :03.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['entry_currency','fx_rate_to_usd','original_gross_in','original_gross_out'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'bankroll_ledger' AND column_name = col) THEN
      RAISE EXCEPTION 'pre-flight failed: bankroll_ledger.% already exists (installed already?)', col;
    END IF;
  END LOOP;
  IF (SELECT reltuples FROM pg_class WHERE oid = 'public.bankroll_ledger'::regclass) > 1000000 THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_ledger is over 1M rows; re-plan the VALIDATE step';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
ALTER TABLE public.bankroll_ledger
  ADD COLUMN entry_currency text DEFAULT 'USD',
  ADD COLUMN fx_rate_to_usd numeric,
  ADD COLUMN original_gross_in numeric,
  ADD COLUMN original_gross_out numeric;

ALTER TABLE public.bankroll_ledger
  ADD CONSTRAINT bankroll_ledger_entry_currency_check
    CHECK (entry_currency IS NULL OR entry_currency ~ '^[A-Z]{3}$') NOT VALID,
  ADD CONSTRAINT bankroll_ledger_fx_rate_positive
    CHECK (fx_rate_to_usd IS NULL OR fx_rate_to_usd > 0) NOT VALID,
  ADD CONSTRAINT bankroll_ledger_foreign_entry_complete
    CHECK (COALESCE(entry_currency, 'USD') = 'USD'
           OR (fx_rate_to_usd IS NOT NULL AND original_gross_in IS NOT NULL AND original_gross_out IS NOT NULL)) NOT VALID;

ALTER TABLE public.bankroll_ledger VALIDATE CONSTRAINT bankroll_ledger_entry_currency_check;
ALTER TABLE public.bankroll_ledger VALIDATE CONSTRAINT bankroll_ledger_fx_rate_positive;
ALTER TABLE public.bankroll_ledger VALIDATE CONSTRAINT bankroll_ledger_foreign_entry_complete;

COMMENT ON COLUMN public.bankroll_ledger.entry_currency IS 'ISO-4217 code the player typed this entry in. NULL or USD = USD. gross_in/gross_out are ALWAYS USD.';
COMMENT ON COLUMN public.bankroll_ledger.fx_rate_to_usd IS 'USD per 1 unit of entry_currency used to compute gross_in/gross_out. NULL for USD entries.';
COMMENT ON COLUMN public.bankroll_ledger.original_gross_in IS 'Buy-in as typed, in entry_currency. NULL for USD entries.';
COMMENT ON COLUMN public.bankroll_ledger.original_gross_out IS 'Cash-out as typed, in entry_currency. NULL for USD entries.';

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bankroll_ledger'
        AND column_name IN ('entry_currency','fx_rate_to_usd','original_gross_in','original_gross_out')
        AND is_nullable = 'YES') <> 4 THEN
    RAISE EXCEPTION 'post-apply: expected 4 nullable currency columns';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bankroll_ledger WHERE entry_currency IS DISTINCT FROM 'USD') THEN
    RAISE EXCEPTION 'post-apply: an existing row does not read entry_currency = USD';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'public.bankroll_ledger'::regclass AND convalidated
        AND conname IN ('bankroll_ledger_entry_currency_check','bankroll_ledger_fx_rate_positive','bankroll_ledger_foreign_entry_complete')) <> 3 THEN
    RAISE EXCEPTION 'post-apply: expected 3 validated currency constraints';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bankroll_ledger'::regclass) THEN
    RAISE EXCEPTION 'post-apply: RLS is off on bankroll_ledger';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (only while no client writes the columns; dropping them after
-- foreign entries exist discards what the player typed - gross_* in USD
-- survive either way):
-- BEGIN;
-- SET LOCAL lock_timeout = '2s';
-- ALTER TABLE public.bankroll_ledger
--   DROP CONSTRAINT IF EXISTS bankroll_ledger_foreign_entry_complete,
--   DROP CONSTRAINT IF EXISTS bankroll_ledger_fx_rate_positive,
--   DROP CONSTRAINT IF EXISTS bankroll_ledger_entry_currency_check,
--   DROP COLUMN IF EXISTS original_gross_out,
--   DROP COLUMN IF EXISTS original_gross_in,
--   DROP COLUMN IF EXISTS fx_rate_to_usd,
--   DROP COLUMN IF EXISTS entry_currency;
-- COMMIT;
-- ═══════════════════════════════════════════════════════════════════════
