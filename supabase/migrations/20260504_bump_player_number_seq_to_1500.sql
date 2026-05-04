-- Migration: Bump player number sequence to start at 1500+
-- As requested, player numbers should start at 1500 and go sequentially.

DO $$
DECLARE
    v_currval BIGINT;
BEGIN
    -- Check current value of the public player number sequence
    -- We use nextval just to get a value, then we adjust if it's below 1500
    SELECT nextval('public_player_number_seq') INTO v_currval;
    
    IF v_currval < 1500 THEN
        PERFORM setval('public_player_number_seq', 1500);
    END IF;

    -- Also check the profiles sequence if it exists
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'profiles_player_number_seq') THEN
        SELECT nextval('profiles_player_number_seq') INTO v_currval;
        IF v_currval < 1500 THEN
            PERFORM setval('profiles_player_number_seq', 1500);
        END IF;
    END IF;
END $$;
