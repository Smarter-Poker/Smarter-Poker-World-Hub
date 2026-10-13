import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root = process.cwd();
const parent = process.env.VIDEO_CHANNEL_PG_WORK_PARENT || process.argv[2] || `${root}/work`;
const evidence = process.env.VIDEO_CHANNEL_PG_EVIDENCE_DIR || '/Volumes/SmarterArchives/agent-evidence/video-library-phase5-20261013';
if (process.platform === 'darwin') {
 if (!path.resolve(parent).startsWith('/Volumes/SmarterWork/agent-work/') || !path.resolve(evidence).startsWith('/Volumes/SmarterArchives/agent-evidence/')) throw new Error('Mac qualification requires owned external SSD work and evidence');
 const disks = execFileSync('df', ['/Volumes/SmarterWork', '/'], {encoding:'utf8'}).trim().split('\n').slice(1).map(line=>line.trim().split(/\s+/)[0]);
 if (disks[0] === disks[1]) throw new Error('SmarterWork must be a separately mounted SSD');
} else if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.VIDEO_CHANNEL_PG_WORK_PARENT || !process.env.VIDEO_CHANNEL_PG_EVIDENCE_DIR) {
 throw new Error('Non-Mac qualification requires explicit isolated GitHub Actions work and evidence parents');
}
mkdirSync(parent, {recursive:true}); mkdirSync(evidence,{recursive:true});
const work = mkdtempSync(path.join(realpathSync(parent), 'vlpg-'));
const bin=process.env.PHASE6_POSTGRES_BIN || process.argv[3] || '/opt/homebrew/bin';
assert.match(execFileSync(`${bin}/postgres`, ['--version'], {encoding:'utf8'}), /PostgreSQL\) 17\./, 'Exact PostgreSQL 17 is required');
const socket=work, port='5432';
if (Buffer.byteLength(socket) + 15 >= 108) { rmSync(work,{recursive:true,force:true}); throw new Error('Choose a shorter private PostgreSQL socket parent'); }
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key])=> !key.startsWith('PG') && key !== 'DATABASE_URL'));
const args=['-h',socket,'-p',port,'-U','video_channel_fixture','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'];
function sql(text) { return execFileSync(`${bin}/psql`,args,{input:text,encoding:'utf8',env:childEnv}); }
const migration=readFileSync(`${root}/supabase/migrations/20261013141500_video_library_channel_follows.sql`,'utf8');
const names=[...migration.matchAll(/\('[A-Z_]+','([^']+)'\)/g)].map(m=>m[1]);
const values=names.map((name,i)=>`(gen_random_uuid(),'${name}','youtube_channel','youtube','creator_uploads','active',true,'UC${String(i).padStart(22,'0')}')`).join(',');
const mirror=readFileSync(`${root}/supabase/migrations/20260820001500_webpush_mirror_reconcile_tag_and_burst_guards.sql`,'utf8');
const mirrorFn=mirror.slice(mirror.indexOf('CREATE OR REPLACE FUNCTION public.fn_mirror_notification_to_push_outbox()'),mirror.indexOf('$fn$;')+5);
const policySource=readFileSync(`${root}/supabase/migrations/20261012152000_notification_delivery_policy.sql`,'utf8');
const policyFunctions=policySource.slice(policySource.indexOf('CREATE FUNCTION public.fn_is_platform_operational_alert'),policySource.indexOf('CREATE TABLE public.notification_delivery_policy_archive'));
const report={startedAt:new Date().toISOString(),postgres:'17',migration:'20261013141500_video_library_channel_follows.sql',migrationSHA256:createHash('sha256').update(migration).digest('hex'),mirrorSHA256:createHash('sha256').update(mirrorFn).digest('hex'),deliveryPolicySHA256:createHash('sha256').update(policyFunctions).digest('hex'),cases:[],status:'running'};
function check(name,statement,expected){const actual=sql(statement).trim();assert.equal(actual,expected,name);report.cases.push({name,status:'passed',actual});}
try {
 execFileSync(`${bin}/initdb`,['-D',`${work}/data`,'-U','video_channel_fixture','--auth=trust','--no-locale','-E','UTF8'],{stdio:'ignore',env:childEnv});
 execFileSync(`${bin}/pg_ctl`,['-D',`${work}/data`,'-l',`${work}/server.log`,'-o',`-p ${port} -k ${socket} -c listen_addresses=''`,'start'],{stdio:'ignore',env:childEnv});
 sql(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS extensions CASCADE;
 DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END$$;
 CREATE SCHEMA auth; CREATE SCHEMA extensions;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;
 CREATE TABLE profiles(id uuid PRIMARY KEY);
 INSERT INTO profiles VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 CREATE TABLE content_sources(id uuid PRIMARY KEY,name text,kind text,provider text,ingestion_mode text,lifecycle_status text,is_active boolean,provider_source_id text);
 INSERT INTO content_sources VALUES ${values};
 CREATE TABLE video_library_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),youtube_video_id text UNIQUE,source_id text,provider_channel_id text,title text,type text DEFAULT 'cash',published_at timestamptz DEFAULT now(),scraped_at timestamptz DEFAULT now(),availability_status text,embeddable boolean,availability_checked_at timestamptz,moderation_state text DEFAULT 'active',taken_down_at timestamptz);
 CREATE VIEW video_library_public_catalog AS SELECT * FROM video_library_videos WHERE availability_status='verified' AND embeddable AND moderation_state IN('active','restored') AND taken_down_at IS NULL AND availability_checked_at BETWEEN now()-interval '7 days' AND now()+interval '5 minutes';
 CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,message text,link text,action_url text,data jsonb,actor_id uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE push_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_user_id uuid,title text,body text,url text,event text,tag text,status text,related_entity_id uuid,claimed_at timestamptz,failure_reason text);
 ${mirrorFn}
 CREATE TRIGGER trg_mirror_notification_to_push_outbox AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fn_mirror_notification_to_push_outbox();
 ${policyFunctions}`);
 check('before migration caller-bound channel follow capability absent',`SELECT to_regprocedure('public.set_video_library_channel_follow(uuid,uuid,boolean,boolean)') IS NULL;`,'t');
 sql(migration);
 const hcl=sql("SELECT source_id FROM video_library_channel_aliases WHERE source_key='HCL'").trim();
 const asUser=(body,user='11111111-1111-4111-8111-111111111111')=>`BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${user}',true);${body};COMMIT;`;
 sql(asUser(`SELECT set_video_library_channel_follow('11111111-1111-4111-8111-111111111111','${hcl}',true,true)`));
 sql(asUser(`SELECT set_video_library_channel_follow('11111111-1111-4111-8111-111111111111','${hcl}',true,true)`));
 check('repeated desired-state follow creates one record',`SELECT count(*) FROM video_library_channel_follows`,'1');
 check('RLS denies other account read',asUser(`SELECT count(*) FROM video_library_channel_follows`,'22222222-2222-4222-8222-222222222222').split(';').filter(x=>!x.startsWith('SELECT set_config')).join(';'),'0');
 const mismatch=spawnSync(`${bin}/psql`,args,{input:asUser(`SELECT set_video_library_channel_follow('22222222-2222-4222-8222-222222222222','${hcl}',true,true)`),encoding:'utf8',env:childEnv});
 assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/Unauthorized: owner mismatch/);report.cases.push({name:'cross-account setter denied',status:'passed'});
 const direct=spawnSync(`${bin}/psql`,args,{input:asUser(`INSERT INTO video_library_channel_follows VALUES('11111111-1111-4111-8111-111111111111','${hcl}',true,now(),now())`),encoding:'utf8',env:childEnv});
 assert.notEqual(direct.status,0);assert.match(direct.stderr,/permission denied/);report.cases.push({name:'direct authenticated writes denied',status:'passed'});
 function insert(id,overrides=''){if(overrides.startsWith('title=')){sql(`INSERT INTO video_library_videos(youtube_video_id,source_id,title,availability_status,embeddable,availability_checked_at) VALUES('${id}','HCL',${overrides.slice(6)},'verified',true,now())`);return;} if(overrides==='embeddable=false'){sql(`INSERT INTO video_library_videos(youtube_video_id,source_id,title,availability_status,embeddable,availability_checked_at) VALUES('${id}','HCL','New Poker Hand','verified',false,now())`);return;}sql(`INSERT INTO video_library_videos(youtube_video_id,source_id,title,availability_status,embeddable,availability_checked_at${overrides?','+overrides.split('=')[0]:''}) VALUES('${id}','HCL','New Poker Hand','verified',true,now()${overrides?','+overrides.slice(overrides.indexOf('=')+1):''})`);}
 insert('11111111111');
 check('real migration trigger generates one in-app notification',`SELECT count(*) FROM notifications WHERE type='video_library_upload'`,'1');
 check('actual maintained mirror generates one linked push outbox event',`SELECT count(*) FROM push_outbox o JOIN notifications n ON o.related_entity_id=n.id WHERE o.event='video_library_upload' AND o.status='pending' AND o.url='/hub/video-library/watch/11111111111'`,'1');
 sql(`UPDATE video_library_videos SET availability_checked_at=now(),availability_status='verified' WHERE youtube_video_id='11111111111'`);
 check('duplicate verification refresh cannot repeat notification',`SELECT count(*) FROM notifications`,'1');
 sql(`DELETE FROM video_library_videos WHERE youtube_video_id='11111111111'`);insert('11111111111');
 check('delete and reinsert keeps durable YouTube receipt',`SELECT count(*) FROM notifications`,'1');
 sql(asUser(`SELECT set_video_library_channel_follow('11111111-1111-4111-8111-111111111111','${hcl}',true,false)`));insert('22222222222');
 check('channel notification opt-out blocks both destinations',`SELECT (SELECT count(*) FROM notifications)||':'||(SELECT count(*) FROM push_outbox)`,'1:1');
 sql(asUser(`SELECT set_video_library_channel_follow('11111111-1111-4111-8111-111111111111','${hcl}',true,true)`));
 insert('33333333333',"moderation_state='taken_down'");
 check('moderation gate blocks upload alert',`SELECT count(*) FROM notifications`,'1');
 sql("UPDATE video_library_videos SET moderation_state='active' WHERE youtube_video_id='33333333333'");
 check('first eligible transition alerts once',`SELECT count(*) FROM notifications`,'2');
 sql("UPDATE video_library_videos SET moderation_state='taken_down' WHERE youtube_video_id='33333333333';UPDATE video_library_videos SET moderation_state='active' WHERE youtube_video_id='33333333333'");
 check('repeated moderation transitions do not replay upload alert',`SELECT count(*) FROM notifications`,'2');
 insert('9PrLmIWU0mU');
 check('central blocked video remains excluded from notifications',`SELECT count(*) FROM notifications`,'2');
 insert('66666666666',"title='Blackjack Live'");
 check('casino misfiled as poker excluded from notifications',`SELECT count(*) FROM notifications`,'2');
 insert('77777777777',"embeddable=false");
 check('non-embeddable upload excluded from notifications',`SELECT count(*) FROM notifications`,'2');
 insert('44444444444',"published_at=now()-interval '1 day'");
 check('historical upload does not backfill after follow',`SELECT count(*) FROM notifications`,'2');
 sql(asUser(`SELECT set_video_library_channel_follow('11111111-1111-4111-8111-111111111111','${hcl}',false,true)`));insert('55555555555');
 check('unfollow blocks new events',`SELECT count(*) FROM notifications`,'2');
 const newSource=sql("INSERT INTO content_sources VALUES(gen_random_uuid(),'New Creator','youtube_channel','youtube','creator_uploads','active',true,'UC9999999999999999999999') RETURNING id").trim();
 sql(asUser(`SELECT set_video_library_channel_follow('11111111-1111-4111-8111-111111111111','${newSource}',true,true)`));
 sql(`INSERT INTO video_library_videos(youtube_video_id,source_id,title,availability_status,embeddable,availability_checked_at) VALUES('88888888888','${newSource}','New Poker Hand','verified',true,now())`);
 check('creator registered after migration notifies using canonical UUID fallback',`SELECT count(*) FROM notifications`,'3');
 const concurrent=()=>new Promise((resolve,reject)=>{const child=spawn(`${bin}/psql`,args,{env:childEnv});let error='';child.stderr.on('data',chunk=>error+=chunk);child.stdout.resume();child.on('close',code=>code===0?resolve():reject(Error(error)));child.stdin.end(asUser(`SELECT set_video_library_channel_follow('11111111-1111-4111-8111-111111111111','${newSource}',true,true);SELECT pg_sleep(0.2)`));});
 await Promise.all([concurrent(),concurrent()]);
 check('concurrent identical desired-state requests retain one canonical follow',`SELECT count(*) FROM video_library_channel_follows WHERE source_id='${newSource}'`,'1');
 const replay=spawnSync(`${bin}/psql`,args,{input:migration,encoding:'utf8',env:childEnv});assert.notEqual(replay.status,0);assert.match(replay.stderr,/replay refused/);report.cases.push({name:'migration replay refused',status:'passed'});
 report.status='passed';
} catch(error){report.status='failed';report.error=error.message;process.exitCode=1;} finally {
 let stopped=false;
 try{execFileSync(`${bin}/pg_ctl`,['-D',`${work}/data`,'stop','-m','fast'],{stdio:'ignore',env:childEnv});stopped=true;}catch(error){report.cleanupError=error.message;process.exitCode=1;report.status='failed';}
 if (stopped) rmSync(work,{recursive:true,force:true});
 report.completedAt=new Date().toISOString();writeFileSync(`${evidence}/channel-sql-qualification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,error:report.error}));
}
