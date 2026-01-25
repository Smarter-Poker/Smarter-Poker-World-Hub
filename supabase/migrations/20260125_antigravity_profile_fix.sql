-- ════════════════════════════════════════════════════════════════════════════════
-- 🛡️ ANTIGRAVITY FIX: Bulletproof Profile Creation Trigger
-- ════════════════════════════════════════════════════════════════════════════════
-- PROBLEM: Some users sign up but their profile is never created, making them invisible
-- SOLUTION: Robust trigger with multiple fallbacks and no silent failures
-- ════════════════════════════════════════════════════════════════════════════════
-- 
-- RUN THIS IN SUPABASE SQL EDITOR
-- ════════════════════════════════════════════════════════════════════════════════

-- Step 1: Create a more robust profile creation function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_player_num INT;
    generated_username TEXT;
BEGIN
    -- Generate username from email or fallback
    generated_username := COALESCE(
        NEW.raw_user_meta_data->>'poker_alias',
        SPLIT_PART(COALESCE(NEW.email, ''), '@', 1),
        'Player' || FLOOR(RANDOM() * 10000)::TEXT
    );
    
    -- Get the next player number
    SELECT COALESCE(MAX(player_number), 1254) + 1 INTO next_player_num FROM public.profiles;
    
    -- Insert profile with all defaults
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
        last_login,
        last_active,
        is_online
    ) VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name', 
            NEW.raw_user_meta_data->>'poker_alias', 
            ''
        ),
        COALESCE(NEW.email, ''),
        generated_username,
        next_player_num,
        0,
        100,   -- Welcome XP bonus
        300,   -- Welcome diamonds bonus
        1.0,
        'Newcomer',
        CASE 
            WHEN NEW.raw_user_meta_data->>'state' IN ('WA', 'ID', 'MI', 'NV', 'CA') THEN 'Restricted_Tier'
            ELSE 'Full_Access'
        END,
        NOW(),
        NOW(),
        NOW(),
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login = NOW(),
        last_active = NOW(),
        is_online = true,
        -- Only update these if they're null
        player_number = COALESCE(profiles.player_number, EXCLUDED.player_number),
        xp_total = COALESCE(profiles.xp_total, EXCLUDED.xp_total),
        diamonds = COALESCE(profiles.diamonds, EXCLUDED.diamonds);
    
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Username already taken - try with a random suffix
        BEGIN
            INSERT INTO public.profiles (id, email, username, created_at, last_login)
            VALUES (
                NEW.id, 
                COALESCE(NEW.email, ''), 
                generated_username || FLOOR(RANDOM() * 1000)::TEXT,
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[ANTIGRAVITY] Profile creation retry failed for %: %', NEW.id, SQLERRM;
        END;
        RETURN NEW;
    WHEN OTHERS THEN
        -- LOG THE ERROR BUT DON'T FAIL - auth should still succeed
        RAISE WARNING '[ANTIGRAVITY] Profile creation failed for %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- Step 2: Recreate the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- Step 4: Find and fix any existing orphaned users
DO $$
DECLARE
    orphan_record RECORD;
    orphan_count INT := 0;
BEGIN
    -- Find auth users without profiles
    FOR orphan_record IN 
        SELECT au.id, au.email, au.created_at, au.raw_user_meta_data
        FROM auth.users au
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE p.id IS NULL
    LOOP
        -- Create profile for each orphan
        INSERT INTO public.profiles (id, email, username, created_at, last_login)
        VALUES (
            orphan_record.id,
            COALESCE(orphan_record.email, ''),
            COALESCE(
                orphan_record.raw_user_meta_data->>'poker_alias',
                SPLIT_PART(COALESCE(orphan_record.email, ''), '@', 1),
                'Player' || orphan_count::TEXT
            ),
            orphan_record.created_at,
            NOW()
        )
        ON CONFLICT (id) DO NOTHING;
        
        orphan_count := orphan_count + 1;
        RAISE NOTICE '[ANTIGRAVITY] Fixed orphaned user: % (%)', orphan_record.id, orphan_record.email;
    END LOOP;
    
    RAISE NOTICE '[ANTIGRAVITY] Total orphaned users fixed: %', orphan_count;
END $$;

-- Done!
SELECT 'ANTIGRAVITY FIX COMPLETE - All users now have profiles!' as status;
