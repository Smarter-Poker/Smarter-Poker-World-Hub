-- Add increment_diamonds RPC function for gamification rewards
-- Used by achievement unlocks and streak milestone claims

-- Create the increment_diamonds function (wrapper around add_diamonds_to_balance)
CREATE OR REPLACE FUNCTION increment_diamonds(
    p_user_id UUID,
    p_amount INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Update the diamonds balance in profiles
    UPDATE profiles
    SET diamonds = COALESCE(diamonds, 0) + p_amount
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;
    
    -- If no row was updated, the user doesn't exist
    IF v_new_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'added', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (service role will also have access)
GRANT EXECUTE ON FUNCTION increment_diamonds(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_diamonds(UUID, INTEGER) TO service_role;
