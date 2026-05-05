-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Add idempotency (p_reference_id) to deduct_diamonds RPC
-- ══════════════════════════════════════════════════════════════════════════
-- BUG FOUND (Pass 5 adversarial audit):
--   deduct_diamonds had an `ON CONFLICT DO NOTHING` on the INSERT into
--   diamond_transactions, but diamond_transactions has no unique constraint
--   that would ever trigger a conflict. The clause was therefore a no-op.
--
--   This meant that if a network timeout caused the client or edge runtime
--   to retry the deduct_diamonds RPC, the sender's balance was charged
--   TWICE — both debits committed, the second one silently, with no
--   indication to the caller that a duplicate had occurred.
--
-- FIX:
--   1. Add p_reference_id text DEFAULT NULL to deduct_diamonds signature.
--   2. Before deducting, check diamond_transactions for an existing row
--      with that reference_id — same pattern already used by
--      add_diamonds_to_balance.
--   3. If duplicate detected: return success:true with current balance
--      (idempotent replay — safe to call multiple times).
--   4. Replace meaningless ON CONFLICT DO NOTHING with an explicit
--      INSERT that stores the reference_id.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop old signature first (it had no p_reference_id)
DROP FUNCTION IF EXISTS public.deduct_diamonds(uuid, integer, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.deduct_diamonds(
  p_user_id        uuid,
  p_amount         integer,
  p_description    text    DEFAULT '',
  p_transaction_type text  DEFAULT 'game_cost',
  p_source         text    DEFAULT NULL,
  p_metadata       jsonb   DEFAULT '{}',
  p_reference_id   text    DEFAULT NULL
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
  -- If caller supplies a reference_id and a deduct with that id already
  -- committed, return success immediately — do not charge again.
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
GRANT EXECUTE ON FUNCTION public.deduct_diamonds(uuid, integer, text, text, text, jsonb, text)
  TO authenticated, service_role;

COMMIT;
