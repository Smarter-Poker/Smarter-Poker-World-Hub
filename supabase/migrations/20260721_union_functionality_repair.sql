-- ═══════════════════════════════════════════════════════════════════════════
-- UNION FUNCTIONALITY REPAIR — 2026-07-21
-- Audit: club-arena session union sweep (see WH .agent/audits 2026-07-21).
--
-- Live findings this migration fixes:
--  1. union_wallets had NO SELECT policy for humans — the SPA union dashboard
--     wallet tiles could never read balances (service-role only).
--  2. unions SELECT was owner/admin-only — the public /unions browse page
--     rendered empty for everyone else despite an is_public column.
--  3. BBJ payouts had no DB-level dedup — the in-memory idempotency cache is
--     per-serverless-instance, so the same jackpot could be paid twice.
--  4. No union-level bbj_pools row was ever created, so engine BBJ
--     contributions from union clubs hit "no pool found" and were skipped —
--     the shared union jackpot never accrued.
--  5. record_insurance_transaction credited the LEGACY unions.insurance_balance
--     column; the canonical wallet store is union_wallets.insurance_wallet
--     (all fn_union_* RPCs + the wallet API operate on union_wallets).
--     Live legacy balance is 0.00, so the repoint is clean.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-flight: abort if the legacy insurance balance is non-zero (would need
-- a data migration first).
DO $$
DECLARE v_legacy numeric;
BEGIN
  SELECT COALESCE(SUM(insurance_balance), 0) INTO v_legacy FROM public.unions;
  IF v_legacy <> 0 THEN
    RAISE EXCEPTION 'unions.insurance_balance holds % (expected 0) — migrate balances before repointing', v_legacy;
  END IF;
END $$;

-- 1. union_wallets: read access for the union's admins (writes stay service-only).
DROP POLICY IF EXISTS union_wallets_admin_read ON public.union_wallets;
CREATE POLICY union_wallets_admin_read ON public.union_wallets
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.union_admins ua
      WHERE ua.union_id = union_wallets.union_id
        AND ua.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.unions u
      WHERE u.id = union_wallets.union_id
        AND u.owner_id = (SELECT auth.uid())
    )
  );

-- 2. unions: public browse of public unions (the /unions directory page).
DROP POLICY IF EXISTS unions_public_browse ON public.unions;
CREATE POLICY unions_public_browse ON public.unions
  FOR SELECT TO authenticated USING (is_public IS NOT FALSE);

-- 3. BBJ payout dedup: one bbj_payout ledger row per (union, pool). The wallet
--    API inserts the claim row BEFORE moving money; a duplicate violates this
--    index and the payout is refused atomically.
CREATE UNIQUE INDEX IF NOT EXISTS uq_union_wallet_tx_bbj_payout
  ON public.union_wallet_transactions (union_id, tx_type, period_id)
  WHERE tx_type = 'bbj_payout' AND period_id IS NOT NULL;

-- 4. Seed a union-level BBJ pool for every union missing one, so engine
--    contributions from union clubs accrue to the shared jackpot.
INSERT INTO public.bbj_pools (union_id, status, pool_amount, main_balance, backup_balance, promo_balance)
SELECT u.id, 'active', 0, 0, 0, 0
FROM public.unions u
WHERE NOT EXISTS (
  SELECT 1 FROM public.bbj_pools bp WHERE bp.union_id = u.id
);

-- Also guarantee every union has its canonical wallet row.
INSERT INTO public.union_wallets (union_id)
SELECT u.id FROM public.unions u
WHERE NOT EXISTS (SELECT 1 FROM public.union_wallets w WHERE w.union_id = u.id)
ON CONFLICT (union_id) DO NOTHING;

-- 5. record_insurance_transaction: repoint the union bank to the canonical
--    union_wallets.insurance_wallet (legacy unions.insurance_balance retired).
CREATE OR REPLACE FUNCTION public.record_insurance_transaction(
  p_table_id uuid, p_club_id uuid, p_hand_number integer, p_player_id uuid,
  p_equity_percent numeric, p_premium numeric, p_insured_amount numeric,
  p_payout numeric, p_player_won boolean
) RETURNS insurance_transactions
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_union_id     uuid;
  v_bank_type    varchar(10);
  v_bank_entity  uuid;
  v_net_player   numeric;
  v_bank_delta   numeric;
  v_tx           insurance_transactions;
BEGIN
  SELECT union_id INTO v_union_id FROM clubs WHERE id = p_club_id;

  IF v_union_id IS NOT NULL THEN
    v_bank_type := 'union';
    v_bank_entity := v_union_id;
  ELSE
    v_bank_type := 'club';
    v_bank_entity := p_club_id;
  END IF;

  v_net_player := COALESCE(p_payout, 0) - COALESCE(p_premium, 0);
  v_bank_delta := COALESCE(p_premium, 0) - COALESCE(p_payout, 0);

  INSERT INTO insurance_transactions (
    table_id, club_id, union_id, hand_number,
    player_id, equity_percent, premium, insured_amount, payout,
    player_won, net_result, bank_type, bank_entity_id
  ) VALUES (
    p_table_id, p_club_id, v_union_id, p_hand_number,
    p_player_id, p_equity_percent, p_premium, p_insured_amount, p_payout,
    p_player_won, v_net_player, v_bank_type, v_bank_entity
  )
  ON CONFLICT (table_id, hand_number, player_id) DO NOTHING
  RETURNING * INTO v_tx;

  IF v_tx.id IS NULL THEN
    SELECT * INTO v_tx FROM insurance_transactions
     WHERE table_id = p_table_id AND hand_number = p_hand_number AND player_id = p_player_id
     LIMIT 1;
    RETURN v_tx;
  END IF;

  IF v_bank_delta <> 0 THEN
    IF v_bank_type = 'union' THEN
      -- 2026-07-21: canonical union wallet store (was legacy unions.insurance_balance)
      INSERT INTO union_wallets (union_id, insurance_wallet)
      VALUES (v_bank_entity, v_bank_delta)
      ON CONFLICT (union_id) DO UPDATE
        SET insurance_wallet = COALESCE(union_wallets.insurance_wallet, 0) + v_bank_delta,
            updated_at = NOW();
    ELSE
      UPDATE club_wallets
         SET chip_balance = COALESCE(chip_balance, 0) + v_bank_delta
       WHERE club_id = v_bank_entity;
    END IF;
  END IF;

  RETURN v_tx;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste-run only if this migration must be reverted)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS union_wallets_admin_read ON public.union_wallets;
-- DROP POLICY IF EXISTS unions_public_browse ON public.unions;
-- DROP INDEX IF EXISTS uq_union_wallet_tx_bbj_payout;
-- DELETE FROM public.bbj_pools WHERE union_id IS NOT NULL AND pool_amount = 0
--   AND main_balance = 0 AND backup_balance = 0 AND promo_balance = 0;
-- -- record_insurance_transaction: re-apply the previous definition from
-- -- pg_get_functiondef history (union branch UPDATE unions.insurance_balance).
