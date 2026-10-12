import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
const tool = name => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR,name),join('/opt/homebrew/opt/postgresql@17/bin',name),join('/usr/lib/postgresql/17/bin',name)].filter(Boolean).find(existsSync);
test('PG17 desired reaction is atomic, RLS-bound, idempotent and rejects busy transactions', async t => {
 const bins=['initdb','pg_ctl','psql'].map(tool);
 const base=process.env.REELS_METRICS_POSTGRES_ROOT || process.env.NATIVE_REVOCATION_POSTGRES_ROOT;
 if(bins.some(x=>!x)||!base||!existsSync(base)){if(process.env.CI==='true')throw new Error('PG17 isolated scratch unavailable');t.skip('PG17 isolated scratch required');return;}
 const [initdb,ctl,psql]=bins; const dir=mkdtempSync(join(base,'metrics-'));const data=join(dir,'data');
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
 const query=q=>execFileSync(psql,[...args,'-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const file=name=>execFileSync(psql,[...args,'-f',new URL('../supabase/migrations/'+name,import.meta.url).pathname],{stdio:['ignore','pipe','pipe']});let started=false;
 try{
 execFileSync(initdb,['-D',data,'-U','postgres','--no-locale','--encoding=UTF8'],{stdio:'ignore'});
 execFileSync(ctl,['-D',data,'-l',join(dir,'pg.log'),'-o',`-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,'-w','start'],{stdio:'ignore'});started=true;
 query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA extensions;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE TABLE public.social_reels(id uuid PRIMARY KEY,author_id uuid,is_deleted boolean,is_public boolean,media_status text,moderation_state text,taken_down_at timestamptz,playback_type text,rights_status text,video_url text,youtube_video_id text,canonical_asset_key text,like_count integer DEFAULT 0);
 CREATE TABLE public.social_posts(id uuid PRIMARY KEY,author_id uuid,like_count integer DEFAULT 0);
 ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
 CREATE POLICY post_read ON social_posts FOR SELECT TO authenticated USING(true);
 CREATE POLICY post_update ON social_posts FOR UPDATE TO authenticated USING(author_id=auth.uid());
 CREATE POLICY reel_update ON social_reels FOR UPDATE TO authenticated USING(author_id=auth.uid());
 GRANT SELECT,UPDATE ON social_posts TO authenticated;GRANT UPDATE ON social_reels TO authenticated;
 CREATE TABLE public.social_likes(id uuid DEFAULT gen_random_uuid(),post_id uuid,user_id uuid,reaction_type text);
 CREATE UNIQUE INDEX social_likes_post_id_user_id_reaction_key ON social_likes(post_id,user_id,reaction_type);
 ALTER TABLE social_reels ENABLE ROW LEVEL SECURITY;ALTER TABLE social_likes ENABLE ROW LEVEL SECURITY;
 CREATE POLICY reel_read ON social_reels FOR SELECT TO authenticated USING((is_public OR author_id=auth.uid()) AND NOT is_deleted);
 CREATE POLICY likes_read ON social_likes FOR SELECT TO authenticated USING(true);
 CREATE POLICY likes_insert ON social_likes FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
 CREATE POLICY likes_delete ON social_likes FOR DELETE TO authenticated USING(user_id=auth.uid());
 GRANT SELECT ON social_reels TO authenticated;GRANT SELECT,INSERT,DELETE ON social_likes TO authenticated;
 CREATE FUNCTION public.fn_is_public_video_playback_eligible(text,text,text,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$SELECT $1='native' AND $2='user_authorized'$$;
 CREATE TABLE reaction_audit(op text);
 CREATE FUNCTION record_reaction_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN INSERT INTO reaction_audit VALUES(TG_OP);RETURN COALESCE(NEW,OLD);END$$;
 CREATE FUNCTION public.trig_sync_like_count() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$BEGIN IF TG_OP='INSERT' THEN UPDATE social_posts SET like_count=GREATEST(0,COALESCE(like_count,0)+1) WHERE id=NEW.post_id;UPDATE social_reels SET like_count=GREATEST(0,COALESCE(like_count,0)+1) WHERE id=NEW.post_id;RETURN NEW;ELSE UPDATE social_posts SET like_count=GREATEST(0,COALESCE(like_count,0)-1) WHERE id=OLD.post_id;UPDATE social_reels SET like_count=GREATEST(0,COALESCE(like_count,0)-1) WHERE id=OLD.post_id;RETURN OLD;END IF;END$$;
 CREATE TRIGGER trg_sync_like_count AFTER INSERT OR DELETE ON social_likes FOR EACH ROW EXECUTE FUNCTION trig_sync_like_count();
 CREATE TRIGGER retained_reaction_audit AFTER INSERT OR DELETE ON social_likes FOR EACH ROW EXECUTE FUNCTION record_reaction_audit();
 CREATE FUNCTION reject_fixture_dislike() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.reaction_type='dislike' AND current_setting('fixture.fail_dislike',true)='yes' THEN RAISE EXCEPTION 'fixture insert failure';END IF;RETURN NEW;END$$;
 CREATE TRIGGER reject_fixture BEFORE INSERT ON social_likes FOR EACH ROW EXECUTE FUNCTION reject_fixture_dislike();`);
 const actor='11111111-1111-4111-8111-111111111111';const reel='22222222-2222-4222-8222-222222222222';
 query(`INSERT INTO social_reels VALUES('${reel}','33333333-3333-4333-8333-333333333333',false,true,'ready','active',NULL,'native','user_authorized','fixture',NULL,'native:fixture',0);INSERT INTO social_posts VALUES('${reel}','33333333-3333-4333-8333-333333333333',0);`);
 const caller=`SET ROLE authenticated;SET request.jwt.claim.sub='${actor}';`;
 // Before: two ordinary inserts from separate requests cause23505 after first committed.
 query(caller+`INSERT INTO social_likes(post_id,user_id,reaction_type) VALUES('${reel}','${actor}','like');`);
 assert.equal(query('SELECT like_count FROM social_reels'),'0'); // Before: another author ledger like did not reach stored counter.
 assert.equal(query("SELECT count(*) FROM social_likes WHERE reaction_type='like'"),'1');
 assert.throws(()=>query(caller+`INSERT INTO social_likes(post_id,user_id,reaction_type) VALUES('${reel}','${actor}','like');`));
 query('DELETE FROM social_likes;DELETE FROM reaction_audit;');
 file('20261012151225_atomic_reel_reaction_intent.sql');
 file('20261012151230_reaction_counts_from_authoritative_ledger.sql');
 const intent=(reaction,active=true)=>`SELECT public.set_reel_reaction('${reel}','${reaction}',${active})`;
 let receipt=JSON.parse(query(caller+intent('like')));assert.equal(receipt.liked,true);assert.equal(receipt.likeCount,1);assert.equal(query('SELECT like_count FROM social_reels'),'1');assert.equal(query('SELECT like_count FROM social_posts'),'1');
 receipt=JSON.parse(query(caller+intent('like')));assert.equal(receipt.likeCount,1);assert.equal(query('SELECT count(*) FROM reaction_audit'),'1');
 // Opposite removal must roll back when insertion is rejected.
 assert.throws(()=>query(caller+"SET fixture.fail_dislike='yes';"+intent('dislike')));
 assert.equal(query("SELECT reaction_type FROM social_likes"),'like');assert.equal(query('SELECT like_count FROM social_reels'),'1');
 receipt=JSON.parse(query(caller+intent('dislike')));assert.equal(receipt.liked,false);assert.equal(receipt.disliked,true);assert.equal(receipt.likeCount,0);assert.equal(query('SELECT like_count FROM social_reels'),'0');assert.equal(query('SELECT like_count FROM social_posts'),'1');
 receipt=JSON.parse(query(caller+intent('like',false)));assert.equal(receipt.disliked,true);
 receipt=JSON.parse(query(caller+intent('dislike',false)));assert.equal(receipt.disliked,false);
 query(caller+intent('dislike',false));assert.equal(query('SELECT count(*) FROM social_likes'),'0');
 assert.throws(()=>query("SET ROLE anon;"+intent('like')));
 assert.throws(()=>query("SET ROLE authenticated;"+intent('like')));
 // A lock held by another transaction is a bounded busy outcome, never a loop.
 const {spawn}=await import('node:child_process');
 const locked=spawn(psql,[...args,'-c',caller+`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('${actor}:${reel}',0));SELECT 'ready';`,'-c','SELECT pg_sleep(2);','-c','COMMIT;'],{stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';locked.stdout.on('data',chunk=>{output+=chunk;if(output.includes('ready'))resolve();});locked.on('error',reject);locked.on('exit',code=>{if(!output.includes('ready'))reject(new Error('Lock fixture did not start '+code));});});
 const start=Date.now();assert.throws(()=>query(caller+intent('like')));assert.ok(Date.now()-start<800,'Busy reaction waited instead of failing promptly');
 await new Promise(resolve=>locked.once('close',resolve));
 const first=spawn(psql,[...args,'-c',caller+'BEGIN;'+intent('like')+";SELECT 'first-ready';",'-c','SELECT pg_sleep(1);','-c','COMMIT;'],{stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';first.stdout.on('data',chunk=>{output+=chunk;if(output.includes('first-ready'))resolve();});first.on('error',reject);});
 const otherCaller="SET ROLE authenticated;SET request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';";
 const second=spawn(psql,[...args,'-c',otherCaller+intent('like')],{stdio:['ignore','pipe','pipe']});
 await Promise.all([new Promise(resolve=>first.once('close',resolve)),new Promise((resolve,reject)=>second.once('close',code=>code===0?resolve():reject(new Error('Second actor mutation failed'))))]);
 assert.equal(query('SELECT like_count FROM social_reels'),'2');assert.equal(query('SELECT like_count FROM social_posts'),'2');
 query(caller+intent('like',false));assert.equal(query('SELECT like_count FROM social_reels'),'1');
 // Generic Post reaction totals retain all existing accepted positive reactions.
 query(`INSERT INTO social_likes(post_id,user_id,reaction_type) VALUES('${reel}','55555555-5555-4555-8555-555555555555','love'),('${reel}','66666666-6666-4666-8666-666666666666','haha');`);
 assert.equal(query('SELECT like_count FROM social_posts'),'3');assert.equal(query('SELECT like_count FROM social_reels'),'1');
 query(`DELETE FROM social_likes WHERE reaction_type IN ('love','haha');`);
 assert.equal(query('SELECT like_count FROM social_posts'),'1');
 // Retained BEFORE INSERT canonicalization reaches only the canonical row.
 const alias='88888888-8888-4888-8888-888888888888';
 query(`CREATE TABLE social_reel_aliases(alias_reel_id uuid,canonical_reel_id uuid);
 INSERT INTO social_reel_aliases VALUES('${alias}','${reel}');
 CREATE FUNCTION fn_canonicalize_social_reel_engagement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$DECLARE target uuid;BEGIN SELECT canonical_reel_id INTO target FROM social_reel_aliases WHERE alias_reel_id=NEW.post_id;IF target IS NOT NULL THEN NEW.post_id=target;END IF;RETURN NEW;END$$;
 CREATE TRIGGER trg_00_canonicalize_reel_alias_like BEFORE INSERT OR UPDATE OF post_id ON social_likes FOR EACH ROW EXECUTE FUNCTION fn_canonicalize_social_reel_engagement();`);
 query(caller+`INSERT INTO social_likes(post_id,user_id,reaction_type) VALUES('${alias}','${actor}','like');`);
 assert.equal(query(`SELECT post_id FROM social_likes WHERE user_id='${actor}'`),reel);
 assert.equal(query('SELECT like_count FROM social_reels'),'2');
 query(caller+intent('like',false));assert.equal(query('SELECT like_count FROM social_reels'),'1');
 // Source-post mirroring remains separate; no duplicate engagement/award rail.
 const sourcePost='99999999-9999-4999-8999-999999999999';
 query(`ALTER TABLE social_reels ADD COLUMN source_post_id uuid;UPDATE social_reels SET source_post_id='${sourcePost}';INSERT INTO social_posts VALUES('${sourcePost}','${actor}',0);`);
 query(caller+`INSERT INTO social_likes(post_id,user_id,reaction_type) VALUES('${sourcePost}','${actor}','love');`);
 assert.equal(query(`SELECT like_count FROM social_posts WHERE id='${sourcePost}'`),'1');
 assert.equal(query('SELECT like_count FROM social_reels'),'1');
 const privateReel='77777777-7777-4777-8777-777777777777';
 query(`INSERT INTO social_reels VALUES('${privateReel}','${actor}',false,false,'ready','active',NULL,'native','user_authorized','fixture',NULL,'native:private',0,NULL);`);
 const privateIntent=`SELECT public.set_reel_reaction('${privateReel}','like',true)`;
 assert.equal(JSON.parse(query(caller+privateIntent)).liked,true);
 assert.throws(()=>query(otherCaller+privateIntent));assert.throws(()=>query('SET ROLE anon;'+privateIntent));
 query("UPDATE social_reels SET is_public=false;");assert.throws(()=>query(caller+intent('like')));
 assert.throws(()=>file('20261012151225_atomic_reel_reaction_intent.sql'));

 }finally{if(started)execFileSync(ctl,['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
