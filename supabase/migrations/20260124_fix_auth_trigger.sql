-- ════════════════════════════════════════════════════════════════════════════════
-- FIX: Update auth trigger to give correct starting values (100 XP, 300 diamonds)
-- And generate player_number automatically
-- ════════════════════════════════════════════════════════════════════════════════

-- Create a SAFE handle_new_user function that creates profile correctly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_player_num INT;
BEGIN
    -- Get the next player number
    SELECT COALESCE(MAX(player_number), 1254) + 1 INTO next_player_num FROM public.profiles;
    
    -- Insert profile with correct starting values
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        username,
        player_number,
        streak_count,
        xp_total,
        diamonds,
        diamond_multiplier,
        skill_tier,
        access_tier,
        created_at,
        last_login
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'poker_alias', ''),
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'poker_alias', ''),
        next_player_num,
        0,
        100,  -- Starting XP bonus (was 50, now matches signup)
        300,  -- Starting diamonds bonus
        1.0,
        'Newcomer',
        CASE 
            WHEN NEW.raw_user_meta_data->>'state' IN ('WA', 'ID', 'MI', 'NV', 'CA') THEN 'Restricted_Tier'
            ELSE 'Full_Access'
        END,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login = NOW(),
        -- Also update any missing fields
        player_number = COALESCE(profiles.player_number, EXCLUDED.player_number),
        xp_total = COALESCE(profiles.xp_total, EXCLUDED.xp_total),
        diamonds = COALESCE(profiles.diamonds, EXCLUDED.diamonds);
    
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Username already taken is OK, we'll handle it in the app
        RETURN NEW;
    WHEN OTHERS THEN
        -- Log but don't fail - auth should still succeed
        RAISE WARNING 'Profile creation in trigger failed: %', SQLERRM;
        RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
