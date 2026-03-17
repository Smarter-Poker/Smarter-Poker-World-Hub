-- ═══════════════════════════════════════════════════════════════════════════
-- Fix add_diamonds_to_balance grant for authenticated role
-- ═══════════════════════════════════════════════════════════════════════════
-- The (uuid, integer, text, text, text) overload was missing the 
-- authenticated grant, causing client-side RPC calls to fail with
-- "permission denied" for certain code paths.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grant EXECUTE on all overloads to authenticated
GRANT EXECUTE ON FUNCTION add_diamonds_to_balance(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION add_diamonds_to_balance(uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_diamonds_to_balance(uuid, integer, text, text, text) TO authenticated;
