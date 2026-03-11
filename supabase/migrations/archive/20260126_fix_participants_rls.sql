-- ═══════════════════════════════════════════════════════════════════════════
-- ANTIGRAVITY FIX: Missing RLS Policy on social_conversation_participants
-- ═══════════════════════════════════════════════════════════════════════════
-- ROOT CAUSE: Users can't see messages because they can't SELECT from
-- social_conversation_participants (only service_role has access).
-- All other RLS policies depend on this table, causing cascade failure.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add policy to let users see their own participation records
CREATE POLICY "Users can view their own participation"
    ON social_conversation_participants
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- 2. Also allow anon role for edge cases
CREATE POLICY "Anon can view participation"
    ON social_conversation_participants
    FOR SELECT
    TO anon
    USING (true);

-- 3. Ensure proper grants exist
GRANT SELECT ON social_conversation_participants TO authenticated;
GRANT SELECT ON social_conversation_participants TO anon;
GRANT SELECT ON social_conversations TO authenticated;
GRANT SELECT ON social_conversations TO anon;
GRANT SELECT ON social_messages TO authenticated;
GRANT SELECT ON social_messages TO anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION: After running, users should be able to see their messages
-- ═══════════════════════════════════════════════════════════════════════════
