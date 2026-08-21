-- ═══════════════════════════════════════════════════════════════════════
-- 20260821030000_seed_unfunded_shark_club_horses.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Cowork (Claude)
-- AFFECTS:     tables: club_members.chip_balance, clubs.chip_treasury,
--                      chip_transactions (inserts)
-- IRREVERSIBLE: no                            (see ROLLBACK at the bottom)
--
-- WHY:
--   Dan, of his cashier roster: "you need to add all the chip balances the
--   horses had in their wallets when they were assigned to me", and on being
--   shown that no such balance exists: "they should of already had chips, but
--   if they didn't just seed them with whatever amount the other horses have
--   so they can play all the games."
--
--   The investigation: the ten horses on that roster were created
--   2026-08-21 00:59:34 with chip_balance = 0, wallet 0, and two inbound chip
--   transactions totalling 2.00 between all of them. Nothing was lost —
--   whatever seeded them never funded them, unlike the other 576 horses in the
--   club. So this is a grant, not a restoration, and it says so.
--
--   AMOUNT: 21,679, the MEDIAN balance of the club's 576 funded horses. The
--   mean is 72,150 and is dragged up by a handful of 250k+ whales, so the
--   median is the honest answer to "whatever the other horses have". It covers
--   four buy-ins at the club's largest table (max_buy_in 5,000), which is what
--   "so they can play all the games" requires.
--
--   CHIPS ARE MOVED, NOT MINTED. The club treasury is debited by exactly the
--   sum credited and the migration aborts if those two numbers disagree. Every
--   grant is written to chip_transactions as horse_treasury_funding — the same
--   type the platform's other 24,967 horse fundings use — so the money has a
--   provenance row rather than appearing from nowhere.
--
--   CLUB JAQK IS DELIBERATELY EXCLUDED. It has three unfunded horses too, but
--   its treasury holds 540.26; funding them would drive it to -64,496.74.
--   Overdrawing a real treasury to fix a display is not a trade worth making.
--   That club needs a top-up first.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_club        uuid;
    v_amount      numeric := 21679;
    v_count       integer;
    v_total       numeric;
    v_before      numeric;
    v_after       numeric;
BEGIN
    -- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────
    SELECT id, chip_treasury INTO v_club, v_before FROM public.clubs WHERE club_id = 25450;
    IF v_club IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: Shark Club (25450) not found';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.club_members cm
      JOIN public.profiles p ON p.id = cm.user_id
     WHERE cm.club_id = v_club AND p.is_horse AND cm.chip_balance = 0 AND cm.agent_id IS NOT NULL;

    -- Idempotent: a second run finds nothing at zero and does nothing.
    IF v_count = 0 THEN
        RAISE NOTICE 'no unfunded horses; nothing to do';
        RETURN;
    END IF;

    v_total := v_count * v_amount;
    IF v_before < v_total THEN
        RAISE EXCEPTION 'pre-flight failed: treasury % cannot cover % for % horses',
              v_before, v_total, v_count;
    END IF;

    -- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────
    -- Ledger first, so every credit has a row explaining where it came from.
    INSERT INTO public.chip_transactions
        (club_id, from_user_id, to_user_id, amount, transaction_type, notes, balance_after)
    SELECT v_club, NULL, cm.user_id, v_amount, 'horse_treasury_funding',
           'Opening bankroll — horse was assigned with a zero balance (median club horse balance)',
           v_amount
      FROM public.club_members cm
      JOIN public.profiles p ON p.id = cm.user_id
     WHERE cm.club_id = v_club AND p.is_horse AND cm.chip_balance = 0 AND cm.agent_id IS NOT NULL;

    UPDATE public.club_members cm
       SET chip_balance = v_amount
      FROM public.profiles p
     WHERE p.id = cm.user_id
       AND cm.club_id = v_club AND p.is_horse AND cm.chip_balance = 0 AND cm.agent_id IS NOT NULL;

    UPDATE public.clubs SET chip_treasury = chip_treasury - v_total WHERE id = v_club;

    -- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────
    SELECT chip_treasury INTO v_after FROM public.clubs WHERE id = v_club;

    IF v_after < 0 THEN
        RAISE EXCEPTION 'post-apply failed: treasury went negative (%)', v_after;
    END IF;
    IF (v_before - v_after) <> v_total THEN
        RAISE EXCEPTION 'post-apply failed: conservation broken — treasury moved % but % was credited',
              (v_before - v_after), v_total;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.club_members cm
          JOIN public.profiles p ON p.id = cm.user_id
         WHERE cm.club_id = v_club AND p.is_horse AND cm.chip_balance = 0 AND cm.agent_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'post-apply failed: an assigned horse still holds a zero balance';
    END IF;

    RAISE NOTICE 'funded % horses with % each (total %); treasury % -> %',
          v_count, v_amount, v_total, v_before, v_after;
END $$;

-- Applied to production 2026-08-21: 8 horses funded, 173,432 total,
-- Shark Club treasury 963,785.99 -> 790,353.99.

-- ─── ROLLBACK ─────────────────────────────────────────────────────────
-- Reverses the grant and returns the chips to the treasury. Only safe while
-- the horses have not yet played — two of the eight were down to 21,677 within
-- minutes, so a later rollback would claw back chips they had already won or
-- lost. Reconcile against chip_transactions before running it.
--
--   WITH granted AS (
--     SELECT ct.to_user_id, ct.club_id, ct.amount
--       FROM chip_transactions ct
--      WHERE ct.transaction_type = 'horse_treasury_funding'
--        AND ct.notes LIKE 'Opening bankroll%'
--   )
--   UPDATE club_members cm SET chip_balance = 0
--     FROM granted g WHERE cm.user_id = g.to_user_id AND cm.club_id = g.club_id;
--   UPDATE clubs SET chip_treasury = chip_treasury + 173432 WHERE club_id = 25450;
--   DELETE FROM chip_transactions
--    WHERE transaction_type = 'horse_treasury_funding' AND notes LIKE 'Opening bankroll%';
