-- 20260312000000_club_arena_acid_compliance.sql
-- Phase 5: Financial ACID Compliance Overhaul
-- Migrating Node.js distributed sagas to atomic Postgres RPCs to prevent chip destruction and double-spends.

BEGIN;

-- 1. Atomic Cashout Request (Debits player + Creates pending request)
CREATE OR REPLACE FUNCTION public.fn_request_cashout(
    p_club_id UUID,
    p_player_id UUID,
    p_agent_id UUID,
    p_amount BIGINT,
    p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_balance BIGINT;
    v_cashout_id UUID;
BEGIN
    -- 1. Check Balance
    SELECT chip_balance INTO v_balance
    FROM public.club_members
    WHERE club_id = p_club_id AND user_id = p_player_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Player is not a member of this club');
    END IF;

    IF v_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 2. Prevent multiple pending cashouts
    IF EXISTS (
        SELECT 1 FROM public.cashout_requests 
        WHERE club_id = p_club_id AND player_id = p_player_id AND status = 'pending'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You already have a pending cashout request');
    END IF;

    -- 3. Hold Chips (Debit)
    UPDATE public.club_members
    SET chip_balance = chip_balance - p_amount
    WHERE club_id = p_club_id AND user_id = p_player_id;

    -- 4. Create Request
    INSERT INTO public.cashout_requests (club_id, player_id, agent_id, amount, status, player_note)
    VALUES (p_club_id, p_player_id, p_agent_id, p_amount, 'pending', p_note)
    RETURNING id INTO v_cashout_id;

    -- 5. Record Escrow Transaction
    INSERT INTO public.chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
    VALUES (p_club_id, p_player_id, p_player_id, -p_amount, 'cashout', 'Cashout hold (escrow): ' || p_amount || ' chips pending agent approval');

    RETURN jsonb_build_object(
        'success', true, 
        'cashout_id', v_cashout_id, 
        'remaining_balance', v_balance - p_amount
    );
END;
$$;


-- 2. Atomic Approve Cashout (Update request + Credit treasury)
-- Note: Requires diamond escrow logic which might still be handled in JS, 
-- but we can at least make the chips-to-treasury part atomic with the cashout state update.
CREATE OR REPLACE FUNCTION public.fn_approve_cashout_atomic(
    p_cashout_id UUID,
    p_agent_id UUID,
    p_agent_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cashout RECORD;
BEGIN
    -- 1. Get and Lock Cashout
    SELECT * INTO v_cashout 
    FROM public.cashout_requests 
    WHERE id = p_cashout_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cashout not found or already processed');
    END IF;

    -- 2. Authorize Agent (handled prior by JS usually, but double check here if needed)

    -- 3. Update Cashout Status
    UPDATE public.cashout_requests
    SET status = 'completed', 
        completed_at = NOW(), 
        agent_note = p_agent_note
    WHERE id = p_cashout_id;

    -- 4. Credit Treasury
    UPDATE public.clubs
    SET chip_treasury = COALESCE(chip_treasury, 0) + v_cashout.amount
    WHERE id = v_cashout.club_id;

    -- 5. Record Transaction
    INSERT INTO public.chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
    VALUES (v_cashout.club_id, v_cashout.player_id, p_agent_id, v_cashout.amount, 'cashout_approved', 'Cashout approved: ' || v_cashout.amount || ' chips moved to treasury');

    RETURN jsonb_build_object(
        'success', true,
        'amount', v_cashout.amount,
        'club_id', v_cashout.club_id,
        'player_id', v_cashout.player_id
    );
END;
$$;


-- 3. Atomic Cancel Cashout (Update request + Credit player)
CREATE OR REPLACE FUNCTION public.fn_cancel_cashout_atomic(
    p_cashout_id UUID,
    p_user_id UUID,
    p_is_agent BOOLEAN,
    p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cashout RECORD;
    v_balance BIGINT;
BEGIN
    -- 1. Get and Lock Cashout
    SELECT * INTO v_cashout 
    FROM public.cashout_requests 
    WHERE id = p_cashout_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cashout not found or already processed');
    END IF;

    -- 2. Update Request
    UPDATE public.cashout_requests
    SET status = 'cancelled', 
        cancelled_at = NOW(), 
        agent_note = p_note
    WHERE id = p_cashout_id;

    -- 3. Return Chips to Player
    UPDATE public.club_members
    SET chip_balance = COALESCE(chip_balance, 0) + v_cashout.amount
    WHERE club_id = v_cashout.club_id AND user_id = v_cashout.player_id
    RETURNING chip_balance INTO v_balance;

    -- 4. Record Transaction
    INSERT INTO public.chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
    VALUES (
        v_cashout.club_id, 
        CASE WHEN p_is_agent THEN p_user_id ELSE v_cashout.player_id END, 
        v_cashout.player_id, 
        v_cashout.amount, 
        CASE WHEN p_is_agent THEN 'cashout_rejected' ELSE 'cashout_cancelled' END, 
        CASE WHEN p_is_agent THEN 'Agent cancelled cashout — chips returned' ELSE 'Player cancelled cashout — chips returned' END
    );

    RETURN jsonb_build_object(
        'success', true,
        'returned', v_cashout.amount,
        'new_balance', v_balance,
        'club_id', v_cashout.club_id,
        'player_id', v_cashout.player_id
    );
END;
$$;


-- 4. Atomic Leave Club (Cancel cashouts + Sweep balance + Deactivate)
CREATE OR REPLACE FUNCTION public.fn_leave_club_atomic(
    p_club_id UUID,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_co RECORD;
    v_held_returned BIGINT := 0;
    v_final_balance BIGINT := 0;
    v_credit_used BIGINT := 0;
BEGIN
    -- 1. Cancel all pending cashouts and return chips FIRST
    FOR v_co IN 
        SELECT id, amount FROM public.cashout_requests 
        WHERE club_id = p_club_id AND player_id = p_user_id AND status = 'pending'
        FOR UPDATE
    LOOP
        UPDATE public.cashout_requests
        SET status = 'cancelled', cancelled_at = NOW(), agent_note = 'Auto-cancelled: player left club'
        WHERE id = v_co.id;
        
        UPDATE public.club_members
        SET chip_balance = COALESCE(chip_balance, 0) + v_co.amount
        WHERE club_id = p_club_id AND user_id = p_user_id;
        
        v_held_returned := v_held_returned + v_co.amount;
    END LOOP;

    -- 2. Sweep entire chip balance to treasury
    SELECT chip_balance, credit_used INTO v_final_balance, v_credit_used
    FROM public.club_members
    WHERE club_id = p_club_id AND user_id = p_user_id;

    IF v_final_balance > 0 THEN
        -- Debit player
        UPDATE public.club_members
        SET chip_balance = 0
        WHERE club_id = p_club_id AND user_id = p_user_id;

        -- Credit treasury
        UPDATE public.clubs
        SET chip_treasury = COALESCE(chip_treasury, 0) + v_final_balance
        WHERE id = p_club_id;

        -- Transaction log
        INSERT INTO public.chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
        VALUES (p_club_id, p_user_id, NULL, v_final_balance, 'withdrawal', 'Player left club — ' || v_final_balance || ' chips returned to club treasury');
    END IF;

    -- 3. Log forgiven credit
    IF COALESCE(v_credit_used, 0) > 0 THEN
        INSERT INTO public.chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
        VALUES (p_club_id, p_user_id, NULL, v_credit_used, 'credit_forgiven', 'Player left club with ' || v_credit_used || ' outstanding credit — written off');
    END IF;

    -- 4. Delete Membership
    DELETE FROM public.club_members
    WHERE club_id = p_club_id AND user_id = p_user_id;

    -- Note: Agent downline cleanup is best left to JS as it involves updating potentially many rows,
    -- but the core financial risks are resolved by the block above.

    RETURN jsonb_build_object(
        'success', true,
        'chips_returned', COALESCE(v_final_balance, 0),
        'held_chips_returned', COALESCE(v_held_returned, 0),
        'credit_written_off', COALESCE(v_credit_used, 0)
    );
END;
$$;


-- 5. Atomic Clawback (Deducts from player, adds to agent)
CREATE OR REPLACE FUNCTION public.fn_clawback_chips_atomic(
    p_transaction_id UUID,
    p_club_id UUID,
    p_agent_id UUID,
    p_amount BIGINT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_txn RECORD;
    v_player_amount BIGINT;
    v_recovered BIGINT;
    v_new_agent_bal BIGINT;
    v_new_player_bal BIGINT;
    v_partial BOOLEAN := false;
BEGIN
    -- 1. Grab transaction and lock it
    SELECT * INTO v_txn
    FROM public.chip_transactions
    WHERE id = p_transaction_id AND club_id = p_club_id AND from_user_id = p_agent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found or not yours');
    END IF;

    IF v_txn.notes LIKE '%[CLAWED BACK]%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already clawed back');
    END IF;

    -- 2. Get Player Balance
    SELECT chip_balance INTO v_player_amount
    FROM public.club_members
    WHERE club_id = p_club_id AND user_id = v_txn.to_user_id
    FOR UPDATE;

    IF v_player_amount <= 0 THEN
        UPDATE public.chip_transactions SET notes = v_txn.notes || ' [CLAWBACK FAILED: Zero balance]' WHERE id = p_transaction_id;
        RETURN jsonb_build_object('success', true, 'partial', true, 'recovered', 0, 'player_new_balance', 0, 'error', 'Player has zero chips');
    END IF;

    -- 3. Determine amount (Partial if needed)
    v_recovered := p_amount;
    IF v_player_amount < p_amount THEN
        v_recovered := v_player_amount;
        v_partial := true;
    END IF;

    -- 4. Execute Transfer
    -- Debit Player
    UPDATE public.club_members
    SET chip_balance = COALESCE(chip_balance, 0) - v_recovered
    WHERE club_id = p_club_id AND user_id = v_txn.to_user_id
    RETURNING chip_balance INTO v_new_player_bal;

    -- Credit Agent
    UPDATE public.club_members
    SET chip_balance = COALESCE(chip_balance, 0) + v_recovered
    WHERE club_id = p_club_id AND user_id = p_agent_id
    RETURNING chip_balance INTO v_new_agent_bal;

    -- 5. Record Transaction + Update Original
    INSERT INTO public.chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
    VALUES (p_club_id, v_txn.to_user_id, p_agent_id, v_recovered, 'clawback', 'Clawback: ' || v_recovered || ' recovered from original txn ' || p_transaction_id);

    UPDATE public.chip_transactions
    SET notes = v_txn.notes || ' [CLAWED BACK: ' || v_recovered || ' at ' || NOW() || ']'
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'partial', v_partial,
        'requested', p_amount,
        'recovered', v_recovered,
        'player_new_balance', v_new_player_bal,
        'agent_new_balance', v_new_agent_bal
    );
END;
$$;


-- 6. Atomic Add Prepaid Credit (Debit Treasury, Credit Agent_Member, Credit Agent_Biz)
CREATE OR REPLACE FUNCTION public.fn_add_prepaid_credit_atomic(
    p_club_id UUID,
    p_agent_id UUID,
    p_amount BIGINT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_treasury BIGINT;
    v_agent_bal BIGINT;
    v_biz_bal BIGINT;
BEGIN
    -- 1. Check Treasury
    SELECT chip_treasury INTO v_treasury
    FROM public.clubs
    WHERE id = p_club_id
    FOR UPDATE;

    IF v_treasury < p_amount OR v_treasury IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient club treasury');
    END IF;

    -- 2. Debit Treasury
    UPDATE public.clubs
    SET chip_treasury = COALESCE(chip_treasury, 0) - p_amount
    WHERE id = p_club_id
    RETURNING chip_treasury INTO v_treasury;

    -- 3. Credit Agent Member Balance
    UPDATE public.club_members
    SET chip_balance = COALESCE(chip_balance, 0) + p_amount
    WHERE club_id = p_club_id AND user_id = p_agent_id
    RETURNING chip_balance INTO v_agent_bal;

    -- 4. Credit Agent Business Balance
    UPDATE public.agents
    SET business_balance = COALESCE(business_balance, 0) + p_amount
    WHERE club_id = p_club_id AND user_id = p_agent_id
    RETURNING business_balance INTO v_biz_bal;

    -- Note: chip_transactions logging is left to JS as it varies

    RETURN jsonb_build_object(
        'success', true,
        'treasury_remaining', v_treasury,
        'agent_balance', v_agent_bal,
        'business_balance', v_biz_bal
    );
END;
$$;

COMMIT;
