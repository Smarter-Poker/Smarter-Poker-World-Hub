-- ═══════════════════════════════════════════════════════════════════════
-- 20260820140000_commander_entry_reentry_marker.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Claude (Commander tournament work, Wave A)
-- AFFECTS:     tables: public.commander_tournament_entries
--              triggers: commander_entries_reentry_marker_trigger
--              rpcs: none   rls: none
-- IRREVERSIBLE: no
--
-- WHY:
--   A RE-ENTRY and a REBUY are different events and the schema could not tell
--   them apart.
--
--     REBUY     tops up the SAME entry. One row, rebuy_count + 1, one entry
--               toward the prize pool. Handled by
--               pages/api/tournaments/[id]/entries/[entryId]/rebuy.js.
--     RE-ENTRY  is a NEW entry after a bust. A NEW row with its own starting
--               stack, counting as an ADDITIONAL entry toward the prize pool.
--               The busted row is untouched and keeps its finish_position and
--               any payout recorded against it.
--
--   Multiple rows per (tournament_id, player_id) already exist in production
--   (on 2026-08-20: 8 pairs with 2 rows, 25 with 3, 12 with 4, 5 with 5), and
--   nothing recorded which of those rows was a re-entry or which entry it
--   replaced. Every prize-pool calculation counts non-cancelled rows
--   (eliminate.js getTotalEntries, payout.js totalEntries, floor-view.js
--   paidEntryCount), so the money math is already correct and this migration
--   does NOT change it. What was missing was the LINK, which the cage needs to
--   reconcile second entries and which reporting needs to show "3 entries,
--   1 re-entry" rather than three unrelated players.
--
--   pages/api/tournaments/[id]/register.js now accepts reentry_of, validates
--   that the original entry is in the same tournament, belongs to the same
--   player, and has status 'eliminated', then stamps the new row's metadata
--   with { is_reentry, reentry_of, reentry_at, reentry_from_finish_position }.
--   That works today with no schema change. This migration promotes the marker
--   to real columns so it can be indexed, joined and aggregated.
--
-- HOW (high level):
--   - Add is_reentry boolean NOT NULL DEFAULT false and reentry_of uuid
--     (self-FK, ON DELETE SET NULL).
--   - Add a BEFORE INSERT OR UPDATE trigger that keeps both columns in step
--     with metadata. This means NO application change is required when this
--     migration is applied: register.js keeps writing metadata and the columns
--     populate themselves. Direct column writes still win when metadata is
--     silent on the subject.
--   - Backfill the columns from any metadata already present.
--   - Partial index on reentry_of for the "show me the re-entries" queries.
--
-- NOTE: applying this is safe at any time and is not required for the
-- application code to work. It is the queryable form of a marker that already
-- lives in metadata.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'commander_tournament_entries'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.commander_tournament_entries not found';
    END IF;

    -- metadata is where the marker currently lives; without it the backfill and
    -- the trigger have nothing to read.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commander_tournament_entries'
          AND column_name = 'metadata'
          AND data_type = 'jsonb'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: commander_tournament_entries.metadata (jsonb) not found';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

ALTER TABLE public.commander_tournament_entries
    ADD COLUMN IF NOT EXISTS is_reentry boolean NOT NULL DEFAULT false;

ALTER TABLE public.commander_tournament_entries
    ADD COLUMN IF NOT EXISTS reentry_of uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commander_tournament_entries_reentry_of_fkey'
    ) THEN
        ALTER TABLE public.commander_tournament_entries
            ADD CONSTRAINT commander_tournament_entries_reentry_of_fkey
            FOREIGN KEY (reentry_of)
            REFERENCES public.commander_tournament_entries (id)
            ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.commander_tournament_entries.is_reentry IS
    'True when this row is a re-entry: a NEW entry taken after this player busted. Counts as an additional entry toward the prize pool. A REBUY is NOT a re-entry (it tops up the same row via rebuy_count).';
COMMENT ON COLUMN public.commander_tournament_entries.reentry_of IS
    'The busted entry this row replaces. That original row is never modified: it keeps its finish_position and its recorded payout.';

-- Keep the columns in step with metadata so the application needs no change.
-- register.js writes metadata.is_reentry / metadata.reentry_of; anything that
-- writes the columns directly still wins when metadata says nothing.
CREATE OR REPLACE FUNCTION public.commander_entries_sync_reentry_marker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_flag text;
    v_of   text;
BEGIN
    v_flag := NEW.metadata ->> 'is_reentry';
    v_of   := NEW.metadata ->> 'reentry_of';

    IF v_flag IS NOT NULL THEN
        NEW.is_reentry := (lower(v_flag) IN ('true', 't', '1'));
    END IF;

    -- A malformed id in metadata must never reject the write: the entry itself
    -- is more important than the marker.
    IF v_of IS NOT NULL AND v_of <> '' THEN
        BEGIN
            NEW.reentry_of := v_of::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE WARNING 'commander_entries_sync_reentry_marker: metadata.reentry_of is not a uuid (%), left unset', v_of;
        END;
    END IF;

    -- A row that points at an original entry IS a re-entry, whatever the flag
    -- says.
    IF NEW.reentry_of IS NOT NULL THEN
        NEW.is_reentry := true;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS commander_entries_reentry_marker_trigger
    ON public.commander_tournament_entries;

CREATE TRIGGER commander_entries_reentry_marker_trigger
    BEFORE INSERT OR UPDATE ON public.commander_tournament_entries
    FOR EACH ROW EXECUTE FUNCTION public.commander_entries_sync_reentry_marker();

-- Backfill from metadata already on the rows. On 2026-08-20 no row carried the
-- marker yet, so this is expected to touch 0 rows on first apply; it is written
-- for the case where the application has been running against the metadata-only
-- form before this migration lands.
UPDATE public.commander_tournament_entries e
SET reentry_of = (e.metadata ->> 'reentry_of')::uuid,
    is_reentry = true
-- jsonb_exists(), not the `?` operator: a `?` in raw SQL is treated as a bind
-- placeholder by several clients and would break the apply.
WHERE jsonb_exists(e.metadata, 'reentry_of')
  AND (e.metadata ->> 'reentry_of') ~ '^[0-9a-fA-F-]{36}$'
  AND e.reentry_of IS DISTINCT FROM (e.metadata ->> 'reentry_of')::uuid;

UPDATE public.commander_tournament_entries e
SET is_reentry = true
WHERE lower(coalesce(e.metadata ->> 'is_reentry', '')) IN ('true', 't', '1')
  AND e.is_reentry = false;

-- "Which entries in this event are re-entries" is the only query shape, so the
-- index is partial and stays tiny.
CREATE INDEX IF NOT EXISTS idx_commander_entries_reentry_of
    ON public.commander_tournament_entries (reentry_of)
    WHERE reentry_of IS NOT NULL;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commander_tournament_entries'
          AND column_name = 'is_reentry'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: is_reentry column missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commander_tournament_entries'
          AND column_name = 'reentry_of'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: reentry_of column missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.commander_tournament_entries'::regclass
          AND tgname = 'commander_entries_reentry_marker_trigger'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'post-apply failed: commander_entries_reentry_marker_trigger missing';
    END IF;

    -- Every linked row must be flagged, and no row may point at itself.
    IF EXISTS (
        SELECT 1 FROM public.commander_tournament_entries
        WHERE reentry_of IS NOT NULL AND is_reentry = false
    ) THEN
        RAISE EXCEPTION 'post-apply failed: rows with reentry_of are not flagged is_reentry';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.commander_tournament_entries
        WHERE reentry_of = id
    ) THEN
        RAISE EXCEPTION 'post-apply failed: an entry points at itself as its own re-entry origin';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a NEW _revert_commander_entry_reentry_marker.sql)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS commander_entries_reentry_marker_trigger
--     ON public.commander_tournament_entries;
-- DROP FUNCTION IF EXISTS public.commander_entries_sync_reentry_marker();
-- DROP INDEX IF EXISTS public.idx_commander_entries_reentry_of;
-- ALTER TABLE public.commander_tournament_entries
--     DROP CONSTRAINT IF EXISTS commander_tournament_entries_reentry_of_fkey;
-- ALTER TABLE public.commander_tournament_entries DROP COLUMN IF EXISTS reentry_of;
-- ALTER TABLE public.commander_tournament_entries DROP COLUMN IF EXISTS is_reentry;
-- COMMIT;
-- The marker survives a rollback: it is still in metadata on every re-entry row.
