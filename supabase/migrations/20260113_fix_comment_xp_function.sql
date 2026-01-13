-- Fix the ambiguous total_xp column reference in fn_award_social_xp
-- This was preventing comments from being saved

-- Drop the problematic function
DROP FUNCTION IF EXISTS fn_award_social_xp CASCADE;

-- Create a simple version that works
CREATE OR REPLACE FUNCTION fn_award_social_xp(
    p_user_id UUID,
    p_action_type TEXT,
    p_reference_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE 
    v_xp_amount INTEGER := 0;
BEGIN
    IF p_action_type = 'post_created' THEN v_xp_amount := 15;
    ELSIF p_action_type = 'comment_created' THEN v_xp_amount := 5;
    ELSIF p_action_type = 'like_given' THEN v_xp_amount := 2;
    END IF;
    
    UPDATE profiles 
    SET xp_total = COALESCE(xp_total, 0) + v_xp_amount
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger function
CREATE OR REPLACE FUNCTION fn_trigger_comment_xp() 
RETURNS TRIGGER AS $$
BEGIN 
    PERFORM fn_award_social_xp(NEW.author_id, 'comment_created', NEW.id); 
    RETURN NEW; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_comment_xp ON social_comments;
CREATE TRIGGER trg_comment_xp 
    AFTER INSERT ON social_comments 
    FOR EACH ROW 
    EXECUTE FUNCTION fn_trigger_comment_xp();
