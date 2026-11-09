-- DRAFT AUTOSAVE FIXTURE (2026-11-09)
--
-- Two technical group conversations owned solely by the designated test
-- identity, so a draft can be verified end to end without addressing any
-- person, club or financial workspace. Two are required because one of the
-- acceptance items is that switching conversations preserves BOTH drafts.
-- No message is seeded: the send check writes the only message, and cleanup
-- removes it.
DO $$
DECLARE official uuid := '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
        a uuid := md5('wh-draft-autosave-20261109-a')::uuid;
        b uuid := md5('wh-draft-autosave-20261109-b')::uuid;
        before_profile text; after_profile text; reachable int;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=official AND username='smarterpoker' AND full_name='Smarter.Poker Official' AND NOT COALESCE(is_horse,false))
 THEN RAISE EXCEPTION 'Designated test identity changed'; END IF;
 IF EXISTS (SELECT 1 FROM social_conversations WHERE id IN (a,b))
 THEN RAISE EXCEPTION 'Owned IDs already exist; inspect durable outcome before retry'; END IF;
 SELECT md5(to_jsonb(p)::text) INTO before_profile FROM profiles p WHERE id=official;

 INSERT INTO social_conversations(id,is_group,group_name,is_request,context_entity_id,context_entity_type)
   VALUES (a,true,'Messenger Verification Only',false,NULL,NULL),
          (b,true,'Messenger Verification Only',false,NULL,NULL);
 INSERT INTO social_conversation_participants(conversation_id,user_id,context_entity_id,context_entity_type)
   VALUES (a,official,NULL,NULL),(b,official,NULL,NULL);

 -- Reachable for authorization, and carrying no continuity state yet.
 SELECT count(*) INTO reachable FROM social_conversation_participants
   WHERE conversation_id IN (a,b) AND user_id=official;
 IF reachable <> 2 THEN RAISE EXCEPTION 'Fixture not reachable: %', reachable; END IF;
 IF EXISTS (SELECT 1 FROM messenger_conversation_state WHERE conversation_id IN (a,b))
 THEN RAISE EXCEPTION 'Fixture continuity is not fresh'; END IF;
 IF EXISTS (SELECT 1 FROM social_messages WHERE conversation_id IN (a,b))
 THEN RAISE EXCEPTION 'Fixture must start with no messages'; END IF;

 SELECT md5(to_jsonb(p)::text) INTO after_profile FROM profiles p WHERE id=official;
 IF before_profile IS DISTINCT FROM after_profile THEN RAISE EXCEPTION 'Unexpected profile side effect'; END IF;
 RAISE NOTICE 'seed ok: % / %', a, b;
END $$;
