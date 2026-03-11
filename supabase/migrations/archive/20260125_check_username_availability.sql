-- ═══════════════════════════════════════════════════════════════════════════
-- Check Username Availability RPC
-- This function allows unauthenticated users to check if a username is taken
-- supabase/migrations/20260125_check_username_availability.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Create a function that can be called by anyone (even unauthenticated)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_exists BOOLEAN := false;
BEGIN
    -- Case-insensitive check for existing username
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE LOWER(username) = LOWER(p_username)
    ) INTO user_exists;
    
    -- Return TRUE if available, FALSE if taken
    RETURN NOT user_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to everyone (including anon)
GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO authenticated;

COMMENT ON FUNCTION public.check_username_available(TEXT) IS 'Checks if a username is available for registration. Returns true if available, false if taken.';
