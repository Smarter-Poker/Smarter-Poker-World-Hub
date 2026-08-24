-- ═══════════════════════════════════════════════════════════════════════
-- 20260824_club_money_panel_returns_union_spin_treasury.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (Cowork)
-- AFFECTS:      fn_club_money_panel (adds 3 keys to the union-staff branch)
-- IRREVERSIBLE: no
--
-- WHY:
--   Dan 2026-08-24: "the wallet is still missing the spins treasury."
--
--   A spin_treasury block was added to /api/club-arena/union-wallet on
--   2026-08-23 — but Club Arena's wallet panel does not read that endpoint.
--   It reads THIS function, and this function never returned the figure, so
--   the union's Spin capital stayed invisible in the surface that matters.
--
--   The capital is real and it is not small. union_wallets.spin_reserve_wallet
--   holds the UNDEPLOYED remainder; every chip actually seeded into a Spin
--   pool lives in spin_bonus_pools.balance. Reporting only the column shows
--   0.00 while 25,862.68 sits in the live pool, because the 20,000 seed was
--   debited straight out of promo_wallet into the pool row and never sat in
--   the column at all.
--
-- HOW:
--   Return union_spin_treasury (the sum), union_spin_idle and
--   union_spin_deployed, inside the EXISTING union-staff branch so the
--   authorisation rules are untouched. Pools are matched on the union id
--   itself (owner_kind 'union' keys the pool by union id) and on every club
--   in the union, because both shapes exist.
--
--   Nothing else in the function changed; the body is reproduced whole
--   because CREATE OR REPLACE takes no patch.
-- ═══════════════════════════════════════════════════════════════════════
--
-- The applied statement is recorded in Supabase migration history as
-- `club_money_panel_returns_union_spin_treasury`. It is reproduced here so the
-- repo carries the reason, the pre-flight and the post-apply assertion:
--
--   pre-flight  : fn_club_money_panel exists AND does not already mention
--                 union_spin_treasury (so a re-run cannot silently no-op)
--   post-apply  : union_spin_treasury present in the new function body
--
-- Verified against production at apply time: idle 0.00, deployed 25,862.68.
--
-- Full statement: see Supabase migration history, or re-derive by adding the
-- v_spin_idle / v_spin_deployed block below to the union-staff branch:
--
--   v_spin_idle := COALESCE(v_w.spin_reserve_wallet, 0);
--   SELECT COALESCE(SUM(COALESCE(sp.balance, 0)), 0) INTO v_spin_deployed
--     FROM spin_bonus_pools sp
--    WHERE sp.is_active
--      AND (sp.club_id = v_union_id
--           OR sp.club_id IN (SELECT uc.club_id FROM union_clubs uc
--                              WHERE uc.union_id = v_union_id));
--
--   ... || jsonb_build_object(
--     'union_spin_treasury', round(v_spin_idle + v_spin_deployed, 2),
--     'union_spin_idle',     round(v_spin_idle, 2),
--     'union_spin_deployed', round(v_spin_deployed, 2))
--
-- and widening the union_wallets SELECT to carry spin_reserve_wallet.

-- Idempotent verification: fails loudly if production ever loses the keys.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='fn_club_money_panel'
           AND p.prosrc LIKE '%union_spin_treasury%'
    ) THEN
        RAISE EXCEPTION
          'fn_club_money_panel does not report union_spin_treasury — the Spins Treasury row will read 0.00. Re-apply the club_money_panel_returns_union_spin_treasury migration.';
    END IF;
    RAISE NOTICE 'OK: fn_club_money_panel reports the union spin treasury';
END $$;
