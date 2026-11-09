-- DRAFT AUTOSAVE FIXTURE (2026-11-09)
--
-- Two technical group conversations owned solely by the designated test
-- identity, so a draft can be verified end to end without addressing any
-- person, club or financial workspace. Two are required because one of the
-- acceptance items is that switching conversations preserves BOTH drafts.
-- One labelled message is seeded into each, from the established cert
-- identity, because fn_get_user_conversations does not list a conversation
-- that has no messages. Without it the fixture could not exercise the
-- whole-workspace read a reload performs.
DO $$
DECLARE official uuid := '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
        cert uuid := '00000000-0000-0000-0000-000000000069';
        a uuid := md5('wh-draft-autosave-20261109-a')::uuid;
        b uuid := md5('wh-draft-autosave-20261109-b')::uuid;
        before_profile text; after_profile text; reachable int; listed int;
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
 INSERT INTO social_messages(id,conversation_id,sender_id,content,message_type,media_metadata,created_at)
   VALUES (md5('wh-draft-autosave-20261109-msg-a')::uuid,a,cert,
           'Messenger Verification Only: draft autosave fixture. No reply requested.','text',
           '{"verification_fixture":"wh-draft-autosave-20261109"}'::jsonb, now() - interval '2 seconds'),
          (md5('wh-draft-autosave-20261109-msg-b')::uuid,b,cert,
           'Messenger Verification Only: draft autosave fixture. No reply requested.','text',
           '{"verification_fixture":"wh-draft-autosave-20261109"}'::jsonb, now() - interval '1 second');

 SELECT count(*) INTO reachable FROM social_conversation_participants
   WHERE conversation_id IN (a,b) AND user_id=official;
 IF reachable <> 2 THEN RAISE EXCEPTION 'Fixture not reachable: %', reachable; END IF;
 IF EXISTS (SELECT 1 FROM messenger_conversation_state WHERE conversation_id IN (a,b))
 THEN RAISE EXCEPTION 'Fixture continuity is not fresh'; END IF;
 -- Both must be LISTED, which is what a whole-workspace read returns.
 SELECT count(*) INTO listed FROM fn_get_user_conversations(official,NULL)
   WHERE conversation_id IN (a,b);
 IF listed <> 2 THEN RAISE EXCEPTION 'Fixture is not listed for a workspace read: %', listed; END IF;

 SELECT md5(to_jsonb(p)::text) INTO after_profile FROM profiles p WHERE id=official;
 IF before_profile IS DISTINCT FROM after_profile THEN RAISE EXCEPTION 'Unexpected profile side effect'; END IF;
 RAISE NOTICE 'seed ok: % / %', a, b;
END $$;
