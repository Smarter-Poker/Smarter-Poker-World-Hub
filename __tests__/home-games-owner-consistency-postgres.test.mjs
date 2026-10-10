import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = join(root, 'supabase/migrations/20261010190000_home_games_owner_consistency_context.sql');
// This definition's exact catalog hash was independently read from the installed
// database at 18:57:01Z. The migration refuses any historical/current drift.
const snapshot = readFileSync(join(root, 'supabase/migrations/ZZZZ_snapshot_home_games_schema.sql'), 'utf8');
const original = snapshot.match(/CREATE OR REPLACE FUNCTION public\.verify_home_group_owner_consistency\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/)[0] + ';';
const owner = '11111111-1111-4111-8111-111111111111';
const pending = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
const group = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function tool(name) {
  return [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
    join('/opt/homebrew/opt/postgresql@17/bin', name), join('/usr/lib/postgresql/17/bin', name)]
    .filter(Boolean).find(existsSync);
}
async function portNumber() {
  const server = net.createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}
test('pending public membership preserves authoritative owner integrity on PostgreSQL 17', async () => {
  const base = process.env.HOME_GAMES_OWNER_POSTGRES_ROOT;
  assert.ok(base && existsSync(base) && tool('initdb') && tool('pg_ctl') && tool('psql'), 'Required PostgreSQL tools/root must exist; no skipped proof');
  assert.match(execFileSync(tool('postgres'), ['--version'], { encoding: 'utf8' }), /\b17\./);
  const scratch = mkdtempSync(join(base, 'run-')); const data = join(scratch, 'data');
  const port = await portNumber(); let started = false;
  const args = ['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq'];
  const query = sql => execFileSync(tool('psql'), [...args,'-c',sql], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim();
  const apply = () => execFileSync(tool('psql'), [...args,'--single-transaction','-f',migration], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
  const caller = (id, sql) => query(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; ${sql}`);
  const joinPending = () => caller(pending, `BEGIN; INSERT INTO commander_home_members VALUES ('${group}','${pending}','pending','member'); COMMIT;`);
  const unchanged = () => query(`SELECT jsonb_build_object('acl',p.proacl,'owner',p.proowner,'binding',(SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgfoid=p.oid),'policies',(SELECT jsonb_agg(to_jsonb(q) ORDER BY polname) FROM pg_policy q WHERE polrelid IN ('commander_home_groups'::regclass,'commander_home_members'::regclass)),'rls',(SELECT jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE oid IN ('commander_home_groups'::regclass,'commander_home_members'::regclass))) FROM pg_proc p WHERE p.oid='verify_home_group_owner_consistency()'::regprocedure;`);
  try {
    execFileSync(tool('initdb'), ['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8'], {stdio:'ignore'});
    execFileSync(tool('pg_ctl'), ['-D',data,'-l',join(scratch,'postgres.log'),'-o',`-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,'-w','start'], {stdio:'ignore'}); started=true;
    query(`CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE anon NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE TABLE commander_home_groups(id uuid PRIMARY KEY,owner_id uuid,is_private boolean);
      CREATE TABLE commander_home_members(group_id uuid,user_id uuid,status text,role text,PRIMARY KEY(group_id,user_id));
      CREATE FUNCTION fn_home_is_group_staff(p_user uuid,p_group uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,extensions AS $$SELECT EXISTS(SELECT 1 FROM public.commander_home_groups WHERE id=p_group AND owner_id=p_user) OR EXISTS(SELECT 1 FROM public.commander_home_members WHERE group_id=p_group AND user_id=p_user AND status='approved' AND role IN ('owner','admin'))$$;
      ALTER TABLE commander_home_groups ENABLE ROW LEVEL SECURITY; ALTER TABLE commander_home_members ENABLE ROW LEVEL SECURITY;
      ALTER TABLE commander_home_groups FORCE ROW LEVEL SECURITY; ALTER TABLE commander_home_members FORCE ROW LEVEL SECURITY;
      CREATE POLICY home_groups_select ON commander_home_groups FOR SELECT USING (NOT is_private OR owner_id=auth.uid() OR id IN(SELECT group_id FROM commander_home_members WHERE user_id=auth.uid() AND status='approved'));
      CREATE POLICY home_members_host_sees_group ON commander_home_members FOR SELECT USING (user_id=auth.uid() OR fn_home_is_group_staff(auth.uid(),group_id));
      CREATE POLICY home_members_insert ON commander_home_members FOR INSERT WITH CHECK(user_id=auth.uid() OR fn_home_is_group_staff(auth.uid(),group_id));
      CREATE POLICY home_members_update ON commander_home_members FOR UPDATE USING(user_id=auth.uid() OR fn_home_is_group_staff(auth.uid(),group_id)) WITH CHECK(user_id=auth.uid() OR fn_home_is_group_staff(auth.uid(),group_id));
      CREATE POLICY home_members_delete ON commander_home_members FOR DELETE USING(user_id=auth.uid() OR fn_home_is_group_staff(auth.uid(),group_id));
      GRANT SELECT ON commander_home_groups TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON commander_home_members TO authenticated;
      INSERT INTO commander_home_groups VALUES ('${group}','${owner}',false);
      INSERT INTO commander_home_members VALUES ('${group}','${owner}','approved','owner');
      ${original}
      REVOKE ALL ON FUNCTION verify_home_group_owner_consistency() FROM PUBLIC; GRANT EXECUTE ON FUNCTION verify_home_group_owner_consistency() TO service_role;
      CREATE CONSTRAINT TRIGGER trg_verify_home_group_owner_consistency AFTER INSERT OR DELETE OR UPDATE ON commander_home_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_home_group_owner_consistency();`);
    assert.equal(query("SELECT md5(pg_get_functiondef('verify_home_group_owner_consistency()'::regprocedure));"),'36996fe4ad8517a9cc096c17ef3e66f4','exact installed preimage');
    assert.equal(caller(pending,`SELECT count(*) FROM commander_home_groups;`),'1');
    assert.equal(caller(pending,`SELECT count(*) FROM commander_home_members WHERE role='owner';`),'0');
    assert.throws(joinPending,/23514: Home group .* has no owner-member row/,'real deferred original failure at COMMIT');
    assert.equal(query(`SELECT count(*) FROM commander_home_members WHERE user_id='${pending}';`),'0','failed join rolled back');
    const preimage=unchanged();
    for (const [change,restore] of [
      ['ALTER FUNCTION verify_home_group_owner_consistency() SET search_path=public;', 'ALTER FUNCTION verify_home_group_owner_consistency() SET search_path=public,pg_temp;'],
      ['GRANT EXECUTE ON FUNCTION verify_home_group_owner_consistency() TO authenticated;', 'REVOKE EXECUTE ON FUNCTION verify_home_group_owner_consistency() FROM authenticated;'],
      ['ALTER TABLE commander_home_members DISABLE TRIGGER trg_verify_home_group_owner_consistency;', 'ALTER TABLE commander_home_members ENABLE TRIGGER trg_verify_home_group_owner_consistency;'],
    ]) { query(change); assert.throws(apply,/contract drifted|binding drifted/); query(restore); }
    apply(); assert.equal(unchanged(),preimage,'ACL, owner, deferred trigger and RLS unchanged');
    assert.equal(query("SELECT prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid='verify_home_group_owner_consistency()'::regprocedure;"),'t');
    joinPending();
    assert.equal(query(`SELECT status FROM commander_home_members WHERE user_id='${pending}';`),'pending');
    assert.equal(caller(pending,`SELECT count(*) FROM commander_home_members WHERE role='owner';`),'0','pending caller still cannot enumerate owner');
    assert.equal(caller(stranger,`UPDATE commander_home_members SET status='banned' WHERE user_id='${owner}' RETURNING user_id;`),'');
    assert.throws(()=>caller(stranger,`INSERT INTO commander_home_members VALUES('${group}','44444444-4444-4444-8444-444444444444','approved','member');`),/row-level security/);
    assert.throws(()=>query(`BEGIN; DELETE FROM commander_home_members WHERE role='owner'; COMMIT;`),/23514: Home group .* has no owner-member row/);
    assert.throws(()=>query(`BEGIN; UPDATE commander_home_members SET user_id='${stranger}' WHERE role='owner'; COMMIT;`),/23514: Home group .* has mismatched ownership/);
    // Implicit pg_temp resolution must not replace either authoritative table.
    caller(pending,`BEGIN; CREATE TEMP TABLE commander_home_groups(id uuid,owner_id uuid); CREATE TEMP TABLE commander_home_members(group_id uuid,user_id uuid,role text); UPDATE public.commander_home_members SET status='pending' WHERE user_id='${pending}'; COMMIT;`);
    assert.equal(query(`SELECT user_id FROM commander_home_members WHERE role='owner';`),owner);
    assert.throws(apply,/catalog contract drifted/,'postimage refuses migration replay');
  } finally { if(started)execFileSync(tool('pg_ctl'),['-D',data,'-m','fast','-w','stop'],{stdio:'ignore'});rmSync(scratch,{recursive:true}); }
});
