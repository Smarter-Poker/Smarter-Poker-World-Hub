import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join,resolve } from 'node:path';
import net from 'node:net';
const root=resolve(import.meta.dirname,'..');
const migration=join(root,'supabase/migrations/20261012152000_notification_delivery_policy.sql');
// Fixture identity data comes from the immutable routing preflight, never a
// sign-in identity or credential. This test uses only its disposable localhost DB.
const policySql=readFileSync(migration,'utf8');
const accountBindings=[...policySql.matchAll(/\(id='([0-9a-f-]+)' AND lower\(email\)='([^']+)'\)/g)].map(match=>({id:match[1],email:match[2]}));
const original=readFileSync(join(root,'__tests__/fixtures/notification-delivery/original.sql'),'utf8');
const owner='47965354-0e56-43ef-931c-ddaab82af765', gmail='3bb71bfe-f723-427c-aac7-a853ba04a014',player='11111111-1111-4111-8111-111111111111';
const bin=process.env.PG17_BINDIR || (existsSync('/opt/homebrew/opt/postgresql@17/bin')?'/opt/homebrew/opt/postgresql@17/bin':'/usr/lib/postgresql/17/bin');
test('real PostgreSQL routes the original seat trigger to push only and guards every database writer',async()=>{
 assert.deepEqual(accountBindings.map(row=>row.id).sort(),[owner,gmail].sort(),'exact verified routing accounts seed only the local fixture');
 const base=process.env.NOTIFICATION_POLICY_POSTGRES_ROOT;
 assert.ok(base && existsSync(base),'An owned PostgreSQL scratch directory is required');
 const scratch=mkdtempSync(join(base,'notification-pg-'));const data=join(scratch,'data');
 const server=net.createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;await new Promise(done=>server.close(done));
 const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
 const q=sql=>execFileSync(join(bin,'psql'),[...args,'-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const apply=()=>execFileSync(join(bin,'psql'),[...args,'-f',migration],{encoding:'utf8',stdio:['ignore','pipe','pipe']});let started=false;
 try {
  execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale'],{stdio:'pipe'});
  execFileSync(join(bin,'pg_ctl'),['-D',data,'-l',join(scratch,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1 -k ''`,'-w','start'],{stdio:'pipe'});started=true;
  q(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);INSERT INTO auth.users VALUES ${accountBindings.map(row=>`('${row.id}','${row.email}')`).join(',')},('${player}','player@example.invalid');
   CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,message text,link text,action_url text,data jsonb,created_at timestamptz DEFAULT now());
   CREATE TABLE push_outbox(id uuid DEFAULT gen_random_uuid(),recipient_user_id uuid,title text,body text,url text,event text,tag text,status text,claimed_at timestamptz,failure_reason text,related_entity_id uuid);
   CREATE FUNCTION fn_mirror_notification_to_push_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO push_outbox(recipient_user_id,event,title,status) VALUES(NEW.user_id,NEW.type,NEW.title,'pending');RETURN NEW;END $$;
   CREATE TRIGGER mirror AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fn_mirror_notification_to_push_outbox();
   CREATE TABLE tables(id uuid PRIMARY KEY,tournament_id uuid);CREATE TABLE tournaments(id uuid PRIMARY KEY,name text);
   CREATE TABLE seats(id uuid DEFAULT gen_random_uuid(),user_id uuid,table_id uuid,is_sitting_out boolean,is_away boolean,left_at timestamptz,stack numeric);
   ${original}
   CREATE TRIGGER blinding AFTER UPDATE ON seats FOR EACH ROW EXECUTE FUNCTION fn_notify_blinding_off();
   INSERT INTO tournaments VALUES('22222222-2222-4222-8222-222222222222','Policy Tournament');
   INSERT INTO tables VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222');
   INSERT INTO seats(user_id,table_id,is_sitting_out,is_away,stack) VALUES('${player}','33333333-3333-4333-8333-333333333333',false,false,25000);
   UPDATE seats SET is_away=true;
   INSERT INTO notifications(user_id,type,title) VALUES('${player}','system','Push Health Alert');`);
  assert.equal(q("SELECT count(*) FROM notifications WHERE type='tournament_blinding_off'"),'1','before: original real seat trigger saves the unwanted notice');
  assert.equal(q("SELECT count(*) FROM notifications WHERE title='Push Health Alert'"),'1','before: non-owner receives operational alert');
  q('TRUNCATE push_outbox');apply();
  assert.equal(q('SELECT count(*) FROM notifications'),'0');assert.equal(q('SELECT count(*) FROM notification_delivery_policy_archive'),'2');
  assert.equal(q('SELECT count(*) FROM push_outbox'),'0','cleanup never pushes historical notices again');
  q('UPDATE seats SET is_away=false; UPDATE seats SET is_away=true;');
  assert.equal(q('SELECT count(*) FROM notifications'),'0');assert.equal(q("SELECT count(*) FROM push_outbox WHERE event='tournament_blinding_off' AND status='pending'"),'1');
  assert.match(q("SELECT body FROM push_outbox WHERE event='tournament_blinding_off'"),/25,000 chips left/,'original gameplay content retained');
  q('UPDATE seats SET is_away=true;');assert.equal(q('SELECT count(*) FROM push_outbox'),'1','no repeated push while still away');
  for(const marker of ['inline','none'])q(`INSERT INTO notifications(user_id,type,title,data) VALUES('${player}','tournament_blinding_off','Blind','{"_push":"${marker}"}');`);
  assert.equal(q('SELECT count(*) FROM notifications'),'0');assert.equal(q('SELECT count(*) FROM push_outbox'),'1','inline producer is not duplicated');
  for(const id of [owner,gmail,player])q(`INSERT INTO notifications(user_id,type,title) VALUES('${id}','system','Push Health Alert');`);
  assert.equal(q("SELECT count(*) FROM notifications WHERE title='Push Health Alert'"),'2');
  q(`INSERT INTO push_outbox(recipient_user_id,event,title,status) VALUES('${player}','system','Push Health Alert','processing');`);
  assert.equal(q(`SELECT status||':'||failure_reason FROM push_outbox WHERE recipient_user_id='${player}' AND event='system'`),'skipped:platform_alert_recipient_not_allowed');
  q(`UPDATE push_outbox SET status='pending' WHERE recipient_user_id='${player}' AND event='system'`);
  assert.equal(q(`SELECT status FROM push_outbox WHERE recipient_user_id='${player}' AND event='system'`),'skipped','update cannot re-enable forbidden recipient');
  q(`INSERT INTO notifications(user_id,type,title) VALUES('${player}','accounting_invoice','Receipt'),('${player}','new_message','Player Message');`);
  assert.equal(q(`SELECT count(*) FROM notifications WHERE user_id='${player}'`),'2','unrelated receipts/messages retained');
  assert.equal(q("SELECT count(*) FROM pg_proc WHERE proname IN('fn_notification_delivery_guard','fn_platform_push_recipient_guard') AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, public']"),'2');
  assert.equal(q("SELECT has_table_privilege('authenticated','notification_delivery_policy_archive','SELECT')"),'f');
  assert.throws(apply,/replay refused/);
 } finally {if(started)execFileSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});rmSync(scratch,{recursive:true,force:true});}
});
