-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Fix broken messenger RPCs
-- Date: 2026-04-23
-- Issues:
--   1. fn_get_or_create_conversation — DOES NOT EXIST (missing entirely)
--   2. fn_update_presence — exists but missing GRANT EXECUTE TO authenticated
--   3. fn_toggle_message_reaction — exists but missing GRANT EXECUTE TO authenticated
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Grant EXECUTE on existing functions that are permission-denied
-- ─────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.fn_update_presence(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_toggle_message_reaction(uuid, uuid, text) TO authenticated;

-- Also ensure anon can't call these (security best practice)
REVOKE EXECUTE ON FUNCTION public.fn_update_presence(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_toggle_message_reaction(uuid, uuid, text) FROM anon;

-- ─────────────────────────────────────────────────────────────────
-- 2. Create fn_get_or_create_conversation (missing entirely)
--    Gets an existing 1-on-1 conversation between two users,
--    or creates a new one and adds both users as participants.
--    SECURITY DEFINER so it can bypass RLS on participants table.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(
    user1_id uuid,
    user2_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation_id uuid;
BEGIN
    -- Find existing direct conversation between the two users
    SELECT c.id INTO v_conversation_id
    FROM social_conversations c
    INNER JOIN social_conversation_participants p1
        ON p1.conversation_id = c.id AND p1.user_id = user1_id
    INNER JOIN social_conversation_participants p2
        ON p2.conversation_id = c.id AND p2.user_id = user2_id
    WHERE c.is_group = false
    LIMIT 1;

    -- Return existing conversation if found
    IF v_conversation_id IS NOT NULL THEN
        RETURN v_conversation_id;
    END IF;

    -- Create a new direct conversation
    INSERT INTO social_conversations (is_group, created_at, updated_at)
    VALUES (false, now(), now())
    RETURNING id INTO v_conversation_id;

    -- Add both users as participants
    INSERT INTO social_conversation_participants (conversation_id, user_id, joined_at, last_read_at)
    VALUES
        (v_conversation_id, user1_id, now(), now()),
        (v_conversation_id, user2_id, now(), now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conversation_id;
END;
$$;

-- Grant to authenticated users
GRANT EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid) FROM anon;

-- ─────────────────────────────────────────────────────────────────
-- 3. Verify social_conversations table columns (may need to create)
--    Only create if not exists
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Ensure social_conversations has is_group column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'social_conversations'
        AND column_name = 'is_group'
    ) THEN
        ALTER TABLE public.social_conversations ADD COLUMN is_group boolean DEFAULT false;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Create user-media bucket if it doesn't exist via storage API
--    NOTE: Run this separately via Supabase dashboard or storage API
--    if the SQL approach doesn't work for your Supabase version.
-- ─────────────────────────────────────────────────────────────────
-- This cannot be done via SQL in all versions. Use the Supabase dashboard to:
-- Create bucket "user-media" with:
--   - Public: YES (for media URLs to work without signed URLs)
--   - File size limit: 100MB
--   - Allowed MIME types: image/*, video/*, audio/*
-- OR: The messenger has already been updated to use social-media bucket
--     via the signed-URL proxy, so this bucket is no longer needed.
