import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const migrationPath = join(
  repoRoot,
  'supabase/migrations/20261010015740_restrict_public_profile_rpc_fields.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');
const requiredWorkflow = readFileSync(
  join(repoRoot, '.github/workflows/build-safety-gate.yml'),
  'utf8',
);

function pgTool(name) {
  return [
    process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
    join('/opt/homebrew/opt/postgresql@17/bin', name),
    join('/usr/local/opt/postgresql@17/bin', name),
    join('/usr/lib/postgresql/17/bin', name),
  ].filter(Boolean).find(existsSync);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return port;
}

test('public profile migration source narrows the typed contract without weakening public access controls', () => {
  assert.match(migrationSql, /DROP FUNCTION public\.get_public_profile_by_username\(text\);/);
  assert.doesNotMatch(migrationSql, /DROP FUNCTION[^;]+CASCADE/i);
  assert.match(migrationSql, /dependent objects prevent safe RESTRICT replacement/);
  assert.match(
    migrationSql,
    /RETURNS TABLE \(\s*id uuid,\s*username text,\s*display_name text,\s*bio text,\s*avatar_url text,\s*level integer,\s*created_at timestamptz\s*\)/i,
  );
  assert.match(migrationSql, /SET search_path = public, extensions/);
  assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.get_public_profile_by_username\(text\) FROM PUBLIC/);
  assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.get_public_profile_by_username\(text\) TO anon, authenticated, service_role/);
  const activeSql = migrationSql.split('-- SAFE RECOVERY')[0];
  assert.doesNotMatch(activeSql, /RETURNS TABLE[\s\S]*?full_name text/i);
  assert.doesNotMatch(activeSql, /RETURNS TABLE[\s\S]*?diamonds integer/i);
  assert.match(activeSql, /trim\(BOTH ' @' FROM coalesce\(p_username, ''\)\)/);
  const recoverySql = migrationSql.split('-- SAFE RECOVERY')[1];
  assert.doesNotMatch(recoverySql, /full_name|diamonds/i);
  assert.match(recoverySql, /SET search_path = public, extensions/);
  assert.match(requiredWorkflow, /PUBLIC_PROFILE_POSTGRES_ROOT: \$\{\{ runner\.temp \}\}\/public-profile-rpc/);
  assert.match(requiredWorkflow, /node --test __tests__\/public-profile-rpc-migration-postgres\.test\.mjs/);
});

test('public profile migration removes private keys and preserves lookup semantics on PostgreSQL 17', async (t) => {
  const initdb = pgTool('initdb');
  const pgCtl = pgTool('pg_ctl');
  const postgres = pgTool('postgres');
  const psql = pgTool('psql');
  const scratchBase = process.env.PUBLIC_PROFILE_POSTGRES_ROOT;
  if (!initdb || !pgCtl || !postgres || !psql || !scratchBase || !existsSync(scratchBase)) {
    t.skip('PostgreSQL 17 tools and PUBLIC_PROFILE_POSTGRES_ROOT are required');
    return;
  }
  assert.match(execFileSync(postgres, ['--version'], { encoding: 'utf8' }), /\b17\./);

  const scratch = mkdtempSync(join(scratchBase, 'run-'));
  const data = join(scratch, 'data');
  const port = await reservePort();
  let started = false;

  const query = (sql) => execFileSync(psql, [
    '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql,
  ], { encoding: 'utf8' }).trim();
  const runMigration = () => execFileSync(psql, [
    '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-f', migrationPath,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8'], {
      stdio: 'ignore',
    });
    execFileSync(pgCtl, [
      '-D', data,
      '-l', join(scratch, 'postgres.log'),
      '-o', `-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,
      '-w', 'start',
    ], { stdio: 'ignore' });
    started = true;

    query(String.raw`
      CREATE SCHEMA extensions;
      DO $roles$
      BEGIN
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END
      $roles$;
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        username text NOT NULL,
        full_name text,
        display_name text,
        bio text,
        avatar_url text,
        level integer,
        diamonds integer,
        created_at timestamptz
      );
      REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
      INSERT INTO public.profiles
        (id, username, full_name, display_name, bio, avatar_url, level, diamonds, created_at)
      VALUES
        ('11111111-1111-1111-1111-111111111111', 'FixturePlayer', 'private-sentinel',
         'Public Fixture', 'Public bio', '/fixture.png', 7, 9001, '2026-01-02T03:04:05Z');

      CREATE FUNCTION public.get_public_profile_by_username(p_username text)
      RETURNS TABLE (
        id uuid, username text, full_name text, display_name text, bio text,
        avatar_url text, level integer, diamonds integer, created_at timestamptz
      )
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
      AS $function$
      BEGIN
        RETURN QUERY
        SELECT p.id, p.username, NULL::text, p.display_name, p.bio,
               p.avatar_url, p.level, NULL::integer, p.created_at
          FROM public.profiles p
         WHERE lower(p.username) = lower(trim(BOTH ' @' FROM coalesce(p_username, '')))
         LIMIT 1;
      END;
      $function$;
      ALTER FUNCTION public.get_public_profile_by_username(text) OWNER TO postgres;
      REVOKE ALL ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO anon, authenticated, service_role;
    `);

    const oldKeys = query(String.raw`
      SET ROLE anon;
      SELECT string_agg(key, ',' ORDER BY key)
        FROM public.get_public_profile_by_username('fixtureplayer') r,
             LATERAL jsonb_object_keys(to_jsonb(r)) key;
    `);
    assert.match(oldKeys, /(^|,)diamonds(,|$)/);
    assert.match(oldKeys, /(^|,)full_name(,|$)/);

    query("ALTER FUNCTION public.get_public_profile_by_username(text) SET search_path = public, extensions;");
    assert.throws(runMigration, /public profile RPC catalog contract drifted/i);
    query("ALTER FUNCTION public.get_public_profile_by_username(text) SET search_path = public;");

    query(String.raw`
      CREATE VIEW public.fixture_public_profile_dependency AS
      SELECT * FROM public.get_public_profile_by_username('fixtureplayer');
    `);
    assert.throws(runMigration, /dependent objects prevent safe RESTRICT replacement/i);
    query('DROP VIEW public.fixture_public_profile_dependency;');

    runMigration();

    for (const role of ['anon', 'authenticated', 'service_role']) {
      const safeKeys = query(String.raw`
        SET ROLE ${role};
        SELECT string_agg(key, ',' ORDER BY key)
          FROM public.get_public_profile_by_username('  @FiXtUrEpLaYeR ') r,
               LATERAL jsonb_object_keys(to_jsonb(r)) key;
      `);
      assert.equal(safeKeys, 'avatar_url,bio,created_at,display_name,id,level,username');
      assert.doesNotMatch(safeKeys, /full_name|diamonds/);
    }

    assert.equal(query(String.raw`
      SET ROLE anon;
      SELECT id || '|' || username || '|' || display_name || '|' || level
        FROM public.get_public_profile_by_username(' @fixtureplayer');
    `), '11111111-1111-1111-1111-111111111111|FixturePlayer|Public Fixture|7');
    assert.equal(query(String.raw`
      SET ROLE anon;
      SELECT count(*) FROM public.get_public_profile_by_username('missing-player');
    `), '0');

    assert.equal(query(String.raw`
      SELECT has_table_privilege('anon', 'public.profiles', 'SELECT')
             OR has_column_privilege('anon', 'public.profiles', 'full_name', 'SELECT')
             OR has_column_privilege('anon', 'public.profiles', 'diamonds', 'SELECT');
    `), 'f');
    assert.equal(query(String.raw`
      SELECT has_function_privilege('anon', 'public.get_public_profile_by_username(text)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.get_public_profile_by_username(text)', 'EXECUTE')
             AND has_function_privilege('service_role', 'public.get_public_profile_by_username(text)', 'EXECUTE');
    `), 't');
    assert.equal(query(String.raw`
      SELECT pg_get_function_result(p.oid) || '|' || p.prosecdef || '|' || array_to_string(p.proconfig, ',')
        FROM pg_proc p
       WHERE p.oid = 'public.get_public_profile_by_username(text)'::regprocedure;
    `), 'TABLE(id uuid, username text, display_name text, bio text, avatar_url text, level integer, created_at timestamp with time zone)|true|search_path=public, extensions');
  } finally {
    if (started) {
      execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    }
    rmSync(scratch, { recursive: true, force: true });
  }
});
