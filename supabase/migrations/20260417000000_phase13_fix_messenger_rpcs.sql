-- ══════════════════════════════════════════════════════════════════════
--  PHASE 13: FIX BROKEN MESSENGER RPCs
-- ══════════════════════════════════════════════════════════════════════
--
--  Five RPCs were found broken during Phase 12 audit:
--
--   1. fn_get_or_create_conversation — stub returning a random UUID with
--      no INSERTs. Callers never got a real conversation.
--
--   2. fn_send_message — wrote to the unused public.messages table
--      (0 rows). The UI reads from public.social_messages (73+ rows).
--      Messages sent via this RPC were silently lost.
--
--   3. fn_get_user_conversations — queried social_* tables correctly but
--      joined to nonexistent user_dna_profiles and selected c.title
--      (nonexistent column on social_conversations). Threw immediately.
--
--   4. fn_mark_messages_read — wrote to the unused messages table.
--      No-op on the real schema.
--
--   5. fn_delete_message — wrote to the unused messages table.
--      No-op on the real schema.
--
--  All five are rewritten against the real social_* schema:
--
--    social_conversations         — threads (is_group + group_name)
--    social_conversation_participants — membership
--    social_messages              — content (is_deleted, read_at, etc.)
--    social_message_reads         — per-user-per-message read receipts
--
--  Also: adds a UNIQUE INDEX on (social_message_reads.message_id, user_id)
--  to allow ON CONFLICT DO NOTHING idempotency in fn_mark_messages_read.
--
--  AUDIT TRAIL
--    - Phase 12's home-games messenger helper (src/lib/home-games/messenger.js)
--      bypasses these RPCs and writes directly. With Phase 13 in place the
--      helper is now redundant, but we leave it — it's proven working in
--      production and refactoring a working path is unnecessary risk.
--    - The orphaned trigger fn_check_club_message_permission still fires
--      on INSERT to the dead public.messages table. Harmless (nothing
--      writes there anymore) but dead code. Not dropped in this phase.
--    - fn_get_conversations (singular-less variant) is a separate stub
--      returning '[]'::JSON. Also not touched here — no known callers.
-- ══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS fn_get_or_create_conversation(uuid, uuid, text);
DROP FUNCTION IF EXISTS fn_send_message(uuid, uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS fn_get_user_conversations(uuid);
DROP FUNCTION IF EXISTS fn_mark_messages_read(uuid, uuid);
DROP FUNCTION IF EXISTS fn_delete_message(uuid, uuid);

CREATE FUNCTION fn_get_or_create_conversation(
    p_user_id uuid,
    p_other_user_id uuid,
    p_conversation_type text DEFAULT 'direct'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id uuid;
    v_new_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_other_user_id IS NULL OR p_user_id = p_other_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid user pair');
    END IF;

    SELECT c.id INTO v_existing_id
      FROM social_conversations c
      JOIN social_conversation_participants p1 ON p1.conversation_id = c.id
      JOIN social_conversation_participants p2 ON p2.conversation_id = c.id
     WHERE c.is_group = false
       AND p1.user_id = p_user_id
       AND p2.user_id = p_other_user_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'conversation_id', v_existing_id, 'created', false);
    END IF;

    INSERT INTO social_conversations (is_group) VALUES (false) RETURNING id INTO v_new_id;
    INSERT INTO social_conversation_participants (conversation_id, user_id)
    VALUES (v_new_id, p_user_id), (v_new_id, p_other_user_id);

    RETURN jsonb_build_object('success', true, 'conversation_id', v_new_id, 'created', true);
END;
$$;

CREATE FUNCTION fn_send_message(
    p_conversation_id uuid,
    p_sender_id uuid,
    p_content text,
    p_message_type text DEFAULT 'text',
    p_metadata jsonb DEFAULT '{}'::jsonb
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
    IF p_conversation_id IS NULL OR p_sender_id IS NULL OR COALESCE(p_content,'') = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing conversation/sender/content');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM social_conversation_participants
        WHERE conversation_id = p_conversation_id AND user_id = p_sender_id
    ) INTO v_is_participant;

    IF NOT v_is_participant THEN
        RETURN jsonb_build_object('success', false, 'error', 'sender is not a participant');
    END IF;

    INSERT INTO social_messages (conversation_id, sender_id, content, message_type)
    VALUES (p_conversation_id, p_sender_id, p_content, COALESCE(p_message_type, 'text'))
    RETURNING id INTO v_message_id;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id, 'conversation_id', p_conversation_id);
END;
$$;

CREATE FUNCTION fn_get_user_conversations(p_user_id uuid)
RETURNS TABLE (
    conversation_id uuid,
    title text,
    is_group boolean,
    last_message_at timestamptz,
    unread_count bigint,
    other_user_id uuid,
    other_user_username text,
    other_user_avatar text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS conversation_id,
        COALESCE(c.group_name, NULL) AS title,
        c.is_group,
        c.last_message_at,
        (
            SELECT COUNT(*)
              FROM social_messages m
             WHERE m.conversation_id = c.id
               AND m.sender_id != p_user_id
               AND COALESCE(m.is_deleted, false) = false
               AND NOT EXISTS (
                   SELECT 1 FROM social_message_reads r
                    WHERE r.message_id = m.id AND r.user_id = p_user_id
               )
        ) AS unread_count,
        ou.id AS other_user_id,
        COALESCE(ou.display_name, ou.username, ou.full_name) AS other_user_username,
        ou.avatar_url AS other_user_avatar
    FROM social_conversations c
    JOIN social_conversation_participants p ON p.conversation_id = c.id AND p.user_id = p_user_id
    LEFT JOIN social_conversation_participants op
           ON op.conversation_id = c.id AND op.user_id <> p_user_id
    LEFT JOIN profiles ou ON ou.id = op.user_id
    ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname='public' AND tablename='social_message_reads'
          AND indexname='social_message_reads_message_user_uk'
    ) THEN
        EXECUTE 'CREATE UNIQUE INDEX social_message_reads_message_user_uk
                 ON social_message_reads (message_id, user_id)';
    END IF;
END $$;

CREATE FUNCTION fn_mark_messages_read(p_conversation_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    IF p_conversation_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing parameters');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM social_conversation_participants
         WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not a participant');
    END IF;

    WITH inserted AS (
        INSERT INTO social_message_reads (message_id, user_id, read_at)
        SELECT m.id, p_user_id, NOW()
          FROM social_messages m
         WHERE m.conversation_id = p_conversation_id
           AND m.sender_id <> p_user_id
           AND COALESCE(m.is_deleted, false) = false
           AND NOT EXISTS (
               SELECT 1 FROM social_message_reads r
                WHERE r.message_id = m.id AND r.user_id = p_user_id
           )
        ON CONFLICT (message_id, user_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM inserted;

    UPDATE social_conversation_participants
       SET last_read_at = NOW()
     WHERE conversation_id = p_conversation_id
       AND user_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'marked', v_count);
END;
$$;

CREATE FUNCTION fn_delete_message(p_message_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender uuid;
BEGIN
    IF p_message_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing parameters');
    END IF;

    SELECT sender_id INTO v_sender FROM social_messages WHERE id = p_message_id;

    IF v_sender IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'message not found');
    END IF;

    IF v_sender <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'only the sender can delete this message');
    END IF;

    UPDATE social_messages
       SET is_deleted = true,
           content = '[message deleted]',
           updated_at = NOW()
     WHERE id = p_message_id;

    RETURN jsonb_build_object('success', true, 'message_id', p_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_or_create_conversation(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_send_message(uuid, uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_get_user_conversations(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_mark_messages_read(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_delete_message(uuid, uuid) TO authenticated, service_role;
