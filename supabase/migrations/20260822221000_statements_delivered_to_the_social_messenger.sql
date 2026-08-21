-- THE STATEMENTS WERE DELIVERED INTO A MESSENGER NOBODY READS.
--
-- 20260822219000 wrote them into public.conversations + public.messages. Those
-- tables are real, but the only code that reads them is the Club Arena SPA's
-- native messaging tree -- and that tree is entirely unrouted: MessagesPage and
-- ClubMessagesPage are iframes of /hub/messenger, and not one component in
-- src/components/messaging/ is imported by any route. The statements landed
-- somewhere with no reader.
--
-- The messenger people actually use is the SOCIAL one:
--   social_conversations / social_messages / social_conversation_participants
-- served by /hub/messenger and /api/messenger/*. It held 91 real messages
-- against 2 in the other family, both of them the mis-delivered statements.
--
-- The "Club Arena widget" is the collapsible identity strip inside that page
-- (messenger.js, the club drawer). Switching to a club re-runs the inbox with
-- context_entity_id set to that club's social_pages row, and
-- fn_get_user_conversations filters
--   p.context_entity_id IS NOT DISTINCT FROM p_context_entity_id
-- so a thread appears in the CLUB inbox precisely when the recipient's
-- participant row carries that club's page id.
--
-- Per (union, club) there is now one durable thread: is_group true, named
-- "<Union> Statements", context_entity_id = the club's social page. Messages
-- carry message_type 'invoice' with the breakdown in media_metadata, which
-- /api/messenger/get-messages already passes through, so MessageBubble renders
-- a statement card instead of prose.
--
-- WHY A GROUP AND NOT A DM: fn_get_or_create_conversation refuses
-- p_user_id = p_other_user_id, and on Midway the union owner and both club
-- owners are the same account, so a DM literally cannot exist. A one-sided
-- group thread has no such restriction and lists correctly in both inboxes.
--
-- WHY ONE PARTICIPANT ROW: social_conversation_participants has
-- UNIQUE (conversation_id, user_id). The first cut seated the union owner
-- under the UNION page and then each club owner under the CLUB page, so the
-- same account hit 23505 and nothing was delivered. Recipients are seated
-- first with the club's page id; the union owner is only seated afterwards, so
-- a union owner who also owns the club reads it in that club's inbox -- which
-- is where a club statement belongs.
--
-- social_pages.linked_entity_id is TEXT, hence the casts.
--
-- Applied to production via Supabase MCP as
-- 'statements_delivered_to_the_social_messenger' and
-- 'statement_thread_respects_one_participant_row_per_user'.
CREATE OR REPLACE FUNCTION public.fn_union_send_club_message(
  p_union_id   uuid,
  p_club_id    uuid,
  p_content    text,
  p_metadata   jsonb DEFAULT '{}'::jsonb,
  p_message_type text DEFAULT 'text')
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sender      uuid;
  v_union_name  text;
  v_union_page  uuid;
  v_club_page   uuid;
  v_conv        uuid;
  v_title       text;
  v_msg_id      uuid;
  v_recipients  int := 0;
  r             record;
BEGIN
  SELECT u.owner_id, u.name INTO v_sender, v_union_name
    FROM unions u WHERE u.id = p_union_id;
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'union has no owner to send as');
  END IF;

  SELECT sp.id INTO v_union_page FROM social_pages sp
   WHERE sp.linked_entity_id = p_union_id::text AND sp.linked_entity_type = 'club' LIMIT 1;
  SELECT sp.id INTO v_club_page FROM social_pages sp
   WHERE sp.linked_entity_id = p_club_id::text AND sp.linked_entity_type = 'club' LIMIT 1;

  v_title := COALESCE(v_union_name, 'Union') || ' Statements';

  SELECT c.id INTO v_conv
    FROM social_conversations c
   WHERE c.is_group = true
     AND c.group_name = v_title
     AND c.context_entity_id IS NOT DISTINCT FROM v_club_page
   ORDER BY c.created_at ASC
   LIMIT 1;

  IF v_conv IS NULL THEN
    INSERT INTO social_conversations (is_group, group_name, context_entity_id, context_entity_type)
    VALUES (true, v_title, v_club_page, CASE WHEN v_club_page IS NULL THEN NULL ELSE 'club' END)
    RETURNING id INTO v_conv;
  END IF;

  -- RECIPIENTS FIRST, seated under the CLUB identity.
  FOR r IN
    SELECT DISTINCT x.uid
      FROM (
        SELECT c.owner_id AS uid FROM clubs c
         WHERE c.id = p_club_id AND c.owner_id IS NOT NULL
        UNION
        SELECT cm.user_id FROM club_members cm
         WHERE cm.club_id = p_club_id
           AND cm.role IN ('owner','admin')
           AND COALESCE(cm.status,'active') NOT IN ('banned','suspended')
      ) x
     WHERE x.uid IS NOT NULL
       AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = x.uid)
  LOOP
    INSERT INTO social_conversation_participants
      (conversation_id, user_id, context_entity_id, context_entity_type)
    VALUES (v_conv, r.uid, v_club_page,
            CASE WHEN v_club_page IS NULL THEN NULL ELSE 'club' END)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    v_recipients := v_recipients + 1;
  END LOOP;

  IF v_recipients = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'club has no owner or admin with a profile',
                              'conversation_id', v_conv);
  END IF;

  INSERT INTO social_conversation_participants
    (conversation_id, user_id, context_entity_id, context_entity_type)
  VALUES (v_conv, v_sender, v_union_page,
          CASE WHEN v_union_page IS NULL THEN NULL ELSE 'club' END)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  INSERT INTO social_messages (conversation_id, sender_id, content, message_type, media_metadata)
  VALUES (v_conv, v_sender, p_content,
          COALESCE(NULLIF(p_message_type, ''), 'text'),
          CASE WHEN p_metadata = '{}'::jsonb OR p_metadata IS NULL THEN NULL ELSE p_metadata END)
  RETURNING id INTO v_msg_id;

  UPDATE social_conversations
     SET last_message_at = now(),
         last_message_preview = left(regexp_replace(p_content, E'\\s+', ' ', 'g'), 100),
         updated_at = now()
   WHERE id = v_conv;

  RETURN jsonb_build_object('success', true, 'delivered', v_recipients,
                            'conversation_id', v_conv, 'message_id', v_msg_id,
                            'club_page', v_club_page, 'union_page', v_union_page);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_send_club_message(uuid, uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_club uuid := 'a0000000-0000-0000-0000-000000000001';
        v_page uuid;
BEGIN
  SELECT sp.id INTO v_page FROM social_pages sp
   WHERE sp.linked_entity_id = v_club::text AND sp.linked_entity_type = 'club' LIMIT 1;
  IF v_page IS NULL THEN
    RAISE EXCEPTION 'Club JAQK has no social page, the club inbox cannot exist';
  END IF;
  RAISE NOTICE 'social delivery wired, club page %', v_page;
END $$;
