-- PART 4: FUNCTIONS AND TRIGGERS (Run this fourth - DONE!)

CREATE OR REPLACE FUNCTION has_user_seen_hand(p_user_id UUID, p_file_id TEXT, p_variant_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM god_mode_hand_history WHERE user_id = p_user_id AND source_file_id = p_file_id AND variant_hash = p_variant_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_available_rotation(p_user_id UUID, p_file_id TEXT)
RETURNS TEXT AS $$
DECLARE
    used_rotations TEXT[];
BEGIN
    SELECT ARRAY_AGG(variant_hash) INTO used_rotations FROM god_mode_hand_history WHERE user_id = p_user_id AND source_file_id = p_file_id;
    IF used_rotations IS NULL OR NOT ('0' = ANY(used_rotations)) THEN RETURN '0';
    ELSIF NOT ('1' = ANY(used_rotations)) THEN RETURN '1';
    ELSIF NOT ('2' = ANY(used_rotations)) THEN RETURN '2';
    ELSIF NOT ('3' = ANY(used_rotations)) THEN RETURN '3';
    ELSE RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_session_after_hand(p_session_id UUID, p_is_correct BOOLEAN, p_chip_penalty INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE god_mode_user_session
    SET current_round_hands_played = current_round_hands_played + 1,
        current_round_correct = current_round_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        health_chips = GREATEST(0, health_chips - p_chip_penalty),
        total_hands_played = total_hands_played + 1,
        total_correct = total_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        last_played_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_registry_updated_at BEFORE UPDATE ON game_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER god_mode_session_updated_at BEFORE UPDATE ON god_mode_user_session FOR EACH ROW EXECUTE FUNCTION update_updated_at();
