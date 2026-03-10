-- ORB-1 Escrow Phase 2: Domain Logic & Row Locking
-- Idempotency checking table and Row-Level Locking transaction RPC

CREATE TABLE IF NOT EXISTS public.orb1_idempotency_keys (
    idempotency_key UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.orb1_idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service Role Full Access" ON public.orb1_idempotency_keys
      FOR ALL USING (auth.role() = 'service_role');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- RPC for atomic buy-in with row-level locks and idempotency checking
CREATE OR REPLACE FUNCTION public.orb1_buyin_transaction(
    p_user_id UUID,
    p_club_id UUID,
    p_chip_amount BIGINT,
    p_diamond_cost BIGINT,
    p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile_diamonds BIGINT;
    v_member_chips BIGINT;
    v_tx_id UUID;
    v_idempotency_status TEXT;
    v_result JSONB;
BEGIN
    -- 1. Check Idempotency immediately
    SELECT status, response_body INTO v_idempotency_status, v_result
    FROM public.orb1_idempotency_keys
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_idempotency_status = 'completed' THEN
            -- Cache hit: Return exact prior success payload but wrapped in a success marker
            -- ensuring the client knows we successfully bypassed
            RETURN jsonb_build_object(
                'success', true, 
                'cached', true,
                'status', v_idempotency_status,
                'data', v_result
            );
        ELSE
            -- In progress or failed state
            RETURN jsonb_build_object(
                'success', true, 
                'cached', true,
                'status', v_idempotency_status,
                'data', v_result
            );
        END IF;
    END IF;

    -- 2. Insert Idempotency Key as 'processing'
    INSERT INTO public.orb1_idempotency_keys (idempotency_key, user_id, operation, status)
    VALUES (p_idempotency_key, p_user_id, 'buyin', 'processing');

    -- 3. LOCK Profile row (Prevent multiple requests reading stale balances)
    SELECT diamond_balance INTO v_profile_diamonds
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_profile_diamonds IS NULL THEN
        v_result := jsonb_build_object('success', false, 'error', 'Profile not found');
        UPDATE public.orb1_idempotency_keys SET status = 'failed', response_body = v_result WHERE idempotency_key = p_idempotency_key;
        RETURN v_result;
    END IF;

    IF v_profile_diamonds < p_diamond_cost THEN
        v_result := jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
        UPDATE public.orb1_idempotency_keys SET status = 'failed', response_body = v_result WHERE idempotency_key = p_idempotency_key;
        RETURN v_result;
    END IF;

    -- 4. LOCK Club Member row (Prevent concurrent chip updates)
    SELECT chip_balance INTO v_member_chips
    FROM public.club_members
    WHERE club_id = p_club_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_member_chips IS NULL THEN
        v_result := jsonb_build_object('success', false, 'error', 'Not a club member');
        UPDATE public.orb1_idempotency_keys SET status = 'failed', response_body = v_result WHERE idempotency_key = p_idempotency_key;
        RETURN v_result;
    END IF;

    -- 5. Execute Deductions and Additions
    UPDATE public.profiles
    SET diamond_balance = diamond_balance - p_diamond_cost
    WHERE id = p_user_id;

    UPDATE public.club_members
    SET chip_balance = chip_balance + p_chip_amount
    WHERE club_id = p_club_id AND user_id = p_user_id;

    -- 6. Insert transaction
    INSERT INTO public.chip_transactions (
        club_id, user_id, transaction_type, amount, balance_after, note
    ) VALUES (
        p_club_id, p_user_id, 'buyin', p_chip_amount, v_member_chips + p_chip_amount, 'Purchased chips with diamonds'
    ) RETURNING id INTO v_tx_id;

    v_result := jsonb_build_object(
        'success', true,
        'newBalance', v_member_chips + p_chip_amount,
        'transactionId', v_tx_id,
        'diamondsRemaining', v_profile_diamonds - p_diamond_cost,
        'cached', false
    );

    -- 7. Update Idempotency status
    UPDATE public.orb1_idempotency_keys 
    SET status = 'completed', response_body = v_result 
    WHERE idempotency_key = p_idempotency_key;

    RETURN v_result;
END;
$$;
