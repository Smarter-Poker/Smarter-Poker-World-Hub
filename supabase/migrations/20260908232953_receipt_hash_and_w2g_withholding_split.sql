-- ═══════════════════════════════════════════════════════════════════════
-- 20260908232953_receipt_hash_and_w2g_withholding_split.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (additive columns and one index)
-- AUTHOR:      cowork-receipts (Claude)
-- AFFECTS:     tables: bankroll_receipts (image_hash, confidence, auto_file),
--                      w2g_forms (federal_withheld, state_withheld)
-- IRREVERSIBLE: no
-- APPLIED:     2026-09-08 via the Supabase MCP apply_migration, recorded as
--              version 20260908232953. Dry-run in a rolled-back transaction first.
--
-- WHY:
--   1. A player photographs the same receipt twice, once at the table and
--      once emptying a pocket that night. Nothing stopped that becoming two
--      bankroll_receipts rows and, filed, two ledger entries and a doubled
--      buy-in. image_hash is a 64-bit difference hash of the scan; a near
--      match is SHOWN to the user with what the earlier one was. Nothing is
--      ever dropped automatically.
--   2. confidence and auto_file keep the router's verdict on the row, so
--      "File All Suggested" can act on it without reading the image again.
--   3. w2g_forms held ONE withholding number. A return wants the federal and
--      the state figure apart. withholding_amount stays the total, because
--      every existing reader adds it up that way.
--
-- HOW (high level):
--   - three nullable columns on bankroll_receipts, auto_file defaulting false
--   - a partial index on (user_id, image_hash) for the duplicate lookup
--   - two nullable columns on w2g_forms
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bankroll_receipts' AND column_name = 'image_hash') THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_receipts.image_hash already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'w2g_forms' AND column_name = 'federal_withheld') THEN
    RAISE EXCEPTION 'pre-flight failed: w2g_forms.federal_withheld already exists';
  END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
ALTER TABLE public.bankroll_receipts
  ADD COLUMN image_hash text,
  ADD COLUMN confidence numeric,
  ADD COLUMN auto_file boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bankroll_receipts.image_hash IS
  'dHash of the scan (16 hex chars); near-duplicates are flagged in the sheet, never silently dropped.';

CREATE INDEX bankroll_receipts_user_hash_idx
  ON public.bankroll_receipts (user_id, image_hash) WHERE image_hash IS NOT NULL;

ALTER TABLE public.w2g_forms
  ADD COLUMN federal_withheld numeric,
  ADD COLUMN state_withheld numeric;

COMMENT ON COLUMN public.w2g_forms.withholding_amount IS
  'Total withheld (federal + state). Kept for every existing reader; the split lives in federal_withheld and state_withheld.';

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bankroll_receipts' AND column_name = 'auto_file') THEN
    RAISE EXCEPTION 'post-apply failed: bankroll_receipts.auto_file missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'w2g_forms' AND column_name = 'state_withheld') THEN
    RAISE EXCEPTION 'post-apply failed: w2g_forms.state_withheld missing';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
