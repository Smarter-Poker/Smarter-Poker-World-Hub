import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = join(root, 'supabase/migrations/20261010045500_native_video_source_revocation_reaches_social.sql');
const sql = readFileSync(migration, 'utf8');
const tool = (name) => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
  join('/opt/homebrew/opt/postgresql@17/bin', name), join('/usr/lib/postgresql/17/bin', name)]
  .filter(Boolean).find(existsSync);

test('native source revocation uses the existing social row event without browser polling', () => {
  assert.match(sql, /AFTER INSERT OR UPDATE OF status[\s\S]*ON public\.video_source_masters/);
  assert.match(sql, /SET visibility = 'private'/);
  assert.match(sql, /SET is_public = false/);
  assert.match(sql, /SECURITY DEFINER[\s\S]*SET search_path = public, extensions/);
  assert.match(sql, /realtime\.send\([\s\S]*jsonb_build_object\('kind', row_kind, 'id', row_id\)[\s\S]*'managed_video_invalidated'[\s\S]*'social-video-authority'[\s\S]*false/);
  assert.doesNotMatch(sql, /cron\.schedule|GRANT EXECUTE|CASCADE|storage\.objects/);
  assert.match(readFileSync(join(root, '.github/workflows/build-safety-gate.yml'), 'utf8'),
    /node --test __tests__\/native-video-source-revocation-postgres\.test\.mjs/);
});

test('PG17 hides only linked managed native social rows on backfill and future revocation', async (t) => {
  const tools = ['initdb', 'pg_ctl', 'postgres', 'psql'].map(tool);
  const base = process.env.NATIVE_REVOCATION_POSTGRES_ROOT;
  if (tools.some((x) => !x) || !base || !existsSync(base)) {
    if (process.env.CI === 'true') throw new Error('Required PG17 tools and NATIVE_REVOCATION_POSTGRES_ROOT missing');
    t.skip('PG17 tools and isolated scratch required'); return;
  }
  const [initdb, pgCtl, postgres, psql] = tools;
  assert.match(execFileSync(postgres, ['--version'], { encoding: 'utf8' }), /\b17\./);
  const server = net.createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const port = server.address().port;
  await new Promise((ok, fail) => server.close((err) => err ? fail(err) : ok()));
  const scratch = mkdtempSync(join(base, 'run-'));
  const data = join(scratch, 'data');
  let started = false;
  const query = (q) => execFileSync(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', q], { encoding: 'utf8' }).trim();
  const apply = () => execFileSync(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', migration], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
    execFileSync(pgCtl, ['-D', data, '-l', join(scratch, 'postgres.log'), '-o',
      `-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
    query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA realtime;
      CREATE TABLE realtime.sent_events(payload jsonb,event text,topic text,private boolean);
      CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean)
        RETURNS void LANGUAGE sql AS $$INSERT INTO realtime.sent_events VALUES(payload,event,topic,private)$$;
      CREATE TABLE public.video_library_videos(id uuid PRIMARY KEY);
      CREATE TABLE public.video_source_masters(
        id uuid PRIMARY KEY, video_id uuid NOT NULL UNIQUE REFERENCES public.video_library_videos(id),
        status text NOT NULL CHECK(status IN ('ready','revoked','deleted')));
      CREATE TABLE public.social_posts(
        id uuid PRIMARY KEY, source_asset_id uuid, origin_type text, content_type text,
        playback_type text, visibility text, is_deleted boolean DEFAULT false, audience_mode text);
      CREATE TABLE public.social_reels(
        id uuid PRIMARY KEY, source_asset_id uuid, origin_type text, playback_type text,
        is_public boolean, is_deleted boolean DEFAULT false);
      GRANT SELECT ON public.social_posts,public.social_reels TO anon,authenticated;
      INSERT INTO public.video_library_videos VALUES
        ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      INSERT INTO public.video_source_masters VALUES
        ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','ready'),
        ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','revoked');
      INSERT INTO public.social_posts(id,source_asset_id,origin_type,content_type,playback_type,visibility,audience_mode) VALUES
        ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','video_library','video','native','public','public'),
        ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','video_library','video','native','public','public'),
        ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','video_library','video','youtube_embed','public','public'),
        ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','user','video','native','public','public'),
        ('20000000-0000-0000-0000-000000000005',NULL,'user','text',NULL,'public','public'),
        ('20000000-0000-0000-0000-000000000006',NULL,'user','text',NULL,'private','private');
      INSERT INTO public.social_reels(id,source_asset_id,origin_type,playback_type,is_public) VALUES
        ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','video_library','native',true),
        ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','video_library','native',true),
        ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','video_library','youtube_embed',true),
        ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','user','native',true),
        ('30000000-0000-0000-0000-000000000005',NULL,'user','native',true),
        ('30000000-0000-0000-0000-000000000006',NULL,'user','native',false);`);
    const grantsBefore = query(`SELECT string_agg(grantee||':'||privilege_type,',' ORDER BY grantee,privilege_type)
      FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('social_posts','social_reels')`);
    apply();
    assert.equal(query("SELECT visibility FROM public.social_posts WHERE id='20000000-0000-0000-0000-000000000002'"), 'private');
    assert.equal(query("SELECT is_public FROM public.social_reels WHERE id='30000000-0000-0000-0000-000000000002'"), 'f');
    assert.equal(query("SELECT visibility FROM public.social_posts WHERE id='20000000-0000-0000-0000-000000000003'"), 'public');
    assert.equal(query("SELECT visibility FROM public.social_posts WHERE id='20000000-0000-0000-0000-000000000004'"), 'public');
    query("UPDATE public.video_source_masters SET status='revoked' WHERE video_id='00000000-0000-0000-0000-000000000001'");
    assert.equal(query("SELECT visibility FROM public.social_posts WHERE id='20000000-0000-0000-0000-000000000001'"), 'private');
    assert.equal(query("SELECT is_public FROM public.social_reels WHERE id='30000000-0000-0000-0000-000000000001'"), 'f');
    query("DELETE FROM public.social_posts WHERE id IN ('20000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000006')");
    query("DELETE FROM public.social_reels WHERE id IN ('30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000006')");
    assert.equal(query(`SELECT count(*) FROM realtime.sent_events
      WHERE event='managed_video_invalidated' AND topic='social-video-authority' AND private=false`), '6');
    assert.equal(query(`SELECT bool_and((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(payload) key)=ARRAY['id','kind'])
      FROM realtime.sent_events`), 't');
    assert.equal(query(`SELECT NOT has_function_privilege('anon','public.fn_native_video_source_revocation_reaches_social()','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.fn_native_video_source_revocation_reaches_social()','EXECUTE')
      AND NOT has_function_privilege('service_role','public.fn_native_video_source_revocation_reaches_social()','EXECUTE')`), 't');
    assert.equal(query(`SELECT proconfig::text FROM pg_proc
      WHERE oid='public.fn_native_video_source_revocation_reaches_social()'::regprocedure`), '{"search_path=public, extensions"}');
    const grantsAfter = query(`SELECT string_agg(grantee||':'||privilege_type,',' ORDER BY grantee,privilege_type)
      FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('social_posts','social_reels')`);
    assert.equal(grantsAfter, grantsBefore);
    assert.throws(apply, /already exists/);
  } finally {
    if (started) execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    rmSync(scratch, { recursive: true, force: true });
  }
});
