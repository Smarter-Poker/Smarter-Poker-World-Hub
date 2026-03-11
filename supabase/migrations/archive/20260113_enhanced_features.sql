-- ═══════════════════════════════════════════════════════════════════════════
-- 🚀 ENHANCED FEATURES MIGRATION
-- Adds: Online Presence, Message Deletion, Message Reactions, Search Support
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ONLINE PRESENCE TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

-- Add online presence fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Function to update user presence
CREATE OR REPLACE FUNCTION fn_update_presence(p_user_id UUID, p_is_online BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles
    SET is_online = p_is_online,
        last_seen = NOW()
    WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_update_presence(UUID, BOOLEAN) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. MESSAGE REACTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS social_message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES social_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction VARCHAR(10) NOT NULL, -- emoji like '❤️', '👍', '😂'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id, reaction)
);

-- RLS for message reactions
ALTER TABLE social_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions" ON social_message_reactions
    FOR SELECT USING (true);

CREATE POLICY "Users can add reactions" ON social_message_reactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions" ON social_message_reactions
    FOR DELETE USING (auth.uid() = user_id);

-- Function to toggle reaction on a message
CREATE OR REPLACE FUNCTION fn_toggle_message_reaction(
    p_message_id UUID,
    p_user_id UUID,
    p_reaction VARCHAR(10)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Check if reaction exists
    SELECT EXISTS(
        SELECT 1 FROM social_message_reactions
        WHERE message_id = p_message_id
          AND user_id = p_user_id
          AND reaction = p_reaction
    ) INTO v_exists;

    IF v_exists THEN
        -- Remove reaction
        DELETE FROM social_message_reactions
        WHERE message_id = p_message_id
          AND user_id = p_user_id
          AND reaction = p_reaction;
        RETURN false; -- Reaction was removed
    ELSE
        -- Add reaction
        INSERT INTO social_message_reactions (message_id, user_id, reaction)
        VALUES (p_message_id, p_user_id, p_reaction);
        RETURN true; -- Reaction was added
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_toggle_message_reaction(UUID, UUID, VARCHAR) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. MESSAGE DELETION (SOFT DELETE)
-- ═══════════════════════════════════════════════════════════════════════════

-- Add deleted_at column for soft delete
ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Function to soft delete a message
CREATE OR REPLACE FUNCTION fn_delete_message(p_message_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sender_id UUID;
BEGIN
    -- Get the sender of the message
    SELECT sender_id INTO v_sender_id
    FROM social_messages
    WHERE id = p_message_id;

    -- Only the sender can delete their own messages
    IF v_sender_id IS NULL OR v_sender_id != p_user_id THEN
        RETURN false;
    END IF;

    -- Soft delete the message
    UPDATE social_messages
    SET is_deleted = true,
        deleted_at = NOW(),
        content = '[Message deleted]'
    WHERE id = p_message_id;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_delete_message(UUID, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TYPING INDICATORS (USING REALTIME BROADCAST)
-- We'll use Supabase Realtime Broadcast for typing, no table needed
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. SEARCH FUNCTIONALITY - Full Text Search Support
-- ═══════════════════════════════════════════════════════════════════════════

-- Add full-text search index on messages
CREATE INDEX IF NOT EXISTS idx_messages_content_search 
ON social_messages USING GIN(to_tsvector('english', content));

-- Add full-text search index on posts
CREATE INDEX IF NOT EXISTS idx_posts_content_search 
ON social_posts USING GIN(to_tsvector('english', content));

-- Function to search messages in a conversation
CREATE OR REPLACE FUNCTION fn_search_messages(
    p_conversation_id UUID,
    p_user_id UUID,
    p_query TEXT
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    sender_id UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify user is participant
    IF NOT EXISTS (
        SELECT 1 FROM social_conversation_participants
        WHERE conversation_id = p_conversation_id
          AND user_id = p_user_id
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT m.id, m.content, m.sender_id, m.created_at
    FROM social_messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.is_deleted = false
      AND m.content ILIKE '%' || p_query || '%'
    ORDER BY m.created_at DESC
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_search_messages(UUID, UUID, TEXT) TO authenticated;

-- Function to search posts globally
CREATE OR REPLACE FUNCTION fn_search_posts(p_query TEXT)
RETURNS TABLE(
    id UUID,
    content TEXT,
    author_id UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.content, p.author_id, p.created_at
    FROM social_posts p
    WHERE p.content ILIKE '%' || p_query || '%'
      AND (p.visibility = 'public' OR p.visibility IS NULL)
    ORDER BY p.created_at DESC
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_search_posts(TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. UNREAD MESSAGE COUNT
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION fn_get_unread_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(m.id)::INTEGER INTO v_count
    FROM social_messages m
    INNER JOIN social_conversation_participants cp ON cp.conversation_id = m.conversation_id
    LEFT JOIN social_message_reads mr ON mr.message_id = m.id AND mr.user_id = p_user_id
    WHERE cp.user_id = p_user_id
      AND m.sender_id != p_user_id
      AND m.is_deleted = false
      AND mr.id IS NULL;

    RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_unread_count(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. ENHANCED COMMENT LOADING WITH PROFILES
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to get comments with author profiles
CREATE OR REPLACE FUNCTION fn_get_post_comments(p_post_id UUID)
RETURNS TABLE(
    id UUID,
    content TEXT,
    author_id UUID,
    author_username TEXT,
    author_avatar TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.content,
        c.author_id,
        COALESCE(p.username, 'Player') as author_username,
        p.avatar_url as author_avatar,
        c.created_at
    FROM social_comments c
    LEFT JOIN profiles p ON p.id = c.author_id
    WHERE c.post_id = p_post_id
    ORDER BY c.created_at ASC
    LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_post_comments(UUID) TO authenticated;
