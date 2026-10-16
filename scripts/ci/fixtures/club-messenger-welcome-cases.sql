CREATE FUNCTION pg_temp.check_true(ok boolean,reason text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION '%',reason; END IF; END $$;
DO $$ DECLARE u uuid; r jsonb; first_save jsonb; req uuid:=gen_random_uuid(); BEGIN
 FOR n IN 1..5 LOOP
  u:=('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  r:=fn_save_club_welcome_message('00000000-0000-4000-8000-000000000100','Welcome From '||n,true,0,CASE WHEN n=2 THEN req ELSE gen_random_uuid() END);
  PERFORM pg_temp.check_true((r->>'revision')::int=1,'Five roles cannot save');
  PERFORM pg_temp.check_true(jsonb_array_length(fn_my_club_welcome_messages())=1,'Wrong own settings scope');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
 r:=fn_save_club_welcome_message('00000000-0000-4000-8000-000000000100','Welcome From 2',true,0,req);
 PERFORM pg_temp.check_true((r->>'replayed')::boolean AND (r->>'revision')::int=1,'Save retry duplicated revision');
END $$;
-- A pending request never sends. Admission followed by referral attachment in
-- the SAME transaction must never send the owner's message first.
INSERT INTO club_members(club_id,user_id,status) VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','pending');
SELECT pg_temp.check_true((SELECT count(*)=0 FROM social_messages),'Pending request sent');
BEGIN;
UPDATE club_members SET status='active' WHERE user_id='00000000-0000-4000-8000-000000000010';
UPDATE club_members SET agent_id='00000000-0000-4000-8000-000000000002' WHERE user_id='00000000-0000-4000-8000-000000000010';
SELECT pg_temp.check_true((SELECT count(*)=0 FROM social_messages),'Message sent before commit');
COMMIT;
SELECT pg_temp.check_true((SELECT count(*)=1 AND min(content)='Welcome From 2' FROM social_messages),'Final assignment did not win');
UPDATE club_members SET status='active',agent_id='00000000-0000-4000-8000-000000000002' WHERE user_id='00000000-0000-4000-8000-000000000010';
SELECT pg_temp.check_true((SELECT count(*)=1 FROM social_messages),'Duplicate update resent');
INSERT INTO club_members(club_id,user_id) VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011');
SELECT pg_temp.check_true((SELECT count(*)=1 FROM social_messages WHERE content='Welcome From 1'),'No-agent owner fallback missing');
UPDATE club_members SET agent_id='00000000-0000-4000-8000-000000000004' WHERE user_id='00000000-0000-4000-8000-000000000010';
SELECT pg_temp.check_true((SELECT count(*)=1 FROM social_messages WHERE content='Welcome From 4'),'New downline assignment not introduced');
BEGIN;
UPDATE club_members SET status='left',is_active=false,membership_lifecycle_status='departed' WHERE user_id='00000000-0000-4000-8000-000000000010';
UPDATE club_members SET status='active',is_active=true,membership_lifecycle_status='active' WHERE user_id='00000000-0000-4000-8000-000000000010';
COMMIT;
SELECT pg_temp.check_true((SELECT count(*)=2 FROM social_messages WHERE content='Welcome From 4'),'Rejoin admission missing');
UPDATE club_messenger_welcome_templates SET enabled=false WHERE user_id='00000000-0000-4000-8000-000000000003';
INSERT INTO club_members(club_id,user_id,agent_id) VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000003');
UPDATE club_messenger_welcome_templates SET enabled=true WHERE user_id='00000000-0000-4000-8000-000000000003';
UPDATE club_members SET status='active' WHERE user_id='00000000-0000-4000-8000-000000000012';
SELECT pg_temp.check_true((SELECT count(*)=0 FROM social_messages WHERE content='Welcome From 3'),'Enabling template retroactively sent');
BEGIN;
INSERT INTO club_members(club_id,user_id) VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000013');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.check_true((SELECT count(*)=1 FROM club_messenger_welcome_deliveries WHERE recipient_id='00000000-0000-4000-8000-000000000013'),'Rollback fixture never exercised delivery');
ROLLBACK;
SELECT pg_temp.check_true((SELECT count(*)=0 FROM club_messenger_admissions WHERE user_id='00000000-0000-4000-8000-000000000013'),'Rolled back join leaked');
INSERT INTO messenger_blocked VALUES('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001');
INSERT INTO club_members(club_id,user_id) VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000014');
SELECT pg_temp.check_true((SELECT count(*)=1 FROM club_messenger_welcome_deliveries WHERE status='blocked'),'Block bypassed');
SELECT pg_temp.check_true((SELECT count(*)=2 FROM social_conversation_participants GROUP BY conversation_id LIMIT 1),'Not a private pair');
SELECT pg_temp.check_true((SELECT count(*)=1 FROM fn_messenger_club_relationships('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000004'::uuid]) WHERE label='Your Sub Agent In Shark Club'),'Direct upline missing');
SELECT pg_temp.check_true((SELECT count(*)=1 FROM fn_messenger_club_relationships('00000000-0000-4000-8000-000000000004',ARRAY['00000000-0000-4000-8000-000000000003'::uuid]) WHERE label='Your Super Agent In Shark Club'),'Agent upline chain missing');
SELECT pg_temp.check_true((SELECT count(*)=1 FROM fn_messenger_club_relationships('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000001'::uuid]) WHERE label='Owner Of Shark Club'),'Owner role missing');
SELECT pg_temp.check_true((SELECT count(*)=0 FROM fn_messenger_club_relationships('00000000-0000-4000-8000-000000000010',ARRAY['00000000-0000-4000-8000-000000000008'::uuid])),'Cross-club identity leaked');

-- A sender restricted from social actions must not block the player's join.
INSERT INTO welcome_restricted_fixture VALUES('00000000-0000-4000-8000-000000000001');
INSERT INTO club_members(club_id,user_id) VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000015');
SELECT pg_temp.check_true((SELECT count(*)=1 FROM club_messenger_welcome_deliveries WHERE recipient_id='00000000-0000-4000-8000-000000000015' AND status='blocked'),'Restricted sender bypassed or join failed');
DELETE FROM welcome_restricted_fixture;
UPDATE agents SET status='inactive' WHERE user_id='00000000-0000-4000-8000-000000000002';
INSERT INTO club_members(club_id,user_id,agent_id) VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000002');
SELECT pg_temp.check_true((SELECT count(*)=1 FROM club_messenger_welcome_deliveries WHERE recipient_id='00000000-0000-4000-8000-000000000016' AND sender_id='00000000-0000-4000-8000-000000000001'),'Inactive assigned agent did not use owner fallback');
SELECT pg_temp.check_true((SELECT count(*)=0 FROM social_messages WHERE id IN(SELECT message_id FROM club_messenger_welcome_deliveries WHERE recipient_id='00000000-0000-4000-8000-000000000013')),'Rolled back native message survived');
