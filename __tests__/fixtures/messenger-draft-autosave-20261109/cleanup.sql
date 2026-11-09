-- Removes exactly what the draft-autosave seed and its verification created,
-- and nothing else: the two owned conversations, their sole participant rows,
-- their continuity rows and any message the send check wrote into them.
DO $$
DECLARE official uuid := '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
        a uuid := md5('wh-draft-autosave-20261109-a')::uuid;
        b uuid := md5('wh-draft-autosave-20261109-b')::uuid;
        stray int;
BEGIN
 SELECT count(*) INTO stray FROM social_conversations
   WHERE id IN (a,b) AND NOT (is_group AND group_name='Messenger Verification Only');
 IF stray > 0 THEN RAISE EXCEPTION 'Owned IDs are not the expected fixture; refusing to delete'; END IF;
 SELECT count(*) INTO stray FROM social_conversation_participants
   WHERE conversation_id IN (a,b) AND user_id <> official;
 IF stray > 0 THEN RAISE EXCEPTION 'Fixture gained an unexpected participant; refusing to delete'; END IF;
 SELECT count(*) INTO stray FROM social_messages
   WHERE conversation_id IN (a,b) AND sender_id NOT IN (official,'00000000-0000-0000-0000-000000000069'::uuid);
 IF stray > 0 THEN RAISE EXCEPTION 'Fixture gained an unexpected sender; refusing to delete'; END IF;

 DELETE FROM messenger_conversation_state WHERE conversation_id IN (a,b);
 DELETE FROM social_messages WHERE conversation_id IN (a,b);
 DELETE FROM social_conversation_participants WHERE conversation_id IN (a,b);
 DELETE FROM social_conversations WHERE id IN (a,b);
 RAISE NOTICE 'cleanup ok';
END $$;
