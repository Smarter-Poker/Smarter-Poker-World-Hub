-- ════════════════════════════════════════════════════════════════════════════════
-- CRITICAL FIX: Fix or disable broken auth signup trigger
-- This trigger on auth.users is causing "Database error saving new user"
-- ════════════════════════════════════════════════════════════════════════════════

-- First, let's drop any existing trigger on auth.users that might be failing
-- Common trigger names: on_auth_user_created, handle_new_user_trigger

-- Drop if exists (safe operation)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- Create a SAFE handle_new_user function that won't fail
-- Uses EXCEPTION handler so auth still works even if profile creation fails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert minimal profile with only essential columns
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        username,
        streak_count,
        xp_total,
        diamonds,
        skill_tier,
        access_tier,
        created_at,
        last_login
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'poker_alias', ''),
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'poker_alias', ''),
        0,
        50,
        300,
        'Newcomer',
        'Full_Access',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login = NOW();
    
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

-- Recreate the trigger with the safe function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
