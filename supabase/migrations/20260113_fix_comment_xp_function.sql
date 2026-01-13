-- Fix the ambiguous total_xp column reference in fn_award_social_xp
-- This was preventing comments from being saved

-- Drop the old function that has the ambiguous column reference
DROP FUNCTION IF EXISTS fn_award_social_xp CASCADE;

-- Recreate with fixed column references (using table name prefix)
CREATE OR REPLACE FUNCTION fn_award_social_xp(
    p_user_id UUID,
    p_action_type TEXT,
    p_reference_id UUID DEFAULT NULL
)
RETURNS TABLE (xp_awarded INTEGER, new_total_xp INTEGER) AS $$
DECLARE
    v_xp_amount INTEGER := 0;
    v_current_xp INTEGER;
BEGIN
    -- Define XP amounts for different actions
    CASE p_action_type
        WHEN 'post_created' THEN v_xp_amount := 15;
        WHEN 'comment_created' THEN v_xp_amount := 5;
        WHEN 'like_given' THEN v_xp_amount := 2;
        WHEN 'like_received' THEN v_xp_amount := 3;
        ELSE v_xp_amount := 0;
    END CASE;
    
    -- Update the user's XP in profiles table
    -- Using explicit table name to avoid ambiguity
    UPDATE profiles 
    SET xp_total = COALESCE(profiles.xp_total, 0) + v_xp_amount,
        updated_at = NOW()
    WHERE profiles.id = p_user_id
    RETURNING profiles.xp_total INTO v_current_xp;
    
    -- Return result
    xp_awarded := v_xp_amount;
    new_total_xp := v_current_xp;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate comment trigger
CREATE OR REPLACE FUNCTION fn_trigger_comment_xp()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_award_social_xp(NEW.author_id, 'comment_created', NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_xp ON social_comments;
CREATE TRIGGER trg_comment_xp
    AFTER INSERT ON social_comments
    FOR EACH ROW EXECUTE FUNCTION fn_trigger_comment_xp();

-- Grant permissions
GRANT EXECUTE ON FUNCTION fn_award_social_xp TO authenticated;
GRANT EXECUTE ON FUNCTION fn_trigger_comment_xp TO authenticated;

SELECT 'XP function fixed - comments should now work!' as status;
