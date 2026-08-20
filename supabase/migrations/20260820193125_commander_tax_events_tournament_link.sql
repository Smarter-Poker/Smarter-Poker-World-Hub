-- ═══════════════════════════════════════════════════════════════════════
-- 20260822090000_commander_tax_events_tournament_link.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Claude (Cowork), Wave D financial and compliance
-- AFFECTS:     tables: public.commander_tax_events
--              rpcs: none  rls: none  triggers: none
-- IRREVERSIBLE: no
--
-- WHY:
--   commander_tax_events records a W-2G with a venue, a player and a date and
--   NOTHING ELSE that says which event produced it. Two consequences, both
--   live today:
--
--     1. The end-of-event compliance packet
--        (GET /api/commander/tournaments/:id/export) cannot list the tax
--        events for the tournament it is exporting. It currently falls back to
--        "same venue, same calendar day, one of these player ids", which is
--        wrong the moment a room runs two events on one day, which is every
--        Saturday.
--     2. Nothing can tell whether a W-2G has already been filed for a given
--        entry, so pressing Finalize twice files the form twice against the
--        same player for the same win.
--
--   entry_id (not just player_id) is the correct key because a re-entry is its
--   own wager: the same player can produce two separate reportable results in
--   one tournament, and each needs its own form.
--
--   NOTHING IS BACKFILLED. Historic tax events keep NULL links exactly as they
--   were written; the export falls back to the date heuristic for those rows.
--
-- HOW (high level):
--   - add nullable tournament_id uuid REFERENCES commander_tournaments(id)
--   - add nullable entry_id uuid REFERENCES commander_tournament_entries(id)
--   - index tournament_id for the packet lookup
--   - partial UNIQUE index on (tournament_id, entry_id) so a duplicate filing
--     is rejected by the database, not just by application-level dedupe
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'commander_tax_events'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.commander_tax_events not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'commander_tournaments'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.commander_tournaments not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'commander_tournament_entries'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.commander_tournament_entries not found';
    END IF;

    -- commander_tournaments.id and commander_tournament_entries.id must both be
    -- uuid or the FK below will not type-check.
    IF (
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commander_tournaments' AND column_name = 'id'
    ) IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'pre-flight failed: commander_tournaments.id is not uuid';
    END IF;

    IF (
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commander_tournament_entries' AND column_name = 'id'
    ) IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'pre-flight failed: commander_tournament_entries.id is not uuid';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

ALTER TABLE public.commander_tax_events
    ADD COLUMN IF NOT EXISTS tournament_id uuid;

ALTER TABLE public.commander_tax_events
    ADD COLUMN IF NOT EXISTS entry_id uuid;

COMMENT ON COLUMN public.commander_tax_events.tournament_id IS
    'The tournament that produced this reportable win. NULL on cash-game events and on rows written before 2026-08-22 (never backfilled).';
COMMENT ON COLUMN public.commander_tax_events.entry_id IS
    'The specific tournament ENTRY that produced this win. One entry is one wager, so a re-entry that also cashes gets its own event row.';

-- ON DELETE SET NULL, not CASCADE: a tax event is a compliance record and must
-- outlive the tournament row it came from if that is ever cleaned up.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commander_tax_events_tournament_id_fkey'
          AND conrelid = 'public.commander_tax_events'::regclass
    ) THEN
        ALTER TABLE public.commander_tax_events
            ADD CONSTRAINT commander_tax_events_tournament_id_fkey
            FOREIGN KEY (tournament_id)
            REFERENCES public.commander_tournaments(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commander_tax_events_entry_id_fkey'
          AND conrelid = 'public.commander_tax_events'::regclass
    ) THEN
        ALTER TABLE public.commander_tax_events
            ADD CONSTRAINT commander_tax_events_entry_id_fkey
            FOREIGN KEY (entry_id)
            REFERENCES public.commander_tournament_entries(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commander_tax_events_tournament
    ON public.commander_tax_events (tournament_id)
    WHERE tournament_id IS NOT NULL;

-- One W-2G per entry. Partial so the historic NULL-linked rows are unaffected
-- and cash-game events (which have no entry) are never constrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commander_tax_events_entry
    ON public.commander_tax_events (tournament_id, entry_id)
    WHERE tournament_id IS NOT NULL AND entry_id IS NOT NULL;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commander_tax_events'
          AND column_name = 'tournament_id' AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: commander_tax_events.tournament_id missing or wrong type';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commander_tax_events'
          AND column_name = 'entry_id' AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: commander_tax_events.entry_id missing or wrong type';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'uq_commander_tax_events_entry'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: uq_commander_tax_events_entry not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commander_tax_events_entry_id_fkey'
          AND conrelid = 'public.commander_tax_events'::regclass
    ) THEN
        RAISE EXCEPTION 'post-apply failed: entry_id foreign key not created';
    END IF;

    -- Nothing was backfilled: every pre-existing row must still be unlinked.
    IF EXISTS (
        SELECT 1 FROM public.commander_tax_events
        WHERE created_at < now() - interval '1 minute'
          AND (tournament_id IS NOT NULL OR entry_id IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'post-apply failed: historic tax events were modified; this migration must not backfill';
    END IF;
END $$;

-- ─── 4. SCHEMA-CACHE RELOAD ───────────────────────────────────────────
-- New columns must be visible to PostgREST or the API insert that writes them
-- fails with PGRST204 until the cache expires on its own.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a NEW _revert_commander_tax_events_tournament_link.sql)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP INDEX IF EXISTS public.uq_commander_tax_events_entry;
-- DROP INDEX IF EXISTS public.idx_commander_tax_events_tournament;
-- ALTER TABLE public.commander_tax_events
--     DROP CONSTRAINT IF EXISTS commander_tax_events_entry_id_fkey;
-- ALTER TABLE public.commander_tax_events
--     DROP CONSTRAINT IF EXISTS commander_tax_events_tournament_id_fkey;
-- ALTER TABLE public.commander_tax_events DROP COLUMN IF EXISTS entry_id;
-- ALTER TABLE public.commander_tax_events DROP COLUMN IF EXISTS tournament_id;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
