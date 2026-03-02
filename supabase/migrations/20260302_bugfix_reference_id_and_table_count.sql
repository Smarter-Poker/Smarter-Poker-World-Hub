-- ============================================================================
-- Migration: Bug fixes from Phase 8 audit
-- Date: 2026-03-02
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add reference_id column to diamond_transactions
--    
--    VIP diamond stipend uses .eq('reference_id', stipendRefId) to check
--    for duplicate credits. Without this column, the idempotency check
--    silently fails and stipends can be double-credited on cron retries.
--
--    The add_diamonds_to_balance RPC already passes p_reference_id but
--    stores it in metadata JSONB. This adds a proper indexed column.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE diamond_transactions 
  ADD COLUMN IF NOT EXISTS reference_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diamond_transactions_reference_id 
  ON diamond_transactions(reference_id) 
  WHERE reference_id IS NOT NULL;

-- Update the add_diamonds_to_balance RPC to write reference_id to the column
CREATE OR REPLACE FUNCTION add_diamonds_to_balance(
    p_user_id UUID,
    p_amount INTEGER,
    p_type TEXT DEFAULT 'bonus',
    p_description TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_balance INTEGER;
    v_new_balance INTEGER;
    v_txn_id UUID;
BEGIN
    -- Check for duplicate via reference_id (idempotency)
    IF p_reference_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM diamond_transactions 
            WHERE reference_id = p_reference_id
        ) THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Duplicate reference_id: ' || p_reference_id,
                'duplicate', true
            );
        END IF;
    END IF;

    -- Get current balance with row lock
    SELECT COALESCE(diamond_balance, 0) INTO v_old_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    v_new_balance := v_old_balance + p_amount;

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
    END IF;

    -- Update balance
    UPDATE profiles SET diamond_balance = v_new_balance WHERE id = p_user_id;

    -- Record transaction with reference_id in both column and metadata
    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, description, 
        balance_after, reference_id, metadata
    ) VALUES (
        p_user_id, p_amount, p_type, p_description,
        v_new_balance, p_reference_id,
        CASE WHEN p_reference_id IS NOT NULL 
            THEN jsonb_build_object('reference_id', p_reference_id)
            ELSE '{}'::jsonb
        END
    ) RETURNING id INTO v_txn_id;

    RETURN jsonb_build_object(
        'success', true,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'transaction_id', v_txn_id
    );
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Create decrement_club_table_count RPC
--
--    manage-table.js calls this on table deletion but the RPC was never
--    created. Currently falls back to a non-atomic read-then-write.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decrement_club_table_count(p_club_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE clubs 
    SET table_count = GREATEST(0, COALESCE(table_count, 0) - 1)
    WHERE id = p_club_id;
END;
$$;
