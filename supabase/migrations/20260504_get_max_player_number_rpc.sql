-- Migration: Add get_max_player_number() RPC
-- 
-- profiles.player_number is stored as TEXT. Sorting TEXT values descending is
-- lexicographic — '999' > '1500'. This function casts to INT before taking MAX
-- so the correct numeric maximum is always returned.
--
-- Returns: BIGINT (the current max player_number, or NULL if no profiles exist)

CREATE OR REPLACE FUNCTION public.get_max_player_number()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT MAX(player_number::BIGINT)
    FROM public.profiles
    WHERE player_number IS NOT NULL
      AND player_number ~ '^\d+$'   -- only parse rows with valid numeric strings
$$;

GRANT EXECUTE ON FUNCTION public.get_max_player_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_max_player_number() TO anon;
GRANT EXECUTE ON FUNCTION public.get_max_player_number() TO service_role;
