#!/usr/bin/env node
// Execute the maintained RPC in an isolated native PG17 cluster, never production.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
// The required hosted job must provision its exact server before this verifier.
// Ubuntu's stock PG16 cannot satisfy the production PG17 contract.
const workflow=readFileSync(join(root,'.github/workflows/build-safety-gate.yml'),'utf8');
const installAt=workflow.indexOf('name: Install PostgreSQL 17 For Training Authority On Linux Runners');
const resolveAt=workflow.indexOf('name: Resolve Exact PostgreSQL 17 Training Test Binaries');
const ownAt=workflow.indexOf('name: Atomic actual-own-hand publication qualification');
assert(installAt>=0&&resolveAt>installAt&&ownAt>resolveAt,'Required own-hand qualification must follow exact PG17 provisioning');
assert.match(workflow.slice(ownAt,workflow.indexOf('\n      - name:',ownAt+1)),/PG17_BINDIR: \$\{\{ env\.PHASE6_POSTGRES_BIN \}\}/);
const mac=process.platform==='darwin',work=mac?'/Volumes/SmarterWork/agent-work':process.env.RUNNER_TEMP;
assert(work,'Configured private runner scratch required');
const archives=mac?'/Volumes/SmarterArchives/agent-evidence':work;
if(mac){assert.notEqual(statSync(work).dev,statSync('/').dev);assert.notEqual(statSync(archives).dev,statSync('/').dev);assert(statfsSync(work).bavail*statfsSync(work).bsize>64*1024*1024);}
const pg=[process.env.PG17_BINDIR,'/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin'].find(p=>p&&existsSync(join(p,'initdb')));assert(pg,'Native PG17 required, no skipped test');
const cluster=mkdtempSync(join(work,'grounded-hand-pg-')),socket=join(cluster,'socket');mkdirSync(socket,{mode:0o700});
const outIndex=process.argv.indexOf('--output');
const output=outIndex<0?mkdtempSync(join(archives,'grounded-hand-proof-')):resolve(process.argv[outIndex+1]);assert(output.startsWith(archives+'/'));mkdirSync(output,{recursive:true});
const env={...process.env,TMPDIR:cluster};for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];
const connection=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-p','55487','-U','postgres','-d','postgres'];
const command=(bin,args,input,timeout=15000)=>spawnSync(join(pg,bin),args,{input,encoding:'utf8',env,timeout});
const cases=[];let running=false,passed=false;
function sql(name,q,{code,expected}={}){const r=command('psql',connection,'\\set VERBOSITY verbose\n'+q+'\n');writeFileSync(join(output,name+'.log'),(r.stdout||'')+(r.stderr||''));const ok=code?r.status!==0&&r.stderr.includes(' '+code+':'):r.status===0&&(expected===undefined||r.stdout.trim()===expected);cases.push({name,passed:ok,expectedCode:code??null});assert(ok,name+': '+r.stdout+r.stderr);return r.stdout.trim();}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const brief={kind:'hand',domain:'poker',title:'a hand from the tables',source:'club arena',people:[],teams:[],concepts:['big_win'],amounts:[],tone:'admiring',isQuestion:false,confidence:1,builtFrom:['horse_hand_reviews']};
const call=(n=1,o={})=>`SELECT coalesce(social_post_id::text,'')||'|'||created||'|'||reason FROM public.publish_horse_grounded_hand('${id(n)}',${o.review??n},${quote(o.text??'My pocket aces held up at showdown')},${quote(o.phrase??'my pocket aces held up at showdown')},${quote(o.semantic??'grounded:hand:'+id(100+n))},${quote(o.frame??'frame:voice:big_win:0')},'fleet:${id(n)}:${o.slot??'2026-10-19T18'}',${quote(JSON.stringify({...brief,...o.brief}))}::jsonb);`;
const service=q=>`SET request.jwt.claim.role='service_role';${q}`;
const counts="SELECT (SELECT count(*) FROM social_posts)||':'||(SELECT count(*) FROM horse_phrase_ledger)||':'||(SELECT count(*) FROM post_briefs)||':'||(SELECT count(*) FROM rewards);";
const reset=`TRUNCATE social_posts,horse_phrase_ledger,post_briefs,rewards;UPDATE profiles SET diamonds=0,status='active',horse_status='available';UPDATE content_settings SET engine_enabled=true,auto_publish=true;UPDATE horse_post_modes SET enabled=true,approved_at=now(),approved_by='owner';UPDATE caption_model_budget_settings SET enabled=false,daily_budget_microusd=0;UPDATE hand_history SET ended_at=now()-interval '1 hour';UPDATE horse_hand_reviews SET review_status='auto_reviewed',played_at=now()-interval '1 hour';`;
async function race(q){return new Promise((ok,fail)=>{const p=spawn(join(pg,'psql'),connection,{env,stdio:['pipe','pipe','pipe']});let a='',b='';p.stdout.on('data',v=>a+=v);p.stderr.on('data',v=>b+=v);p.once('error',fail);p.once('exit',c=>c===0?ok(a.trim()):fail(Error(b)));p.stdin.end(service(q));});}
async function withLocker(statement,run){
 const p=spawn(join(pg,'psql'),connection,{env,stdio:['pipe','pipe','pipe']});let text='';
 const ended=new Promise((ok,fail)=>{p.once('error',fail);p.once('exit',c=>c===0?ok():fail(Error('Locker failed '+c)));});
 try{await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('Locker readiness timeout')),5000);p.stdout.on('data',v=>{text+=v;if(text.includes('LOCK_READY')){clearTimeout(timer);ok();}});p.stderr.on('data',v=>{clearTimeout(timer);fail(Error(String(v)));});p.stdin.write('BEGIN;'+statement+'\n\\echo LOCK_READY\n');});await run(p);}
 finally{if(!p.stdin.destroyed)p.stdin.end('ROLLBACK;\n\\q\n');await ended;}
}
try{
 assert.match(command('postgres',['--version']).stdout,/\b17\./);
 assert.equal(command('initdb',['-D',join(cluster,'data'),'-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'],undefined,30000).status,0);
 writeFileSync(join(cluster,'data/postgresql.auto.conf'),`listen_addresses=''\nunix_socket_directories='${socket}'\nunix_socket_permissions=0700\nport=55487\nshared_buffers='16MB'\nmax_connections=10\n`);
 assert.equal(command('pg_ctl',['-D',join(cluster,'data'),'-l',join(cluster,'server.log'),'-w','start'],undefined,30000).status,0);running=true;
 sql('fixture',`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA extensions;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE TABLE ca_money_rpc_registry(proname text PRIMARY KEY,status text,notes text);
 CREATE TABLE profiles(id uuid PRIMARY KEY,is_horse boolean,status text,horse_status text,avatar_url text,diamonds integer DEFAULT 0);
 CREATE TABLE content_authors(profile_id uuid PRIMARY KEY,is_active boolean);
 CREATE TABLE content_settings(engine_enabled boolean,auto_publish boolean);
 CREATE TABLE caption_model_budget_settings(enabled boolean,daily_budget_microusd bigint);
 CREATE TABLE horse_post_modes(mode text PRIMARY KEY,enabled boolean,approved_at timestamptz,approved_by text);
 INSERT INTO content_settings VALUES(true,true);INSERT INTO caption_model_budget_settings VALUES(false,0);INSERT INTO horse_post_modes VALUES('grounded_hand',true,now(),'owner');
 INSERT INTO profiles SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,true,'active','available','https://approved.example/avatar',0 FROM generate_series(1,4)n;
 INSERT INTO content_authors SELECT id,true FROM profiles;
 CREATE TABLE hand_history(id uuid PRIMARY KEY,ended_at timestamptz);
 CREATE TABLE horse_hand_reviews(id bigint PRIMARY KEY,hand_id uuid,horse_user_id uuid,played_at timestamptz,review_status text,hole_cards jsonb,actions jsonb,net_bb numeric);
 INSERT INTO hand_history SELECT ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,now()-interval '1 hour' FROM generate_series(1,4)n;
 INSERT INTO horse_hand_reviews SELECT n,('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()-interval '1 hour','auto_reviewed','[{"rank":"A","suit":"s"},{"rank":"A","suit":"h"}]','[{"action":"raise"}]',40 FROM generate_series(1,4)n;
 CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid,content text,content_type text,media_urls jsonb,visibility text,audience_mode text,topic text,topics text[],origin_type text,metadata jsonb,created_at timestamptz DEFAULT now(),is_deleted boolean DEFAULT false);
 CREATE UNIQUE INDEX uq_slot ON social_posts((metadata->>'publication_key')) WHERE metadata->>'publication_key' IS NOT NULL;
 CREATE TABLE horse_phrase_ledger(id bigint GENERATED ALWAYS AS IDENTITY,phrase_norm text,horse_id uuid,post_id uuid,used_at timestamptz DEFAULT now());
 CREATE TABLE post_briefs(post_id uuid PRIMARY KEY,kind text,domain text,sport text,title text,source text,people text[],teams text[],concepts text[],amounts text[],topic text,tone text,is_question boolean,confidence numeric,summary text,built_from text[]);
 CREATE TABLE rewards(post_id uuid PRIMARY KEY,author_id uuid);
 CREATE FUNCTION fixture_reward() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE profiles SET diamonds=diamonds+1 WHERE id=NEW.author_id;INSERT INTO rewards VALUES(NEW.id,NEW.author_id);RETURN NEW;END$$;
 CREATE TRIGGER ordinary_reward AFTER INSERT ON social_posts FOR EACH ROW EXECUTE FUNCTION fixture_reward();`);
 const path=join(root,'supabase/migrations/20261019183000_grounded_hand_atomic_publication.sql');
 if(existsSync(path))sql('install-exact-maintained-migration',readFileSync(path,'utf8'));
 const first=sql('complete-atomic-publication',service(call()));assert.match(first,/\|true\|published$/);
 sql('all-four-effects-once',counts,{expected:'1:3:1:1'});
 sql('public-hands-tab-predicate',"SELECT count(*) FROM social_posts WHERE topics @> ARRAY['hand'] AND topic='poker'",{expected:'1'});
 sql('replay-identical-no-effects',service(call()),{expected:first.replace('|true|published','|false|already_published')});sql('reward-not-duplicated',counts,{expected:'1:3:1:1'});
 sql('wrong-replay-conflicts',service(call(1,{text:'Different claim',phrase:'different claim'})),{expected:'|false|duplicate_slot'});
 sql('later-slot-cadence',service(call(1,{slot:'2026-10-19T19'})),{expected:'|false|posted_recently'});
 for(const role of ['anon','authenticated'])sql('deny-'+role,`SET ROLE ${role};${call()}`,{code:'42501'});
 sql('deny-no-service-claim',call(),{code:'42501'});
 sql('reset',reset);
 sql('wrong-owner',service(call(2,{review:1,semantic:'grounded:hand:'+id(101)})),{code:'42501'});
 sql('wrong-actual-hand-key',service(call(1,{semantic:'grounded:hand:'+id(999)})),{code:'22023'});
 sql('mismatched-normalized-phrase',service(call(1,{phrase:'wrong'})),{code:'22023'});
 for(const [name,fault] of Object.entries({inactive:"UPDATE profiles SET horse_status='disabled'",retired:"UPDATE profiles SET status='deleted'",master:'UPDATE content_settings SET engine_enabled=false',mode:'UPDATE horse_post_modes SET enabled=false',unapproved:'UPDATE horse_post_modes SET approved_at=NULL',model:'UPDATE caption_model_budget_settings SET enabled=true',stale:"UPDATE horse_hand_reviews SET played_at=now()-interval '8 days'",future:"UPDATE horse_hand_reviews SET played_at=now()+interval '1 hour'",unfinished:'UPDATE hand_history SET ended_at=NULL',pending:"UPDATE horse_hand_reviews SET review_status='pending'"})){
  sql('reset-'+name,reset);sql('fault-'+name,fault);sql('refuse-'+name,service(call()),{code:'42501'});sql('no-effects-'+name,counts,{expected:'0:0:0:0'});
 }
 sql('reset-final-fault',reset);sql('add-final-brief-fault',`CREATE FUNCTION fail_brief() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'brief fault';END$$;CREATE TRIGGER final_brief_failure BEFORE INSERT ON post_briefs FOR EACH ROW EXECUTE FUNCTION fail_brief();`);
 sql('roll-back-whole-publication',service(call()),{code:'P0001'});sql('zero-post-ledger-brief-reward',counts,{expected:'0:0:0:0'});sql('remove-final-fault','DROP TRIGGER final_brief_failure ON post_briefs');
 const phraseRace=await Promise.all([race(call()),race(call(2,{frame:'frame:voice:big_win:1'}))]);assert.equal(phraseRace.filter(x=>x.endsWith('|true|published')).length,1);assert.equal(phraseRace.filter(x=>x==='|false|phrase_used').length,1);cases.push({name:'concurrent-global-phrase',passed:true});
 sql('reset-frame-race',reset);const frameRace=await Promise.all([race(call()),race(call(2,{text:'My kings won at showdown',phrase:'my kings won at showdown'}))]);assert.equal(frameRace.filter(x=>x.endsWith('|true|published')).length,1);assert.equal(frameRace.filter(x=>x==='|false|frame_used').length,1);cases.push({name:'concurrent-global-frame',passed:true});
 sql('reset-source-reuse',reset);sql('publish-source',service(call()));sql('age-source-cadence',"UPDATE social_posts SET created_at=now()-interval '21 hours';UPDATE horse_phrase_ledger SET used_at=now()-interval '4 hours'");sql('programme-source-refusal',service(call(1,{text:'A new sentence on the same hand',phrase:'a new sentence on the same hand',frame:'frame:voice:big_win:2',slot:'2026-10-20T18'})),{expected:'|false|source_used'});
 sql('receipt-incomplete',"DELETE FROM post_briefs");sql('incomplete-replay-not-success',service(call()),{code:'23514'});
 sql('reset-shared-actual-hand',reset);sql('first-view-of-actual-hand',service(call()));
 sql('second-review-of-shared-hand',`UPDATE horse_hand_reviews SET hand_id='${id(101)}' WHERE id=2`);
 sql('shared-actual-hand-not-new-content',service(call(2,{semantic:'grounded:hand:'+id(101),text:'Another view of the same hand',phrase:'another view of the same hand',frame:'frame:voice:big_win:2'})),{expected:'|false|source_used'});
 sql('restore-second-review',`UPDATE horse_hand_reviews SET hand_id='${id(102)}' WHERE id=2`);
 sql('reset-old-history',reset);sql('old-own-phrase',`INSERT INTO horse_phrase_ledger(phrase_norm,horse_id,used_at) VALUES('my pocket aces held up at showdown','${id(1)}',now()-interval '60 days')`);sql('horse-90-day-guard',service(call()),{expected:'|false|phrase_used'});
 sql('reset-busy-profile',reset);
 await withLocker(`SELECT id FROM profiles WHERE id='${id(1)}' FOR SHARE;`,async()=>{
  sql('busy-profile-refused-before-reward',service(call()),{code:'55P03'});sql('busy-profile-no-effects',counts,{expected:'0:0:0:0'});
 });
 sql('reset-cross-producer',reset);
 await withLocker(`SELECT pg_advisory_xact_lock(hashtextextended('publish-horse-video-author:${id(1)}',0));`,async locker=>{
  const other=spawn(join(pg,'psql'),connection,{env,stdio:['pipe','pipe','pipe']});let a='',b='';other.stdout.on('data',v=>a+=v);other.stderr.on('data',v=>b+=v);const done=new Promise((ok,fail)=>{other.once('error',fail);other.once('exit',c=>c===0?ok(a.trim()):fail(Error(b)));});
  await new Promise(ok=>other.stdin.end(service("SET application_name='grounded-cross-producer-test';"+call()),ok));
  // pg_stat_activity is the actual blocked state, not an arbitrary race delay.
  let waiting=false;for(let i=0;i<100&&!waiting;i++)waiting=sql('cross-producer-wait-'+i,"SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND granted=false)")==='t';
  assert(waiting,'Grounded transaction must serialize behind the existing video author lock');
  locker.stdin.end(`INSERT INTO social_posts(author_id,content,content_type,visibility,origin_type,metadata) VALUES('${id(1)}','Other legitimate publication','video','public','horse','{}');COMMIT;\n\\q\n`);
  assert.equal(await done,'|false|posted_recently');cases.push({name:'existing-video-author-lock-serializes-cadence',passed:true});
 });
 sql('cross-producer-exactly-one-reward',counts,{expected:'1:0:0:1'});
 sql('metadata-does-not-leak-source-payload',reset+service(call())+"SELECT metadata ?| ARRAY['actions','hole_cards','opponent_id','table_id','club_id'] FROM social_posts",{expected:undefined});
 sql('no-private-payload-columns',"SELECT bool_and(NOT(metadata ?| ARRAY['actions','hole_cards','opponent_id','table_id','club_id'])) FROM social_posts",{expected:'t'});
 passed=true;
}finally{
 if(running){const r=command('pg_ctl',['-D',join(cluster,'data'),'-m','fast','-w','stop']);assert.equal(r.status,0,'Owned cluster must stop');}
 if(existsSync(join(cluster,'server.log')))writeFileSync(join(output,'server.log'),readFileSync(join(cluster,'server.log')));
 rmSync(cluster,{recursive:true});writeFileSync(join(output,'RESULTS.json'),JSON.stringify({passed,cases,clusterRemoved:!existsSync(cluster),scope:'Exact maintained atomic RPC, isolated native PG17 with ordinary reward fixture; no production writes'},null,2));console.log(JSON.stringify({passed,cases:cases.length,output}));
}
