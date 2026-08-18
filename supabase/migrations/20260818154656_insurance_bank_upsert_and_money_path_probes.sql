-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (version 20260818154656, name insurance_bank_upsert_and_money_path_probes)
-- Mirror of the applied migration. Do not re-run against production.
-- Engine consumer: CA f58a882cc (insurance contract pricing + horse liveness).
-- ═══════════════════════════════════════════════════════════════════════════
-- INSURANCE BANK HARDENING + first-ever money-path proof (2026-08-18)
--
-- insurance_transactions has ZERO rows in the platform's history (no table
-- has insurance enabled yet), so record_insurance_transaction had never
-- executed in production. Deep-dive findings, one found by the probes below:
--
-- 1. The club-bank branch was `UPDATE club_wallets ... WHERE club_id = X`:
--    a club WITHOUT a wallet row would move table-stack chips with the
--    bank side silently unrecorded.
-- 2. PROBE-CAUGHT: club_wallets.chip_balance has a CHECK >= 0, but an
--    insurance bank is an underwriting account that MUST go negative when
--    a payout exceeds collected premiums - the very first big payout from
--    a low-balance club would have ERRORED at settlement (stack already
--    credited, bank never debited, alert-and-under-collect). The union
--    branch never had this problem: union_wallets.insurance_wallet has no
--    such check. Club insurance banking now gets its own signed account,
--    club_wallets.insurance_balance, mirroring the union semantics and
--    keeping chip_balance's solvency guard intact for its other uses.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.club_wallets
  ADD COLUMN IF NOT EXISTS insurance_balance numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.club_wallets.insurance_balance IS
  'Signed insurance underwriting balance (premiums in, payouts out). May be negative: the club absorbs insurance variance. Union clubs bank insurance in union_wallets.insurance_wallet instead.';

CREATE OR REPLACE FUNCTION public.record_insurance_transaction(
  p_table_id uuid, p_club_id uuid, p_hand_number integer, p_player_id uuid,
  p_equity_percent numeric, p_premium numeric, p_insured_amount numeric,
  p_payout numeric, p_player_won boolean)
RETURNS insurance_transactions
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
      INSERT INTO union_wallets (union_id, insurance_wallet)
      VALUES (v_bank_entity, v_bank_delta)
      ON CONFLICT (union_id) DO UPDATE
        SET insurance_wallet = COALESCE(union_wallets.insurance_wallet, 0) + v_bank_delta,
            updated_at = NOW();
    ELSE
      -- HARDENED 2026-08-18: upsert into the SIGNED insurance account -
      -- never chip_balance (whose >=0 check would abort the first payout
      -- that exceeds collected premiums), and never a bare UPDATE (a club
      -- without a wallet row must not lose the bank side).
      INSERT INTO club_wallets (club_id, insurance_balance)
      VALUES (v_bank_entity, v_bank_delta)
      ON CONFLICT (club_id) DO UPDATE
        SET insurance_balance = COALESCE(club_wallets.insurance_balance, 0) + v_bank_delta,
            updated_at = NOW();
    END IF;
  END IF;

  RETURN v_tx;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_insurance_transaction(uuid,uuid,integer,uuid,numeric,numeric,numeric,numeric,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_insurance_transaction(uuid,uuid,integer,uuid,numeric,numeric,numeric,numeric,boolean) TO service_role;

-- ── Probes: run the real money paths, then roll every write back ───────────
-- (verbatim from the applied migration; probes create a synthetic club +
-- table, exercise winner/replay/loser/push paths, assert wallet deltas, and
-- abort the subtransaction so no probe state survives)
DO $probe$
DECLARE
  v_user uuid;
  v_club uuid;
  v_table uuid;
  v_after numeric;
  v_chip numeric;
  v_tx insurance_transactions;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL THEN RAISE NOTICE 'no users; skipping probes'; RETURN; END IF;

  BEGIN  -- aborted subtransaction: everything inside rolls back
    INSERT INTO clubs (id, name, owner_id)
    VALUES (gen_random_uuid(), ':ins_probe_club:', v_user)
    RETURNING id INTO v_club;
    INSERT INTO tables (name, club_id) VALUES (':ins_probe_table:', v_club)
    RETURNING id INTO v_table;
    DELETE FROM club_wallets WHERE club_id = v_club; -- force the no-wallet-row case

    -- 1. WINNER path: premium 12 collected, no payout -> insurance bank +12.
    v_tx := record_insurance_transaction(v_table, v_club, 1, v_user, 84.1, 12, 100, 0, false);
    IF v_tx.id IS NULL THEN RAISE EXCEPTION 'probe1: no tx row'; END IF;
    SELECT insurance_balance, chip_balance INTO v_after, v_chip FROM club_wallets WHERE club_id = v_club;
    IF v_after IS DISTINCT FROM 12 THEN
      RAISE EXCEPTION 'probe1: insurance bank upsert failed: %', v_after;
    END IF;

    -- 2. IDEMPOTENT replay: same (table, hand, player) -> wallet moved once.
    v_tx := record_insurance_transaction(v_table, v_club, 1, v_user, 84.1, 12, 100, 0, false);
    SELECT insurance_balance INTO v_after FROM club_wallets WHERE club_id = v_club;
    IF v_after IS DISTINCT FROM 12 THEN
      RAISE EXCEPTION 'probe2: replay moved the wallet twice: %', v_after;
    END IF;

    -- 3. LOSER path: premium 12, payout 100 -> bank -88 on top of +12 = -76.
    --    THE CASE THE OLD FUNCTION COULD NOT EXECUTE (chip_balance CHECK >= 0).
    v_tx := record_insurance_transaction(v_table, v_club, 2, v_user, 84.1, 12, 100, 100, true);
    SELECT insurance_balance, chip_balance INTO v_after, v_chip FROM club_wallets WHERE club_id = v_club;
    IF v_after IS DISTINCT FROM -76 THEN
      RAISE EXCEPTION 'probe3: expected -76, got %', v_after;
    END IF;
    IF COALESCE(v_chip, 0) <> 0 THEN
      RAISE EXCEPTION 'probe3: chip_balance must be untouched, got %', v_chip;
    END IF;

    -- 4. PUSH path: premium 0, payout 0 -> ledger row, bank untouched.
    v_tx := record_insurance_transaction(v_table, v_club, 3, v_user, 50, 0, 100, 0, false);
    IF v_tx.id IS NULL THEN RAISE EXCEPTION 'probe4: push must still write the ledger row'; END IF;
    SELECT insurance_balance INTO v_after FROM club_wallets WHERE club_id = v_club;
    IF v_after IS DISTINCT FROM -76 THEN
      RAISE EXCEPTION 'probe4: push moved the wallet: %', v_after;
    END IF;

    RAISE EXCEPTION 'PROBE-ROLLBACK';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'PROBE-ROLLBACK' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM clubs WHERE name = ':ins_probe_club:') THEN
    RAISE EXCEPTION 'probe cleanup failed: synthetic club survived';
  END IF;

  RAISE NOTICE 'insurance money-path probes passed: signed bank, upsert, idempotent replay, payout beyond premiums, push';
END
$probe$;
