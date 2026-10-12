import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
const tool = name => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR,name),join('/opt/homebrew/opt/postgresql@17/bin',name),join('/usr/lib/postgresql/17/bin',name)].filter(Boolean).find(existsSync);
test('PG17 native captions preserve unknown rows, owned paths, service-only metadata and replay refusal', async t => {
 const bins=['initdb','pg_ctl','psql'].map(tool);
 const base=process.env.REELS_CAPTIONS_POSTGRES_ROOT || process.env.NATIVE_REVOCATION_POSTGRES_ROOT;
 if(bins.some(x=>!x)||!base||!existsSync(base)){if(process.env.CI==='true')throw new Error('PG17 isolated scratch unavailable');t.skip('PG17 isolated scratch required');return;}
 const [initdb,ctl,psql]=bins; const dir=mkdtempSync(join(base,'captions-'));const data=join(dir,'data');
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
 const query=q=>execFileSync(psql,[...args,'-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const file=name=>execFileSync(psql,[...args,'-f',new URL('../supabase/migrations/'+name,import.meta.url).pathname],{stdio:['ignore','pipe','pipe']});let started=false;
 try{
 execFileSync(initdb,['-D',data,'-U','postgres','--no-locale','--encoding=UTF8'],{stdio:'ignore'});
 execFileSync(ctl,['-D',data,'-l',join(dir,'pg.log'),'-o',`-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,'-w','start'],{stdio:'ignore'});started=true;
 query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;CREATE POLICY old_broad ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);CREATE TABLE storage.buckets(id text,public boolean,allowed_mime_types text[]);INSERT INTO storage.buckets VALUES(\'social-media\',true,ARRAY[\'video/mp4\']);CREATE TABLE social_reels(id uuid PRIMARY KEY,author_id uuid,playback_type text);GRANT INSERT,UPDATE,SELECT ON social_reels TO authenticated,service_role;');
 const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
 const url=`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/reels/${owner}/caption-${id}-${'a'.repeat(64)}.vtt`;
 query(`INSERT INTO social_reels VALUES('${id}','${owner}','native');`);
 assert.throws(()=>query(`UPDATE social_reels SET caption_track_url='${url}'`));
 query("SET ROLE anon;INSERT INTO storage.objects VALUES('social-media','reels/a/caption-before.vtt')");
 file('20261012151219_reels_owned_native_captions.sql');
 query(`SET ROLE service_role;UPDATE social_reels SET caption_track_url='${url}'`);
 assert.equal(query('SELECT caption_track_url IS NOT NULL FROM social_reels'),'t');
 assert.throws(()=>query(`SET ROLE authenticated;UPDATE social_reels SET caption_track_url=NULL`));
 assert.throws(()=>query(`UPDATE social_reels SET caption_track_url='${url.replace(owner,id)}'`));
 assert.throws(()=>query(`UPDATE social_reels SET playback_type='youtube_embed'`));
 assert.equal(query("SELECT allowed_mime_types=ARRAY['video/mp4','text/vtt'] FROM storage.buckets"),'t');
 assert.throws(()=>file('20261012151219_reels_owned_native_captions.sql'));
 assert.throws(()=>query("SET ROLE anon;INSERT INTO storage.objects VALUES('social-media','reels/a/caption-after.vtt')"));
 assert.equal(query("SET ROLE anon;WITH changed AS (DELETE FROM storage.objects WHERE name='reels/a/caption-before.vtt' RETURNING *) SELECT count(*) FROM changed"),'0');
 assert.equal(query("SET ROLE authenticated;WITH changed AS (UPDATE storage.objects SET name='reels/a/caption-hijack.vtt' WHERE name='reels/a/caption-before.vtt' RETURNING *) SELECT count(*) FROM changed"),'0');
 query("SET ROLE anon;INSERT INTO storage.objects VALUES('social-media','other/unchanged.jpg')");
 query("SET ROLE service_role;INSERT INTO storage.objects VALUES('social-media','reels/a/caption-service.vtt')");
 assert.equal(query("SELECT prosecdef FROM pg_proc WHERE oid='guard_owned_reel_caption_metadata()'::regprocedure"),'f');
 }finally{if(started)execFileSync(ctl,['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
