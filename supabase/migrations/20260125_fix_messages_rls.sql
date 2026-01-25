-- ═══════════════════════════════════════════════════════════════════════════
-- ANTIGRAVITY FIX: Social Messages RLS Policy
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEM: Messages exist in database but users can't see them
-- The current RLS policy using subquery on social_conversation_participants is failing
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Users can view conversation messages" ON social_messages;

-- Create a more permissive policy that works reliably
-- Uses EXISTS which is more efficient than IN for subqueries
CREATE POLICY "Users can view conversation messages"
    ON social_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM social_conversation_participants scp
            WHERE scp.conversation_id = social_messages.conversation_id
              AND scp.user_id = auth.uid()
        )
    );

-- Also ensure INSERT policy works
DROP POLICY IF EXISTS "Users can send messages" ON social_messages;

CREATE POLICY "Users can send messages"
    ON social_messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM social_conversation_participants scp
            WHERE scp.conversation_id = social_messages.conversation_id
              AND scp.user_id = auth.uid()
        )
    );

-- Verify: Check if the table has RLS enabled
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'social_messages';

-- Grant read access to the authenticated and anon roles on social_messages
GRANT SELECT ON social_messages TO authenticated;
GRANT SELECT ON social_messages TO anon;

-- Also grant on participants table (needed for the policy subquery)
GRANT SELECT ON social_conversation_participants TO authenticated;
GRANT SELECT ON social_conversation_participants TO anon;

-- Verify messages are accessible
-- SELECT id, content, sender_id, created_at 
-- FROM social_messages 
-- WHERE conversation_id = 'ab868e7d-a75b-4a6d-ab46-7839e8302e89'
-- LIMIT 5;
