-- Migration: Add diamond crediting to fn_approve_cashout_atomic for true ACID compliance
-- Previously, fn_credit_diamonds was called in Node.js before fn_approve_cashout_atomic.
-- If the server crashed between calls, diamonds were minted but the cashout remained pending (infinite double spend).

CREATE OR REPLACE FUNCTION public.fn_approve_cashout_atomic(
    p_cashout_id UUID,
    p_agent_id UUID,
    p_agent_note TEXT,
    p_diamonds_to_credit BIGINT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cashout RECORD;
    v_new_diamonds BIGINT := 0;
BEGIN
    -- 1. Get and Lock Cashout
    SELECT * INTO v_cashout 
    FROM public.cashout_requests 
    WHERE id = p_cashout_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cashout not found or already processed');
    END IF;

    -- 2. Update Cashout Status
    UPDATE public.cashout_requests
    SET status = 'completed', 
        completed_at = NOW(), 
        agent_note = p_agent_note
    WHERE id = p_cashout_id;

    -- 3. Credit Treasury
    UPDATE public.clubs
    SET chip_treasury = COALESCE(chip_treasury, 0) + v_cashout.amount
    WHERE id = v_cashout.club_id;

    -- 4. Record Transaction
    INSERT INTO public.chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
    VALUES (v_cashout.club_id, v_cashout.player_id, p_agent_id, v_cashout.amount, 'cashout_approved', 'Cashout approved: ' || v_cashout.amount || ' chips moved to treasury');

    -- 5. Credit Diamonds (if requested)
    IF p_diamonds_to_credit > 0 THEN
        UPDATE public.profiles
        SET diamonds = COALESCE(diamonds, 0) + p_diamonds_to_credit
        WHERE id = v_cashout.player_id
        RETURNING diamonds INTO v_new_diamonds;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'amount', v_cashout.amount,
        'club_id', v_cashout.club_id,
        'diamonds_credited', p_diamonds_to_credit,
        'new_diamond_balance', v_new_diamonds
    );
END;
$$;

COMMIT;
