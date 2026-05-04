CREATE OR REPLACE FUNCTION public.deduct_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT ''::text,
  p_transaction_type text DEFAULT 'game_cost'::text,
  p_source text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current integer;
  v_new_balance integer;
  v_effective_type text;
BEGIN
  -- MUST USE FOR UPDATE TO PREVENT CONCURRENT DOUBLE SPEND RACE CONDITION
  SELECT COALESCE(diamonds, 0) INTO v_current
    FROM profiles WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current);
  END IF;

  v_effective_type := COALESCE(p_source, p_transaction_type);

  -- Atomic deduction
  UPDATE profiles
    SET diamonds = diamonds - p_amount,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;

  -- Log transaction (FIX: provide both type and transaction_type)
  INSERT INTO diamond_transactions (user_id, amount, transaction_type, type, description, balance_after, metadata, created_at)
  VALUES (p_user_id, -p_amount, v_effective_type, v_effective_type, p_description, v_new_balance, p_metadata, now())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'charged', p_amount);
END;
$function$;
