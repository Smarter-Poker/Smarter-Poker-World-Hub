import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
const tool = name => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR,name),join('/opt/homebrew/opt/postgresql@17/bin',name),join('/usr/lib/postgresql/17/bin',name)].filter(Boolean).find(existsSync);
test('PG17 protected native owner preserves old RPC, blocks client bypass and atomically publishes qualified mirrors', async t => {
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
 query(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA storage;CREATE SCHEMA extensions;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE storage.objects(bucket_id text,name text);
 CREATE TABLE social_posts(id uuid PRIMARY KEY,author_id uuid,media_urls jsonb,original_media_url text,transcode_status text,transcode_error text,rights_status text,playback_type text,is_deleted boolean DEFAULT false,metadata jsonb,content_type text,thumbnail_url text,moderation_state text,taken_down_at timestamptz);
 CREATE TABLE social_reels(id uuid PRIMARY KEY,source_post_id uuid,author_id uuid,rights_status text,playback_type text,is_deleted boolean,video_url text,media_status text DEFAULT 'ready',moderation_state text DEFAULT 'active',taken_down_at timestamptz,thumbnail_url text);
 ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
 CREATE POLICY own_posts ON social_posts FOR ALL TO authenticated USING(author_id=auth.uid()) WITH CHECK(author_id=auth.uid());
 GRANT SELECT,INSERT,UPDATE ON social_posts TO authenticated;GRANT SELECT,UPDATE ON social_posts TO service_role;GRANT SELECT ON social_reels,storage.objects TO service_role;`);
 file('20261012144907_native_upload_queue_authority.sql');
 const owner='11111111-1111-4111-8111-111111111111';const post='22222222-2222-4222-8222-222222222222';const mirror='33333333-3333-4333-8333-333333333333';
 const url=`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${owner}/one.mov`;
 const outputPath=`videos/${owner}/native-${post}-44444444-4444-4444-8444-444444444444.mp4`;const output=`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/${outputPath}`;
 query(`INSERT INTO storage.objects VALUES('social-media','videos/${owner}/one.mov'),('social-media','${outputPath}');INSERT INTO social_posts(id,author_id,media_urls,original_media_url,transcode_status,transcode_error,rights_status,playback_type,is_deleted,metadata) VALUES('${post}','${owner}','["${url}"]',NULL,NULL,NULL,'user_authorized','native',false,NULL);INSERT INTO social_reels(id,source_post_id,author_id,rights_status,playback_type,is_deleted,video_url) VALUES('${mirror}','${post}','${owner}','user_authorized','native',false,'${url}');`);
 const enqueue=`SELECT queue_owned_native_upload('${owner}','${post}','${url}')`;
 query('SET ROLE service_role;'+enqueue);assert.equal(query("SELECT metadata IS NULL FROM social_posts"),'t');
 const queueSource=readFileSync(new URL('../supabase/migrations/20260815_go_live_guest_mgmt_thumbnail_gift_hardening.sql',import.meta.url),'utf8');
 const queueDefinition=queueSource.match(/CREATE OR REPLACE FUNCTION public\.fn_queue_video_transcode\(\)[\s\S]*?\$function\$;/)[0];
 query(queueDefinition+`CREATE TRIGGER tr_queue_video_transcode BEFORE INSERT ON social_posts FOR EACH ROW EXECUTE FUNCTION fn_queue_video_transcode();
 CREATE FUNCTION fn_social_posts_video_to_reel_mirror() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$BEGIN IF NEW.content_type='video' AND NEW.playback_type='native' AND NOT EXISTS(SELECT 1 FROM social_reels WHERE source_post_id=NEW.id) THEN INSERT INTO social_reels(id,source_post_id,author_id,rights_status,playback_type,is_deleted,video_url) VALUES(gen_random_uuid(),NEW.id,NEW.author_id,NEW.rights_status,NEW.playback_type,false,NEW.media_urls->>0);END IF;RETURN NEW;END$$;
 CREATE TRIGGER trg_social_posts_video_to_reel_mirror AFTER INSERT ON social_posts FOR EACH ROW EXECUTE FUNCTION fn_social_posts_video_to_reel_mirror();`);
 const composerSource=`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${owner}/composer.mov`;
 query(`INSERT INTO storage.objects VALUES('social-media','videos/${owner}/composer.mov');`);
 const composer=(postId)=>`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';INSERT INTO social_posts(id,author_id,media_urls,rights_status,playback_type,content_type,metadata) VALUES('${postId}','${owner}','["${composerSource}"]','user_authorized','native','video','{}');`;
 const beforeComposer='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';query(composer(beforeComposer));
 assert.equal(query(`SELECT transcode_status='queued' AND metadata->>'native_reels_worker' IS NULL FROM social_posts WHERE id='${beforeComposer}'`),'t');
 file('20261012152857_native_worker_publication_authority.sql');
 const afterComposer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';query(composer(afterComposer));
 assert.equal(query(`SELECT transcode_status='queued' AND metadata->>'native_reels_worker'='sp-transcode' FROM social_posts WHERE id='${afterComposer}'`),'t');
 query(`DELETE FROM social_reels WHERE source_post_id IN ('${beforeComposer}','${afterComposer}');DELETE FROM social_posts WHERE id IN ('${beforeComposer}','${afterComposer}');`);
 assert.equal(JSON.parse(query('SET ROLE service_role;'+enqueue)).reused,true);
 assert.equal(query("SELECT metadata->>'native_reels_worker' FROM social_posts"),'sp-transcode');
 const caller=`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`;
 for(const update of ["original_media_url='https://evil.test/source.mov'","transcode_status='running'","transcode_error='fake'","metadata='{}'"]){assert.throws(()=>query(caller+`UPDATE social_posts SET ${update} WHERE id='${post}';`));}
 query(caller+`UPDATE social_posts SET metadata=jsonb_set(metadata,'{caption}','true') WHERE id='${post}';`);
 query(caller+`INSERT INTO social_posts(id,author_id) VALUES('55555555-5555-4555-8555-555555555555','${owner}');`);
 assert.throws(()=>query(caller+`INSERT INTO social_posts(id,author_id,transcode_status) VALUES('66666666-6666-4666-8666-666666666666','${owner}','queued');`));
 query(`UPDATE social_posts SET transcode_status='running' WHERE id='${post}';`);
 const thumbnailPath=outputPath.replace(/\.mp4$/,'.jpg');const thumbnail=output.replace(/\.mp4$/,'.jpg');
 query(`INSERT INTO storage.objects VALUES('social-media','${thumbnailPath}');`);
 const publish=`SELECT complete_owned_native_upload('${post}','${owner}','${url}','${output}','${thumbnail}')`;
 assert.throws(()=>query(caller+publish));
 query(`UPDATE social_posts SET rights_status='embed_only' WHERE id='${post}';`);assert.throws(()=>query('SET ROLE service_role;'+publish));
 assert.equal(query(`SELECT transcode_status FROM social_posts WHERE id='${post}'`),'running');
 query(`UPDATE social_posts SET rights_status='user_authorized' WHERE id='${post}';`);
 assert.throws(()=>query('SET ROLE service_role;'+publish.replace('one.mov','missing.mov')));
 assert.throws(()=>query('SET ROLE service_role;'+publish.replace(thumbnail,'https://evil.test/preview.jpg')));
 assert.equal(query(`SELECT transcode_status FROM social_posts WHERE id='${post}'`),'running');
 // Creator-selected preview and unqualified mirrors remain untouched.
 const creatorPreview='https://existing.example/approved-preview.jpg';
 query(`UPDATE social_posts SET thumbnail_url='${creatorPreview}' WHERE id='${post}';
 INSERT INTO social_reels(id,source_post_id,author_id,rights_status,playback_type,is_deleted,video_url,media_status,moderation_state) VALUES
 ('77777777-7777-4777-8777-777777777777','${post}','${owner}','user_authorized','native',false,'${url}','ready','taken_down'),
 ('88888888-8888-4888-8888-888888888888','${post}','${owner}','user_authorized','native',false,'${url}','pending','active');`);
 const receipt=JSON.parse(query('SET ROLE service_role;'+publish));assert.equal(receipt.completed,true);assert.equal(receipt.mirrors,1);
 assert.equal(query(`SELECT media_urls->>0 FROM social_posts WHERE id='${post}'`),output);assert.equal(query(`SELECT video_url FROM social_reels WHERE id='${mirror}'`),output);
 assert.equal(query(`SELECT count(*) FROM social_reels WHERE id<>'${mirror}' AND video_url='${url}'`),'2');assert.equal(query(`SELECT thumbnail_url FROM social_posts WHERE id='${post}'`),creatorPreview);assert.equal(query(`SELECT thumbnail_url FROM social_reels WHERE id='${mirror}'`),creatorPreview);
 assert.throws(()=>query('SET ROLE service_role;'+publish));
 assert.throws(()=>file('20261012152857_native_worker_publication_authority.sql'));

 }finally{if(started)execFileSync(ctl,['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
