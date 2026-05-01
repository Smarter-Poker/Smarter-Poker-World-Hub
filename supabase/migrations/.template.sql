-- ═══════════════════════════════════════════════════════════════════════
-- <YYYYMMDD>_<short_slug>.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      <agent-name or human>
-- AFFECTS:     tables: ...  rpcs: ...  rls: ...  triggers: ...
-- IRREVERSIBLE: no                            (yes → fill the ROLLBACK section)
--
-- WHY:
--   <One paragraph. What's broken, what symptom this fixes, where the
--   incident/audit/log evidence lives. Future agents WILL ask "why
--   does this exist" — answer it here, not in chat.>
--
-- HOW (high level):
--   - <bullet>
--   - <bullet>
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
-- Fail loudly if our assumptions are wrong, so the migration aborts
-- before partial changes land.
DO $$
BEGIN
    -- Example: assert the table exists, the column doesn't yet, etc.
    -- IF NOT EXISTS (
    --     SELECT 1 FROM information_schema.tables
    --     WHERE table_schema = 'public' AND table_name = '<table>'
    -- ) THEN
    --     RAISE EXCEPTION 'pre-flight failed: public.<table> not found';
    -- END IF;
    NULL;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
-- ALTER TABLE / CREATE INDEX / CREATE OR REPLACE FUNCTION / etc.

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
-- Verify the migration achieved its goal. RAISE EXCEPTION on any
-- mismatch so the transaction rolls back instead of leaving the DB
-- in an unexpected state.
DO $$
BEGIN
    -- Example: assert the new column exists, the new index is valid, etc.
    NULL;
END $$;

-- ─── 4. SCHEMA-CACHE RELOAD (only if changing RPCs that PostgREST exposes)
-- NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 only — paste into a NEW _revert_<slug>.sql migration)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- -- reverse SQL here
-- COMMIT;
