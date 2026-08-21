-- THE CLUB BADGE AND THE INBOX COUNTED DIFFERENT THINGS.
--
-- Two RPCs produce "unread", and they did not agree on either half of the
-- question.
--
--   fn_get_user_conversations  (the inbox, per conversation)
--       scopes by the PARTICIPANT's context:  p.context_entity_id
--       counts messages with no row in social_message_reads
--
--   fn_get_all_identity_unread_counts  (the Club Arena drawer badge)
--       scoped by the CONVERSATION's context: c.context_entity_id
--       counted messages with created_at > p.last_read_at
--
-- fn_mark_messages_read maintains both read mechanisms together, so the read
-- tracking usually lands in the same place. The scope did not: switching
-- identity in the drawer filters the inbox on the PARTICIPANT row, because
-- that is what says which identity you are reading as. Grouping the badge by
-- the conversation's context instead meant a thread whose context was set by
-- the other party counted toward a badge for an identity you never act as,
-- and a thread where only your own participant row carries the context was
-- missed entirely.
--
-- Both halves are now the inbox's: participant scope, and reads tracked by
-- social_message_reads. The badge is now literally "what the inbox will show
-- when you switch to this identity", and a post-apply assertion proves the
-- two agree for a real club identity.
--
-- Also revokes anon's leftover write grants on messenger_blocked. anon held
-- arwdxtm on the table that decides who is allowed to talk to whom.
--
-- Applied to production via Supabase MCP as
-- 'identity_unread_counts_match_the_inbox'.

CREATE OR REPLACE FUNCTION public.fn_get_all_identity_unread_counts(p_user_id uuid)
RETURNS TABLE(entity_id uuid, unread_total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.context_entity_id AS entity_id,
         count(m.id)::bigint AS unread_total
    FROM social_conversation_participants p
    JOIN social_messages m ON m.conversation_id = p.conversation_id
   WHERE p.user_id = p_user_id
     AND p.context_entity_id IS NOT NULL
     AND COALESCE(m.is_deleted, false) = false
     AND m.sender_id IS DISTINCT FROM p_user_id
     AND NOT EXISTS (
         SELECT 1 FROM social_message_reads r
          WHERE r.message_id = m.id AND r.user_id = p_user_id
     )
   GROUP BY p.context_entity_id;
$function$;

REVOKE ALL ON TABLE public.messenger_blocked FROM anon;

DO $$
DECLARE
  v_user uuid := '47965354-0e56-43ef-931c-ddaab82af765';
  v_page uuid := '1170f414-0c80-43ea-bf06-ce3ec3680b81';  -- Club JAQK
  v_inbox bigint;
  v_badge bigint;
BEGIN
  SELECT COALESCE(SUM(x.unread_count), 0) INTO v_inbox
    FROM fn_get_user_conversations(v_user, v_page) x;

  SELECT COALESCE(SUM(u.unread_total), 0) INTO v_badge
    FROM fn_get_all_identity_unread_counts(v_user) u
   WHERE u.entity_id = v_page;

  IF v_inbox IS DISTINCT FROM v_badge THEN
    RAISE EXCEPTION 'badge and inbox still disagree for the club identity: inbox=% badge=%',
      v_inbox, v_badge;
  END IF;

  RAISE NOTICE 'identity unread agrees with the inbox (both %)', v_inbox;
END $$;
