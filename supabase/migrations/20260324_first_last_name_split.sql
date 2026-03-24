-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Add first_name/last_name support to auth trigger and RPC
-- Updates handle_new_user trigger to extract first_name/last_name from metadata
-- Updates initialize_player_profile RPC to write first_name/last_name columns
-- ════════════════════════════════════════════════════════════════════════════════

-- 1. Update the auth trigger to populate first_name and last_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  v_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');

  -- If first/last not provided, split from full_name
  IF v_first_name = '' AND v_last_name = '' AND v_full_name != '' THEN
    v_first_name := split_part(v_full_name, ' ', 1);
    v_last_name := CASE
      WHEN position(' ' in v_full_name) > 0
      THEN substring(v_full_name from position(' ' in v_full_name) + 1)
      ELSE ''
    END;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, created_at, updated_at)
  VALUES (NEW.id, NEW.email, v_full_name, v_first_name, v_last_name, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

-- 2. Update initialize_player_profile to also write first_name/last_name
-- This preserves the 7-param signature the signup code expects
CREATE OR REPLACE FUNCTION public.initialize_player_profile(
    p_user_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_username TEXT DEFAULT NULL
)
RETURNS TABLE (
    player_number BIGINT,
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_player_number BIGINT;
    v_is_restricted BOOLEAN;
    v_access_tier TEXT;
    v_is_employee BOOLEAN;
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    -- Split full_name into first/last
    v_first_name := split_part(COALESCE(p_full_name, ''), ' ', 1);
    v_last_name := CASE
      WHEN position(' ' in COALESCE(p_full_name, '')) > 0
      THEN substring(COALESCE(p_full_name, '') from position(' ' in COALESCE(p_full_name, '')) + 1)
      ELSE ''
    END;

    -- Check if this is an employee
    v_is_employee := (COALESCE(p_email, '') ILIKE '%@smarter.poker');

    -- Assign player number
    IF v_is_employee THEN
        SELECT NEXTVAL('employee_number_seq') INTO v_player_number;
    ELSE
        SELECT NEXTVAL('public_player_number_seq') INTO v_player_number;
    END IF;

    -- Check restricted states
    v_is_restricted := COALESCE(p_state, '') IN ('WA', 'ID', 'MI', 'NV', 'CA');
    v_access_tier := CASE WHEN v_is_restricted THEN 'Restricted_Tier' ELSE 'Full_Access' END;

    -- Insert or update profile
    INSERT INTO profiles (
        id, player_number, full_name, first_name, last_name,
        email, phone, city, state, username,
        xp_total, diamonds, diamond_multiplier, streak_count,
        skill_tier, access_tier, email_verified, phone_verified,
        created_at, last_login
    ) VALUES (
        p_user_id, v_player_number, p_full_name, v_first_name, v_last_name,
        p_email, p_phone, p_city, p_state, p_username,
        100, 300, 1.0, 0,
        'Newcomer', v_access_tier, false, false,
        NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        username = EXCLUDED.username,
        access_tier = EXCLUDED.access_tier,
        last_login = NOW(),
        player_number = COALESCE(profiles.player_number, v_player_number);

    -- Get the actual player_number
    SELECT p.player_number INTO v_player_number FROM profiles p WHERE p.id = p_user_id;

    RETURN QUERY SELECT v_player_number, true::BOOLEAN, 'Profile initialized'::TEXT;
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0::BIGINT, false::BOOLEAN, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;

-- 3. Backfill existing users: split full_name into first_name/last_name where empty
UPDATE profiles
SET
  first_name = split_part(full_name, ' ', 1),
  last_name = CASE
    WHEN position(' ' in full_name) > 0
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE ''
  END
WHERE
  (first_name IS NULL OR first_name = '')
  AND (last_name IS NULL OR last_name = '')
  AND full_name IS NOT NULL
  AND full_name != '';
