-- ═══════════════════════════════════════════════════════════════════════════
-- HARDEN AUTH TRIGGER: Ensure all new users have complete profile data
-- This prevents FK join failures when new users are created
-- supabase/migrations/20260125_harden_auth_trigger.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop and recreate the handle_new_user function with bulletproof defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    username_base TEXT;
    username_final TEXT;
    counter INTEGER := 0;
BEGIN
    -- Generate base username from email or random
    username_base := COALESCE(
        NEW.raw_user_meta_data->>'username',
        SPLIT_PART(NEW.email, '@', 1),
        'user_' || SUBSTR(NEW.id::TEXT, 1, 8)
    );
    
    -- Ensure username is unique by appending numbers if needed
    username_final := username_base;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = username_final) LOOP
        counter := counter + 1;
        username_final := username_base || counter::TEXT;
        IF counter > 100 THEN
            username_final := 'user_' || SUBSTR(NEW.id::TEXT, 1, 12) || '_' || counter::TEXT;
            EXIT;
        END IF;
    END LOOP;
    
    -- Insert profile with ALL required fields guaranteed to be non-null
    INSERT INTO public.profiles (
        id,
        email,
        username,
        full_name,
        display_name_preference,
        skill_tier,
        role,
        diamonds,
        xp,
        current_level,
        created_at
    ) VALUES (
        NEW.id,
        COALESCE(NEW.email, NEW.id::TEXT || '@noemail.local'),
        username_final,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            INITCAP(REPLACE(username_final, '_', ' ')),
            'New Member'
        ),
        'full_name',
        'recreational',
        'user',
        100,
        0,
        1,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        -- Update any null fields with defaults
        username = COALESCE(EXCLUDED.username, profiles.username, 'user_' || SUBSTR(NEW.id::TEXT, 1, 8)),
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name, 'New Member'),
        email = COALESCE(EXCLUDED.email, profiles.email),
        display_name_preference = COALESCE(profiles.display_name_preference, 'full_name'),
        skill_tier = COALESCE(profiles.skill_tier, 'recreational'),
        role = COALESCE(profiles.role, 'user');
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail auth - user can still sign up
        RAISE WARNING 'handle_new_user trigger error: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also create a function to backfill any profiles with NULL required fields
CREATE OR REPLACE FUNCTION public.fix_incomplete_profiles()
RETURNS INTEGER AS $$
DECLARE
    fixed_count INTEGER := 0;
BEGIN
    UPDATE public.profiles SET
        username = COALESCE(username, 'user_' || SUBSTR(id::TEXT, 1, 8)),
        full_name = COALESCE(full_name, 'Member'),
        display_name_preference = COALESCE(display_name_preference, 'full_name'),
        skill_tier = COALESCE(skill_tier, 'recreational'),
        role = COALESCE(role, 'user')
    WHERE 
        username IS NULL OR
        full_name IS NULL OR
        display_name_preference IS NULL;
    
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RETURN fixed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the fix immediately
SELECT public.fix_incomplete_profiles();

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates complete profile with all required fields when new user signs up. Never fails - logs errors but returns NEW.';
