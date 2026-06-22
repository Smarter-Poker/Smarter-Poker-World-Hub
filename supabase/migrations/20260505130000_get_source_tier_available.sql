-- Atomic sum function for diamond limits

DROP FUNCTION IF EXISTS public.get_source_tier_available(uuid);
CREATE OR REPLACE FUNCTION public.get_source_tier_available(p_user_id UUID)
RETURNS TABLE (
    purchased_won_total BIGINT,
    free_earned_total BIGINT,
    total_sent BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_purchased BIGINT := 0;
    v_free BIGINT := 0;
    v_sent BIGINT := 0;
    v_escrow_threshold TIMESTAMPTZ := NOW() - INTERVAL '72 hours';
    r RECORD;
BEGIN
    FOR r IN
        SELECT amount, transaction_type, created_at
        FROM diamond_transactions
        WHERE user_id = p_user_id
    LOOP
        IF r.amount > 0 THEN
            IF r.transaction_type IN ('purchase', 'stripe_purchase', 'diamond_purchase', 'tournament_prize', 'tournament_win', 'prize_pool', 'promo_purchased') THEN
                IF r.transaction_type LIKE '%purchase%' AND r.created_at > v_escrow_threshold THEN
                    v_free := v_free + r.amount;
                ELSE
                    v_purchased := v_purchased + r.amount;
                END IF;
            ELSE
                v_free := v_free + r.amount;
            END IF;
        ELSIF r.transaction_type IN ('diamond_gift_sent', 'live_gift_sent') THEN
            v_sent := v_sent + ABS(r.amount);
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_purchased, v_free, v_sent;
END;
$$;
