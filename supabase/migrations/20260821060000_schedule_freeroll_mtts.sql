-- ═══════════════════════════════════════════════════════════════════════
-- 20260821060000_schedule_freeroll_mtts.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER 2. AUTHOR: Cowork (Claude). IRREVERSIBLE: no (ROLLBACK at bottom).
--
-- WHY: the 5-minute MTT ticker shipped on 2026-08-20 and had never been seen,
-- because the platform holds 7,306 spins and 2,809 heads-up games and ZERO
-- MTTs in a pre-start state. The bar was correct; there was nothing true for
-- it to say.
--
-- SAFETY: these are FREEROLLS. buy_in_amount 0, buy_in_fee 0,
-- guaranteed_prize 0, prize_pool 0. No player pays anything and no treasury
-- funds a prize, so scheduling them moves no money at all.
--
-- Cloned from a known-good MTT rather than hand-built, so every column the
-- engine needs (blind_structure, payout_structure, starting_chips, late
-- registration) is exactly what a working tournament carries. Idempotent: it
-- will not create a second copy of an event that is still pre-start.
--
-- A REAL recurring schedule — which events, what guarantees, funded from
-- where, at what cadence — is a product and economic decision and is
-- deliberately NOT made here. This is the minimum that makes the feature
-- observable.
--
-- Applied to production 2026-08-21: three events created in Midway Union,
-- 12 / 45 / 90 minutes out.
-- ═══════════════════════════════════════════════════════════════════════

WITH template AS (
    SELECT * FROM public.tournaments
     WHERE tournament_type = 'MTT' AND blind_structure IS NOT NULL AND payout_structure IS NOT NULL
     ORDER BY created_at DESC LIMIT 1
), spec(label, offset_min) AS (
    VALUES ('Late Night Freeroll (NLH)', 12),
           ('Night Owl Freeroll (NLH)', 45),
           ('Last Call Freeroll (NLH)', 90)
)
INSERT INTO public.tournaments (
    name, description, game_type, variant, buy_in_amount, buy_in_fee, guaranteed_prize,
    start_time, status, current_players, max_players, late_reg_mins, starting_chips,
    blind_structure, payout_structure, club_id, min_players, tournament_type, prize_pool,
    is_rebuy, add_on_available, is_bounty, is_pko, is_turbo, created_at, updated_at
)
SELECT spec.label, 'Freeroll. No buy-in, no fee.',
       t.game_type, t.variant, 0, 0, 0,
       now() + (spec.offset_min || ' minutes')::interval,
       'REGISTERING', 0, t.max_players, t.late_reg_mins, t.starting_chips,
       t.blind_structure, t.payout_structure, t.club_id,
       t.min_players, 'MTT', 0,
       false, false, false, false, false, now(), now()
FROM template t, spec
WHERE NOT EXISTS (
    SELECT 1 FROM public.tournaments x
     WHERE x.name = spec.label AND x.status IN ('ANNOUNCED','REGISTERING')
);

DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n FROM public.tournaments
     WHERE tournament_type='MTT' AND status IN ('ANNOUNCED','REGISTERING') AND start_time > now();
    IF n = 0 THEN
        RAISE EXCEPTION 'post-apply failed: still no upcoming MTT for the ticker to announce';
    END IF;
END $$;

-- ROLLBACK:
--   DELETE FROM public.tournaments
--    WHERE name IN ('Late Night Freeroll (NLH)','Night Owl Freeroll (NLH)','Last Call Freeroll (NLH)')
--      AND status IN ('ANNOUNCED','REGISTERING') AND current_players = 0;
