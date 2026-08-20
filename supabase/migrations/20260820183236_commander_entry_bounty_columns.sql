-- ═══════════════════════════════════════════════════════════════════════
-- 20260821130000_commander_entry_bounty_columns.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (additive: two columns + backfill)
-- AUTHOR:      Claude (Cowork) for Club Commander, Wave B payout engines
-- AFFECTS:     tables: public.commander_tournament_entries
--              rpcs: none   rls: none   triggers: none
-- IRREVERSIBLE: no
--
-- WHY:
--   Club Commander recorded a knockout as `bounties_collected += 1` and
--   nothing else. That says a knockout happened, but never what it was
--   WORTH, so: the cage had no figure to pay a bounty against, a
--   Progressive Knockout head could not grow (the entire point of the
--   format), and undoing an elimination could not put the money back
--   because nothing knew how much had moved.
--
--   Two per-entry numbers close it:
--     bounty_value    what is on THIS player's head right now. In a
--                     standard bounty event it is the flat
--                     commander_tournaments.bounty_amount all night. In a
--                     PKO it starts at the buy-in slice that funded it and
--                     grows by half of every head that player knocks out.
--     bounty_winnings cash this player has WON from knockouts. In a PKO
--                     that is the other half of each head they took.
--
--   Conservation: a PKO knockout moves the busted head into
--   (eliminator cash + eliminator head) in equal halves, worked in cents,
--   so the bounty money in play is always entries * starting bounty. See
--   pkoSplit() in pages/api/tournaments/[id]/payout.js.
--
--   Related, same wave, code-only: the prize-pool math now takes the bounty
--   slice OUT of the buy-in (prize = buyin - bounty, fee on top), matching
--   fn_tournament_entry_split on the online side (migration 20260820y).
--   Commander had been counting the bounty slice as prize money as well as
--   bounty money for all 20 bounty tournaments in the table.
--
-- HOW (high level):
--   - ADD COLUMN bounty_value numeric NOT NULL DEFAULT 0
--   - ADD COLUMN bounty_winnings numeric NOT NULL DEFAULT 0
--   - Backfill bounty/PKO events: adopt anything the pre-migration
--     metadata fallback wrote (src/lib/commander/tournamentBounty.js keeps
--     the numbers in metadata until these columns exist), otherwise seed a
--     live player's head from the tournament configuration.
--
-- SAFETY: the application code probes for these columns at runtime and
--   falls back to the metadata jsonb, so it is correct both before and
--   after this migration. Nothing breaks if it is applied late; the
--   backfill below is what adopts the interim metadata values.
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

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commander_tournament_entries'
          AND column_name = 'bounties_collected'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: bounties_collected missing, this is not the expected table shape';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commander_tournaments'
          AND column_name = 'bounty_amount'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: commander_tournaments.bounty_amount not found';
    END IF;

    -- Additive only. If either column already exists this migration has
    -- already run (or something else claimed the name) and must not silently
    -- re-backfill over live numbers.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commander_tournament_entries'
          AND column_name IN ('bounty_value', 'bounty_winnings')
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: bounty_value/bounty_winnings already exist, refusing to re-run the backfill';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

ALTER TABLE public.commander_tournament_entries
    ADD COLUMN bounty_value    numeric NOT NULL DEFAULT 0,
    ADD COLUMN bounty_winnings numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commander_tournament_entries.bounty_value IS
    'Bounty currently on this player''s head. Flat bounty_amount in a bounty event; in a PKO it starts at the buy-in slice that funded it and grows by half of every head this player knocks out. Zeroed when the head is claimed.';

COMMENT ON COLUMN public.commander_tournament_entries.bounty_winnings IS
    'Cash this player has won from knockouts. Standard bounty: knockouts * bounty_amount. PKO: the cash half of every head taken.';

-- Backfill, bounty and PKO events only. Everything else stays at the 0
-- default, which is already correct for a freezeout.
UPDATE public.commander_tournament_entries e
SET
    -- Adopt whatever the pre-migration metadata fallback recorded.
    bounty_winnings = COALESCE(NULLIF(e.metadata ->> 'bounty_winnings', '')::numeric, 0),
    bounty_value = CASE
        -- Out of the tournament: the head is gone (claimed, or never in play).
        WHEN e.status IN ('eliminated', 'cancelled', 'winner', 'cashed') THEN 0
        ELSE COALESCE(
            NULLIF(e.metadata ->> 'bounty_value', '')::numeric,
            CASE lower(COALESCE(t.tournament_type, ''))
                WHEN 'pko' THEN COALESCE(
                    NULLIF(t.settings -> 'pko' ->> 'starting_bounty', '')::numeric,
                    NULLIF(t.bounty_amount, 0)::numeric,
                    floor(COALESCE(t.buyin_amount, 0) / 2.0)
                )
                WHEN 'bounty' THEN COALESCE(t.bounty_amount, 0)::numeric
                ELSE 0
            END
        )
    END
FROM public.commander_tournaments t
WHERE t.id = e.tournament_id
  AND lower(COALESCE(t.tournament_type, '')) IN ('bounty', 'pko');

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_cols     int;
    v_negative int;
    v_nulls    int;
BEGIN
    SELECT count(*) INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commander_tournament_entries'
      AND column_name IN ('bounty_value', 'bounty_winnings')
      AND data_type = 'numeric'
      AND is_nullable = 'NO'
      AND column_default = '0';

    IF v_cols <> 2 THEN
        RAISE EXCEPTION 'post-apply failed: expected 2 numeric NOT NULL DEFAULT 0 bounty columns, found %', v_cols;
    END IF;

    SELECT count(*) INTO v_negative
    FROM public.commander_tournament_entries
    WHERE bounty_value < 0 OR bounty_winnings < 0;

    IF v_negative > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % entries carry a negative bounty figure', v_negative;
    END IF;

    SELECT count(*) INTO v_nulls
    FROM public.commander_tournament_entries
    WHERE bounty_value IS NULL OR bounty_winnings IS NULL;

    IF v_nulls > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % entries carry a NULL bounty figure', v_nulls;
    END IF;

    -- A live entry in a configured bounty/PKO event must now carry a head.
    IF EXISTS (
        SELECT 1
        FROM public.commander_tournament_entries e
        JOIN public.commander_tournaments t ON t.id = e.tournament_id
        WHERE lower(COALESCE(t.tournament_type, '')) IN ('bounty', 'pko')
          AND COALESCE(t.bounty_amount, 0) > 0
          AND e.status IN ('seated', 'active', 'bagged', 'registered', 'alternate')
          AND e.bounty_value = 0
    ) THEN
        RAISE EXCEPTION 'post-apply failed: a live entry in a funded bounty event has no bounty_value';
    END IF;
END $$;

-- ─── 4. SCHEMA-CACHE RELOAD ───────────────────────────────────────────
-- New columns must be visible to PostgREST before the API stops falling
-- back to metadata.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a NEW _revert_commander_entry_bounty_columns.sql)
-- ═══════════════════════════════════════════════════════════════════════
-- Dropping these loses every recorded bounty figure. Copy them into
-- metadata first so the application's metadata fallback keeps working.
--
-- BEGIN;
--
-- UPDATE public.commander_tournament_entries
-- SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
--         'bounty_value',    bounty_value,
--         'bounty_winnings', bounty_winnings
--     )
-- WHERE bounty_value <> 0 OR bounty_winnings <> 0;
--
-- ALTER TABLE public.commander_tournament_entries
--     DROP COLUMN bounty_value,
--     DROP COLUMN bounty_winnings;
--
-- NOTIFY pgrst, 'reload schema';
--
-- COMMIT;
