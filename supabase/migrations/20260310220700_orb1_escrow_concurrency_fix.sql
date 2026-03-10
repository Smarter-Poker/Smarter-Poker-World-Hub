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
    -- 1. Insert Idempotency Key
    -- Wrap in a block to catch unique_violation if another concurrent request inserts it
    BEGIN
        INSERT INTO public.orb1_idempotency_keys (idempotency_key, user_id, operation, status)
        VALUES (p_idempotency_key, p_user_id, 'buyin', 'processing');
    EXCEPTION WHEN unique_violation THEN
        -- The key is already inserted by another request (or previously)
        -- By the time this SELECT runs, the other transaction will have either committed (and we see 'completed') or rolled back.
        -- Wait, actually selecting here might not wait for the other transaction to commit unless we also do FOR UPDATE or something if we really needed to, but the UNIQUE constraint violation implies the other transaction ALREADY committed (otherwise we would block on the INSERT until it commits/rolls back). Wait, yes, if we hit unique_violation, the other transaction has COMMITTED. Thus we can read the final status!
        SELECT status, response_body INTO v_idempotency_status, v_result
        FROM public.orb1_idempotency_keys
        WHERE idempotency_key = p_idempotency_key;

        RETURN jsonb_build_object(
            'success', true, 
            'cached', true,
            'status', v_idempotency_status,
            'data', v_result
        );
    END;

    -- 3. LOCK Profile row (Prevent multiple requests reading stale balances)
    SELECT diamonds INTO v_profile_diamonds
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
    SET diamonds = diamonds - p_diamond_cost
    WHERE id = p_user_id;

    UPDATE public.club_members
    SET chip_balance = chip_balance + p_chip_amount
    WHERE club_id = p_club_id AND user_id = p_user_id;

    -- 6. Insert transaction
    INSERT INTO public.chip_transactions (
        club_id, to_user_id, transaction_type, amount, balance_after, notes
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
