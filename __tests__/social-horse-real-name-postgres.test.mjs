import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = join(root, 'supabase/migrations/20261010044300_social_horses_use_established_real_names.sql');
const sql = readFileSync(migration, 'utf8');
const tool = (name) => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
  join('/opt/homebrew/opt/postgresql@17/bin', name), join('/usr/lib/postgresql/17/bin', name)]
  .filter(Boolean).find(existsSync);

test('horse public names stay source-owned without human name grants or periodic repair', () => {
  assert.match(sql, /SECURITY INVOKER SET search_path = public, pg_temp/);
  assert.match(sql, /NEW\.is_horse IS TRUE AND NEW\.horse_status = 'available'/);
  assert.doesNotMatch(sql, /^\s*GRANT|cron\.schedule|CASCADE|UPDATE public\.content_authors/im);
  assert.match(readFileSync(join(root, '.github/workflows/build-safety-gate.yml'), 'utf8'),
    /node --test __tests__\/social-horse-real-name-postgres\.test\.mjs/);
});

test('PG17 migrates only available horse names and enforces future edits without changing human privacy', async (t) => {
  const tools = ['initdb', 'pg_ctl', 'postgres', 'psql'].map(tool);
  const base = process.env.HORSE_NAME_POSTGRES_ROOT;
  if (tools.some((x) => !x) || !base || !existsSync(base)) {
    if (process.env.CI === 'true') throw new Error('Required PG17 tools and HORSE_NAME_POSTGRES_ROOT missing');
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
      CREATE TABLE public.profiles(id integer PRIMARY KEY, is_horse boolean, horse_status text,
        full_name text, first_name text, last_name text, display_name text, username text, alias text);
      INSERT INTO public.profiles VALUES
        (1,true,'available','Kane Mercer','Kane','Mercer','SnapKingEmber','kanemercer','SnapKingEmber'),
        (2,false,NULL,'Private Legal Name','Private','Name','Human Choice','human','TableAlias'),
        (3,true,'disabled',NULL,NULL,NULL,'Retired Choice','retired','RetiredAlias');
      GRANT SELECT(id,display_name,username,alias) ON public.profiles TO anon,authenticated;
      CREATE FUNCTION public.fixture_collision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.is_horse IS TRUE AND EXISTS(SELECT 1 FROM public.profiles p
        WHERE NOT coalesce(p.is_horse,false) AND p.display_name=NEW.display_name)
        THEN RAISE EXCEPTION 'human name collision'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER trg_reject_horse_name_on_human BEFORE INSERT OR UPDATE OF display_name,is_horse
        ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fixture_collision_guard();`);
    query("UPDATE public.profiles SET full_name='Disagrees' WHERE id=1");
    assert.throws(apply, /persona name is missing or disagrees/);
    assert.equal(query("SELECT display_name FROM public.profiles WHERE id=1"), 'SnapKingEmber');
    query("UPDATE public.profiles SET full_name='Kane Mercer' WHERE id=1");
    apply();
    assert.equal(query('SELECT string_agg(display_name,\'|\' ORDER BY id) FROM public.profiles'),
      'Kane Mercer|Human Choice|Retired Choice');
    assert.equal(query('SELECT username||\'|\'||alias FROM public.profiles WHERE id=1'), 'kanemercer|SnapKingEmber');
    query("UPDATE public.profiles SET display_name='AliasAgain' WHERE id=1");
    assert.equal(query('SELECT display_name FROM public.profiles WHERE id=1'), 'Kane Mercer');
    query("UPDATE public.profiles SET full_name=' Kane  Mercer ' WHERE id=1");
    assert.equal(query('SELECT display_name FROM public.profiles WHERE id=1'), 'Kane Mercer');
    query("UPDATE public.profiles SET full_name='Kane Renamed',last_name='Renamed' WHERE id=1");
    assert.equal(query('SELECT display_name FROM public.profiles WHERE id=1'), 'Kane Renamed');
    assert.throws(() => query("UPDATE public.profiles SET full_name='Human Choice',first_name='Human',last_name='Choice',display_name='SafeAlias' WHERE id=1"), /human name collision/);
    query("UPDATE public.profiles SET display_name='New Human Choice' WHERE id=2");
    assert.equal(query('SELECT display_name FROM public.profiles WHERE id=2'), 'New Human Choice');
    query("INSERT INTO public.profiles VALUES (4,true,'available','New Persona','New','Persona','AnotherAlias','newpersona','AnotherAlias')");
    assert.equal(query('SELECT display_name FROM public.profiles WHERE id=4'), 'New Persona');
    assert.equal(query("SELECT full_name IS NULL FROM public.profiles WHERE id=3"), 't');
    for (const role of ['anon', 'authenticated']) {
      assert.equal(query(`SELECT has_column_privilege('${role}','public.profiles','display_name','SELECT')
        AND NOT has_column_privilege('${role}','public.profiles','full_name','SELECT')
        AND NOT has_function_privilege('${role}','public.fn_social_horse_public_real_name()','EXECUTE')`), 't');
      assert.equal(query(`SET ROLE ${role}; SELECT display_name FROM public.profiles WHERE id=1`), 'Kane Renamed');
    }
    assert.throws(apply, /already exists/); // no unnoticed replay of installed source
  } finally {
    if (started) execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    rmSync(scratch, { recursive: true, force: true });
  }
});
