import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
const tool = name => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR,name),join('/opt/homebrew/opt/postgresql@17/bin',name),join('/usr/lib/postgresql/17/bin',name)].filter(Boolean).find(existsSync);
test('PG17 optional social reward errors return NEW without changing award rules or INVOKER authority', async t => {
 const bins=['initdb','pg_ctl','psql'].map(tool);
 const base=process.env.REELS_REWARD_RETURN_POSTGRES_ROOT || process.env.NATIVE_REVOCATION_POSTGRES_ROOT;
 if(bins.some(x=>!x)||!base||!existsSync(base)){if(process.env.CI==='true')throw new Error('PG17 isolated scratch unavailable');t.skip('PG17 isolated scratch required');return;}
 const [initdb,ctl,psql]=bins; const dir=mkdtempSync(join(base,'reward-return-'));const data=join(dir,'data');
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
 const query=q=>execFileSync(psql,[...args,'-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const file=name=>execFileSync(psql,[...args,'-f',new URL('../supabase/migrations/'+name,import.meta.url).pathname],{stdio:['ignore','pipe','pipe']});let started=false;
 try{
 execFileSync(initdb,['-D',data,'-U','postgres','--no-locale','--encoding=UTF8'],{stdio:'ignore'});
 execFileSync(ctl,['-D',data,'-l',join(dir,'pg.log'),'-o',`-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,'-w','start'],{stdio:'ignore'});started=true;
 query("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA extensions;CREATE TABLE social_posts(id uuid PRIMARY KEY,author_id uuid,origin_type text);CREATE TABLE fixture_awards(post_id uuid PRIMARY KEY,author_id uuid,kind text);GRANT INSERT,SELECT ON social_posts TO authenticated;CREATE FUNCTION claim_reward(actor uuid,kind text,metadata jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN INSERT INTO fixture_awards VALUES((metadata->>'post_id')::uuid,actor,kind) ON CONFLICT DO NOTHING;RETURN '{}'::jsonb;END $$;REVOKE ALL ON FUNCTION claim_reward(uuid,text,jsonb) FROM PUBLIC;");
 query(`CREATE OR REPLACE FUNCTION public.fn_social_post_reward() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'extensions' AS $function$
declare    v_result JSONB;
begin    -- Call the existing reward bus to claim the 'social_post_share' reward (15 diamonds)
    v_result := claim_reward(NEW.author_id, 'social_post_share', jsonb_build_object('post_id', NEW.id));
        RETURN NEW;
        EXCEPTION WHEN OTHERS then    -- If reward fails, don't block the post_frequency    RETURN NEW;
        END;
        $function$;REVOKE ALL ON FUNCTION fn_social_post_reward() FROM PUBLIC;GRANT EXECUTE ON FUNCTION fn_social_post_reward() TO service_role;CREATE TRIGGER trg_reward_social_post AFTER INSERT ON social_posts FOR EACH ROW WHEN (NEW.origin_type IS DISTINCT FROM 'video_library') EXECUTE FUNCTION fn_social_post_reward();`);
 assert.equal(query("SELECT md5(pg_get_functiondef('fn_social_post_reward()'::regprocedure))"),'12d3f0751ffd93fa7036e6f852eb4dd8');
 const insert=(id,role='authenticated',origin='user_upload')=>query(`SET ROLE ${role};INSERT INTO social_posts VALUES('${id}','11111111-1111-4111-8111-111111111111','${origin}');`);
 let before;
 try{insert('22222222-2222-4222-8222-222222222222');}catch(error){before=error.stderr?.toString();}
 assert.match(before||'',/control reached end of trigger procedure without RETURN/);
 assert.equal(query('SELECT count(*) FROM social_posts'),'0');assert.equal(query('SELECT count(*) FROM fixture_awards'),'0');
 file('20261013010356_reels_source_post_reward_return.sql');
 insert('22222222-2222-4222-8222-222222222222');assert.equal(query('SELECT count(*) FROM social_posts'),'1');assert.equal(query('SELECT count(*) FROM fixture_awards'),'0');
 query("GRANT EXECUTE ON FUNCTION claim_reward(uuid,text,jsonb) TO authenticated;GRANT INSERT,SELECT ON fixture_awards TO authenticated;");
 insert('33333333-3333-4333-8333-333333333333');assert.equal(query("SELECT count(*) FROM fixture_awards WHERE kind='social_post_share'"),'1');
 query("CREATE OR REPLACE FUNCTION claim_reward(actor uuid,kind text,metadata jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture reward failure';END $$;");
 insert('44444444-4444-4444-8444-444444444444');assert.equal(query('SELECT count(*) FROM social_posts'),'3');assert.equal(query('SELECT count(*) FROM fixture_awards'),'1');
 insert('55555555-5555-4555-8555-555555555555','authenticated','video_library');assert.equal(query('SELECT count(*) FROM fixture_awards'),'1');
 assert.equal(query("SELECT NOT prosecdef AND proowner='postgres'::regrole AND proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid='fn_social_post_reward()'::regprocedure"),'t');
 assert.throws(()=>file('20261013010356_reels_source_post_reward_return.sql'));
 }finally{if(started)execFileSync(ctl,['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
