DO $$
DECLARE n int := 720; owned uuid[]; official uuid := '2d1cd6c3-5700-4af9-a271-d4863fdab20d'; sender uuid := '00000000-0000-0000-0000-000000000069'; send_fixture uuid := md5('wh-send-fixture-20261106')::uuid; removed int;
BEGIN
 PERFORM set_config('lock_timeout','3s',true);
 owned := array(SELECT md5('wh-large-inbox-20261106-'||g)::uuid FROM generate_series(1,n) g) || send_fixture;
 PERFORM 1 FROM social_conversations WHERE id = ANY(owned) FOR UPDATE;
 IF EXISTS (SELECT 1 FROM social_conversations WHERE id = ANY(owned) AND NOT (is_group AND group_name IN ('Verification Only: Large Inbox 20261106','Messenger Verification Only')))
 OR EXISTS (SELECT 1 FROM social_conversation_participants WHERE conversation_id = ANY(owned) AND user_id IS DISTINCT FROM official)
 OR EXISTS (SELECT 1 FROM social_messages WHERE conversation_id = ANY(owned) AND NOT (
      (sender_id = sender AND conversation_id <> send_fixture AND media_metadata->>'verification_fixture' = 'wh-messenger-large-inbox-20261106')
   OR (conversation_id = send_fixture AND sender_id = official AND content LIKE 'Messenger Verification Only: Idempotent Send %' AND message_type = 'text')))
 OR EXISTS (SELECT 1 FROM social_message_reads r JOIN social_messages m ON m.id = r.message_id WHERE m.conversation_id = ANY(owned) AND r.user_id IS DISTINCT FROM official)
 OR EXISTS (SELECT 1 FROM message_reactions x JOIN social_messages m ON m.id = x.message_id WHERE m.conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM live_help_tickets WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM accounting_conversations WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM accounting_invoice_deliveries d JOIN social_messages m ON m.id = d.message_id WHERE m.conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM notifications WHERE data->>'conversationId' IN (SELECT unnest(owned)::text) AND user_id IS DISTINCT FROM official)
 THEN RAISE EXCEPTION 'Fixture changed or acquired other data; preserve and inspect'; END IF;
 DELETE FROM notifications WHERE user_id = official AND data->>'conversationId' IN (SELECT unnest(owned)::text);
 DELETE FROM social_conversations WHERE id = ANY(owned);
 GET DIAGNOSTICS removed = ROW_COUNT;
 IF EXISTS (SELECT 1 FROM social_messages WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM social_conversation_participants WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM social_message_reads WHERE message_id IN (SELECT md5('wh-large-inbox-msg-20261106-'||g)::uuid FROM generate_series(1,n) g))
 THEN RAISE EXCEPTION 'Owned fixture cleanup incomplete'; END IF;
 RAISE NOTICE 'cleanup removed % conversations', removed;
END $$;
