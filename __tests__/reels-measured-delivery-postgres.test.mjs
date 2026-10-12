import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
const tool = name => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR,name),join('/opt/homebrew/opt/postgresql@17/bin',name),join('/usr/lib/postgresql/17/bin',name)].filter(Boolean).find(existsSync);
test('PG17 measured-event additive schema keeps NULL unknowns, constraints and service-only writes', async t => {
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
 query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 file('20261004180000_reels_delivery_metrics.sql');
 assert.throws(()=>query("INSERT INTO public.reels_delivery_metrics(surface,feed_mode,viewport_width,event_kind) VALUES('social','for-you',390,'swipe')"));
 file('20261012144851_reels_measured_delivery_events.sql');
 const row="INSERT INTO public.reels_delivery_metrics(surface,feed_mode,viewport_width,event_kind,swipe_ms,stall_ms,stall_count) VALUES('social','for-you',390,'swipe',250,10,1)";
 query('SET ROLE service_role; '+row);
 assert.equal(query('SELECT startup_ms IS NULL AND transferred_kb IS NULL AND swipe_ms=250 FROM public.reels_delivery_metrics'),'t');
 assert.throws(()=>query("SET ROLE anon; "+row));
 assert.throws(()=>query(row.replace("'swipe',250","'fake',250")));
 assert.throws(()=>query(row.replace("'swipe',250","'swipe',-1")));
 assert.throws(()=>file('20261012144851_reels_measured_delivery_events.sql'));
 query("CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);CREATE TABLE public.social_posts(id uuid PRIMARY KEY,author_id uuid,media_urls jsonb,original_media_url text,transcode_status text,transcode_error text,rights_status text,playback_type text,is_deleted boolean DEFAULT false);");
 file('20261012144907_native_upload_queue_authority.sql');
 const owner='11111111-1111-4111-8111-111111111111';const post='22222222-2222-4222-8222-222222222222';
 const url=`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/videos/${owner}/one.mp4`;
 query(`INSERT INTO storage.objects VALUES('social-media','videos/${owner}/one.mp4');INSERT INTO social_posts VALUES('${post}','${owner}','["${url}"]',NULL,NULL,NULL,'user_authorized','native',false);`);
 const enqueue=`SELECT public.queue_owned_native_upload('${owner}','${post}','${url}')`;
 assert.equal(JSON.parse(query(enqueue)).status,'queued');
 assert.equal(JSON.parse(query(enqueue)).reused,true);
 assert.equal(query(`SELECT original_media_url='${url}' AND transcode_status='queued' FROM social_posts`),'t');
 assert.throws(()=>query(enqueue.replace(owner,'33333333-3333-4333-8333-333333333333')));
 assert.throws(()=>query(enqueue.replace('/one.mp4','/wrong.mp4')));
 assert.throws(()=>query('SET ROLE anon; '+enqueue));
 query("UPDATE social_posts SET transcode_status='done';");
 assert.equal(JSON.parse(query(enqueue)).status,'done');
 assert.throws(()=>file('20261012144907_native_upload_queue_authority.sql'));
 assert.equal(query("SELECT relrowsecurity FROM pg_class WHERE oid='public.reels_delivery_metrics'::regclass"),'t');
 }finally{if(started)execFileSync(ctl,['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
