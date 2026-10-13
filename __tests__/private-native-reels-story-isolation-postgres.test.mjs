import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
const tool = name => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR,name),join('/opt/homebrew/opt/postgresql@17/bin',name),join('/usr/lib/postgresql/17/bin',name)].filter(Boolean).find(existsSync);
test('PG17 restricted native sources never fan out to public stories; original public behavior and ACL remain', async t => {
 const bins=['initdb','pg_ctl','psql'].map(tool);
 const base=process.env.REELS_STORY_ISOLATION_POSTGRES_ROOT || process.env.NATIVE_REVOCATION_POSTGRES_ROOT;
 if(bins.some(x=>!x)||!base||!existsSync(base)){if(process.env.CI==='true')throw new Error('PG17 isolated scratch unavailable');t.skip('PG17 isolated scratch required');return;}
 const [initdb,ctl,psql]=bins; const dir=mkdtempSync(join(base,'story-isolation-'));const data=join(dir,'data');
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
 const query=q=>execFileSync(psql,[...args,'-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const file=name=>execFileSync(psql,[...args,'-f',new URL('../supabase/migrations/'+name,import.meta.url).pathname],{stdio:['ignore','pipe','pipe']});let started=false;
 try{
 execFileSync(initdb,['-D',data,'-U','postgres','--no-locale','--encoding=UTF8'],{stdio:'ignore'});
 execFileSync(ctl,['-D',data,'-l',join(dir,'pg.log'),'-o',`-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,'-w','start'],{stdio:'ignore'});started=true;
 query("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA extensions;CREATE TABLE social_posts(id integer GENERATED ALWAYS AS IDENTITY,author_id uuid,content text,media_urls jsonb,visibility text,audience_mode text,origin_type text);CREATE TABLE social_stories(author_id uuid,content text,media_url text,media_type text,created_at timestamptz,expires_at timestamptz,is_active boolean);ALTER TABLE social_stories ENABLE ROW LEVEL SECURITY;CREATE POLICY public_read ON social_stories FOR SELECT USING(true);GRANT SELECT ON social_stories TO anon;");
 query(readFileSync(new URL('../supabase/migrations/20260430_fix_auto_story_trigger_return.sql',import.meta.url),'utf8').replace('Silently swallow —','Silently swallow -'));
 query("ALTER FUNCTION fn_auto_create_story_from_post() SET search_path=public;REVOKE ALL ON FUNCTION fn_auto_create_story_from_post() FROM PUBLIC;GRANT EXECUTE ON FUNCTION fn_auto_create_story_from_post() TO service_role;CREATE TRIGGER trg_auto_story_on_post AFTER INSERT ON public.social_posts FOR EACH ROW WHEN (NEW.origin_type IS DISTINCT FROM 'video_library') EXECUTE FUNCTION fn_auto_create_story_from_post();");
 assert.equal(query("SELECT md5(pg_get_functiondef('fn_auto_create_story_from_post()'::regprocedure))"),'361d53230ceac434d88a7785dd66530a');
 const insert=(visibility,audience,origin='user_upload')=>query(`INSERT INTO social_posts(author_id,content,media_urls,visibility,audience_mode,origin_type) VALUES('11111111-1111-4111-8111-111111111111','Original private test', '["https://example.invalid/original.mp4"]',${visibility===null?'NULL':"'"+visibility+"'"},${audience===null?'NULL':"'"+audience+"'"},'${origin}');`);
 insert('private','only_me');
 assert.equal(query('SET ROLE anon;SELECT count(*) FROM social_stories'),'1','Installed baseline leaks a restricted source through the public story policy');
 query('TRUNCATE social_stories,social_posts;');
 const acl=query("SELECT proacl::text FROM pg_proc WHERE oid='fn_auto_create_story_from_post()'::regprocedure");
 file('20261013004359_private_native_reels_story_isolation.sql');
 for(const [visibility,audience]of[['private','only_me'],['public','only_me'],['public','friends'],['public','restricted'],[null,null],['friends',null]])insert(visibility,audience);
 assert.equal(query('SET ROLE anon;SELECT count(*) FROM social_stories'),'0');
 assert.equal(query('SELECT count(*) FROM social_posts'),'6','Restricted original posts still insert normally');
 insert('public',null);insert('public','public');
 assert.equal(query('SET ROLE anon;SELECT count(*) FROM social_stories'),'2','Existing public auto-story behavior stays intact');
 insert('public','public','video_library');assert.equal(query('SELECT count(*) FROM social_stories'),'2');
 assert.equal(query("SELECT proacl::text FROM pg_proc WHERE oid='fn_auto_create_story_from_post()'::regprocedure"),acl);
 assert.equal(query("SELECT prosecdef AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid='fn_auto_create_story_from_post()'::regprocedure"),'t');
 query("ALTER TABLE social_stories ADD CONSTRAINT fixture_story_failure CHECK(content <> 'Force story failure');INSERT INTO social_posts(author_id,content,visibility,audience_mode) VALUES('11111111-1111-4111-8111-111111111111','Force story failure','public','public');");
 assert.equal(query("SELECT count(*) FROM social_posts WHERE content='Force story failure'"),'1','Optional story failure still returns NEW without blocking the post');
 assert.throws(()=>file('20261013004359_private_native_reels_story_isolation.sql'));
 }finally{if(started)execFileSync(ctl,['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
