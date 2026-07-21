-- Atomic BBJ promo-pool payout. The old BBJService flow deducted the whole amount
-- from the pool (bbj_promo_payout) THEN credited recipients one-by-one in a JS
-- loop (add_to_promo_wallet) — a partial loop failure stranded chips (deducted,
-- never distributed). This SECURITY DEFINER RPC does the pool deduction, the
-- integer-cents split (remainder to the first recipient), every recipient credit,
-- and the audit rows in ONE transaction; any failure rolls the whole thing back.
CREATE OR REPLACE FUNCTION public.fn_bbj_promo_payout_atomic(
  p_pool_id uuid, p_amount numeric, p_recipient_user_ids uuid[],
  p_reason text DEFAULT NULL, p_event_type text DEFAULT 'custom'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $function$
DECLARE
  v_pool record; v_count int; v_total_cents bigint; v_base_cents bigint;
  v_remainder_cents bigint; v_uid uuid; v_idx int := 0; v_amt numeric; v_new_bal numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success', true, 'skipped', 'zero_amount'); END IF;
  IF p_recipient_user_ids IS NULL OR array_length(p_recipient_user_ids,1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_recipients'); END IF;
  v_count := array_length(p_recipient_user_ids, 1);
  SELECT * INTO v_pool FROM bbj_pools WHERE id = p_pool_id FOR UPDATE;
  IF v_pool.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'pool_not_found'); END IF;
  IF COALESCE(v_pool.promo_balance,0) < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_promo_balance', 'available', v_pool.promo_balance, 'requested', p_amount); END IF;
  UPDATE bbj_pools SET promo_balance = promo_balance - p_amount, pool_amount = pool_amount - p_amount,
    total_paid_out = COALESCE(total_paid_out,0) + p_amount, updated_at = NOW() WHERE id = p_pool_id;
  v_total_cents := round(p_amount * 100); v_base_cents := v_total_cents / v_count;
  v_remainder_cents := v_total_cents - v_base_cents * v_count;
  FOREACH v_uid IN ARRAY p_recipient_user_ids LOOP
    v_amt := (v_base_cents + (CASE WHEN v_idx = 0 THEN v_remainder_cents ELSE 0 END))::numeric / 100;
    UPDATE wallets SET balance = balance + v_amt, updated_at = NOW() WHERE user_id = v_uid AND wallet_type = 'PROMO' RETURNING balance INTO v_new_bal;
    IF NOT FOUND THEN
      INSERT INTO wallets (user_id, wallet_type, balance, locked_balance, created_at, updated_at)
      VALUES (v_uid, 'PROMO', v_amt, 0, NOW(), NOW()) RETURNING balance INTO v_new_bal; END IF;
    INSERT INTO wallet_transactions (user_id, wallet_type, type, amount, category, description, balance_after)
    VALUES (v_uid, 'PROMO', 'credit', v_amt, 'promotion', 'BBJ promo pool payout', v_new_bal);
    v_idx := v_idx + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'amount', p_amount, 'recipient_count', v_count, 'event_type', p_event_type, 'reason', p_reason);
END; $function$;
