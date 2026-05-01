-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: Add media_metadata to social_messages + update fn_send_message
-- Migration: 20260501140000_add_media_metadata_to_social_messages.sql
--
-- PROBLEM: social_messages has no media_metadata column.
-- fn_send_message accepts p_metadata jsonb but silently discards it.
-- SharedPostCard always renders null because media_metadata is never stored.
--
-- FIX:
-- 1. Add media_metadata jsonb column to social_messages
-- 2. Update fn_send_message to INSERT media_metadata
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add media_metadata column (safe: IF NOT EXISTS guard)
ALTER TABLE public.social_messages
    ADD COLUMN IF NOT EXISTS media_metadata jsonb DEFAULT NULL;

-- Index for messages that have metadata (shared posts, GIFs, etc.)
CREATE INDEX IF NOT EXISTS idx_social_messages_has_metadata
    ON public.social_messages (conversation_id, created_at)
    WHERE media_metadata IS NOT NULL;

-- 2. Update fn_send_message to store the metadata
CREATE OR REPLACE FUNCTION public.fn_send_message(
    p_conversation_id uuid,
    p_sender_id       uuid,
    p_content         text,
    p_message_type    text    DEFAULT 'text',
    p_metadata        jsonb   DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_message_id uuid;
    v_is_participant boolean;
BEGIN
    -- Verify sender is a participant (belt-and-suspenders, send-message API already checks)
    SELECT EXISTS (
        SELECT 1 FROM public.social_conversation_participants
        WHERE conversation_id = p_conversation_id AND user_id = p_sender_id
    ) INTO v_is_participant;

    IF NOT v_is_participant THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
    END IF;

    -- Insert message with metadata
    INSERT INTO public.social_messages (
        conversation_id,
        sender_id,
        content,
        message_type,
        media_metadata
    ) VALUES (
        p_conversation_id,
        p_sender_id,
        p_content,
        COALESCE(NULLIF(p_message_type, ''), 'text'),
        CASE WHEN p_metadata = '{}'::jsonb OR p_metadata IS NULL THEN NULL ELSE p_metadata END
    )
    RETURNING id INTO v_message_id;

    -- Update conversation last message preview
    UPDATE public.social_conversations
    SET
        last_message_at      = now(),
        last_message_preview = CASE
            WHEN p_message_type = 'shared_post' THEN
                COALESCE('📎 ' || (p_metadata->>'preview_title'), '📎 Shared Post')
            ELSE
                left(p_content, 100)
        END,
        updated_at = now()
    WHERE id = p_conversation_id;

    RETURN jsonb_build_object(
        'success',         true,
        'message_id',      v_message_id,
        'conversation_id', p_conversation_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_send_message(uuid, uuid, text, text, jsonb)
    TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'social_messages.media_metadata column added + fn_send_message updated to store metadata.'; END $$;
