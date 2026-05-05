-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Add strict serialized cooldown to deduct_diamonds
-- ══════════════════════════════════════════════════════════════════════════
-- BUG FOUND: Concurrent parallel requests could bypass JS-level 
-- limit checks (like 30-day limits and 60-second cooldowns) because all 
-- parallel lambdas read the same un-updated ledger state before any 
-- of them hit the `deduct_diamonds` row lock.
--
-- FIX:
-- Add `p_cooldown_seconds` to the RPC. By checking for recent transactions
-- INSIDE the `FOR UPDATE` locked section, we strictly serialize execution.
-- If 20 parallel requests arrive, 1 succeeds, and the other 19 wait for the 
-- lock. Once they get the lock, they see the first request's commit and abort.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop old signature first
DROP FUNCTION IF EXISTS public.deduct_diamonds(uuid, integer, text, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.deduct_diamonds(
  p_user_id        uuid,
  p_amount         integer,
  p_description    text    DEFAULT '',
  p_transaction_type text  DEFAULT 'game_cost',
  p_source         text    DEFAULT NULL,
  p_metadata       jsonb   DEFAULT '{}',
  p_reference_id   text    DEFAULT NULL,
  p_cooldown_seconds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current     integer;
  v_new_balance integer;
  v_effective_type text;
BEGIN
  -- ── Idempotency check ──────────────────────────────────────────────────
  IF p_reference_id IS NOT NULL THEN
    SELECT balance_after INTO v_new_balance
      FROM diamond_transactions
     WHERE reference_id = p_reference_id
       AND user_id = p_user_id
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success',     true,
        'balance',     v_new_balance,
        'charged',     p_amount,
        'idempotent',  true
      );
    END IF;
  END IF;

  -- ── Row-level lock prevents concurrent double-spend ────────────────────
  SELECT COALESCE(diamonds, 0) INTO v_current
    FROM profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Insufficient diamonds',
      'balance', v_current
    );
  END IF;

  v_effective_type := COALESCE(p_source, p_transaction_type);

  -- ── Serialized Anti-Spam / Race Condition Guard ────────────────────────
  -- Runs inside the lock so parallel bypasses are mathematically impossible
  IF p_cooldown_seconds > 0 THEN
    IF EXISTS (
      SELECT 1 FROM diamond_transactions
       WHERE user_id = p_user_id
         AND transaction_type = v_effective_type
         AND created_at >= now() - make_interval(secs => p_cooldown_seconds)
    ) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Please wait before sending again',
        'cooldown_active', true
      );
    END IF;
  END IF;

  -- ── Atomic balance deduction ───────────────────────────────────────────
  UPDATE profiles
     SET diamonds   = diamonds - p_amount,
         updated_at = now()
   WHERE id = p_user_id
   RETURNING diamonds INTO v_new_balance;

  -- ── Ledger entry ───────────────────────────────────────────────────────
  INSERT INTO diamond_transactions
    (user_id, amount, transaction_type, description, balance_after, metadata, reference_id, created_at)
  VALUES
    (p_user_id, -p_amount, v_effective_type, p_description, v_new_balance, p_metadata, p_reference_id, now());

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'charged', p_amount);
END;
$$;

-- Re-grant execute to both roles
GRANT EXECUTE ON FUNCTION public.deduct_diamonds(uuid, integer, text, text, text, jsonb, text, integer)
  TO authenticated, service_role;

COMMIT;
