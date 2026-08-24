-- ═══════════════════════════════════════════════════════════════════════
-- 20260824_union_bbj_backup_and_promo_transfers.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER: 3 | AUTHOR: Claude (Cowork) | IRREVERSIBLE: yes (moves money)
--
-- WHY:
--   Dan 2026-08-24: "back up BBJ needs to be clickable, and funds are allowed
--   to be moved to the promo fund or to the main BBJ if the owner chooses to",
--   and "the promo wallet needs to be clickable and have funds sent from it."
--
--   Neither move existed. The only route from backup to main was
--   fn_bbj_reseed_main_from_backup, which moves the ENTIRE backup balance and
--   only when main is fully drained — a reseed, not a transfer. There was no
--   path at all from backup to the promo wallet, and no partial anything.
--
-- HOW:
--   Two atomic, idempotent RPCs in fn_union_fund_bbj_pool's shape: op_id lands
--   on union_wallet_transactions.period_id, whose unique index turns a retry
--   into a 'duplicate' answer instead of a second transfer. (That index had to
--   be widened first — see
--   20260824_union_wallet_tx_op_idempotency_covers_every_tx_type. Until then
--   these two had no idempotency at all, which a probe caught.)
--
--   Every debit is FOR UPDATE + explicit balance check before the write, so a
--   concurrent transfer cannot overdraw a bank. Amounts round to 2dp on the
--   way in: a bank holding sub-cent dust is a bank that never reconciles.
--
--   service_role only. The API verifies union lead before calling; granting
--   these to `authenticated` would put a jackpot transfer one fetch() away
--   from any signed-in browser.
--
--   NOTE the ledger row for backup->main uses wallet 'bbj_wallet'. The
--   union_wallet_transactions CHECK allows six wallet names and 'bbj_pool' is
--   not one of them — the same mistake is live in union-wallet.js's
--   process_bbj_payout, which is why that table holds zero rows with tx_type
--   'bbj_payout'.
--
-- VERIFIED against production, then reversed to the cent:
--   backup->main 1.00 ok; same op_id replayed -> duplicate, refused
--   backup->promo 1.00 ok; promo->bbj_main 1.00 ok
--   overdraw 99,999,999 -> refused, 'insufficient backup balance'
--   promo->club for a club outside the union -> refused, 'club is not in this union'
--   balances restored exactly: main 11,121.01 backup 11,709.02 promo 22,634.53
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_union_bbj_backup_transfer(
  p_union_id uuid, p_amount numeric, p_destination text,
  p_op_id uuid, p_created_by uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_amt numeric := round(COALESCE(p_amount, 0), 2);
  v_pool_id uuid; v_backup numeric; v_main numeric; v_promo_after numeric;
BEGIN
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount must be > 0');
  END IF;
  IF p_destination NOT IN ('main', 'promo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'destination must be main or promo');
  END IF;
  IF p_op_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'op_id_required');
  END IF;

  SELECT id, COALESCE(backup_balance,0), COALESCE(main_balance,0)
    INTO v_pool_id, v_backup, v_main
    FROM bbj_pools WHERE union_id = p_union_id AND status = 'active' FOR UPDATE;

  IF v_pool_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no active BBJ pool for this union');
  END IF;
  IF v_backup < v_amt THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient backup balance',
                              'available', v_backup, 'requested', v_amt);
  END IF;

  IF p_destination = 'main' THEN
    UPDATE bbj_pools
       SET backup_balance = COALESCE(backup_balance,0) - v_amt,
           main_balance   = COALESCE(main_balance,0)   + v_amt,
           updated_at     = now()
     WHERE id = v_pool_id;

    INSERT INTO union_wallet_transactions
      (union_id, wallet, direction, amount, balance_after, tx_type, period_id, notes, created_by)
    VALUES
      (p_union_id, 'bbj_wallet', 'debit', v_amt, v_main + v_amt, 'bbj_backup_to_main', p_op_id,
       COALESCE(NULLIF(p_notes, ''), 'BBJ backup -> main jackpot'), p_created_by);

    RETURN jsonb_build_object('success', true, 'destination', 'main', 'amount', v_amt,
                              'pool_id', v_pool_id, 'backup_after', v_backup - v_amt,
                              'main_after', v_main + v_amt);
  END IF;

  UPDATE bbj_pools SET backup_balance = COALESCE(backup_balance,0) - v_amt, updated_at = now()
   WHERE id = v_pool_id;

  INSERT INTO union_wallets (union_id, promo_wallet) VALUES (p_union_id, v_amt)
  ON CONFLICT (union_id) DO UPDATE
    SET promo_wallet = COALESCE(union_wallets.promo_wallet, 0) + EXCLUDED.promo_wallet,
        updated_at = now()
  RETURNING promo_wallet INTO v_promo_after;

  IF v_promo_after IS NULL THEN
    RAISE EXCEPTION 'promo wallet credit failed for union %', p_union_id;
  END IF;

  INSERT INTO union_wallet_transactions
    (union_id, wallet, direction, amount, balance_after, tx_type, period_id, notes, created_by)
  VALUES
    (p_union_id, 'promo_wallet', 'credit', v_amt, v_promo_after, 'bbj_backup_to_promo', p_op_id,
     COALESCE(NULLIF(p_notes, ''), 'BBJ backup -> promo wallet'), p_created_by);

  RETURN jsonb_build_object('success', true, 'destination', 'promo', 'amount', v_amt,
                            'pool_id', v_pool_id, 'backup_after', v_backup - v_amt,
                            'promo_after', v_promo_after);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'duplicate', true,
                            'error', 'operation already processed');
END;
$fn$ SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.fn_union_promo_send(
  p_union_id uuid, p_amount numeric, p_destination text, p_club_id uuid,
  p_op_id uuid, p_created_by uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_amt numeric := round(COALESCE(p_amount, 0), 2);
  v_promo numeric; v_after numeric; v_club_after numeric; v_pool_id uuid;
BEGIN
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount must be > 0');
  END IF;
  IF p_destination NOT IN ('club', 'bbj_main') THEN
    RETURN jsonb_build_object('success', false, 'error', 'destination must be club or bbj_main');
  END IF;
  IF p_op_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'op_id_required');
  END IF;

  SELECT COALESCE(promo_wallet, 0) INTO v_promo
    FROM union_wallets WHERE union_id = p_union_id FOR UPDATE;
  IF v_promo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'union wallet not found');
  END IF;
  IF v_promo < v_amt THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient promo balance',
                              'available', v_promo, 'requested', v_amt);
  END IF;

  IF p_destination = 'club' THEN
    IF p_club_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'club_id required');
    END IF;
    -- A union may only fund ITS OWN clubs. Without this a promo transfer is a
    -- chip mint into any club in the database.
    IF NOT EXISTS (SELECT 1 FROM union_clubs uc
                    WHERE uc.union_id = p_union_id AND uc.club_id = p_club_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'club is not in this union');
    END IF;

    UPDATE union_wallets SET promo_wallet = promo_wallet - v_amt, updated_at = now()
     WHERE union_id = p_union_id RETURNING promo_wallet INTO v_after;
    UPDATE clubs SET chip_treasury = COALESCE(chip_treasury, 0) + v_amt, updated_at = now()
     WHERE id = p_club_id RETURNING chip_treasury INTO v_club_after;

    INSERT INTO union_wallet_transactions
      (union_id, club_id, wallet, direction, amount, balance_after, tx_type, period_id, notes, created_by)
    VALUES
      (p_union_id, p_club_id, 'promo_wallet', 'debit', v_amt, v_after, 'promo_to_club', p_op_id,
       COALESCE(NULLIF(p_notes, ''), 'Promo wallet -> club treasury'), p_created_by);

    RETURN jsonb_build_object('success', true, 'destination', 'club', 'amount', v_amt,
                              'promo_after', v_after, 'club_treasury_after', v_club_after);
  END IF;

  UPDATE union_wallets SET promo_wallet = promo_wallet - v_amt, updated_at = now()
   WHERE union_id = p_union_id RETURNING promo_wallet INTO v_after;

  UPDATE bbj_pools
     SET main_balance = COALESCE(main_balance,0) + v_amt,
         pool_amount  = COALESCE(pool_amount,0)  + v_amt,
         updated_at   = now()
   WHERE union_id = p_union_id AND status = 'active'
   RETURNING id INTO v_pool_id;
  IF v_pool_id IS NULL THEN
    RAISE EXCEPTION 'no active BBJ pool for union %', p_union_id;
  END IF;

  INSERT INTO union_wallet_transactions
    (union_id, wallet, direction, amount, balance_after, tx_type, period_id, notes, created_by)
  VALUES
    (p_union_id, 'promo_wallet', 'debit', v_amt, v_after, 'promo_to_bbj_main', p_op_id,
     COALESCE(NULLIF(p_notes, ''), 'Promo wallet -> main jackpot'), p_created_by);

  RETURN jsonb_build_object('success', true, 'destination', 'bbj_main', 'amount', v_amt,
                            'promo_after', v_after, 'pool_id', v_pool_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'duplicate', true,
                            'error', 'operation already processed');
END;
$fn$ SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.fn_union_bbj_backup_transfer(uuid,numeric,text,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_union_bbj_backup_transfer(uuid,numeric,text,uuid,uuid,text)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_union_promo_send(uuid,numeric,text,uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_union_promo_send(uuid,numeric,text,uuid,uuid,uuid,text)
  TO service_role;

DO $$
BEGIN
    IF has_function_privilege('authenticated','public.fn_union_bbj_backup_transfer(uuid,numeric,text,uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.fn_union_bbj_backup_transfer(uuid,numeric,text,uuid,uuid,text)','EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: backup transfer reachable from a browser';
    END IF;
    IF has_function_privilege('authenticated','public.fn_union_promo_send(uuid,numeric,text,uuid,uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.fn_union_promo_send(uuid,numeric,text,uuid,uuid,uuid,text)','EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: promo send reachable from a browser';
    END IF;
    RAISE NOTICE 'post-apply OK: both transfer RPCs are service_role only';
END $$;

COMMIT;
