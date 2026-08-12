-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808214331_add_poker_venues_zip_for_w2g.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- pages/api/tax/w2g.js selects `zip` from poker_venues to fill the venue
-- block of a W-2G tax form. The table has address/city/state/country but no
-- zip (or any postal column), so the select fails with 42703 and the form
-- generates with no venue data — on a federal gambling-winnings tax
-- document.
--
-- Additive, nullable, named `zip` to match the query so no code change is
-- needed. The value must still be sourced per venue — a blank ZIP on a form
-- that otherwise renders is an honest gap; a 500 that renders nothing is
-- not. All existing venue rows stay valid.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.poker_venues
  ADD COLUMN IF NOT EXISTS zip text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='poker_venues' AND column_name='zip') THEN
    RAISE EXCEPTION 'poker_venues.zip was not added';
  END IF;
END $$;
