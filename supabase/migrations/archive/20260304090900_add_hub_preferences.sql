/* ═══════════════════════════════════════════════════════════════════════════
   MIGRATION: Add Hub Preferences
   ═══════════════════════════════════════════════════════════════════════════ */

-- 1. Add hub_preferences column if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS hub_preferences jsonb DEFAULT '{}'::jsonb;

-- 2. Create RPC function for secure updating from the client
CREATE OR REPLACE FUNCTION public.update_hub_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ensure the user is updating their own profile ONLY
    IF auth.uid() = p_user_id THEN
        UPDATE public.profiles
        SET hub_preferences = p_preferences,
            updated_at = NOW()
        WHERE id = p_user_id;
    ELSE
        RAISE EXCEPTION 'Unauthorized: Users can only update their own hub preferences';
    END IF;
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_hub_preferences(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_hub_preferences(uuid, jsonb) TO service_role;
