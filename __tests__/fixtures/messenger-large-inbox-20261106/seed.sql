DO $$
DECLARE before_profiles text; after_profiles text; n int := 720; listed int; unread int;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM profiles WHERE id='2d1cd6c3-5700-4af9-a271-d4863fdab20d' AND username='smarterpoker' AND full_name='Smarter.Poker Official' AND NOT COALESCE(is_horse,false))
 OR NOT EXISTS (SELECT 1 FROM profiles p JOIN ca_cert_accounts c ON c.user_id=p.id WHERE p.id='00000000-0000-0000-0000-000000000069' AND c.active AND NOT COALESCE(p.is_horse,false) AND fn_ca_is_fixture_account(p.id) AND fn_ca_is_cert_account(p.id))
 THEN RAISE EXCEPTION 'Designated test identities changed'; END IF;
 IF EXISTS (SELECT 1 FROM social_conversations WHERE id IN (SELECT md5('wh-large-inbox-20261106-'||g)::uuid FROM generate_series(1,n) g) OR id=md5('wh-send-fixture-20261106')::uuid)
 OR EXISTS (SELECT 1 FROM social_messages WHERE id IN (SELECT md5('wh-large-inbox-msg-20261106-'||g)::uuid FROM generate_series(1,n) g))
 THEN RAISE EXCEPTION 'Owned IDs already exist; inspect durable outcome before retry'; END IF;
 SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) INTO before_profiles FROM profiles p WHERE id IN ('2d1cd6c3-5700-4af9-a271-d4863fdab20d','00000000-0000-0000-0000-000000000069');
 INSERT INTO social_conversations(id,is_group,group_name,is_request,context_entity_id,context_entity_type)
   SELECT md5('wh-large-inbox-20261106-'||g)::uuid,true,'Verification Only: Large Inbox 20261106',false,NULL,NULL FROM generate_series(1,n) g;
 INSERT INTO social_conversations(id,is_group,group_name,is_request,context_entity_id,context_entity_type)
   VALUES (md5('wh-send-fixture-20261106')::uuid,true,'Messenger Verification Only',false,NULL,NULL);
 INSERT INTO social_conversation_participants(conversation_id,user_id,context_entity_id,context_entity_type)
   SELECT md5('wh-large-inbox-20261106-'||g)::uuid,'2d1cd6c3-5700-4af9-a271-d4863fdab20d'::uuid,NULL::uuid,NULL::text FROM generate_series(1,n) g
   UNION ALL SELECT md5('wh-send-fixture-20261106')::uuid,'2d1cd6c3-5700-4af9-a271-d4863fdab20d'::uuid,NULL::uuid,NULL::text;
 INSERT INTO social_messages(id,conversation_id,sender_id,content,message_type,media_metadata,created_at)
   SELECT md5('wh-large-inbox-msg-20261106-'||g)::uuid, md5('wh-large-inbox-20261106-'||g)::uuid,'00000000-0000-0000-0000-000000000069'::uuid,
     'Technical verification fixture 20261106. Large-inbox read-state check only; no reply requested.','text',
     '{"verification_fixture":"wh-messenger-large-inbox-20261106"}'::jsonb, now() - make_interval(secs => g)
   FROM generate_series(1,n) g;
 SELECT count(*), count(*) FILTER (WHERE unread_count=1) INTO listed, unread
   FROM fn_get_user_conversations('2d1cd6c3-5700-4af9-a271-d4863fdab20d',NULL)
   WHERE conversation_id IN (SELECT md5('wh-large-inbox-20261106-'||g)::uuid FROM generate_series(1,n) g);
 IF listed <> n OR unread <> n THEN RAISE EXCEPTION 'Fixture not reachable or unread: listed %, unread %', listed, unread; END IF;
 IF EXISTS (SELECT 1 FROM fn_get_user_conversations('2d1cd6c3-5700-4af9-a271-d4863fdab20d',NULL) WHERE conversation_id=md5('wh-send-fixture-20261106')::uuid)
 THEN RAISE EXCEPTION 'Empty send fixture must not be listed before its first message'; END IF;
 IF EXISTS (SELECT 1 FROM notifications WHERE user_id='2d1cd6c3-5700-4af9-a271-d4863fdab20d' AND created_at > now() - interval '1 minute' AND data->>'conversationId' IN (SELECT md5('wh-large-inbox-20261106-'||g)::uuid::text FROM generate_series(1,n) g))
 THEN RAISE EXCEPTION 'Unexpected notification side effect'; END IF;
 SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) INTO after_profiles FROM profiles p WHERE id IN ('2d1cd6c3-5700-4af9-a271-d4863fdab20d','00000000-0000-0000-0000-000000000069');
 IF before_profiles IS DISTINCT FROM after_profiles THEN RAISE EXCEPTION 'Unexpected profile side effect'; END IF;
 RAISE NOTICE 'seed ok: % conversations listed and unread', listed;
END $$;
