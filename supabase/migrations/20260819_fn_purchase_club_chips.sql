-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_fn_purchase_club_chips.sql
-- Applied to production 2026-08-19 via Supabase MCP as `fn_purchase_club_chips`.
--
-- WHY: fn_purchase_chips credits the GLOBAL PLAYER wallet
-- (credit_player_wallet -> wallets.balance WHERE wallet_type='PLAYER').
-- The Club Arena shop, buy-ins and cashier all spend club_members.chip_balance
-- (fn_debit_chips takes p_club_id). So the marketplace "Get Chips" tab charged
-- diamonds and the store still said "insufficient chips" -- verified live on
-- the test account: 10 diamonds charged, club balance unchanged at 1000.
--
-- This is the club-scoped sibling: deduct diamonds and credit
-- club_members.chip_balance in ONE transaction, so a failed credit rolls back
-- the diamond charge. Membership is required (no accidental club joins).
-- A replayed reference_id returns idempotent without double-crediting.
--
-- Called ONLY by /api/club-arena/purchase-chips (service_role); EXECUTE is
-- revoked from anon/authenticated per the money-RPC lockdown, asserted below.
--
-- Rollback: DROP FUNCTION public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text);
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_purchase_club_chips(
  p_user_id       uuid,
  p_club_id       uuid,
  p_amount        numeric,
  p_diamonds_cost integer DEFAULT 0,
  p_reference_id  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_debit    jsonb;
  v_credit   jsonb;
  v_is_member boolean;
BEGIN
  IF p_user_id IS NULL OR p_club_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user and club required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'chip amount must be > 0');
  END IF;
  IF p_diamonds_cost IS NULL OR p_diamonds_cost < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid diamond cost');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM club_members WHERE club_id = p_club_id AND user_id = p_user_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member of this club');
  END IF;

  IF p_diamonds_cost > 0 THEN
    v_debit := deduct_diamonds(
      p_user_id, p_diamonds_cost, 'Club chip package purchase',
      'purchase', 'chip_purchase', jsonb_build_object('club_id', p_club_id),
      p_reference_id, 0
    );

    IF COALESCE((v_debit->>'success')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', COALESCE(v_debit->>'error', 'diamond debit failed'),
        'balance', v_debit->'balance'
      );
    END IF;

    IF COALESCE((v_debit->>'idempotent')::boolean, false) IS TRUE THEN
      RETURN jsonb_build_object(
        'success', true, 'chips_credited', 0, 'diamonds_charged', 0,
        'diamond_balance_after', v_debit->'balance',
        'club_id', p_club_id, 'idempotent', true
      );
    END IF;
  END IF;

  v_credit := fn_credit_chips(
    p_club_id, p_user_id, p_amount, 'Chip package purchase',
    jsonb_build_object('transaction_type', 'chip_purchase', 'diamonds_charged', p_diamonds_cost)
  );

  IF COALESCE((v_credit->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'club chip credit failed: %', COALESCE(v_credit->>'error', 'unknown');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'chips_credited', p_amount,
    'diamonds_charged', p_diamonds_cost,
    'diamond_balance_after', v_debit->'balance',
    'club_id', p_club_id,
    'club_balance_after', v_credit->'balance_after',
    'idempotent', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated',
       'public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_purchase_club_chips must NOT be executable by authenticated';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_purchase_club_chips must be executable by service_role';
  END IF;
END $$;
