BEGIN;
INSERT INTO clubs(id,name,owner_id) VALUES('00000000-0000-4000-8000-000000000900','Sequence Club','00000000-0000-4000-8000-000000000001');
INSERT INTO club_members(club_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000900','00000000-0000-4000-8000-000000000001','owner'),
 ('00000000-0000-4000-8000-000000000900','00000000-0000-4000-8000-000000000002','agent');
INSERT INTO agents(id,user_id,club_id,role) VALUES('00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000900','agent');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT fn_save_club_welcome_message('00000000-0000-4000-8000-000000000900','Owner Immediate',true,0,gen_random_uuid());
SELECT fn_save_club_owner_welcome_message('00000000-0000-4000-8000-000000000900','Owner Ten Minute Welcome',true,0,gen_random_uuid());
DO $$ DECLARE v jsonb; BEGIN
 v:=fn_my_club_welcome_messages();
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v) c WHERE c->>'club_id'='00000000-0000-4000-8000-000000000900' AND c->>'content'='Owner Immediate' AND c->>'owner_content'='Owner Ten Minute Welcome') THEN RAISE EXCEPTION 'Two owner slots missing'; END IF;
END $$;
DO $$ DECLARE t record; v jsonb; BEGIN
 SELECT * INTO t FROM club_messenger_owner_welcome_templates WHERE club_id='00000000-0000-4000-8000-000000000900';
 v:=fn_save_club_owner_welcome_message(t.club_id,t.content,t.enabled,0,t.request_id);
 IF v->>'replayed'<>'true' OR (v->>'revision')::int<>1 THEN RAISE EXCEPTION 'Owner retry lost identity'; END IF;
 BEGIN PERFORM fn_save_club_owner_welcome_message(t.club_id,'Stale Owner',true,0,gen_random_uuid()); RAISE EXCEPTION 'Stale owner write succeeded'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
SELECT fn_save_club_welcome_message('00000000-0000-4000-8000-000000000900','Agent First',true,0,gen_random_uuid());
DO $$ BEGIN
 BEGIN PERFORM fn_save_club_owner_welcome_message('00000000-0000-4000-8000-000000000900','Forged Owner',true,0,gen_random_uuid()); RAISE EXCEPTION 'Agent edited owner slot'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO club_members(club_id,user_id,role,agent_id) VALUES('00000000-0000-4000-8000-000000000900','00000000-0000-4000-8000-000000000006','player','00000000-0000-4000-8000-000000000002');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ DECLARE q record; v jsonb; BEGIN
 SELECT * INTO q FROM club_messenger_owner_followups WHERE club_id='00000000-0000-4000-8000-000000000900';
 IF q.generation IS NULL OR q.status<>'pending' OR q.due_at<clock_timestamp()+interval '9 minutes 59 seconds' THEN RAISE EXCEPTION 'Ten minute followup not queued'; END IF;
 IF NOT EXISTS(SELECT 1 FROM social_messages m JOIN club_messenger_welcome_deliveries d ON d.message_id=m.id WHERE d.generation=q.generation AND m.sender_id='00000000-0000-4000-8000-000000000002' AND m.content='Agent First') THEN RAISE EXCEPTION 'Agent must send first'; END IF;
 v:=fn_dispatch_club_owner_welcomes(200); IF (v->>'sent')::int<>0 THEN RAISE EXCEPTION 'Owner sent early'; END IF;
END $$;
UPDATE club_messenger_owner_followups SET due_at=clock_timestamp()-interval '1 second' WHERE club_id='00000000-0000-4000-8000-000000000900';
SELECT fn_dispatch_club_owner_welcomes(200);
SELECT fn_dispatch_club_owner_welcomes(200);
DO $$ BEGIN
 IF (SELECT count(*) FROM social_messages WHERE content='Owner Ten Minute Welcome')<>1 THEN RAISE EXCEPTION 'Owner send duplicate or absent'; END IF;
END $$;
UPDATE club_messenger_welcome_templates SET enabled=false WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000001';
INSERT INTO club_members(club_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000900','00000000-0000-4000-8000-000000000007','player');
UPDATE club_messenger_welcome_templates SET enabled=true WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000001';
DO $$ DECLARE r text; g uuid; BEGIN
 SELECT conversation_id INTO g FROM club_messenger_staff_notice_groups WHERE club_id='00000000-0000-4000-8000-000000000900';
 IF g IS NULL THEN RAISE EXCEPTION 'Staff group missing'; END IF;
 FOREACH r IN ARRAY ARRAY['sub_agent','agent','super_agent','admin','co_owner'] LOOP
  UPDATE club_members SET role=r WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000007';
  IF (SELECT count(*) FROM social_conversation_participants WHERE conversation_id=g AND user_id='00000000-0000-4000-8000-000000000007')<>1 THEN RAISE EXCEPTION 'Promotion enrollment failed for %',r; END IF;
 END LOOP;
 UPDATE club_members SET role='player' WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000007';
 IF EXISTS(SELECT 1 FROM social_conversation_participants WHERE conversation_id=g AND user_id='00000000-0000-4000-8000-000000000007') THEN RAISE EXCEPTION 'Demoted member retained staff access'; END IF;
 BEGIN INSERT INTO social_conversation_participants(conversation_id,user_id) VALUES(g,'00000000-0000-4000-8000-000000000007'); RAISE EXCEPTION 'Player forged staff participation'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Rejoin first send is new, but a block placed before the delayed owner send
-- must be respected; an old completed generation cannot resend.
UPDATE club_members SET is_active=false WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000006';
UPDATE club_members SET is_active=true WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000006';
INSERT INTO messenger_blocked VALUES('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001');
UPDATE club_messenger_owner_followups SET due_at=clock_timestamp()-interval '1 second' WHERE status='pending';
SELECT fn_dispatch_club_owner_welcomes(200);
DO $$ BEGIN IF (SELECT count(*) FROM social_messages WHERE content='Owner Ten Minute Welcome')<>1 OR NOT EXISTS(SELECT 1 FROM club_messenger_owner_followups WHERE status='blocked') THEN RAISE EXCEPTION 'Delayed personal block bypassed'; END IF; END $$;
DELETE FROM messenger_blocked WHERE blocker_id='00000000-0000-4000-8000-000000000006';
UPDATE club_members SET is_active=false WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000006';
UPDATE club_members SET is_active=true WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000006';
UPDATE club_members SET is_active=false WHERE club_id='00000000-0000-4000-8000-000000000900' AND user_id='00000000-0000-4000-8000-000000000006';
UPDATE club_messenger_owner_followups SET due_at=clock_timestamp()-interval '1 second' WHERE status='pending';
SELECT fn_dispatch_club_owner_welcomes(200);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM club_messenger_owner_followups WHERE status='cancelled') THEN RAISE EXCEPTION 'Departed member welcome not cancelled'; END IF;
 IF (SELECT count(*) FROM social_messages WHERE content='Owner Ten Minute Welcome')<>1 THEN RAISE EXCEPTION 'Welcome delivered after departure'; END IF;
END $$;
-- Native thread deletion clears the mapping before the next role event.
DELETE FROM social_conversations WHERE id IN(SELECT conversation_id FROM club_messenger_staff_notice_groups WHERE club_id='00000000-0000-4000-8000-000000000900');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM club_messenger_staff_notice_groups WHERE club_id='00000000-0000-4000-8000-000000000900') THEN RAISE EXCEPTION 'Deleted group retained mapping'; END IF; END $$;
ROLLBACK;
