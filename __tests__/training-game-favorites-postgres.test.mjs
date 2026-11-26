import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { join, resolve } from 'node:path';
import test from 'node:test';

const { Client } = createRequire(import.meta.url)('pg');
const migration = 'supabase/migrations/20261126191500_training_game_favorites_hardened.sql';

test('favorites grants, ownership policies and data constraints hold on isolated PostgreSQL 17', { timeout: 90000 }, async () => {
  const bin = [
    process.env.PHASE6_POSTGRES_BIN,
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/lib/postgresql/17/bin',
  ].find(directory => directory && existsSync(join(directory, 'initdb')));
  assert.ok(bin, 'PostgreSQL 17 is required');
  const work = resolve('work');
  mkdirSync(work, { recursive: true });
  const scratch = mkdtempSync(join(work, 'favorites-pg17-'));
  const data = join(scratch, 'data');
  const run = (tool, args) => execFileSync(join(bin, tool), args, {
    encoding: 'utf8', stdio: 'pipe', env: { PATH: bin, LANG: 'C', TMPDIR: scratch },
  });
  const portReservation = net.createServer();
  let started = false;
  let db;
  try {
    await new Promise((ok, fail) => {
      portReservation.once('error', fail);
      portReservation.listen(0, '127.0.0.1', ok);
    });
    const { port } = portReservation.address();
    await new Promise(ok => portReservation.close(ok));
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(scratch, 'postgres.log'), '-w', '-o',
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, 'start']);
    started = true;
    db = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', ssl: false });
    await db.connect();

    const scalar = async (sql, args) => (await db.query(sql, args)).rows[0].value;
    const version = await scalar("SELECT current_setting('server_version_num')::integer AS value");
    assert.equal(Math.floor(version / 10000), 17);
    await db.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    `);
    const source = readFileSync(new URL('../' + migration, import.meta.url), 'utf8');
    const relation = 'public.training_game_favorites';
    await db.query('BEGIN');
    await db.query(source);
    await db.query('ROLLBACK');
    assert.equal(await scalar('SELECT to_regclass($1) AS value', [relation]), null);
    await db.query(source);
    await db.query(source);
    assert.equal(await scalar('SELECT relrowsecurity AS value FROM pg_class WHERE oid=$1::regclass', [relation]), true);
    assert.equal(await scalar("SELECT count(*)::int AS value FROM pg_policies WHERE schemaname='public' AND tablename='training_game_favorites'"), 3);
    assert.match(await scalar("SELECT pg_get_indexdef('idx_training_game_favorites_user_created'::regclass) AS value"),
      /\(user_id, created_at DESC\)/);
    const privileges = ['SELECT','INSERT','DELETE','UPDATE','TRUNCATE','REFERENCES','TRIGGER'];
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const grant of privileges) {
        const actual = await scalar('SELECT has_table_privilege($1,$2,$3) AS value', [role, relation, grant]);
        assert.equal(actual, role === 'service_role' || (role === 'authenticated' && ['SELECT','INSERT','DELETE'].includes(grant)), role + ' ' + grant);
      }
    }

    const first = randomUUID(), second = randomUUID();
    await db.query('INSERT INTO auth.users VALUES ($1),($2)', [first, second]);
    const favorite = (owner, id) => db.query('INSERT INTO public.training_game_favorites(user_id,game_id) VALUES ($1,$2)', [owner, id]);
    const count = () => scalar('SELECT count(*)::int AS value FROM public.training_game_favorites');
    const claim = id => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.query('SET ROLE anon');
    await assert.rejects(count, { code: '42501' });
    await assert.rejects(() => favorite(first, 'cash-002'), { code: '42501' });
    await db.query('RESET ROLE');
    await db.query('SET ROLE authenticated');
    await claim(first);
    await favorite(first, 'cash-002');
    assert.equal(await count(), 1);
    await assert.rejects(() => favorite(first, 'cash-002'), { code: '23505' });
    await assert.rejects(() => favorite(second, 'mtt-001'), { code: '42501' });
    for (const invalid of ['', '   ', 'a'.repeat(81)]) {
      await assert.rejects(() => favorite(first, invalid), { code: '23514' });
    }
    await favorite(first, 'a'.repeat(80));
    await assert.rejects(() => db.query("UPDATE public.training_game_favorites SET game_id='cash-003'"), { code: '42501' });
    await claim(second);
    assert.equal(await count(), 0);
    assert.equal((await db.query('DELETE FROM public.training_game_favorites WHERE user_id=$1', [first])).rowCount, 0);
    await favorite(second, 'cash-002');
    await favorite(second, 'cash-003');
    assert.equal((await db.query("DELETE FROM public.training_game_favorites WHERE game_id='cash-003'")).rowCount, 1);
    await db.query('RESET ROLE');
    await db.query('SET ROLE service_role');
    assert.equal(await count(), 3);
    const upsert = `INSERT INTO public.training_game_favorites(user_id,game_id) VALUES ($1,$2)
      ON CONFLICT(user_id,game_id) DO UPDATE SET game_id=excluded.game_id RETURNING game_id`;
    for (let i = 0; i < 2; i++) assert.equal((await db.query(upsert, [first, 'cash-004'])).rows[0].game_id, 'cash-004');
    assert.equal(await count(), 4);
    await assert.rejects(() => favorite(randomUUID(), 'cash-004'), { code: '23503' });
    await db.query('RESET ROLE');
    await db.query('DELETE FROM auth.users WHERE id=$1', [first]);
    assert.equal(await count(), 1);
    assert.equal(await scalar('SELECT user_id AS value FROM public.training_game_favorites'), second);
    console.log('TRAINING_FAVORITES_PG17 ' + JSON.stringify({
      path: migration, sha256: createHash('sha256').update(source).digest('hex'), serverVersion: version,
    }));
  } finally {
    if (db) await db.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(scratch, { recursive: true, force: true });
  }
});
