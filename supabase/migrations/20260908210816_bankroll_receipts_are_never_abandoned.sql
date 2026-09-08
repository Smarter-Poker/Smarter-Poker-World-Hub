-- ═══════════════════════════════════════════════════════════════════════
-- 20260908210816_bankroll_receipts_are_never_abandoned.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (additive: one new table)
-- AUTHOR:      cowork-receipts (Claude)
-- AFFECTS:     tables: bankroll_receipts (new)  rls: bankroll_receipts_own
-- IRREVERSIBLE: no
-- APPLIED:     2026-09-08 via the Supabase MCP apply_migration, recorded as
--              version 20260908210816 in supabase_migrations.schema_migrations.
--              Dry-run in a rolled-back transaction first.
--
-- WHY:
--   Dan, 2026-09-08: a scanned receipt "must always at least be SAVED and
--   assigned to some place later, it can't just be left or abandoned." Until
--   now the Receipt Saved sheet on /hub/bankroll-manager uploaded the image to
--   storage and kept NO record of it: closing the sheet left an orphaned
--   object nothing could find again, and a W-2G (screenshot, Four Winds,
--   $2,140.00) was offered only "Create New Expense" or "Attach To Existing".
--   This table is the record. A row is written the moment a scan completes,
--   before the user chooses anything, and stays `unassigned` until the receipt
--   is attached to a ledger entry (session or expense) or filed in the W-2G
--   vault. The dashboard lists unassigned rows until they are gone.
--
-- HOW (high level):
--   - bankroll_receipts: one row per completed scan, owned by user_id
--   - status unassigned|assigned; assigned_kind + assigned_id name the target
--   - route/extracted jsonb keep the classification so the sheet can reopen
--     the receipt later exactly as it was read
--   - RLS: owner only, same shape as w2g_forms
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bankroll_receipts'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.bankroll_receipts already exists';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'w2g_forms'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.w2g_forms not found (the vault this feeds)';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bankroll_ledger'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.bankroll_ledger not found';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
CREATE TABLE public.bankroll_receipts (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url       text        NOT NULL,
    document_type   text        NOT NULL DEFAULT 'unknown',
    destination     text        NOT NULL DEFAULT 'manual',
    summary         text,
    route           jsonb,
    extracted       jsonb,
    status          text        NOT NULL DEFAULT 'unassigned'
                                CHECK (status IN ('unassigned', 'assigned')),
    assigned_kind   text        CHECK (assigned_kind IS NULL OR assigned_kind IN ('ledger_entry', 'w2g_form')),
    assigned_id     uuid,
    assigned_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bankroll_receipts_assignment_is_whole CHECK (
        (status = 'unassigned' AND assigned_kind IS NULL AND assigned_id IS NULL)
        OR
        (status = 'assigned' AND assigned_kind IS NOT NULL AND assigned_id IS NOT NULL)
    )
);

COMMENT ON TABLE public.bankroll_receipts IS
    'One row per completed receipt scan on /hub/bankroll-manager. Written before the user chooses a destination so a scan is never lost; unassigned rows are listed on the dashboard until filed.';

CREATE INDEX bankroll_receipts_user_status_idx
    ON public.bankroll_receipts (user_id, status, created_at DESC);

ALTER TABLE public.bankroll_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY bankroll_receipts_own ON public.bankroll_receipts
    FOR ALL
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankroll_receipts TO authenticated;
GRANT ALL ON public.bankroll_receipts TO service_role;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'bankroll_receipts' AND policyname = 'bankroll_receipts_own'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: owner policy missing on bankroll_receipts';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bankroll_receipts'::regclass) THEN
        RAISE EXCEPTION 'post-apply failed: RLS not enabled on bankroll_receipts';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
