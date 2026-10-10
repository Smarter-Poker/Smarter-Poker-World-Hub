import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = join(root, 'supabase/migrations/20261010180000_home_games_address_visibility_contract.sql');
const snapshot = readFileSync(join(root, 'supabase/migrations/ZZZZ_snapshot_home_games_schema.sql'), 'utf8');
const names = ['rpc_hg_create_tournament', 'get_user_home_games_calendar', 'rpc_hg_list_public_tournaments'];
function original(name) {
  const expression = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([^\\n]*\\)[\\s\\S]*?AS \\$function\\$[\\s\\S]*?\\$function\\$`);
  const match = snapshot.match(expression);
  assert.ok(match, `snapshot function ${name}`);
  return `${match[0]};`;
}
function pgTool(name) {
  return [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
    join('/opt/homebrew/opt/postgresql@17/bin', name), join('/usr/lib/postgresql/17/bin', name)]
    .filter(Boolean).find(existsSync);
}
async function reservePort() {
  const server = net.createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const { port } = server.address();
  await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
  return port;
}
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
const group = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('Home Games visibility repair preserves the API and authorization on PostgreSQL 17', async () => {
  const base = process.env.HOME_GAMES_ADDRESS_POSTGRES_ROOT;
  const initdb = pgTool('initdb'); const pgCtl = pgTool('pg_ctl'); const psql = pgTool('psql');
  assert.ok(base && existsSync(base) && initdb && pgCtl && psql,
    'Required PostgreSQL 17 tools and HOME_GAMES_ADDRESS_POSTGRES_ROOT must exist (no skipped qualification)');
  assert.match(execFileSync(pgTool('postgres'), ['--version'], { encoding: 'utf8' }), /\b17\./);
  const scratch = mkdtempSync(join(base, 'run-'));
  const data = join(scratch, 'data'); const port = await reservePort(); let started = false;
  const args = ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
  const query = (sql) => execFileSync(psql, [...args, '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const apply = () => execFileSync(psql, [...args, '--single-transaction', '-f', migration], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const caller = (id, sql) => query(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; ${sql}`);
  const create = (visibility) => `SELECT rpc_hg_create_tournament('${group}', 'Qualification', 0, 20000, 'standard', CURRENT_DATE+1, '18:00', 8, 'Fixture', 'private-sentinel', ${visibility === undefined ? "'rsvp'" : `'${visibility}'`});`;
  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
    execFileSync(pgCtl, ['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, '-w', 'start'], { stdio: 'ignore' });
    started = true;
    query(`
      CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE anon NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE commander_home_groups (id uuid PRIMARY KEY, name text, owner_id uuid, is_private boolean, is_active boolean);
      CREATE TABLE commander_home_members (group_id uuid, user_id uuid, status text, role text);
      CREATE TABLE social_pages (slug text, linked_entity_type text, linked_entity_id text);
      CREATE TABLE commander_home_games (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, host_id uuid, title text, description text,
        format text, game_type text, buyin_min integer, buyin_max integer, starting_stack integer, structure text,
        scheduled_date date, start_time time, end_time time, max_players integer, status text,
        address text, address_visible_to text CONSTRAINT commander_home_games_address_visible_to_check CHECK (address_visible_to IS NULL OR address_visible_to IN ('all','rsvp','approved')),
        stakes text, notes_for_attendees text DEFAULT 'attendee-sentinel', rsvp_yes integer DEFAULT 0,
        rsvp_maybe integer DEFAULT 0, waitlist_count integer DEFAULT 0, cover_photo_url text, neighborhood text);
      CREATE TABLE commander_home_rsvps (game_id uuid, user_id uuid, response text, checked_in_at timestamptz);
      CREATE TABLE commander_home_audit_log (group_id uuid, actor_id uuid, target_type text, target_id uuid, action text, metadata jsonb);
      INSERT INTO commander_home_groups VALUES ('${group}', 'Private Fixture', '${owner}', true, true);
      INSERT INTO commander_home_members VALUES ('${group}', '${member}', 'approved', 'member');
      ${original('fn_home_is_group_staff')}
      ${names.map(original).join('\n')}
      ${names.map((name) => `REVOKE ALL ON FUNCTION public.${name}(${name === 'rpc_hg_create_tournament' ? 'uuid,text,integer,integer,text,date,time,integer,text,text,text' : name === 'get_user_home_games_calendar' ? 'uuid,integer' : 'uuid'}) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.${name}(${name === 'rpc_hg_create_tournament' ? 'uuid,text,integer,integer,text,date,time,integer,text,text,text' : name === 'get_user_home_games_calendar' ? 'uuid,integer' : 'uuid'}) TO authenticated, service_role;`).join('\n')}
    `);
    const metadata = query(`SELECT jsonb_agg(jsonb_build_object('name',proname,'owner',proowner,'acl',proacl,'args',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)) ORDER BY proname) FROM pg_proc WHERE proname IN (${names.map((n) => `'${n}'`).join(',')});`);
    // Actual original creator plus installed CHECK, not a stub: both API labels fail.
    for (const value of ['public', 'members']) assert.throws(() => caller(owner, create(value)), /address_visible_to.*check|violates check constraint/i);
    const oldRsvp = caller(owner, create('rsvp'));
    assert.equal(query(`SELECT count(*) FROM commander_home_games;`), '1');
    // The original SECDEF reader leaks private schedules to an unrelated caller.
    assert.equal(JSON.parse(caller(stranger, `SELECT rpc_hg_list_public_tournaments('${group}');`)).length, 1);
    query(`INSERT INTO commander_home_rsvps VALUES ('${oldRsvp}','${member}','yes',NULL);`);
    assert.equal(caller(member, `SELECT address_visible FROM get_user_home_games_calendar('${member}');`), 'f');

    // Pre-image drift aborts the complete migration before any replacement.
    query('ALTER FUNCTION rpc_hg_list_public_tournaments(uuid) SET search_path=public,extensions;');
    assert.throws(apply, /catalog contract drifted/);
    assert.equal(query("SELECT proconfig[1] FROM pg_proc WHERE proname='rpc_hg_create_tournament';"), 'search_path=public');
    query('ALTER FUNCTION rpc_hg_list_public_tournaments(uuid) SET search_path=public;');
    query('GRANT EXECUTE ON FUNCTION rpc_hg_list_public_tournaments(uuid) TO anon;');
    assert.throws(apply, /catalog contract drifted/);
    query('REVOKE EXECUTE ON FUNCTION rpc_hg_list_public_tournaments(uuid) FROM anon;');
    query("ALTER TABLE commander_home_games DROP CONSTRAINT commander_home_games_address_visible_to_check; ALTER TABLE commander_home_games ADD CONSTRAINT commander_home_games_address_visible_to_check CHECK(address_visible_to IN ('all','rsvp','approved','public'));");
    assert.throws(apply, /persisted visibility CHECK drifted/);
    query("ALTER TABLE commander_home_games DROP CONSTRAINT commander_home_games_address_visible_to_check; ALTER TABLE commander_home_games ADD CONSTRAINT commander_home_games_address_visible_to_check CHECK(address_visible_to IS NULL OR address_visible_to IN ('all','rsvp','approved'));");
    apply();
    assert.equal(query(`SELECT jsonb_agg(jsonb_build_object('name',proname,'owner',proowner,'acl',proacl,'args',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)) ORDER BY proname) FROM pg_proc WHERE proname IN (${names.map((n) => `'${n}'`).join(',')});`), metadata);
    assert.equal(query(`SELECT count(*) FROM pg_proc WHERE proname IN (${names.map((n) => `'${n}'`).join(',')}) AND proconfig=ARRAY['search_path=public, extensions'] AND prosecdef;`), '3');
    assert.equal(query("SELECT has_function_privilege('anon','rpc_hg_list_public_tournaments(uuid)','EXECUTE');"), 'f');
    for (const [api, stored] of [['public','all'], ['members','approved'], ['rsvp','rsvp']]) {
      const id = caller(owner, create(api));
      assert.equal(query(`SELECT address_visible_to FROM commander_home_games WHERE id='${id}';`), stored);
      assert.equal(query(`SELECT count(*) FROM commander_home_audit_log WHERE target_id='${id}' AND actor_id='${owner}' AND action='created';`), '1');
    }
    assert.throws(() => caller(stranger, create('members')), /NOT_GROUP_STAFF/);
    assert.throws(() => caller(owner, create('approved')), /INVALID_ADDRESS_VISIBILITY/);
    assert.throws(() => query(create('members')), /AUTH_REQUIRED/);
    assert.throws(() => caller(member, `SELECT * FROM get_user_home_games_calendar('${owner}');`), /UNAUTHORIZED/);
    assert.equal(caller(stranger, `SELECT rpc_hg_list_public_tournaments('${group}');`), '[]');
    assert.equal(JSON.parse(caller(member, `SELECT rpc_hg_list_public_tournaments('${group}');`)).length, 4);
    const ownerCalendar = JSON.parse(caller(owner, `SELECT jsonb_agg(to_jsonb(c)) FROM get_user_home_games_calendar('${owner}') c;`));
    assert.ok(ownerCalendar.every((c) => c.address_visible && c.address === 'private-sentinel'));
    const memberCalendar = () => JSON.parse(caller(member, `SELECT jsonb_agg(to_jsonb(c)) FROM get_user_home_games_calendar('${member}') c;`));
    assert.equal(memberCalendar().find((c) => c.game_id === oldRsvp).address, 'private-sentinel');
    assert.equal(memberCalendar().filter((c) => c.address_visible).length, 3); // all, approved, RSVP yes only
    assert.equal(memberCalendar().find((c) => c.game_id === oldRsvp).notes_for_attendees, 'attendee-sentinel');
    // Only confirmed yes attendees see RSVP addresses, not maybe/no/waitlist.
    for (const response of ['maybe','no','waitlist']) {
      query(`UPDATE commander_home_rsvps SET response='${response}' WHERE game_id='${oldRsvp}';`);
      const row = memberCalendar().find((c) => c.game_id === oldRsvp);
      assert.equal(row.address_visible, false); assert.equal(row.address, null); assert.equal(row.notes_for_attendees, null);
    }
    query(`UPDATE commander_home_rsvps SET response='yes';`);
    query(`UPDATE commander_home_members SET status='banned' WHERE user_id='${member}';`);
    assert.equal(caller(member, `SELECT count(*) FROM get_user_home_games_calendar('${member}');`), '0');
    assert.equal(caller(member, `SELECT rpc_hg_list_public_tournaments('${group}');`), '[]');
    query(`UPDATE commander_home_groups SET is_private=false;`);
    assert.equal(caller(member, `SELECT count(*) FROM get_user_home_games_calendar('${member}');`), '0');
    assert.equal(caller(member, `SELECT rpc_hg_list_public_tournaments('${group}');`), '[]');
    assert.equal(JSON.parse(caller(stranger, `SELECT rpc_hg_list_public_tournaments('${group}');`)).filter((c) => c.address === 'private-sentinel').length, 1);
    query(`UPDATE commander_home_members SET status='removed';`);
    assert.equal(caller(member, `SELECT count(*) FROM get_user_home_games_calendar('${member}');`), '0');
    assert.equal(caller(member, `SELECT rpc_hg_list_public_tournaments('${group}');`), '[]');
    // Pending/declined stale RSVPs on public parents do not grant attendee details.
    for (const status of ['pending','declined']) {
      query(`UPDATE commander_home_members SET status='${status}';`);
      const row = memberCalendar().find((c) => c.game_id === oldRsvp);
      assert.equal(row.address_visible, false); assert.equal(row.address, null); assert.equal(row.notes_for_attendees, null);
      query(`UPDATE commander_home_groups SET is_private=true;`);
      assert.equal(caller(member, `SELECT count(*) FROM get_user_home_games_calendar('${member}');`), '0');
      assert.equal(caller(member, `SELECT rpc_hg_list_public_tournaments('${group}');`), '[]');
      query(`UPDATE commander_home_groups SET is_private=false;`);
    }
    // Host eligibility remains, but revoked membership cannot bypass revocation.
    query(`UPDATE commander_home_groups SET is_private=true; UPDATE commander_home_games SET host_id='${stranger}' WHERE id='${oldRsvp}';`);
    assert.equal(caller(stranger, `SELECT address FROM get_user_home_games_calendar('${stranger}');`), 'private-sentinel');
    query(`INSERT INTO commander_home_members VALUES ('${group}', '${stranger}', 'banned', 'co_host');`);
    assert.equal(caller(stranger, `SELECT count(*) FROM get_user_home_games_calendar('${stranger}');`), '0');
    query(`INSERT INTO commander_home_members VALUES ('${group}', '${owner}', 'banned', 'owner');`);
    assert.equal(caller(owner, `SELECT count(*) FROM get_user_home_games_calendar('${owner}');`), '4');
    assert.equal(JSON.parse(caller(owner, `SELECT rpc_hg_list_public_tournaments('${group}');`)).length, 4);
    const defaultId = caller(owner, `SELECT rpc_hg_create_tournament('${group}', 'Default visibility', 0, 20000, 'standard', CURRENT_DATE+1, '18:00');`);
    assert.equal(query(`SELECT address_visible_to FROM commander_home_games WHERE id='${defaultId}';`), 'rsvp');
    for (const visibility of ['NULL','true']) {
      query(`UPDATE commander_home_groups SET is_private=${visibility};`);
      assert.equal(caller(stranger, `SELECT rpc_hg_list_public_tournaments('${group}');`), '[]');
    }
    for (const active of ['false','NULL']) {
      query(`UPDATE commander_home_groups SET is_active=${active};`);
      assert.equal(caller(owner, `SELECT count(*) FROM get_user_home_games_calendar('${owner}');`), '0');
      assert.equal(caller(owner, `SELECT rpc_hg_list_public_tournaments('${group}');`), '[]');
    }
    // Re-executing an installed repair is refused instead of silently replayed.
    assert.throws(apply, /catalog contract drifted/);
  } finally {
    if (started) execFileSync(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
    rmSync(scratch, { recursive: true });
  }
});
