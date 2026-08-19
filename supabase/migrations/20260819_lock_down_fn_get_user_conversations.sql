-- ═══════════════════════════════════════════════════════════════════════════
-- fn_get_user_conversations(uuid, uuid) — close the inbox IDOR
-- ═══════════════════════════════════════════════════════════════════════════
-- The function is SECURITY DEFINER, takes the identity as a PARAMETER, has no
-- auth.uid() check anywhere in its body, and EXECUTE is granted to
-- `authenticated`. Verified live before writing this:
--
--   sig                                     secdef  authenticated  mentions_auth_uid
--   fn_get_user_conversations(uuid,uuid)    true    TRUE           FALSE
--   fn_get_user_conversations(uuid)         false   false          false
--
-- So any logged-in user can POST to /rest/v1/rpc/fn_get_user_conversations
-- with {"p_user_id": "<someone else's uuid>"} using their own session and read
-- that person's entire inbox: every conversation id, unread counts, and the
-- display name and avatar of whoever they are talking to.
--
-- HOW IT GOT HERE: 20260809022000_revoke_authenticated_on_identity_trusting_
-- definer_fns.sql revoked exactly this, for exactly this reason — its header
-- describes the attack. Then 20260815_messenger_participant_identity_context.sql
-- re-created the function to add the context filter and re-granted EXECUTE to
-- authenticated on its way past. Filename ordering put the GRANT after the
-- REVOKE, so the fix was silently undone six days later by a migration about a
-- different feature.
--
-- Nothing calls it from a browser. grep across pages/, src/ and the Club Arena
-- repo finds only pages/api/messenger/get-conversations.js, which calls it with
-- the service-role key. Revoking `authenticated` costs nothing.
--
-- Two layers, because the grant has now been lost once already:
--   1. REVOKE — the authoritative gate.
--   2. An auth.uid() guard inside the body, so that if some future migration
--      re-grants EXECUTE the function still refuses to read anyone else's
--      inbox. Shaped to allow the server: when there is no end-user JWT
--      (service_role, postgres) auth.uid() is NULL and the guard stands down.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_get_user_conversations(
    p_user_id uuid,
    p_context_entity_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    conversation_id uuid,
    title text,
    is_group boolean,
    last_message_at timestamp with time zone,
    unread_count bigint,
    other_user_id uuid,
    other_user_username text,
    other_user_avatar text,
    context_entity_id uuid,
    context_entity_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Defence in depth. A caller presenting an end-user JWT may only ask for
    -- their own conversations. A caller with no JWT at all is the API route
    -- holding the service-role key, which has already verified identity from
    -- the bearer token before it gets here.
    IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'fn_get_user_conversations: not authorized to read another user''s inbox';
    END IF;

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
        ou.avatar_url AS other_user_avatar,
        p.context_entity_id,
        p.context_entity_type
    FROM social_conversations c
    JOIN social_conversation_participants p
      ON p.conversation_id = c.id AND p.user_id = p_user_id
    LEFT JOIN social_conversation_participants op
      ON op.conversation_id = c.id AND op.user_id <> p_user_id
    LEFT JOIN profiles ou ON ou.id = op.user_id
    WHERE p.context_entity_id IS NOT DISTINCT FROM p_context_entity_id
    ORDER BY c.last_message_at DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_get_user_conversations(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_get_user_conversations(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_user_conversations(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_get_user_conversations(uuid, uuid) IS
    'Service-role only. Reads a user inbox by parameter, so EXECUTE must never be granted to anon or authenticated - see 20260819_lock_down_fn_get_user_conversations.sql. The auth.uid() guard in the body is a backstop, not the gate.';

-- ── Post-apply assertions ────────────────────────────────────────────────
DO $$
BEGIN
    IF has_function_privilege('authenticated',
        'public.fn_get_user_conversations(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can still EXECUTE fn_get_user_conversations(uuid,uuid)';
    END IF;

    IF has_function_privilege('anon',
        'public.fn_get_user_conversations(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can still EXECUTE fn_get_user_conversations(uuid,uuid)';
    END IF;

    IF NOT has_function_privilege('service_role',
        'public.fn_get_user_conversations(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role lost EXECUTE on fn_get_user_conversations(uuid,uuid) - the API route is now broken';
    END IF;

    IF position('auth.uid()' in pg_get_functiondef(
        'public.fn_get_user_conversations(uuid,uuid)'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'the auth.uid() backstop is missing from the function body';
    END IF;
END $$;

-- ROLLBACK
--   GRANT EXECUTE ON FUNCTION public.fn_get_user_conversations(uuid, uuid) TO authenticated;
--   (do not — this is the vulnerability)
